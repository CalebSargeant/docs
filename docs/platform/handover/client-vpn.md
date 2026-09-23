# Client VPN — the handover boundary

Each client site (a MikroTik router in the field) reaches the platform AWS VPC over an **AWS Site-to-Site VPN**. This page documents the *responsibility boundary*: the Terraform that provisions the AWS side of each connection, and the MikroTik RouterOS `.rsc` config file that is generated from AWS output and **handed to the client to paste into their router**.

!!! note "Scope — what this page is and is not"
    General client networking (routing on the client LAN, their cameras, their WAN) is **out of scope** — that is standard networking knowledge and it is the client's problem. What is documented here is exactly the seam the platform engineer owns: everything up to and including the `.rsc` handover file. This is directly analogous to how AWS Site-to-Site VPN hands *you* an opaque config file for your own CPE ("tin") — here the platform is the AWS side and generates that opaque file *for the client's* MikroTik.

## The responsibility boundary

```
   PLATFORM (platform team owns)                CLIENT (owns their side)
 ┌───────────────────────────────┐               ┌───────────────────────────────┐
 │  AWS af-south-1, network      │               │  Site MikroTik router         │
 │                               │   IPsec/IKEv2 │  (dynamic public IP)          │
 │  VGW (ASN 64512)              │◄────tunnel 1──┤                               │
 │   ├─ Customer Gateway (cgw)   │◄────tunnel 2──┤  Applies the generated .rsc:  │
 │   ├─ VPN Connection (2 tuns)  │     + BGP     │   - ipsec profile/peer/       │
 │   ├─ PSKs → Secrets Manager   │               │     proposal/identity/policy  │
 │   └─ BGP over 169.254.x.x     │               │   - BGP instance + connection │
 │                               │               │   - loopback inside addresses │
 │  generate-vpn-config.py ──────┼──► client.rsc │   - firewall address-lists    │
 │  (reads AWS, emits .rsc)      │   (handover)  │   - input/forward filter rules│
 └───────────────────────────────┘               └───────────────────────────────┘
```

| Concern | Owner | Where |
|---|---|---|
| Virtual Private Gateway, Customer Gateways, VPN Connections, tunnel crypto options | Platform | `terraform/aws/_modules/vpn` |
| Which clients exist, their public IP + BGP ASN | Platform | `terraform/aws/network/af-south-1/vpn/terragrunt.hcl` |
| PSKs (AWS-generated), tunnel inside/outside addresses | Platform | AWS Secrets Manager `vpn/<client>/psk` |
| The `.rsc` file itself | Platform | `generate-vpn-config.py` |
| Pasting the `.rsc` into the router, keeping the router up, their LAN/cameras | **Client** | Their MikroTik |
| Aligning the MikroTik IPsec lifetimes/DPD to the AWS side | Platform (advisory, applied on client tin) | `docs/runbooks/vpn-mikrotik-ipsec.md` |

The dividing line is the `.rsc` file. Everything left of it is Terraform + a Python generator that the platform engineer runs. Everything right of it is the client's router.

## The AWS side — the `vpn` module

Source: `terraform/aws/_modules/vpn` (`main.tf`, `variables.tf`, `outputs.tf`).

### What it creates

- **One Virtual Private Gateway** (`aws_vpn_gateway.this`, tagged `vgw-af-south-1`), Amazon-side ASN **64512** (set in terragrunt). Route propagation is enabled onto the listed route tables via `aws_vpn_gateway_route_propagation.this`.
- **Per client, one Customer Gateway + one VPN Connection** (each with **two tunnels**), driven by the `var.customers` map.
- **A CloudWatch log group** `/aws/vpn/tunnels` for tunnel + BGP logs.
- **Per client, a Secrets Manager secret** `vpn/<client>/psk` holding both tunnels' PSKs and inside/outside addresses (see below).
- **CGW-updater automation plumbing**: a DynamoDB table `vpn-cgw-state` and (optionally) an IRSA IAM role `vpn-cgw-updater` for a Kubernetes CronJob that rewrites Customer Gateway IPs when a client's dynamic public IP changes.

