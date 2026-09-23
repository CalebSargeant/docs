# Network addressing plan (IPAM)

This is the authoritative IP-address / CIDR register for the platform estate. Every value on this
page is pulled from the Terragrunt roots and the `vpc`/`vpn` modules — it is generated *from* code,
not maintained by hand, so treat the linked source as the source of truth if the two ever disagree.

The address space is deliberately small and hand-planned around a single **shared "mono-VPC"** in
AWS `af-south-1`, carved into a per-environment `/19` and then RAM-shared into each workload account.
The whole `10.161.0.0/16` supernet is the platform's; Azure lives in a parallel `10.162.0.0/19`, and a
small `10.119.0.0/16` slice is reserved for `eu-central-1`.

!!! info "Where these numbers come from"
    - AWS environments, CIDRs and subnet tiers: `terraform/aws/root.hcl` (`inputs.environments` + `inputs.regions`).
    - How each `/19` is sliced into per-AZ `/24`s: `terraform/aws/_modules/vpc/_subnet.tf`.
    - Cross-account subnet sharing: `terraform/aws/_modules/vpc/_ram.tf`.
    - Azure VNet/subnets: `terraform/azure/root.hcl`.
    - Client Site-to-Site VPN peers: `terraform/aws/network/af-south-1/vpn/terragrunt.hcl` + `_modules/vpn`.

## Supernet allocation at a glance

| Supernet | Cloud / scope | Owner |
|----------|---------------|-------|
| `10.161.0.0/16` | AWS `af-south-1` mono-VPC (all environments, sliced per-env `/19`) | network account `210987654321` |
| `10.162.0.0/19` | Azure `southafricanorth` prod VNet | subscription `00000000-…` |
| `10.119.0.0/16` | AWS `eu-central-1` (Frankfurt) — **reserved, not deployed** | network / prod (map only) |
| `169.254.0.0/16` | Site-to-Site VPN tunnel *inside* addresses (AWS-assigned per tunnel) | AWS-managed |

