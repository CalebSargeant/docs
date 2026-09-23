# Terraform AWS modules — network & edge

Reusable Terraform modules under `terraform/aws/_modules`
that build the platform's AWS networking and edge layer: the shared "mono-VPC",
the Site-to-Site VPN mesh to customer sites, the VPN observability/alerting/auto-remediation
pipeline, the CHR EIP failover path, the public edge (load balancers, ACM certs,
CloudFront for the API and images), cross-account `external-dns`, and the MongoDB
Atlas PrivateLink endpoint.

Every module here is a *child module*. It is consumed by a Terragrunt leaf under
`terraform/aws/<env>/<region>/<name>/terragrunt.hcl`, whose `source` is
`_modules//<basename-of-leaf-dir>` — so the leaf directory name equals the module
name (`api-cdn` → `cloudfront-api` and `images-cdn` → `cloudfront-images` are the
two exceptions). Providers (`aws`, `aws.network`, `aws.us-east-1`) and remote
state are injected by the Terragrunt-generated root files, so modules generally do
**not** declare their own `provider` blocks. Environments in play are `network`
(account `210987654321`), `prod` (`777788889999`) and `staging`, all in
`af-south-1`.

!!! note "Account topology"
    The VPN, VPC, VPN alerting/trampoline and CHR-related resources live in the
    **network** account. The `vpn-metrics-*-iam` pair spans **network** (reader
    role) and **prod** (exporter role). CloudFront/ACM/LB/external-dns modules run
    in **prod** or **staging** but frequently reach back into **network** via the
    `aws.network` provider (which assumes `TerraformNetworkAdmin`) for Route53 and
    VPC lookups.

---

## Module index