### The two CGW / two VPN-connection variants

Because client routers have **dynamic public IPs** and AWS **auto-generates PSKs**, the module splits each resource into two `for_each` variants selected by per-client booleans. A `locals` block then merges each pair back into one map (`local.customer_gateways`, `local.vpn_connections`) so outputs and the PSK secret are uniform.

| Resource | Variant (default clients) | Variant (OCI-style) | Selector |
|---|---|---|---|
| `aws_customer_gateway.ignore_ip` | ✅ ignores IP changes | | `ignore_ip_changes = true` (default) |
| `aws_customer_gateway.managed_ip` | | static IP, `create_before_destroy` | `ignore_ip_changes = false` |
| `aws_vpn_connection.managed_psk` | ✅ AWS-managed PSK | | `ignore_psk_changes = false` (default) |
| `aws_vpn_connection.ignore_psk` | | external PSK (e.g. OCI) | `ignore_psk_changes = true` |

- `ignore_ip` CGWs set `lifecycle { ignore_changes = [ip_address] }` so Terraform does **not** fight the CGW-updater CronJob when a client's DDNS IP moves. The `ip_address` in terragrunt is therefore only a *seed* for first creation.
- `ignore_psk` connections set `ignore_changes = [tunnel1_preshared_key, tunnel2_preshared_key]` so an externally-managed PSK isn't reverted. All the current af-south-1 clients use the **default** variants (dynamic IP, AWS-managed PSK).

!!! note "moved{} blocks"
    `main.tf` keeps two `moved{}` blocks migrating `exampletest` from the old single-resource names (`aws_customer_gateway.this` / `aws_vpn_connection.this`) into the split `ignore_ip` / `managed_psk` names. The `client-g` (OCI Johannesburg) moved blocks were removed 2026-07-03 when client-g was decommissioned to be rebuilt CHR-terminated. Leave the `exampletest` blocks in place — deleting them would trigger destroy/recreate of that connection.

### Tunnel crypto defaults (IKEv2)

`local.default_tunnel_options` sets both tunnels identically, then merges any per-client `tunnel1_options` / `tunnel2_options` overrides on top. Key values:

```hcl
ike_versions                 = ["ikev2"]
phase1_encryption_algorithms = ["AES256", "AES256-GCM-16"]
phase2_encryption_algorithms = ["AES256", "AES256-GCM-16"]
phase1_integrity_algorithms  = ["SHA2-384", "SHA2-512"]
phase2_integrity_algorithms  = ["SHA2-256", "SHA2-384", "SHA2-512"]
phase1_dh_group_numbers      = [15,16,17,18,19,20,21,22,23,24]
phase1_lifetime_seconds      = 28800   # 8h  (IKE / Phase 1 SA)
phase2_lifetime_seconds      = 3600    # 1h  (IPsec / Phase 2 child SA)
rekey_margin_time_seconds    = 540     # AWS default; see warning below
rekey_fuzz_percentage        = 100
dpd_timeout_seconds          = 30
dpd_timeout_action           = "restart"   # AWS re-initiates on DPD timeout
startup_action               = "start"     # AWS actively initiates (CGW has dynamic IP)
```

- Routing is **dynamic BGP** (`static_routes_only = false`), both network CIDRs `0.0.0.0/0`, so BGP runs over the `169.254.x.x` tunnel inside addresses.
- `startup_action = "start"` is deliberate: the client IP is dynamic, so AWS actively initiates rather than waiting for the client.
- `tunnel1_enable_tunnel_lifecycle_control = true` on both tunnels enables the modify-in-place tunnel replacement the **tunnel-trampoline** Lambda uses.

!!! warning "Do not raise rekey_margin_time_seconds back toward the Phase-2 lifetime"
    The extensive comment in `main.tf` explains this. The old margin of `1800` with fuzz `100` opened the rekey window `1800 * 2 = 3600s` before a `3600s` Phase-2 expiry — i.e. AWS could try to rekey the child SA almost immediately and jitter-early every cycle, colliding with the MikroTik's own rekeys and leaving stale/half-open child SAs (the blackhole the tunnel-trampoline chases, or a fully-wedged tunnel). `540` (AWS's own default) gives one predictable rekey ~9–18 min before expiry. This was part of the 2026-07-17 incident fix. The MikroTik half of that fix lives in the IPsec runbook.