!!! note "One VPC, many environments — the mono-VPC"
    Despite the per-environment CIDRs below, AWS `af-south-1` has a **single** VPC
    (`aws_vpc.this`, `Name = mono-vpc`) built only from the **network** account leaf
    (`terraform/aws/network/af-south-1/vpc`).
    Its CIDR is `10.161.0.0/16` — set by
    `network/af-south-1/region.hcl`
    as `vpc_cidr` (broader than the `10.161.0.0/19` the `root.hcl` map lists for the network *env*).
    Each environment's `/19` is a **slice within that one VPC**; the workload accounts never get
    their own VPC — they get the relevant subnets *shared in* via RAM (see
    [Cross-account subnet sharing](#cross-account-subnet-sharing-ram)).

## Master register — Account / Env → Region → CIDR → subnet tiers

From `root.hcl`'s `environments` map. `az_count` is how many AZs are actually built; the subnet
tiers differ by the account's **role** — the `network` account runs a firewall/transit topology
(`outside` / `management` / `inside`), workload accounts run `app` / `data`.

| Env | AWS account | Region | `az_count` | Env CIDR (`/19`) | Subnet tiers | Live dir? |
|-----|-------------|--------|:---:|------------------|--------------|:---:|
| network | `210987654321` | af-south-1 | 2 | `10.161.0.0/19` | outside, management, inside | ✅ |
| shared | `123456789012` | af-south-1 | 2 | `10.161.32.0/19` | app, data | ❌ map-only |
| prod | `777788889999` | af-south-1 | 2 | `10.161.64.0/19` | app, data | ✅ |
| staging | `444455556666` | af-south-1 | 2 | `10.161.96.0/19` | app, data | ✅ |
| dev | `111122223333` | af-south-1 | 1 | `10.161.128.0/19` | app, data | ❌ map-only |
| network | `210987654321` | `testing123` | 2 | `10.161.160.0/19` | outside, management, inside | ❌ placeholder |
| network | `210987654321` | eu-central-1 | 1 | `10.119.0.0/24` | outside, management, inside | ❌ reserved |
| prod | `777788889999` | eu-central-1 | 1 | `10.119.1.0/24` | app, data | ❌ reserved |

!!! note "Reserved vs. active allocations"
    `shared` and `dev` are declared in the map (account IDs + CIDRs) but have **no**
    `terraform/aws/<env>/` directory. Their subnets *are* still created inside the mono-VPC (the
    `vpc` module iterates all five environments — see below) and RAM-shared, but no workload is
    deployed against them. `testing123` is a placeholder region *key* (not a real AWS region), and
    `eu-central-1` has map entries but no live VPC, so its `10.119.x` subnets are never actually
    provisioned. Treat all four as **reserved** address space.

### Region metadata

From `root.hcl`'s `regions` map — descriptive metadata (separate from the CIDR map above):

| Region | `az_letters` | `city_code` | `country_code` | `timezone` |
|--------|--------------|-------------|----------------|------------|
| af-south-1 | a, b, c | `cpt` | `za` | Africa/Johannesburg |
| eu-central-1 | a, b, c | `fra` | `de` | Europe/Berlin |

!!! note "`az_letters` is narrowed for the network region"
    `network/af-south-1/region.hcl`
    overrides `az_letters` to `["a","b"]`. Since every af-south-1 environment sets `az_count = 2`
    (except `dev = 1`), only AZs **a** and **b** are ever built regardless.

## How subnets are derived per AZ

`_modules/vpc/_subnet.tf`
iterates `local.all_environments = ["network","shared","prod","staging","dev"]`, and for each
environment's subnet tiers × AZs computes a **`/24`** with:

```hcl
cidr_block = cidrsubnet(
  var.environments[env].regions[region].cidr,   # the env /19
  5,                                             # +5 bits: /19 -> /24
  (index(subnets, subnet_type) * 3) + az_index   # reserved_az_count = 3 per tier
)
```

The `* 3` (`reserved_az_count = 3`) reserves a slot for a third AZ per tier even though only two are
built — so tier `n`, AZ `i` lands at `netnum = 3n + i` within the `/19`. Subnet keys are
`${env}-${subnet_type}-${az_letter}` and each subnet is tagged `Environment`, `SubnetType`, `AZ`
(those tags are what `load-balancers` and `external-dns` later filter on). `map_public_ip_on_launch`
is forced `false` for every subnet.

### Derived subnet register (af-south-1)

Concrete `/24`s produced by that formula. Note the **gaps** (e.g. `10.161.2.0/24`, `10.161.66.0/24`)
— those are the reserved-but-unbuilt third-AZ slots.

| Env | Tier | AZ a | AZ b |
|-----|------|------|------|
| network | outside | `10.161.0.0/24` | `10.161.1.0/24` |
| network | management | `10.161.3.0/24` | `10.161.4.0/24` |
| network | inside | `10.161.6.0/24` | `10.161.7.0/24` |
| shared | app | `10.161.32.0/24` | `10.161.33.0/24` |
| shared | data | `10.161.35.0/24` | `10.161.36.0/24` |
| prod | app | `10.161.64.0/24` | `10.161.65.0/24` |
| prod | data | `10.161.67.0/24` | `10.161.68.0/24` |
| staging | app | `10.161.96.0/24` | `10.161.97.0/24` |
| staging | data | `10.161.99.0/24` | `10.161.100.0/24` |
| dev | app | `10.161.128.0/24` | *(az_count 1 — not built)* |
| dev | data | `10.161.131.0/24` | *(az_count 1 — not built)* |

!!! info "Cross-checks that confirm the derivation"
    These `/24`s are corroborated by other modules that hardcode hosts inside them: the
    `config-mikrotik` prod dst-NAT targets `10.161.64.10` / `10.161.65.10` (prod `app-a`/`app-b`,
    host `.10`), and the `mongodb-private-link` shared endpoints pin `10.161.35.10` / `10.161.36.10`
    (shared `data-a`/`data-b`, host `.10`).

## Per-AZ routing

From `_modules/vpc/_routing.tf`:
the default route table is deliberately kept **empty**, one route table is created per subnet key,
and a default route to the Internet Gateway (`mono-igw`) is added **only for the `management` and
`outside`** tiers.

!!! warning "Route-table associations are not managed in Terraform"
    `aws_route_table_association.subnet_az` is **commented out** ("un-un comment when doing routes in
    terraform again"). The module creates the route tables but does **not** bind them to subnets, and
    the data-plane routing (to the FortiGate ENI, inside subnets, etc.) is hand-finished outside
    Terraform. Do not assume the routing here is complete from the IaC alone.

## Cross-account subnet sharing (RAM)

The mono-VPC lives in the network account, but workload subnets must appear in each environment's own
account. `_modules/vpc/_ram.tf`
does this with **AWS Resource Access Manager**:

- One `aws_ram_resource_share` **per non-network environment** (`${env}-subnets-share`), all with
  `allow_external_principals = true`.
- Every subnet tagged `Environment != network` is associated to *its* environment's share
  (`aws_ram_resource_association.env_subnets`, keyed off the subnet's `Environment` tag).
- Each share is granted to that environment's **account ID** as principal
  (`aws_ram_principal_association.env_accounts_subnets`, `principal = env.account_id`).

Net effect: the `prod` account sees `10.161.64.0/19` subnets, `staging` sees `10.161.96.0/19`, etc.,
all as *shared* subnets in the single mono-VPC — the workload accounts launch ENIs/EKS nodes/RDS into
them without owning the VPC. The `network` account keeps its own `outside`/`management`/`inside`
subnets un-shared. (There is also a generic `vpc-subnets-share` resource share defined but the
per-env shares are what actually carry the associations.)

The reciprocal control-plane path is the generated `aws.network` provider (assume-role into
`arn:aws:iam::210987654321:role/TerraformNetworkAdmin`) that lets prod/staging leaves *read* the
shared VPC/subnets and *write* network-account Route53 — see
[Terragrunt foundation → cross-account access](terraform-overview.md#cross-account-access-the-network-provider).

## The MikroTik / CHR management overlay

The cloud-side routers (**MikroTik CHR** — Cloud Hosted Router EC2 instances) that terminate the
management overlay and front the FortiGate live in the **network** account's `outside`/`inside`
subnets, provisioned by the three `_mikrotik_*.tf` files in the `vpc` module. All three
(`prod`/`shared`/`staging`) reuse the **same** hardcoded network subnet IDs from
`_modules/vpc/_mikrotik_staging.tf`
and differentiate their CHRs by **host number** via `cidrhost(...)`:

| CHR set | Host number | Outside ENIs (network `outside` a/b) | Inside ENIs (network `inside` a/b) |
|---------|:---:|--------------------------------------|------------------------------------|
| prod | `.10` | `10.161.0.10`, `10.161.1.10` | `10.161.6.10`, `10.161.7.10` |
| shared | `.30` | `10.161.0.30`, `10.161.1.30` | `10.161.6.30`, `10.161.7.30` |
| staging | `.20` (`var.private_ip_number` default) | `10.161.0.20`, `10.161.1.20` | `10.161.6.20`, `10.161.7.20` |

Each CHR has an `outside` ENI (device_index 0, with an Elastic IP) and an `inside` ENI
(device_index 1), both `source_dest_check = false` so they can route. The public "outside" IP follows
the active prod CHR via the `eip-failover-lambda` (EIP `eipalloc-0027e8493b34f3272`, targets
`i-0f70bc3058d11b496` / `i-0dff013f8d3c7dce9`) — see
[AWS network & edge → eip-failover-lambda](terraform-aws-network-edge.md#eip-failover-lambda).

!!! note "RouterOS config lives elsewhere / is mid-migration"
    Layer-3 on the CHRs (WireGuard, BGP AS `65164`, the default route to the FortiGate inside IP,
    the `claimEIP` script) is the `config-mikrotik` module's job, but that module is flagged
    **inconsistent / mid-migration** (see
    [network & edge → config-mikrotik](terraform-aws-network-edge.md#config-mikrotik) and
    [Legacy & orphans](legacy-and-orphans.md)). Addressing here is authoritative; the RouterOS
    overlay config is not.

## eu-central-1 (Frankfurt) — reserved

Map entries only; there is **no** `eu-central-1` live VPC directory, so nothing below is actually
provisioned. Both slices are `/24`s (not `/19`s), so the `/24 → +5 bits` derivation yields **`/29`**
subnets:

| Env | CIDR | Derived subnet-a (`/29`) examples |
|-----|------|-----------------------------------|
| network | `10.119.0.0/24` | outside `10.119.0.0/29`, management `10.119.0.24/29`, inside `10.119.0.48/29` |
| prod | `10.119.1.0/24` | app `10.119.1.0/29`, data `10.119.1.24/29` |

!!! warning "Reserved only — do not treat as live"
    The `vpc` module only runs from the af-south-1 network leaf, so these `10.119.x` subnets exist
    solely as reserved allocations in `root.hcl`. If Frankfurt is ever stood up, the `/24`-sourced
    `/29`s above are what the current formula would produce — re-check the intended prefix before
    building.

## Azure — `southafricanorth` prod VNet

From `terraform/azure/root.hcl`.
A single `prod` environment (subscription `00000000-1111-2222-3333-444444444444`), region
`southafricanorth` (city `jhb`), availability zones `["1","2"]`. Unlike AWS, the Azure subnets are
**declared explicitly** as `/22`s (not derived):

| Scope | CIDR |
|-------|------|
| VNet | `10.162.0.0/19` |
| `outside` subnet | `10.162.0.0/22` |
| `inside` subnet | `10.162.8.0/22` |
| `app` subnet | `10.162.12.0/22` |
| `data` subnet | `10.162.16.0/22` |

The Azure domain is `az.example.net` (vs. AWS `aws.example.net`) and its Terraform state is stored in **AWS S3**
(`example-azure-prod-southafricanorth`, af-south-1) to avoid the chicken-and-egg of bootstrapping
an Azure storage account. A large commented-out `oldprod` block in the same file documents a parked
VM/subnet migration and is inert.

## Client Site-to-Site VPN peers

Each client site (a field MikroTik) reaches the mono-VPC over an **AWS Site-to-Site VPN** from a
single Virtual Private Gateway (Amazon-side ASN **`64512`**). The peer set is defined in
`network/af-south-1/vpn/terragrunt.hcl`;
the machinery is `_modules/vpn`.
See [Client VPN — the handover boundary](../handover/client-vpn.md) for the full onboarding flow.

Resources per client are named `cgw-<client>-01` (customer gateway) and `vpn-<client>-01` (VPN
connection, 2 tunnels). All current clients use the **default variant**: dynamic public IP
(`ignore_ip_changes = true`) + AWS-managed PSK. The `ip_address` below is a **seed for first
creation only** — the CGW-updater CronJob (DynamoDB `vpn-cgw-state`) keeps the live CGW IP current as
the client's DDNS address moves.

| Connection (`vpn-<client>-01`) | BGP ASN | CGW seed public IP | Remote inside CIDR (client LAN) | DDNS endpoint (comment) |
|--------------------------------|:---:|--------------------|----------------------------------|-------------------------|
| `client-a` | 65102 | `198.51.100.5` | BGP-learned — see note | `hx0000000a1.sn.mynetname.net` |
| `client-b` | 65103 | `192.0.2.84` | BGP-learned — see note | `hx0000000c3.sn.mynetname.net` |
| `client-c` | 65104 | `198.51.100.15` | BGP-learned — see note | `hx0000000b2.sn.mynetname.net` |
| `client-d` (site D) | 65105 | `203.0.113.149` | BGP-learned — see note | `hx0000000e5.sn.mynetname.net` |
| `client-e` | 65109 | `192.0.2.146` | BGP-learned — see note | `b2c3d4e5f6a7.sn.mynetname.net` |
| `client-e-site2` | 65106 | `203.0.113.14` | BGP-learned — see note | `hx0000000d4.sn.mynetname.net` |
| `client-e-site3` | 65107 | `198.51.100.3` | BGP-learned (`172.16.61.28/32` camera noted) | `a1b2c3d4e5f6.sn.mynetname.net` |

- **Amazon-side ASN** `64512`; client ASNs are private-use `64512–65534` and must each differ from
  `64512`. `log_retention_days = 3` for the `/aws/vpn/tunnels` CloudWatch log group.
- **VGW route propagation** targets these route tables (from the leaf's `route_table_ids`):
  `prod-inside-a/b`, `staging-inside-a/b`, `network-outside-a/b`.

!!! warning "Operator input needed — client-side remote CIDRs are not in code"
    The VPN connections are **dynamic-BGP** (`static_routes_only = false`), and both
    `local_ipv4_network_cidr` / `remote_ipv4_network_cidr` are set to `0.0.0.0/0` so BGP runs over
    the tunnel inside addresses. That means **no client's actual LAN / camera subnet is declared in
    this repo** — each remote prefix is *learned at runtime via BGP* and can only be read from the
    live AWS side (`aws ec2 describe-vpn-connections`) or the router. The only remote-side prefix
    that appears anywhere in-tree is `client-e-site3`'s `172.16.61.28/32` camera address, and only
    as a comment / `generate-vpn-config.py` example. Populate the "Remote inside CIDR" column from
    the live BGP table / client records — it is **operator input**, not derivable from the repo.

!!! note "Tunnel inside addresses (169.254.0.0/16) are AWS-assigned"
    The two `/30` tunnel inside CIDRs per connection (the `169.254.x.x` link-local BGP peering
    addresses) default to AWS auto-assignment — the `tunnel1_inside_cidr` / `tunnel2_inside_cidr`
    inputs are `null` for every current client. Their concrete values live only in AWS (and the
    `vpn/<client>/psk` Secrets Manager blob), not in Terraform.

!!! note "Decommissioned / pending peers"
    `client-e-site4` and `client-f` (ASN 65110) were decommissioned 2026-07-03. **`client-g`**
    (OCI Johannesburg) was removed the same day and is slated to be rebuilt **CHR-terminated**
    (active/active, two MikroTik CHRs in the client-i OCI VCN, each terminating its own AWS S2S
    connection). Its peer/remote CIDRs are therefore **operator input pending the rebuild** — see the
    commented block in the VPN terragrunt and the AWS↔OCI dual-tunnel design.

## Quick reference — who owns what

| Range | Purpose |
|-------|---------|
| `10.161.0.0/24`, `10.161.1.0/24` | network `outside` (a/b) — CHR outside ENIs + FortiGate |
| `10.161.3.0/24`, `10.161.4.0/24` | network `management` (a/b) |
| `10.161.6.0/24`, `10.161.7.0/24` | network `inside` (a/b) — CHR inside ENIs |
| `10.161.32.0/19` | shared (reserved) — incl. MongoDB PrivateLink endpoints `10.161.35.10` / `.36.10` |
| `10.161.64.0/19` | **prod** app/data — EKS nodes, RDS, ElastiCache |
| `10.161.96.0/19` | **staging** app/data |
| `10.161.128.0/19` | dev (reserved) |
| `10.161.160.0/19` | `testing123` placeholder |
| `10.162.0.0/19` | Azure prod VNet (`southafricanorth`) |
| `10.119.0.0/16` | eu-central-1 (reserved, not deployed) |
| `169.254.0.0/16` | S2S VPN tunnel inside `/30`s (AWS-assigned) |