| Module | Purpose | Consumed by (leaf) |
|--------|---------|--------------------|
| [`vpc`](#vpc) | The shared "mono-VPC": subnets, route tables, Route53 zones, RAM shares, CHR/MikroTik EC2 | `network/.../vpc` |
| [`vpn`](#vpn) | AWS Site-to-Site VPN (IKEv2, dynamic BGP) per customer + CGW-updater IAM/DynamoDB | `network/.../vpn` |
| [`vpn-alerting`](#vpn-alerting) | CloudWatch `TunnelState` alarm → SNS → PagerDuty + Slack notifier Lambda | `network/.../vpn-alerting` |
| [`tunnel-trampoline`](#tunnel-trampoline) | EventBridge Lambda that auto-replaces blackholed / wedged-DOWN VPN tunnels | `network/.../tunnel-trampoline` |
| [`vpn-metrics-network-iam`](#vpn-metrics-iam-modules) | Network-account CloudWatch-read role for the prod metrics exporter | `network/.../vpn-metrics-network-iam` |
| [`vpn-metrics-prod-iam`](#vpn-metrics-iam-modules) | Prod-account EKS Pod Identity role that role-chains into the reader | `prod/.../vpn-metrics-prod-iam` |
| [`eip-failover-lambda`](#eip-failover-lambda) | Lambda (+ Function URL) to move an EIP between CHR instances | `network/.../eip-failover-lambda` |
| [`config-mikrotik`](#config-mikrotik) | RouterOS (MikroTik/CHR) config via the `routeros` provider | `network` & `prod` `.../config-mikrotik` |
| [`load-balancers`](#load-balancers) | Public NLB fronting EKS nodes (+ optional ACM/ALB, commented out) | `prod/.../load-balancers` |
| [`acm-certificates`](#acm-certificates) | Regional ACM cert with cross-account Route53 DNS validation | `prod` & `staging` `.../acm-certificates` |
| [`cloudfront-api`](#cloudfront-api) | CloudFront in front of the public-api ALB, injecting API creds as origin headers | `prod` & `staging` `.../api-cdn` |
| [`cloudfront-images`](#cloudfront-images) | CloudFront over the images S3 bucket with OAC | `staging/.../images-cdn` |
| [`external-dns`](#external-dns) | Cross-account IRSA so staging external-dns writes network-account Route53 | `staging/.../external-dns` |
| [`mongodb-private-link`](#mongodb-private-link) | Interface VPC endpoint to a MongoDB Atlas PrivateLink service | *(no live leaf — see notes)* |

---

## vpc

`_modules/vpc`
builds the single shared VPC (`Name = mono-vpc`) that every environment's subnets
are carved out of and RAM-shared into. It is applied only from the **network**
account leaf but provisions subnets for all environments.

### Structure

The module is split by concern into `_`-prefixed files:

| File | Contents |
|------|----------|
| `_vpc.tf` | `aws_vpc.this` (`var.vpc_cidr`, `enable_dns_hostnames = true`) |
| `_igw.tf` | `aws_internet_gateway.this` (`mono-igw`) |
| `_subnet.tf` | Computes a per-`env`/`subnet-type`/`AZ` subnet map and creates `aws_subnet.this` |
| `_routing.tf` | Empties the default RT, one RT per subnet key, default-route-via-IGW for `management`/`outside` |
| `_route53.tf` | Parent zone + per-env public & private zones + NS delegation |
| `_sg.tf` | `${env}-sg` (allow-all) and `${env}-bootstrap-sg` |
| `_ram.tf` | RAM resource shares associating non-network subnets to each env account |
| `_iam.tf` | `TerraformNetworkAdmin` cross-account admin role |
| `_key_pair.tf` | `mikrotik-ssh-key` EC2 key pair |
| `_mikrotik_staging.tf` | Hardcoded subnet locals + `data.aws_subnet` used by **all three** MikroTik files, plus the staging CHR EC2 |
| `_mikrotik_prod.tf` | Prod CHR ENIs/EIPs/instances (`c5.large`) |
| `_mikrotik_shared.tf` | Shared CHR ENIs/EIPs/instances |

### Subnet & CIDR scheme

`_subnet.tf` iterates `local.all_environments = ["network","shared","prod","staging","dev"]`.
For each environment's `subnets` list (subnet types) and each AZ it produces a
`/24` via `cidrsubnet(<env cidr>, 5, (index(subnet_type)*3)+az_index)` — i.e. it
carves `/24`s out of each environment's `/19`, reserving **3 AZs per subnet type**
(`reserved_az_count = 3`). Subnet keys are `${env}-${subnet_type}-${az_letter}`
and every subnet is tagged `Environment`, `SubnetType`, `AZ` (those tags are what
`load-balancers` / `external-dns` later filter on). `map_public_ip_on_launch` is
forced `false`.

### Routing

`aws_default_route_table.default` is deliberately kept **empty** ("not in use").
Per-subnet-key route tables (`aws_route_table.subnet_az`) are created, and a
default route to the IGW is added only for `management` and `outside` subnet types.

!!! warning "Route-table associations are commented out"
    `aws_route_table_association.subnet_az` in
    `_routing.tf`
    is commented out ("Un-un comment when doing routes in terraform again"), so the
    module creates route tables but does **not** bind them to subnets. Data-plane
    routing (to the FortiGate ENI, inside subnets, etc.) is described in the file
    header as a requirement but is managed outside this Terraform. Treat the
    routing here as partial/hand-finished.

### Route53 zones

- `aws_route53_zone.parent` = `var.domain` (default `aws.example.net`).
- Public zones per env: `network` → `<city>.aws.example.net`, others → `<env>.<city>.aws.example.net`.
- Private zones per env: `internal.<...>` variants, each associated to the VPC.
- `aws_route53_record.subdomain_delegation` adds NS records in the parent zone for
  each public subdomain.

### MikroTik / CHR EC2

Three near-identical files (`prod`, `shared`, `staging`) each create a pair of
EIPs, outside + inside ENIs (`source_dest_check = false`), EIP associations and
`aws_instance` CHRs (device_index 0 = outside, 1 = inside). All three reference the
**same** `local.network_inside`/`local.network_outside` hardcoded subnet-ID lists
and `data.aws_subnet.*` defined in `_mikrotik_staging.tf`. Inside/outside private
IPs are pinned via `cidrhost(...)` at host `.10` (prod), `.30` (shared) and
`var.private_ip_number` (default `20`, staging). `mikrotik_pubkey` has a default
committed ed25519 public key.

### Key variables & outputs

Inputs include `environments` (map of account_id + per-region cidr/subnets),
`regions` (az_letters/city_code/country_code), `vpc_cidr`, `mikrotik_ami`,
`mikrotik_instance_type`. Outputs: `vpc_id`, a rich `subnets` map (id/arn/cidr/az/
tags + derived `environment`/`subnet_type`), `route_tables`, and `route53_zones`
(parent/public/private zone ids + name servers).

---

## vpn

`_modules/vpn`
provisions **AWS Site-to-Site VPN** connections from a single Virtual Private
Gateway to each customer MikroTik, using **IKEv2** and **dynamic BGP**. Customer
gateway public IPs are dynamic (customer routers on `*.sn.mynetname.net` DDNS), so
the module is built around *lifecycle-splitting* resources by whether their IP /
PSK is Terraform-managed or externally managed.

### Virtual Private Gateway & propagation

- `aws_vpn_gateway.this` — attached to `var.vpc_id`, `amazon_side_asn = var.amazon_side_asn`
  (the prod leaf sets `64512`).
- `aws_vpn_gateway_route_propagation.this` — one per `var.route_table_ids` (the
  leaf propagates into the prod/staging `inside` and network `outside` route tables).
- `aws_cloudwatch_log_group.vpn_tunnels` — `/aws/vpn/tunnels`, retention
  `var.log_retention_days` (leaf sets `3`).

### Customer gateways & connections — the split pattern

`var.customers` is a `map(object(...))`. Two booleans drive which of four
resources each customer lands in:

| Flag (default) | true → resource | false → resource |
|----------------|-----------------|------------------|
| `ignore_ip_changes` (`true`) | `aws_customer_gateway.ignore_ip` (lifecycle `ignore_changes = [ip_address]`) | `aws_customer_gateway.managed_ip` (`create_before_destroy`) |
| `ignore_psk_changes` (`false`) | `aws_vpn_connection.ignore_psk` (ignores tunnel PSKs) | `aws_vpn_connection.managed_psk` |

Both CGW variants are re-unified into `local.customer_gateways`, and both VPN
variants into `local.vpn_connections`, so downstream (Secrets Manager, outputs)
treats them uniformly. The default path (`ignore_ip = true`, `managed_psk`) suits
dynamic-IP MikroTik sites: the [CGW-updater cronjob](#cgw-updater-iam-dynamodb) can
swap the CGW IP without Terraform fighting it. The `ignore_psk` variant exists for
externally-managed PSKs (e.g. OCI supplying its own key).

!!! note "State migration `moved` blocks"
    The top of
    `main.tf`
    has `moved` blocks migrating `aws_customer_gateway.this["exampletest"]` →
    `.ignore_ip["exampletest"]` and the VPN equivalent, from the pre-split layout.
    `exampletest` is **not** in the current `customers` map (see below) — these are
    legacy no-ops kept for older state. The `client-g` migration blocks were already
    removed on 2026-07-03.

### Tunnel options

`local.default_tunnel_options` encodes the negotiated crypto and is merged with any
per-customer `tunnel1_options`/`tunnel2_options` override (nulls filtered out).
Notable defaults:

```hcl
ike_versions                 = ["ikev2"]
phase1_encryption_algorithms = ["AES256", "AES256-GCM-16"]
phase2_encryption_algorithms = ["AES256", "AES256-GCM-16"]
phase1_integrity_algorithms  = ["SHA2-384", "SHA2-512"]
phase2_integrity_algorithms  = ["SHA2-256", "SHA2-384", "SHA2-512"]
phase1_dh_group_numbers      = [15,16,17,18,19,20,21,22,23,24]
phase2_dh_group_numbers      = [15,16,17,18,19,20,21,22,23,24]
phase1_lifetime_seconds      = 28800   # 8h  (IKE / Phase 1 SA)
phase2_lifetime_seconds      = 3600    # 1h  (IPsec / Phase 2 child SA)
rekey_margin_time_seconds    = 540     # AWS default (see comment)
rekey_fuzz_percentage        = 100
replay_window_size           = 1024
dpd_timeout_seconds          = 30
dpd_timeout_action           = "restart"  # AWS re-initiates on DPD timeout
startup_action               = "start"    # AWS actively initiates (CGW IP is dynamic)
preshared_key                = null       # AWS auto-generates
```

!!! warning "rekey_margin_time_seconds = 540 is load-bearing — do not raise it"
    The extensive comment in `main.tf` explains the previous value (`1800` with
    fuzz `100`) opened the Phase-2 rekey window at `3600s` before a `3600s` expiry,
    letting AWS rekey the child SA almost immediately every cycle and collide with
    the MikroTik's own rekeys — leaving the stale/half-open child SAs the
    `tunnel-trampoline` chases. `540` (AWS's own default) yields one predictable
    rekey ~9–18 min before expiry.

Both connections set `static_routes_only = false`, `local_ipv4_network_cidr` and
`remote_ipv4_network_cidr` = `0.0.0.0/0` (so the 169.254/16 tunnel-inside addresses
work for BGP), `tunnelN_enable_tunnel_lifecycle_control = true` (a prerequisite for
`ReplaceVpnTunnel` — see [tunnel-trampoline](#tunnel-trampoline)), and CloudWatch
tunnel + BGP logging into the log group (gated by `tunnel_log_enabled` /
`tunnel_bgp_log_enabled`, both default `true`).

### Live customer set

The prod leaf (`network/af-south-1/vpn/terragrunt.hcl`)
defines these customers (all defaults — dynamic IP, managed PSK):

| Customer | BGP ASN | Initial IP | Note |
|----------|---------|-----------|------|
| `client-a` | 65102 | 198.51.100.5 | |
| `client-b` | 65103 | 192.0.2.84 | |
| `client-c` | 65104 | 198.51.100.15 | |
| `client-d` | 65105 | 203.0.113.149 | site D |
| `client-e` | 65109 | 192.0.2.146 | |
| `client-e-site2` | 65106 | 203.0.113.14 | |
| `client-e-site3` | 65107 | 198.51.100.3 | |

`amazon_side_asn = 64512`. `client-e-site4` and `client-f` were
decommissioned 2026-07-03; `client-g` (OCI Johannesburg) was removed the same day and
is slated to be rebuilt CHR-terminated.

### CGW-updater IAM & DynamoDB

Because CGW IPs are dynamic, a Kubernetes CronJob updates them. The module can
create the IRSA plumbing (gated by `enable_cgw_updater_iam`, default `false` — the
prod leaf does not currently enable it):

- `aws_iam_role.cgw_updater` (`vpn-cgw-updater`) trusting the EKS OIDC provider for
  `system:serviceaccount:${cgw_updater_namespace}:${cgw_updater_service_account}`
  (defaults `vpn-automation` / `cgw-updater`).
- `aws_iam_policy.cgw_updater` — `ec2:*CustomerGateway*`, `ec2:ModifyVpnConnection`,
  Describe VPN/tags (region-scoped), and DynamoDB access to the state table.
- `aws_dynamodb_table.cgw_state` (`vpn-cgw-state`, hash `customer_name`, PITR on) —
  **always** created; holds `{customer_name, bgp_asn, current_ip, dns_hostname, cgw_id, ...}`.

### Secrets Manager

For every customer, `aws_secretsmanager_secret.vpn_psk` (`vpn/<customer>/psk`) plus
a version storing both tunnels' `preshared_key`, `address`, `bgp_asn` and inside
addresses from the (AWS-generated) connection attributes.

### Outputs

`vpn_gateway_id`/`_arn`, `customer_gateway_ids`, **`vpn_connection_ids`** (the map
wired into both `vpn-alerting` and `tunnel-trampoline`), `vpn_tunnel_details`,
`vpn_psk_secret_arns`, the CloudWatch log group name/arn, CGW-updater role
name/arn, and the DynamoDB table name/arn.

---

## vpn-alerting

`_modules/vpn-alerting`
pages on-call (PagerDuty) and posts to Slack `#networking-alerts` (as the **platform-bot**
bot) when a VPN connection has **no working tunnel**. It is the "hard down" pager;
`tunnel-trampoline` is the auto-fixer.

### Detection logic

One `aws_cloudwatch_metric_alarm.vpn_tunnel_down` per `var.vpn_connection_ids`
entry, on `AWS/VPN TunnelState` dimensioned by `VpnId`:

```hcl
statistic           = "Maximum"
comparison_operator = "LessThanThreshold"
threshold           = 1
period              = 300   # alarm_period_seconds
evaluation_periods  = 1
datapoints_to_alarm = 1
treat_missing_data  = "missing"
```

`TunnelState` is `1` (up) / `0` (down) per tunnel; aggregated with **Maximum** the
value only drops below `1` when *every* tunnel is down. This fires on real
connectivity loss and never false-alarms on single-tunnel links (e.g. the retired
`client-g`, whose second tunnel was permanently `0`).

### Pipeline

```
AWS/VPN TunnelState  →  CloudWatch alarm (Maximum < 1)
     →  SNS topic (KMS-encrypted)
          ├─ HTTPS  → PagerDuty CloudWatch integration  (pages)
          └─ Lambda → Slack chat.postMessage as platform-bot   (#networking-alerts)
```

- `aws_kms_key.alerts` — a **customer-managed** CMK (rotation on) with a policy
  granting `cloudwatch.amazonaws.com`, `sns.amazonaws.com` and CloudWatch Logs use
  of the key. This is the shared "alerts key" that `tunnel-trampoline` also reuses.
  Alias `alias/${sns_topic_name}` (default topic `infra-alerts`).
- `aws_sns_topic.alerts` (+ topic policy allowing account manage and CloudWatch
  publish). PagerDuty subscribes via `https` with `endpoint_auto_confirms = true`.
- `aws_secretsmanager_secret.slack` (`alerting/slack-bot-token`) — created with a
  **placeholder** and `ignore_changes = [secret_string]`; the real `xoxb-…` token
  is written out of band (see the module README). Can instead reference an existing
  secret via `create_slack_secret = false` + `slack_secret_arn`.
- `aws_lambda_function.slack_notifier` — `slack_notifier.py`, `python3.12`,
  reserved concurrency `5`, X-Ray active, reads the token secret and posts to
  `slack_channel_id` (default `C000000AAA5` = `#networking-alerts`). Subscribed to
  the SNS topic (lambda protocol).

### slack_notifier.py

Pure stdlib + bundled `boto3`. `lambda_handler` iterates SNS records, JSON-parses
the CloudWatch alarm `Message`, and `_build_message` renders an attachment coloured
by state — red `:rotating_light:` (ALARM), green `:white_check_mark:` (OK, which
auto-resolves the PagerDuty incident), amber otherwise. `VPN_NAME_MAP` (a reverse
`vpn-id → name` map, injected by the module) turns `vpn-0abc…` into `client-g`. The
bot token is cached across warm invocations.

### Notable inputs / outputs

Inputs: `vpn_connection_ids`, `pagerduty_integration_url` (sensitive),
`enable_pagerduty` / `enable_slack`, `slack_channel_id`, alarm tuning
(`alarm_period_seconds`/`evaluation_periods`/`datapoints_to_alarm`). Outputs:
`sns_topic_arn`, **`kms_key_arn`** and **`slack_secret_arn`** (both consumed by
`tunnel-trampoline`), plus `alarm_names` and `slack_notifier_function_name`.

### KICS / Checkov suppressions

`main.tf` documents accepted-risk suppressions inline: `e38a8e0a` (tags injected at
apply), `720f44cf`/`CKV_AWS_116` (no Lambda DLQ — a dropped Slack notice is
acceptable, PagerDuty is the reliable path), `CKV_AWS_117` (notifier only calls the
public Slack API, no VPC), plus `e39f87f5`/`e592a0c5` false positives.

---

## tunnel-trampoline

`_modules/tunnel-trampoline`
is the auto-remediator for two VPN failure modes that `vpn-alerting` cannot fix:

1. **Blackhole** — a tunnel reports `TunnelState = 1` (UP, BGP routes present) but
   passes ~zero data for a sustained period. Phase 1 (IKE) is alive so DPD and the
   `TunnelState` alarm are blind; only the Phase 2 data plane is dead (a stale
   asymmetric child SA). The manual fix is the console's **Actions → Replace VPN
   Tunnel** (`ReplaceVpnTunnel` API); this module does it automatically.
2. **Wedged DOWN** (behind `remediate_down`) — **every** tunnel is DOWN and stays
   wedged (a stale IKE/Phase-1 SA that historically only cleared with a manual
   disable/enable on the customer router — the outage that took Client A/Client C/
   Client B down for ~3 days on 2026-07-17).

An EventBridge schedule (default `rate(5 minutes)`, matching AWS/VPN's 5-min metric
resolution) invokes a Lambda that reads state and, subject to guardrails, calls
`ReplaceVpnTunnel`.

### Terraform resources

| Resource | Detail |
|----------|--------|
| `aws_dynamodb_table.state` | `tunnel-trampoline-state`, hash `vpn_id`, PITR + SSE with `var.kms_key_arn`; holds per-connection cooldown/incident state |
| `aws_sqs_queue.dlq` | Async-invocation DLQ, KMS-encrypted, 14-day retention |
| `aws_sns_topic.escalation` (+ subscription) | Dedicated PagerDuty topic (only when `enable_pagerduty`), so escalations never fan out through `vpn-alerting`'s Slack notifier |
| `aws_iam_role.trampoline` (+ inline policy) | Least-privilege: logs, `ec2:DescribeVpnConnections`, `cloudwatch:GetMetricData`, `ec2:ReplaceVpnTunnel` **scoped to exactly the managed `vpn-connection` ARNs**, DynamoDB get/put, SQS send, KMS decrypt/generate, X-Ray, Secrets Manager (Slack), SNS publish |
| `aws_signer_signing_profile` + `aws_lambda_code_signing_config` | Warn-only code signing |
| `aws_cloudwatch_log_group.trampoline` | `/aws/lambda/<fn>`, KMS-encrypted, retention `var.log_retention_days` (default `365`) |
| `aws_lambda_function.trampoline` | `trampoline.py`, `python3.12`, timeout `60`, memory `128`, **`reserved_concurrent_executions = 1`** (never overlap sweeps), Active tracing, SQS DLQ, ~30 env-var knobs |
| `aws_cloudwatch_event_rule.sweep` + target + `aws_lambda_permission.events` | The `rate(5 minutes)` schedule; `state = enabled ? "ENABLED" : "DISABLED"` (kill switch) |

The `ReplaceVpnTunnel` ARNs are derived in `locals` from `values(var.vpn_connection_ids)`.
`data.archive_file.trampoline` zips `trampoline.py` only (tests are excluded).

### trampoline.py — the classifier

`lambda_handler` fetches enough history to cover both the baseline and the diurnal
comparison windows, then per connection: `DescribeVpnConnections` for live
per-tunnel UP/DOWN + `GetMetricData` on `TunnelDataIn` per tunnel outside-IP.
`_classify` returns one of six states:

| State | Meaning |
|-------|---------|
| `down` | No tunnel UP. `down_eligible = true` **only if** baseline ≥ `BASELINE_MIN_BYTES` (else it's `vpn-alerting`'s job) |
| `idle` | Baseline below the floor — genuinely quiet site, never touched |
| `lag` | Fewer than `MIN_PRESENT_DATAPOINTS` recent datapoints on the carrier tunnel — CloudWatch publish lag, wait |
| `healthy` | Recent `TunnelDataIn` ≥ `BLACKHOLE_MAX_BYTES` |
| `quiet` | Silent now, but ~0 at this time-of-day on recent days → normal diurnal low (see below) |
| `blackhole` | UP but `< BLACKHOLE_MAX_BYTES` over the detection window on a link that *should* carry traffic |

Detection keys on `TunnelDataIn` (client→AWS), the direction carrying the capture capture
uploads that "stop". `recent_total` counts bytes from **every** tunnel (not just UP
ones) so a tunnel that just flipped DOWN still proves the data plane was alive. The
metric-lag quorum keys on the **carrier** tunnel (busiest by baseline), not a
pooled count, so a silent standby publishing zero-valued datapoints can't satisfy
the quorum for a lagging carrier.

!!! note "Diurnal guard — \"no cars at night ≠ blackhole\""
    Many managed links are capture camera sites: they carry capture uploads while cars
    pass and drop to ~0 overnight, which the 24h baseline can't distinguish from a
    stale tunnel. `_classify` compares "now" to the busiest same-time-of-day window
    over the last `DIURNAL_COMPARISON_DAYS` (default `2`) days (each
    `DIURNAL_WINDOW_MINUTES` wide, default `60`). If even that is ~0 → `quiet`, not
    a fault. Missing comparison metrics are *not* treated as zero — the guard only
    engages when every reference window has ≥ `MIN_PRESENT_DATAPOINTS` real points.
    `DIURNAL_COMPARISON_DAYS = 0` disables it. During the dry-run soak this fixed
    `client-e` reading blackhole ~00:40–07:00 every night.

### trampoline.py — remediation & guardrails

`_remediate` is shared by the blackhole and DOWN paths (`kind` selects the tunnel
set and wording). Flow: honour the per-connection **cooldown**; if still faulted
after a prior replace → **escalate once** (`#networking-alerts` + PagerDuty); if the
**daily cap** is hit → stop acting and escalate; otherwise pick target tunnel(s)
via `_targets` and call `_replace_tunnel`. `_targets` picks the busiest-by-baseline
UP tunnel under `replace_strategy = "active"` (de-prioritising the tunnel replaced
last sweep so a wrong guess self-corrects), or **all** UP tunnels under `"both"`.
The DOWN path (`_handle_down`) first arms a `down_since` timer and waits
`DOWN_PERSISTENCE_MINUTES` of continuous downtime before the first replace.

If **every** `ReplaceVpnTunnel` call fails (IAM/throttle/API error), the code
explicitly does **not** masquerade as success: it arms the cooldown (stop
hammering), escalates once, and posts an `:x:` FAILED notice.

Guardrails (env-var → default):

| Guardrail | Var | Default |
|-----------|-----|---------|
| Dry run (blackhole) | `dry_run` | `true` |
| Kill switch | `enabled` | `true` |
| DOWN remediation | `remediate_down` | `false` |
| Dry run (DOWN, independent soak) | `down_dry_run` | `true` |
| DOWN persistence | `down_persistence_minutes` | `15` |
| Detection window | `detection_window_minutes` | `30` |
| Silence threshold | `blackhole_max_bytes` | `1048576` (1 MiB) |
| Baseline window / floor | `baseline_window_hours` / `baseline_min_bytes` | `24h` / `104857600` (100 MiB) |
| Cooldown | `cooldown_minutes` | `40` |
| Daily cap (per connection) | `max_replaces_per_day` | `6` |
| Replace strategy | `replace_strategy` | `active` (or `both`) |

`cooldown_minutes` (40) is deliberately > `detection_window_minutes` (30) so the
post-cooldown read reflects only post-replace traffic ("did the replace fix it?").

### Notification policy & heartbeat

Deliberately quiet. Routine detect-and-replace → `#networking-warnings`; a replace
that did **not** fix it (or the daily cap) → `#networking-alerts` + PagerDuty
(once per incident); a failed replace *call* → `:x:` `#networking-warnings` +
PagerDuty. On any **fully clean** sweep it posts a one-line `#networking-info`
heartbeat as platform-bot, e.g.:

> ✅ **Tunnel Trampoline** - 9 checked, 0 blackholed, 4 active, 4 idle, 1 down

The heartbeat is a dead-man's switch (its *absence* means the sweep stalled), posts
regardless of `dry_run`, and is throttled by `heartbeat_min_interval_minutes` (`0`
= every sweep). It is **suppressed** whenever a sweep isn't genuinely all-clear —
a blackhole/error, an incident mid-cooldown, or a "suspect" link (one a paged
incident auto-closed to idle/down that hasn't recovered within `SUSPECT_WINDOW_HOURS`,
default `24`). Slack goes direct via `chat.postMessage`; PagerDuty via the
dedicated SNS topic.

### test_trampoline.py

`test_trampoline.py`
is an offline, pure-function test suite (`python test_trampoline.py`; needs `boto3`
importable only because the module builds clients at import). It covers the
classifier (blackhole / idle / healthy / metric-lag / all-down / carrier-lag /
dropped-carrier), target selection & rotation, both replace strategies, the
heartbeat (post / throttle / suppress), the failed-replace path (no false
"Replaced", pages once, arms cooldown, dry-run never persists a phantom
escalation), incident close-out, and the full DOWN path (eligibility, persistence
gate, independent `down_dry_run` soak vs live replace, `lambda_handler` routing).

### Live configuration (prod)

The leaf
wires `vpn_connection_ids` from the `vpn` dependency and **reuses** `vpn-alerting`'s
`slack_secret_arn` + `kms_key_arn`, and the `pagerduty` leaf's `aws-vpn-tunnels`
integration URL. It is **fully live**: `dry_run = false`, `enabled = true`,
`remediate_down = true`, `down_dry_run = false`, `down_persistence_minutes = 15`,
`replace_strategy = "active"`, `detection_window_minutes = 30`, `cooldown_minutes = 40`,
`max_replaces_per_day = 6`, heartbeat to `#networking-info` (`C000000AAA3`) every
sweep.

!!! note "Not VPC-attached (accepted CKV_AWS_117)"
    Like the sibling `eip-failover-lambda` / `vpn-alerting` Lambdas, the trampoline
    is intentionally not VPC-attached: it is egress-only and must reach the public
    Slack API, and the network VPC has no NAT, so attaching would black-hole all
    egress. `ReplaceVpnTunnel` requires Tunnel Endpoint Lifecycle Control on the
    tunnels (enabled by the `vpn` module) and a recent `boto3` (`python3.12`
    bundles one).

---

## vpn-metrics-iam modules

A matched pair that lets the **prod** EKS `cloudwatch-exporter` (YACE) scrape the
`AWS/VPN` metrics (`TunnelState`, `TunnelDataIn/Out`) that live in the **network**
account, via role-chaining. They mirror the `router-fleet-*-iam` pair. Both take
only `var.tags`.

### vpn-metrics-network-iam (network account, 210987654321)

`main.tf`
creates `aws_iam_role.cloudwatch_reader` (`vpn-metrics-cloudwatch-reader`) trusting
`arn:aws:iam::777788889999:role/vpn-metrics-exporter` for
`sts:AssumeRole` **and** `sts:TagSession` (EKS Pod Identity attaches transitive
session tags, so role-chaining carries them and STS rejects `AssumeRole` without
`TagSession`). Its inline policy grants read-only `cloudwatch:GetMetricData` /
`ListMetrics` / `GetMetricStatistics` + `tag:GetResources` (`Resource = "*"` — these
have no resource-level scoping). Output: `cloudwatch_reader_role_arn`.

### vpn-metrics-prod-iam (prod account, 777788889999)

`main.tf`
creates `aws_iam_role.exporter` (`vpn-metrics-exporter`, trusted by
`pods.eks.amazonaws.com`), an inline policy allowing it to assume
`arn:aws:iam::210987654321:role/vpn-metrics-cloudwatch-reader`, and an
`aws_eks_pod_identity_association` binding it to the `cloudwatch-exporter`
ServiceAccount in the `observability` namespace of `prod-eks`.

!!! note
    `vpn-metrics-prod-iam` has **no** `outputs.tf` (only `main.tf` + `variables.tf`).

---

## eip-failover-lambda

`_modules/eip-failover-lambda`
moves a single Elastic IP between CHR (MikroTik cloud-router) instances so the
outside/public IP follows the active CHR. A CHR claims the EIP by POSTing to the
Lambda's Function URL (see the `claimEIP` RouterOS script in
[`config-mikrotik/_system.tf`](#config-mikrotik)).

### Resources

- `aws_iam_role.lambda_role` + `aws_iam_policy.lambda_eip_policy` — allows
  `ec2:DescribeAddresses/DescribeInstances/DescribeNetworkInterfaces/AssociateAddress/
  DisassociateAddress` (`Resource = "*"`) and scoped CloudWatch Logs.
- `aws_cloudwatch_log_group.lambda_logs` — retention `var.log_retention_days` (14).
- `aws_lambda_function.eip_failover` — `lambda_function.py` (`python3.9`, handler
  `lambda_function.lambda_handler`), `timeout`/`memory_size` from vars. The code is
  rendered via `templatefile` so `eip_allocation_id` and `chr_instance_ids` are
  baked in at build time (not runtime env vars).
- `aws_lambda_function_url.eip_failover_url` — **`authorization_type = "NONE"`**,
  CORS open to `*`/POST.

### lambda_function.py

`lambda_handler` parses `target_instance_id` from the request body, validates it is
in the injected `CHR_INSTANCE_IDS` allow-list (rejects otherwise), then:
`describe_addresses` for the EIP → if already on the target, no-op; else
`describe_instances`, require `running`, pick the target ENI (**prefers device
index 2**, the "third interface", falling back to device index 0),
`disassociate_address` from the current holder, and `associate_address` to the
target ENI. Returns structured `statusCode`/JSON. Uses `logging`; no third-party
deps beyond `boto3`.

!!! warning "Unauthenticated Function URL"
    The Function URL is `authorization_type = "NONE"` and the handler's only guard
    is the CHR-instance-ID allow-list — anyone who knows the URL and a valid CHR
    instance-ID can trigger an EIP move. The CHR script embeds the URL and a
    hardcoded `target_instance_id`. Treat the URL as a semi-secret.

### Live configuration (prod)

`function_name = mikrotik-eip-failover-prod`, `eip_allocation_id = eipalloc-0027e8493b34f3272`
(prod-mikrotik-outside failover EIP), `chr_instance_ids = [i-0f70bc3058d11b496, i-0dff013f8d3c7dce9]`.
Outputs: `lambda_function_arn`/`_name`, `lambda_function_url`, `lambda_role_arn`,
`cloudwatch_log_group_name`.

---

## config-mikrotik

`_modules/config-mikrotik`
configures RouterOS on the CHR/MikroTik routers via the community
`terraform-routeros/routeros` provider (`~> 1.0`). It manages interfaces
(ether/WireGuard), IP addressing, DNS, routes, BGP, an extensive firewall
(filter/NAT/address-lists), DHCP/NTP/identity, and the `claimEIP` script +
scheduler.

### Layout

`main.tf` declares the `routeros` provider **with `for_each = var.chr_instances`
and `alias = each.key`** (one aliased provider per CHR, `hosturl = "api://<hostname>"`,
`insecure = true`). Config is spread across `_bgp.tf`, `_interface.tf`,
`_ip-addresses.tf`, `_ip-dns.tf`, `_ip_route.tf`, `_system.tf`,
`_wireguard-peers.tf`, `_firewall.tf` and `_ip-firewall.tf`. `auth.tf` is a stub
comment. Inputs include `chr_instances`, `mikrotiks`, `fortigates`,
`mikrotik_username`/`_password` (sensitive), `vpc_cidr`, `management_wg_key`,
`rfc1918` and `trusted_*` lists.

Highlights: BGP AS `65164` peering with `client-b` (remote AS `65217`); a
`management` + `azure` WireGuard interface; a default route to the FortiGate
inside-IP; the `claimEIP` script (POSTs the EIP-failover Function URL) on a 10-min
scheduler; and a large ordered firewall (accept established/related, drop invalid,
allow HTTPS/CAPTURES `443,30333,1701,3333`, RFC1918, WireGuard/IKE/IPsec, BGP `179`,
TRUSTED and ICMP, then implicit-deny) plus masquerade + dst-nat CAPTURES/HTTPS rules
to `10.161.64.10`/`10.161.65.10`.

!!! danger "This module is inconsistent / mid-migration — treat as non-production"
    Multiple issues make this module non-functional as written and it appears to be
    an unfinished experiment (see legacy findings):

    - `main.tf` aliases providers as `routeros.<key>`, but resources reference a
      non-existent alias `routeros.mikrotik[each.key]` (most files) **and**
      `routeros[each.key]` (`_interface.tf`) — inconsistent and unresolvable.
    - Two overlapping firewall definitions: `_firewall.tf` keyed on
      `var.chr_instances` and `_ip-firewall.tf` keyed on `var.mikrotiks` define
      duplicate/competing rule sets.
    - `_ip-addresses.tf` does `192.168.235.${each.key + 1}` — arithmetic on a map
      string key.
    - Placeholder/secret material committed inline: `private_key = "<private_key>"`
      (Azure WG), a hardcoded WireGuard public key and personal home IPs, and a
      hardcoded EIP-failover Function URL + instance-ID.
    - The network leaf passes `chrs = ...` (not the module's `chr_instances`) and a
      `../hub` dependency; the prod leaf passes neither `chr_instances` nor the
      MikroTik connection vars. There is no evidence this is applied cleanly.

    The authoritative, working CHR/MikroTik monitoring & fleet config is tracked
    elsewhere (router-fleet IAM modules, the RouterOS runbook); `copypaste.rsc` in
    the `vpc` module is a manual reference bootstrap, not consumed by Terraform.

---

## load-balancers

`_modules/load-balancers`
provisions a public **Network Load Balancer** fronting the EKS nodes (TCP 80/443).
Applied from the prod leaf; it looks the VPC/subnets up **cross-account** in the
network account.

### What is actually created

- `aws_lb.nlb` (`${env}-nlb`, `network`, cross-zone on) into `local.subnet_ids`
  (provided `public_subnet_ids`, else the network-account `app` subnets discovered
  by tag).
- Target groups `nlb_https` (443) and `nlb_http` (80), both `TCP`, source-IP
  stickiness, TCP health checks.
- `aws_lb_target_group_attachment.*` attaching each EKS node instance ID (from
  `eks_node_ids`, else resolved from `eks_node_private_ips`) to both TGs.
- Listeners `nlb_https` (443) and `nlb_http` (80), both `TCP` forward.
- Optional `aws_route53_record.nlb` (A/alias, via `aws.network`) when
  `create_route53_records`.
- ACM cert block (`aws_acm_certificate.alb` + Route53 validation) gated by
  `create_certificate` — retained for the ALB path.

`data.tf` discovers the VPC (`tag:Name = mono-vpc`), `app` subnets (filtered by
`Environment` + `SubnetType`) and EKS node instances, all via `aws.network`.
`s3_logs.tf` builds the S3 bucket policy for ELB/NLB access logs (ELB af-south-1
service account `098369216593`, plus `delivery.logs`/`logging.s3` principals) when
`logs_bucket_name` + a logs toggle is set.

!!! note "The ALB and the TCP-3333 target group are commented out"
    A large block of `main.tf`/`outputs.tf` — the entire **ALB** (LB, SG, target
    group, listeners, HTTP→HTTPS redirect) and the **TCP 3333** NLB target
    group/listener/attachment — is commented out. Per the inline note, camera
    connections on 3333 go **directly to nodes**, not through the NLB, because of
    the NLB's hardcoded 350-second idle timeout. Live outputs are NLB-only
    (`nlb_dns_name`/`_zone_id`/`_arn`, `nlb_route53_record_fqdn`); the ALB-related
    inputs (`alb_*`, `ssl_policy`, `certificate_arn`) exist but drive only the
    still-active cert resources.

---

## acm-certificates

`_modules/acm-certificates`
issues a **regional** ACM certificate and validates it via DNS records created in a
Route53 zone that lives in the **network** account (`aws.network`).

- `aws_acm_certificate.this` — `var.domain_name` + `subject_alternative_names`,
  `validation_method = "DNS"`, `create_before_destroy`.
- `data.aws_route53_zone.validation` (via `aws.network`) — looked up by
  `route53_zone_name` when `route53_zone_id` is not supplied.
- `aws_route53_record.validation` (via `aws.network`) — one per
  `domain_validation_options`, `allow_overwrite`, TTL `var.validation_record_ttl`
  (60).
- `aws_acm_certificate_validation.this` — blocks until validated.

Outputs: `certificate_arn`, `certificate_domain_name`, `certificate_status`,
`validation_record_fqdns`. Consumed by the prod and staging `acm-certificates`
leaves.

---

## cloudfront-api

`_modules/cloudfront-api`
(leaf `api-cdn`, prod + staging) puts CloudFront in front of the `public-api`
shared-ALB Ingress and **injects the dashboard API credentials as origin custom
headers** — so the browser bundle can omit `NEXT_PUBLIC_API_KEY`; CloudFront adds
the secret server-side on every origin request.

### Key elements

- `data.aws_secretsmanager_secret_version.dashboard_api` — reads the dashboard credentials
  from `var.secrets_manager_secret_id`; `api_key_property` (default
  `DASHBOARD_APP_API_KEY`) and `app_source_property` (`DASHBOARD_APP_SOURCE`) select
  the JSON keys.
- `aws_cloudfront_function.add_api_prefix` (`cloudfront-js-2.0`, viewer-request) —
  prepends `/api` to `/dashboard/*` URIs so requests reach the real handlers
  (public-api mounts those routes under `/api`).
- `aws_cloudfront_distribution.this` — origin = `var.origin_domain_name` (the ALB
  Ingress host), `https-only`, TLS1.2; two `custom_header`s inject
  `x-platform-api-key` / `x-platform-app-source`; managed cache policy
  **CachingDisabled** + origin-request policy **AllViewerExceptHostHeader** (keeps
  the origin Host = the Ingress hostname so the rule matches); geo-restriction
  whitelist `var.country_codes` (default `["ZA"]`); optional WAFv2 web ACL by ARN
  or name lookup (`aws.us-east-1`).
- Viewer certificate: reuse `var.acm_certificate_arn` (must be **us-east-1**) or
  mint `aws_acm_certificate.cert` (us-east-1) — but only if
  `allow_acm_certificate_mint = true`.

!!! warning "Two-phase mint when the zone is on Cloudflare"
    The viewer domain's DNS is on **Cloudflare**, so Terraform cannot auto-create
    validation records. A minted cert stays `PENDING_VALIDATION` and CloudFront
    rejects it. A `precondition` forces you to either pass a pre-issued
    `acm_certificate_arn` or opt in with `allow_acm_certificate_mint = true` and do
    the manual flow: (1) apply to create the cert, (2) add the records from the
    `certificate_validation_records` output in Cloudflare and wait for `ISSUED`,
    (3) re-apply with `acm_certificate_arn` set.

!!! note "Secrets in state"
    The injected API key/app-source land in Terraform state — keep state encrypted
    (the module header calls this out).

Outputs: `distribution_domain` (target for the Cloudflare CNAME), `distribution_id`
(for invalidations), `certificate_validation_records`.

---

## cloudfront-images

`_modules/cloudfront-images`
(leaf `images-cdn`, staging) serves the images S3 bucket through CloudFront using
**Origin Access Control** (OAC, not OAI).

- `data.aws_s3_bucket.images` — `var.bucket_name`, else derived `example-<env>-<country>`.
- `aws_cloudfront_origin_access_control.oac` — sigv4, `signing_behavior = always`.
- `aws_cloudfront_distribution.this` — S3 REST origin (bucket domain rewritten to
  the regional `s3.<region>.amazonaws.com` form), GET/HEAD only, compression,
  `redirect-to-https`; no geo restriction.
- `aws_cloudfront_cache_policy.images` + `aws_cloudfront_origin_request_policy.forward_all_qs`
  (both `aws.us-east-1`) — TTLs `default_ttl` (600) / `max_ttl` (3600), forward all
  query strings, no cookies/headers, Brotli+gzip.
- `aws_s3_bucket_policy.allow_oac` — grants `cloudfront.amazonaws.com`
  `s3:GetObject` conditioned on the distribution ARN (`AWS:SourceArn`).
- Optional us-east-1 ACM cert when `var.domain_name` is set; otherwise the default
  CloudFront cert.

Outputs (declared inline in `main.tf`): `distribution_domain`,
`certificate_validation_records`. This module has no separate `outputs.tf`.

---

## external-dns

`_modules/external-dns`
(leaf `staging/.../external-dns`) sets up **cross-account IRSA** so the staging EKS
`external-dns` can write records into a public hosted zone that lives in the
**network** account (`staging.cpt.aws.example.net`). This fixes the `InvalidIdentityToken`
error from trying to federate directly into the other account.

### Two-role chain

1. `aws_iam_role.irsa` (staging account, `${env}-external-dns-role`) — trusts the
   staging cluster's **own** OIDC provider for
   `system:serviceaccount:${service_account_namespace}:${service_account_name}`
   (defaults `external-dns`/`external-dns`). `data.aws_eks_cluster.this` reads the
   OIDC issuer.
2. `aws_iam_role_policy.irsa_assume_route53` — lets that role `sts:AssumeRole` the
   network-account role.
3. `aws_iam_role.route53` (network account, via `aws.network`) — trusts the IRSA
   role, with `aws_iam_policy.route53` granting `ChangeResourceRecordSets` /
   `ListResourceRecordSets` scoped to the hosted zone (looked up by
   `hosted_zone_name`) plus the list/get-change actions on `*`.

`external-dns` runs with the IRSA role and `--aws-assume-role` into the network
role. Outputs: `irsa_role_arn`, `route53_role_arn`.

---

## mongodb-private-link

`_modules/mongodb-private-link`
creates an **Interface VPC endpoint** to a MongoDB Atlas PrivateLink service (via
`aws.network`), optionally with a dedicated security group and pinned private IPs.

- `aws_vpc_endpoint.mongodb_private_link` — `vpc_endpoint_type = "Interface"`,
  `service_name = var.service_name` (an Atlas `com.amazonaws.vpce.af-south-1.vpce-svc-…`).
  When `enable_subnet_mappings` (default `true`) it uses `subnet_configuration`
  blocks to pin a private IP per subnet; otherwise plain `subnet_ids`.
  `private_dns_enabled` defaults `false`.
- `aws_security_group.mongodb_private_link` (count, when `create_security_group`) —
  ingress TCP `1024–1026` from `allowed_cidr_blocks` (default `10.0.0.0/8`).

`variables.tf` carries a `default_shared_config` with hardcoded shared-env defaults
(`vpc-06da8d2201f2dbf31`, the Atlas service name, and subnet mappings
`10.161.35.10`/`10.161.36.10`). Rich outputs expose the endpoint id/arn/state, DNS
entries, ENI ids, subnet ids and the SG id/arn.

!!! note "No live leaf references this module"
    A repo-wide search finds **no** Terragrunt leaf sourcing `mongodb-private-link`
    (only the module itself). It is either applied outside the standard leaf layout
    or currently orphaned — verify before assuming it is deployed.

---

## Cross-module wiring summary

- `vpc` → outputs `vpc_id`/subnets/route-tables consumed by `vpn`, `load-balancers`
  (by tag lookup), `mongodb-private-link`.
- `vpn` → **`vpn_connection_ids`** feeds both `vpn-alerting` (one alarm each) and
  `tunnel-trampoline` (monitor/replace set).
- `vpn-alerting` → **`kms_key_arn`** + **`slack_secret_arn`** reused by
  `tunnel-trampoline`; both page the same PagerDuty "AWS VPN Tunnels" service but
  the trampoline owns its own SNS topic.
- `vpn-metrics-prod-iam` (prod) role-chains into `vpn-metrics-network-iam` (network)
  so the prod YACE exporter can scrape `AWS/VPN` metrics that the trampoline /
  alerting also read.
- `eip-failover-lambda` Function URL is called by the `config-mikrotik` `claimEIP`
  script running on the CHRs that `vpc` provisions.
- `acm-certificates` / `cloudfront-api` / `cloudfront-images` / `external-dns` /
  `load-balancers` all reach into the **network** account (`aws.network`) for
  Route53 zones or VPC/subnet discovery.