### Module inputs (the client list shape)

`var.customers` is a `map(object(...))`. The minimum per client is `bgp_asn` + `ip_address`; everything else defaults. Full shape (from `variables.tf`):

```hcl
customers = {
  "acme" = {
    bgp_asn    = 65001
    ip_address = "203.0.113.10"   # seed only for default clients (IP ignored after create)

    # lifecycle toggles (defaults shown)
    ignore_ip_changes      = true    # CGW-updater manages the IP
    ignore_psk_changes     = false   # AWS manages the PSK
    tunnel_log_enabled     = true
    tunnel_bgp_log_enabled = true

    # optional /30 inside CIDRs from 169.254.0.0/16 (else AWS auto-assigns)
    tunnel1_inside_cidr = null
    tunnel2_inside_cidr = null

    # optional per-tunnel crypto overrides (incl. external preshared_key)
    tunnel1_options = null
    tunnel2_options = null
  }
}
```

### Module outputs

| Output | Contents |
|---|---|
| `vpn_gateway_id` / `vpn_gateway_arn` | The VGW |
| `customer_gateway_ids` | `{ client => cgw-id }` |
| `vpn_connection_ids` | `{ client => vpn-id }` |
| `vpn_tunnel_details` | Per client: `tunnel1/2_address` (AWS outside IPs), `tunnel1/2_cgw_inside_address`, `tunnel1/2_vgw_inside_address` |
| `vpn_psk_secret_arns` | `{ client => secret-arn }` for `vpn/<client>/psk` |
| `cloudwatch_log_group_arn` / `_name` | `/aws/vpn/tunnels` |
| `cgw_updater_role_arn` / `_name` | IRSA role (null unless `enable_cgw_updater_iam`) |
| `cgw_state_table_name` / `_arn` | `vpn-cgw-state` DynamoDB table |

### The PSK secret (`vpn/<client>/psk`)

`aws_secretsmanager_secret_version.vpn_psk` writes a JSON blob per client containing **both tunnels'** PSK, outside address, BGP ASN and inside addresses:

```json
{
  "tunnel1_preshared_key": "…", "tunnel1_address": "…",
  "tunnel1_bgp_asn": "…",
  "tunnel1_cgw_inside_address": "169.254.x.x", "tunnel1_vgw_inside_address": "169.254.x.y",
  "tunnel2_preshared_key": "…", "tunnel2_address": "…", "…": "…"
}
```

!!! note "The generator does NOT read this secret"
    `generate-vpn-config.py` reads the tunnel details and PSKs **directly from `aws ec2 describe-vpn-connections`** (the live `CustomerGatewayConfiguration` XML + `Options.TunnelOptions[].PreSharedKey`), not from Secrets Manager. The secret is the durable, machine-readable copy for other consumers; the generator goes to the source of truth.

## The current client list (af-south-1)

Source: `terraform/aws/network/af-south-1/vpn/terragrunt.hcl`. All use the default variants (dynamic IP + AWS PSK).

| Client key | BGP ASN | Seed IP | MikroTik DDNS endpoint (comment) |
|---|---|---|---|
| `client-a` | 65102 | 198.51.100.5 | `hx0000000a1.sn.mynetname.net` |
| `client-b` | 65103 | 192.0.2.84 | `hx0000000c3.sn.mynetname.net` |
| `client-c` | 65104 | 198.51.100.15 | `hx0000000b2.sn.mynetname.net` |
| `client-d` (site D) | 65105 | 203.0.113.149 | `hx0000000e5.sn.mynetname.net` |
| `client-e` | 65109 | 192.0.2.146 | `b2c3d4e5f6a7.sn.mynetname.net` |
| `client-e-site2` | 65106 | 203.0.113.14 | `hx0000000d4.sn.mynetname.net` |
| `client-e-site3` | 65107 | 198.51.100.3 | `a1b2c3d4e5f6.sn.mynetname.net` |

Also configured in this file: `amazon_side_asn = 64512`, `log_retention_days = 3`, `vpc_id` from the `../vpc` dependency, and `route_table_ids` (prod-inside-a/b, staging-inside-a/b, network-outside-a/b) for VGW route propagation.

!!! note "Decommissioned / commented-out entries — do not blindly re-add"
    `client-e-site4` (removed 2026-07-03), `client-f` (ASN 65110, removed manually in AWS), and `client-g` (OCI Johannesburg, being rebuilt CHR-terminated active/active) are commented out with dated notes. Private-use ASNs live in **64512–65534**; the Amazon side (64512) must differ from every client ASN.

## The client `.rsc` — `generate-vpn-config.py`

Source: `generate-vpn-config.py`. This is the crux of the handover: it turns a live AWS VPN connection into a ready-to-paste MikroTik RouterOS script.

### How it runs

```bash
# By client name (resolved via the vpn-<name>-01 Name tag):
./generate-vpn-config.py client-a

# Or by explicit VPN connection ID:
./generate-vpn-config.py vpn-00fd03bf5da351523

# Positional overrides: <name_or_id> [region] [vpc_cidr]
./generate-vpn-config.py client-c af-south-1 10.161.0.0/16
```

Defaults: `region = af-south-1`, `vpc_cidr = 10.161.0.0/16`, `--aws-profile network`. It writes `<client>.rsc` in the current directory.

### What it does

1. **Resolves the connection.** If the arg matches `vpn-[0-9a-f]+` it is used as the ID; otherwise it lists all connections and matches on the extracted name from the `vpn-<name>-01` `Name` tag (exact match wins over partial; ambiguity aborts with the candidate list).
2. **Fetches** `aws ec2 describe-vpn-connections --vpn-connection-ids <id> --profile network`.
3. **Parses** the `CustomerGatewayConfiguration` XML — the two `ipsec_tunnel` elements — plus `VgwTelemetry[].OutsideIpAddress` and `Options.TunnelOptions[].PreSharedKey`. From this it derives per tunnel: AWS **outside** IP, **PSK**, customer inside IP, AWS inside IP, and the customer/AWS **BGP ASNs**. The `/30` inside CIDR is computed as `customer_inside_ip` minus 2 in the last octet.
4. **Emits** the `.rsc` (see next section).

### Optional flags (site-specific behaviour)

| Flag | Effect |
|---|---|
| `--enable-nat-t` | Sets `nat-traversal=yes` on the IPsec profile and adds `my-id=address:<ip>` to both identities. Needed when the router sits behind NAT. |
| `--nat-t-my-id <ip>` | The `my-id` address (default `198.51.100.3`, the Boveland router). |
| `--enable-camera-capture-nat` | Adds a `dst-nat` + `masquerade` pair so camera capture-event traffic (TCP `3333` by default) is forwarded into the VPC. |
| `--camera-capture-dst-address` / `--camera-capture-target-address` / `--camera-capture-port` / `--camera-capture-comment` | Tune those NAT rules (defaults `10.0.0.4` → `10.161.0.193`, port `3333`). |
| `--address-list-entry 'LIST\|SUBNET\|COMMENT'` | Repeatable. Adds extra firewall address-list rows, e.g. `camera-bgp\|172.16.61.28/32\|Camera to add to BGP`. |
| `--bgp-output-network-list` | Address-list name referenced by BGP `output.network` (default `BGP`). |

## What the client receives (contents of the `.rsc`)

The generated file substitutes **real values** (MikroTik variables only work inside scripts, so the generator inlines everything). A commented header records the ASNs, both tunnels' outside/inside IPs, the VPC CIDR, and whether NAT-T is on. The body configures, in RouterOS syntax:

- **`/ip ipsec profile`** — one IKEv2 profile `hub-aws-ike2`: `dh-group=ecp384`, `enc-algorithm=aes-256`, `hash-algorithm=sha384`, `prf-algorithm=sha384`, `lifetime=8h`, `nat-traversal=<yes|no>`.
- **`/ip ipsec peer`** — `hub-aws-t1` and `hub-aws-t2`, each pointing at one AWS tunnel **outside IP**, `exchange-mode=ike2`.
- **`/ip ipsec proposal`** — `hub-aws-esp`: `auth-algorithms=sha512,sha256`, `enc-algorithms=aes-256-cbc,aes-256-gcm`, `pfs-group=ecp384`, `lifetime=1h`.
- **`/routing bgp instance`** — `hub-aws-ins1` / `hub-aws-ins2`, `as=<customer_asn>`, router-id = each tunnel's customer inside IP.
- **`/ip ipsec identity`** — one per peer, carrying the **PSK** (`secret="…"`) and `remote-id=address:<aws-outside-ip>` (plus `my-id` if NAT-T).
- **`/ip ipsec policy`** — tunnel policies for the VPC CIDR and the tunnel inside `/30`, bound to each peer with `proposal=hub-aws-esp tunnel=yes`.
- **`/routing bgp connection`** — `hub-aws-bgp1` / `hub-aws-bgp2`: eBGP, multihop, `local.address=<customer_inside>%lo`, `remote.address=<aws_inside>/32 .as=<aws_asn>`, `output.network=<BGP list>`, redistribute connected.
- **`/ip address`** — the two tunnel customer inside IPs bound to the `lo` (loopback) interface (BGP peers off the loopback so a single tunnel flap doesn't drop the session).
- **`/ip firewall address-list`** — `hub-aws-outside` (both AWS outside IPs), `hub-aws-inside` (both AWS inside IPs), `hub-aws-vpc` (the VPC CIDR), plus any `--address-list-entry` rows.
- **`/ip firewall filter`** — input accepts for IPsec UDP **500** & **4500** and **ESP** from `hub-aws-outside`, BGP **TCP 179** from `hub-aws-inside`, and forward accepts both directions for `hub-aws-vpc`.
- **`/ip firewall nat`** — only when `--enable-camera-capture-nat` is set (the `dst-nat` + `masquerade` pair).

!!! warning "The .rsc contains live pre-shared keys — treat it as a secret"
    The `secret="…"` values in the `/ip ipsec identity` section are the real tunnel PSKs pulled from AWS. Hand the file to the client over a secure channel; do not commit generated `.rsc` files, paste them into tickets, or email them in the clear.

### Tunnel topology (dual-tunnel active/standby)

Each VPN connection has two independent tunnels to two different AWS endpoints, and the client router brings up both:

| | Tunnel 1 | Tunnel 2 |
|---|---|---|
| AWS outside IP | `tunnel1_address` | `tunnel2_address` |
| AWS inside (VGW) | `tunnel1_vgw_inside_address` | `tunnel2_vgw_inside_address` |
| Client inside (CGW) | `tunnel1_cgw_inside_address` | `tunnel2_cgw_inside_address` |
| MikroTik peer | `hub-aws-t1` | `hub-aws-t2` |
| MikroTik BGP | `hub-aws-bgp1` | `hub-aws-bgp2` |

Both tunnels run BGP simultaneously. The design is **active/standby failover**: traffic uses one tunnel, and if it drops, BGP + DPD reconverge onto the other. DPD (`dpd_timeout_action = "restart"` AWS-side, `dpd-interval=10s` / `dpd-maximum-failures=3` MikroTik-side) tears down a dead peer so it self-heals. See the MikroTik IPsec runbook for the client-router lifetime/DPD settings that must match the AWS side, and the tunnel-trampoline module for the AWS-side auto-remediation of a wedged tunnel.

## How to onboard a new client VPN

!!! tip "Prerequisites"
    AWS CLI configured with the `network` profile (the VPN lives in the network account, af-south-1). Terragrunt. Python 3. The client's router public IP (a seed) and an agreed **BGP ASN** in 64512–65534 that is unique and not equal to 64512.

1. **Add the client to the customer map.** Edit `terraform/aws/network/af-south-1/vpn/terragrunt.hcl` and add an entry under `customers`, mirroring the existing ones (include the DDNS endpoint as a comment):

    ```hcl
    "newclient" = { # <router>.sn.mynetname.net
      bgp_asn    = 65111        # unique, 64512–65534, != 64512
      ip_address = "203.0.113.10"  # seed only; CGW-updater manages it after
    }
    ```

2. **Plan and apply the AWS side** (from the vpn terragrunt dir; note network account is applied manually — it is not in CI):

    ```bash
    export AWS_PROFILE=network
    cd terraform/aws/network/af-south-1/vpn
    terragrunt plan     # expect: 1 CGW, 1 VPN connection (2 tunnels), 1 PSK secret
    terragrunt apply
    ```

    This creates `cgw-newclient-01`, `vpn-newclient-01`, and the `vpn/newclient/psk` secret. AWS auto-generates the PSKs and assigns tunnel addresses.

3. **Generate the client `.rsc`** from the live connection:

    ```bash
    ./generate-vpn-config.py newclient
    # → writes newclient.rsc
    # Behind NAT?  add --enable-nat-t --nat-t-my-id <router-public-ip>
    # Camera capture events?  add --enable-camera-capture-nat
    ```

    Review the printed summary (ASNs, both tunnels, VPC CIDR).

4. **Hand the `.rsc` to the client** over a secure channel and have them paste it into their MikroTik (e.g. `/import newclient.rsc`, or WinBox terminal). This is the boundary — from here the client owns applying it. It contains live PSKs, so treat it as a secret and do not commit it.

5. **Ask the client to align IPsec lifetimes/DPD** per the MikroTik IPsec runbook (Phase 1 `8h`, Phase 2 `1h`, `dpd-interval=10s`, `dpd-maximum-failures=3`) so AWS stays the rekey initiator and a dead peer self-heals.

6. **Verify both tunnels come up.** Check the AWS side and Grafana:

    ```bash
    aws ec2 describe-vpn-connections --profile network --region af-south-1 \
      --filters Name=tag:Customer,Values=newclient \
      --query 'VpnConnections[].VgwTelemetry[].[Status,StatusMessage]' --output table
    ```

    On the **VPN Tunnels** Grafana dashboard, confirm `aws_vpn_tunnel_state_maximum == 1` and that BGP routes for the client's subnets appear (route propagation is already enabled on the listed route tables).

## How to regenerate a client `.rsc` (rotation / re-handover)

If a client re-images their router, or a PSK/tunnel changes, just re-run the generator — it always reads current AWS state:

```bash
export AWS_PROFILE=network
cd terraform/aws/network/af-south-1/vpn
./generate-vpn-config.py <client>          # or the vpn-<id>
```

Then hand the fresh `.rsc` back to the client. No Terraform change is needed unless the client's BGP ASN or lifecycle behaviour is changing.

## How to decommission a client VPN

1. Remove (or comment out with a dated note, as the existing entries do) the client's block from `customers` in `terragrunt.hcl`.
2. `export AWS_PROFILE=network && terragrunt apply` — this destroys the CGW, VPN connection and PSK secret for that client.
3. Note it in the file's comment block (see `client-e-site4` / `client-f` / `client-g` precedents) so the history is auditable.

## Gotchas

- **Network account is applied by hand.** The `network` account is not wired into CI — `terragrunt apply` here is a manual, `AWS_PROFILE=network` operation.
- **`ip_address` in terragrunt is a seed, not the truth.** For the default (dynamic-IP) clients the CGW ignores `ip_address` after creation; the CGW-updater CronJob (IRSA role `vpn-cgw-updater`, DynamoDB `vpn-cgw-state`) keeps it current. Editing the seed IP in terragrunt does **not** move a live tunnel.
- **The `.rsc` inlines PSKs.** It is a secret. Don't commit it, don't paste it into tickets.
- **Keep MikroTik lifetimes equal to (not shorter than) the AWS values** so AWS stays the rekey initiator — see the runbook. Raising AWS `phase*_lifetime_seconds` means raising the client side to match.
- **Don't remove the `exampletest` `moved{}` blocks** in `main.tf` — they migrate state, and removing them forces destroy/recreate.
- **`client-d` was noted down in a prior session** (site D) — if its tunnel is down, that's a known deferred item rather than a fresh break.
