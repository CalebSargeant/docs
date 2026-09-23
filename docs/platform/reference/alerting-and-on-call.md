# Alerting & on-call

Every alert the platform's infrastructure raises, where each one is routed, and how to
respond to it. Alerting is split across **two independent systems** that meet at the
same Slack bot and the same PagerDuty service:

- **In-cluster Prometheus / Alertmanager** (`kube-prometheus-stack`, prod overlay only)
  — router-fleet reachability (blackbox ICMP), MikroTik device health (mktxp), and a
  Prometheus-native view of the AWS VPN tunnels. Rules live under
  `kubernetes/infrastructure/services/observability/overlays/prod/kube-prometheus-stack/`.
- **AWS CloudWatch → SNS → Lambda** (Terraform, `network` account) — the *paging* path
  for AWS Site-to-Site VPN outages (`terraform/aws/_modules/vpn-alerting`) plus the
  `tunnel-trampoline` auto-remediator (`terraform/aws/_modules/tunnel-trampoline`).

Both post to Slack as the **platform-bot** bot and page the single **"AWS VPN Tunnels"**
PagerDuty service. This page is the consolidated catalog; the deep-dive on the wiring
lives in [CI/CD & Slack notifications](../handover/cicd-and-notifications.md) and
[Kubernetes Observability](kubernetes-observability.md).

!!! info "Prod only"
    The full Alertmanager routing config, the PrometheusRules, and the
    `cloudwatch-exporter` all exist **only in the prod overlay** and the `network`
    account. Staging deploys the monitoring stack but carries no alert rules or
    routing config (see [Kubernetes Observability](kubernetes-observability.md)).

## Routing model — Slack channels & PagerDuty

There is **one Slack bot (platform-bot)** and **three networking channels**. Everything posts
via `chat.postMessage` by channel *ID* (never incoming webhooks), so the same bot token
works across channels.

| Channel | ID | Role |
|---|---|---|
| `#networking-alerts` | `C000000AAA5` | Paging / genuine failures. The **only** channel that also pages PagerDuty. |
| `#networking-warnings` | `C000000AAA6` | Routine remediations + device/connection health warnings. |
| `#networking-info` | `C000000AAA3` | The `tunnel-trampoline` "all clear" heartbeat (liveness). |

PagerDuty is a **single all-hands service, "AWS VPN Tunnels"**, defined in
`terraform/aws/network/af-south-1/pagerduty/terragrunt.hcl`. The escalation policy
`Platform Engineering - All Hands` (`terraform/aws/_modules/pagerduty/main.tf`) pages
**every engineer at once — there is no rotation**:

| Escalation setting | Value | Source |
|---|---|---|
| Policy | `Platform Engineering - All Hands` | `escalation_policy_name` (default) |
| Targets | **all engineers, simultaneously** (one rule, every user a target) | `pagerduty_escalation_policy.all_hands` |
| Re-notify delay | **10 min** per loop | `escalation_delay_minutes` (default) |
| Loops | **3** (re-pages everyone if no ack) | `escalation_num_loops` (default) |
| Team | `the platform Engineering` | `team_name` (default) |
| Membership role | `manager` | `team_membership_role` (default) |

The paged engineers are set in the leaf (`engineer_emails`,
`terraform/aws/network/af-south-1/pagerduty/terragrunt.hcl`):

```hcl
engineer_emails = [
  "network-lead@example.com",
  "platform-lead@example.com",
  "technical@example.com",
  "ops-engineer@example.com",
  "systems@example.com",   # the network lead
]
```

Each email must already exist as a PagerDuty user (looked up via a `pagerduty_user`
data source — IDs are never hard-coded). One `pagerduty_service` +
`pagerduty_service_integration` (Amazon CloudWatch) is created per entry in
`var.services`; today that is only `aws-vpn-tunnels`. Adding a service reuses the same
all-hands policy.

!!! warning "`PAGERDUTY_TOKEN` is required to plan/apply the `pagerduty` leaf"
    The `pagerduty` provider reads its API token from the **`PAGERDUTY_TOKEN`**
    environment variable (`terraform/aws/_modules/pagerduty/providers.tf`); nothing
    secret is committed. Export it before `plan`/`apply` (`terraform validate` does
    not need it):

    ```bash
    export PAGERDUTY_TOKEN="$(op read 'op://platform/PagerDuty/API Key')"
    ```

    The `network` account is **not in CI**, so this leaf (and `vpn-alerting` /
    `tunnel-trampoline`) is applied **manually** with `AWS_PROFILE=network`.

!!! warning "Operator input needed — per-user PagerDuty contact methods"
    The escalation *timing* (10-min delay, 3 loops) and the *who* (`engineer_emails`)
    are in code. **How** each engineer is actually notified — phone, SMS, push,
    per-user notification rules and contact-method ordering — is configured per user
    inside PagerDuty and is **not** in this repo. Confirm and record each engineer's
    contact methods directly in the PagerDuty account.

### Alert source → destination

| Source | Event | Slack | PagerDuty |
|---|---|---|---|
| **vpn-alerting** (CloudWatch `AWS/VPN TunnelState`) | Every tunnel on a connection DOWN (`Maximum < 1`) | `#networking-alerts` (Lambda) | ✅ AWS VPN Tunnels |
| vpn-alerting | Recovery (`OK`) | `#networking-alerts` (green) | auto-resolves |
| **tunnel-trampoline** | Routine detect-and-replace of a blackholed (UP-but-silent) tunnel | `#networking-warnings` | — |
| tunnel-trampoline | Replace did **not** restore traffic, or daily cap hit | `#networking-alerts` | ✅ AWS VPN Tunnels |
| tunnel-trampoline | `ReplaceVpnTunnel` call itself failed (IAM/throttle/API) | `#networking-warnings` (`:x:`) | ✅ AWS VPN Tunnels |
| tunnel-trampoline | Clean sweep (nothing wrong) | `#networking-info` heartbeat | — |
| **Alertmanager** `ClientRouterDown` (blackbox ICMP) | Named client router unreachable 5m | `#networking-alerts` | ✅ (routing-key secret) |
| Alertmanager monitoring-integrity criticals | `severity: critical` | `#networking-alerts` | — (Slack only) |
| Alertmanager router / VPN health warnings & criticals | `team: networking` | `#networking-warnings` / `#networking-alerts` | — (Slack only) |

!!! note "Two paths, no double-page — by design"
    AWS VPN tunnel health is alerted **two ways**. The Terraform Lambdas own the
    *paging* path (CloudWatch alarm → SNS → PagerDuty + Slack). The Prometheus
    `vpn-tunnels` rules add a **Slack-only** early-warning / flap-detection view beside
    the Grafana dashboard. PagerDuty for a fully-down connection comes **only** from the
    CloudWatch alarm, so the two never double-page.

## Alert inventory — Prometheus (Alertmanager)

Only `PrometheusRule` objects labelled `release: kube-prometheus-stack` are discovered
by the stack's Prometheus. Routing is entirely **by label** in
`helmrelease.yaml` (`alertmanagerSpec.config`): the default receiver is `"null"`
(anything not explicitly matched is swallowed), `Watchdog` → `null`.

| Route matcher | Receiver | Destination |
|---|---|---|
| `alertname = "ClientRouterDown"` | `networking-critical` | `#networking-alerts` **+ PagerDuty** |
| `team = "networking"`, `severity = "warning"` | `networking-warnings` | `#networking-warnings` (Slack) |
| `team = "networking"` (catch-all critical) | `networking-alerts` | `#networking-alerts` (Slack only) |

Alertmanager posts Slack via `api_url: https://slack.com/api/chat.postMessage` with a
Bearer token read from the mounted file
`/etc/alertmanager/secrets/slack-credentials/slack-bot-token`, and pages PagerDuty via
`routing_key_file: /etc/alertmanager/secrets/pagerduty-credentials/routing-key` — both
mounted through `alertmanagerSpec.secrets`.

### `router-icmp` — the only paging Prometheus rule

`prometheusrule-router-icmp.yaml` (group `router-icmp.rules`).

| Alert | Expr (summary) | `for` | Severity |
|---|---|---|---|
| `ClientRouterDown` | `probe_success{job="router-blackbox-icmp", router_endpoint=~"…"} == 0` — ICMP probe failing, restricted to **three** named endpoints | 5m | **critical** |

The three paged endpoints (the rest of the fleet is dashboarded but never pages):

| `router_endpoint` | Site |
|---|---|
| `hx0000000c3.sn.mynetname.net` | Client B |
| `hx0000000a1.sn.mynetname.net` | Client A |
| `client-c-tmc.ddns.net` | Client C TMC (public endpoint only) |

### `router-health` — Slack-only fleet health

`prometheusrule-router-health.yaml`. All carry `team: networking`; **never** PagerDuty.
Criticals route to `#networking-alerts`, warnings to `#networking-warnings`.

**Group `router-monitoring-integrity.rules`** — "watch the watcher" (→ `#networking-alerts`):

| Alert | Expr (summary) | `for` | Severity |
|---|---|---|---|
| `MktxpExporterDown` | `up{job="mktxp"} == 0` — device metrics not being collected | 5m | critical |
| `RouterFleetResolverStalled` | `time() - max(kube_cronjob_status_last_schedule_time{…cronjob="router-fleet-resolver"}) > 7200` — resolver CronJob hasn't run in >2h | 15m | critical |
| `RouterBlackboxProbesMissing` | `absent(probe_success{job="router-blackbox-icmp"})` — whole ICMP pipeline gone | 5m | critical |

**Group `router-connection-health.rules`** — path to the client degrading (→ `#networking-warnings`):

| Alert | Expr (summary) | `for` | Severity |
|---|---|---|---|
| `RouterReachabilityDegraded` | `avg_over_time(probe_success[15m])` between `0.5` and `0.9` — 10–50% ICMP loss | 10m | warning |
| `RouterHighLatency` | `probe_icmp_duration_seconds{phase="rtt",…} > 0.5` — RTT above 500 ms | 15m | warning |
| `RouterInterfaceErrors` | `rate(mktxp_interface_rx_error_total) + rate(mktxp_interface_tx_error_total) > 1` per interface | 15m | warning |

**Group `router-device-health.rules`** — the box itself, mktxp subset (→ `#networking-warnings`):

| Alert | Expr (summary) | `for` | Severity |
|---|---|---|---|
| `RouterUnexpectedReboot` | `mktxp_system_uptime < 900` — uptime under 15 min | 2m | warning |
| `RouterHighTemperature` | `mktxp_system_cpu_temperature > 70` (°C) | 10m | warning |
| `RouterHighCPU` | `mktxp_system_cpu_load > 90` (%) | 15m | warning |
| `RouterHighMemory` | `(1 - free/total) * 100 > 90` (%) | 15m | warning |
| `RouterDiskFull` | `(1 - free_hdd/total_hdd) * 100 > 90` (%) | 15m | warning |
| `RouterLowVoltage` | `mktxp_system_routerboard_voltage < 20` (V; physical boards only) | 10m | warning |

### `vpn-tunnels` — Slack-only VPN early-warning

`prometheusrule-vpn-tunnels.yaml` (group `vpn-tunnels.rules`), off the
`cloudwatch-exporter` (YACE) series. All `team: networking`, **Slack-only** — the
paging path for VPN is the CloudWatch alarm below.

| Alert | Expr (summary) | `for` | Severity |
|---|---|---|---|
| `VpnTunnelDown` | `aws_vpn_tunnel_state_maximum == 0` — one tunnel of a redundant pair down | 15m | warning |
| `VpnConnectionDown` | `max by (dimension_VpnId, tag_Customer) (aws_vpn_tunnel_state_maximum) == 0` — every tunnel down | 10m | critical |
| `VpnTunnelRekeyChurn` | `sum by (…) (changes(aws_vpn_tunnel_state_maximum[1h])) > 6` — flapping / rekey-colliding | 10m | warning |
| `VpnMetricsExporterDown` | `up{job="cloudwatch-exporter"} == 0` — dead-man's switch on the exporter | 15m | warning |

!!! warning "Operator input needed — Alertmanager PagerDuty routing-key target"
    `ClientRouterDown` pages PagerDuty using the `routing-key` in the prod-account
    Secrets Manager secret `pagerduty-credentials` (mounted into Alertmanager). The
    only PagerDuty service *defined in this repo* is `AWS VPN Tunnels`, so router pages
    most likely land there, but the routing key is populated **out of band** and is not
    derivable from Git. Confirm in the PagerDuty account which service that key targets.

## Alert inventory — CloudWatch alarms (`vpn-alerting`)

`terraform/aws/_modules/vpn-alerting/main.tf` creates **one CloudWatch alarm per VPN
connection** via `for_each = var.vpn_connection_ids` (the `{ name = vpn-id }` map wired
from the `vpn` leaf's output). Each alarm fans out through the SNS topic `infra-alerts`
(KMS-CMK encrypted) to both PagerDuty and the Slack notifier Lambda.

| Alarm (per connection) | Metric | Statistic | Condition | Period | Eval / datapoints | Missing data |
|---|---|---|---|---|---|---|
| `vpn-tunnel-down-<name>` | `AWS/VPN` `TunnelState` (dim `VpnId`) | `Maximum` | `LessThanThreshold`, threshold `1` | 300 s | 1 / 1 | `missing` |

```
AWS/VPN TunnelState (per tunnel: 1=up / 0=down)
  └─ CloudWatch alarm  vpn-tunnel-down-<name>   (Maximum < 1  ⇒  EVERY tunnel down)
       └─ SNS topic  infra-alerts  (KMS-CMK, alias/infra-alerts)
            ├─ HTTPS  → PagerDuty CloudWatch integration          → pages all-hands
            └─ Lambda infra-alerts-slack-notifier → chat.postMessage → #networking-alerts
```

- **Why `Maximum < 1`** — `TunnelState` is `1`/`0` per tunnel; the `Maximum` over a
  connection stays `1` while *any* tunnel is up and drops below `1` only when **all**
  are down. It fires on real connectivity loss and never false-alarms on single-tunnel
  links like the OCI `client-g` connection (its unused second tunnel is permanently `0`).
- **Recovery** — both `alarm_actions` and `ok_actions` publish to the SNS topic, so the
  `OK` event auto-resolves the PagerDuty incident and posts a green "recovered" message
  to Slack.
- **Slack notifier** — `slack_notifier.py` (Python 3.12, stdlib `urllib` + bundled
  `boto3`, no deps). SNS-triggered; maps `VpnId` → friendly name via `VPN_NAME_MAP` and
  posts a red (`ALARM`) / green (`OK`) / amber attachment. **No DLQ by design** — a
  dropped Slack notice is acceptable because PagerDuty is the reliable path.
- **Defaults** (overridable via `variables.tf`): `alarm_period_seconds = 300`,
  `alarm_evaluation_periods = 1`, `alarm_datapoints_to_alarm = 1`. The prod
  `vpn-alerting` leaf does not override these.

!!! note "The alarm set follows the `vpn` leaf"
    The concrete connections (and therefore the concrete `vpn-tunnel-down-*` alarm
    names) come from `terraform/aws/network/af-south-1/vpn`'s `vpn_connection_ids`
    output — `client-g` (OCI) is the canonical single-tunnel example. The full list is
    not enumerated in the alerting module itself; a new connection added to the `vpn`
    leaf automatically gets an alarm on the next apply.

## Auto-remediation — `tunnel-trampoline`

`tunnel-trampoline` (`terraform/aws/_modules/tunnel-trampoline`) closes the failure mode
`vpn-alerting` is blind to: a tunnel that reports `TunnelState = 1` (UP, BGP present) but
passes **zero data** — a dead Phase 2 data plane (stale/asymmetric child SA after a
rekey/flap). DPD and the `TunnelState` alarm both see it as healthy. The proven manual
fix is the console's **Actions → Replace VPN Tunnel**; this Lambda does that
automatically.

```
EventBridge rate(5 minutes)                      (tunnel-trampoline-sweep)
  └─ Lambda tunnel-trampoline  (reserved concurrency 1 — sweeps never overlap)
       ├─ DescribeVpnConnections + GetMetricData (TunnelDataIn)
       ├─ classify: all-down / idle / metric-lag / diurnal-quiet / BLACKHOLE
       ├─ ReplaceVpnTunnel (guardrailed)         → busiest UP tunnel (replace_strategy=active)
       ├─ Slack chat.postMessage (direct)        → #networking-warnings / -alerts / -info
       ├─ DynamoDB tunnel-trampoline-state        → per-vpn cooldown / incident state
       ├─ SNS tunnel-trampoline-escalation → PagerDuty  (only on escalation)
       └─ SQS tunnel-trampoline-dlq               → async-invoke DLQ (14-day retention)
```

**Classification** (per connection, each sweep): all tunnels DOWN → skip (that is
`vpn-alerting`'s job, unless DOWN remediation is on — below); baseline traffic below
`baseline_min_bytes` → **idle, skip**; too few recent datapoints → metric lag, wait;
UP-but-silent yet also ~silent at this same time-of-day on recent days → **diurnal
quiet, skip**; UP but `< blackhole_max_bytes` over the detection window when it *should*
carry traffic → **blackhole**, remediate.

!!! note "Diurnal guard — 'no cars at night ≠ blackhole'"
    Many managed links are **capture camera sites** that drop to ~0 overnight. A naïve check
    flagged `client-e` as blackholed every night ~00:40–07:00. The guard
    (`diurnal_comparison_days`, default 2) compares "now" to the link's own
    same-time-of-day traffic on recent days; only silence that *departs* from the rhythm
    is a blackhole.

### DOWN remediation

Behind `remediate_down`, the trampoline also fixes the opposite failure: **every** tunnel
DOWN and *wedged* (a stale IKE / Phase-1 SA that AWS's own DPD-restart never recovers —
the outage that took Client A/Client C/Client B down for ~3 days on 2026-07-17). Once a
normally-active connection has had every tunnel DOWN for `down_persistence_minutes`
continuously, it `ReplaceVpnTunnel`s the down tunnel(s) — the AWS-side equivalent of the
manual disable/enable on the customer router. `vpn-alerting` still **pages immediately**
on all-down; a successful auto-fix clears that page via the `TunnelState` recovery.

### Notification policy — deliberately quiet

| Event | Destination |
|---|---|
| Routine detect-and-replace | `#networking-warnings` |
| Replace did **not** fix it (still silent after cooldown) or daily cap hit | `#networking-alerts` **+ PagerDuty** (once per incident) |
| `ReplaceVpnTunnel` call itself failed (IAM/throttle/API) | `:x:` `#networking-warnings` **+ PagerDuty** (once per incident) |
| Incident recovery (traffic flowing again) | `#networking-warnings` (and `#networking-alerts` if it had escalated) |
| Dry-run "would replace" | `#networking-warnings`, prefixed `[DRY-RUN]` |
| **Clean sweep** — no blackhole, no error | `#networking-info` heartbeat one-liner |

The `#networking-info` heartbeat is a **liveness signal**: its *absence* means the sweep
has stopped. It is suppressed when a sweep is not genuinely all-clear (a blackhole, an
error, an in-flight incident, or a paged-then-auto-closed "suspect" link that has not yet
recovered). "Did the replace fix it?" is answered by re-evaluating **after** the cooldown
(`cooldown_minutes` is set above `detection_window_minutes` so the read reflects only
post-replace traffic).

### Live configuration (prod `network` leaf)

From `terraform/aws/network/af-south-1/tunnel-trampoline/terragrunt.hcl` — what is
actually deployed:

| Setting | Value | Meaning |
|---|---|---|
| `enabled` | `true` | EventBridge sweep runs (`rate(5 minutes)`) |
| `dry_run` | **`false`** | **Live** blackhole remediation |
| `remediate_down` | **`true`** | DOWN-path remediation live |
| `down_dry_run` | **`false`** | DOWN path acts for real |
| `down_persistence_minutes` | `15` | Continuous downtime before first DOWN replace |
| `detection_window_minutes` | `30` | Trailing silence window (rides out end-of-day tail-off) |
| `cooldown_minutes` | `40` | Per-connection wait between replaces (> detection window) |
| `max_replaces_per_day` | `6` | Per connection; on breach **stops acting** and pages |
| `replace_strategy` | `active` | Replace only the busiest UP tunnel |
| `heartbeat_min_interval_minutes` | `0` | Heartbeat on every 5-min sweep (~288/day) |
| `slack_channel_warnings` / `_alerts` / `_info` | `C000000AAA6` / `C000000AAA5` / `C000000AAA3` | The three channels |

**Shared plumbing** (via the `vpn-alerting` Terragrunt dependency): the trampoline
**reuses** `vpn-alerting`'s Slack bot-token secret and KMS CMK, and pages the **same**
`AWS VPN Tunnels` PagerDuty service — but owns its **own** SNS topic
(`tunnel-trampoline-escalation`) so escalations never fan out through `vpn-alerting`'s
Slack notifier. Everything at rest (DynamoDB `tunnel-trampoline-state`, the SNS topic,
the SQS DLQ, the log group, Lambda env vars) uses the shared alerts CMK. `ReplaceVpnTunnel`
IAM is scoped to exactly the managed `vpn-connection` ARNs; log retention is 365 days
(org policy). `ReplaceVpnTunnel` requires **Tunnel Endpoint Lifecycle Control** (already
enabled on all managed connections).

## Silence & acknowledge

### Acknowledge a PagerDuty page

- **Ack in PagerDuty** (mobile app, email, or the incident UI). Because the escalation
  policy loops **every 10 minutes up to 3 times**
  (`terraform/aws/_modules/pagerduty/main.tf`), an unacknowledged page **re-pages
  everyone** until someone acks. Acknowledging stops the re-notify loop.
- **Auto-resolve** — both `vpn-alerting` and `tunnel-trampoline` incidents resolve
  themselves: the CloudWatch alarm's `OK` event (via `ok_actions` → SNS) resolves the
  `vpn-alerting` incident, and the trampoline posts a recovery close-out when traffic
  flows again. Prefer fixing the underlying tunnel over manually resolving.

### Silence a Prometheus / Alertmanager alert

Router and Prometheus-VPN alerts flow through the in-cluster Alertmanager
(`kube-prometheus-stack`, `observability` namespace). Silence them with an **Alertmanager
silence** (matcher-based, time-boxed) via the Alertmanager UI/API or `amtool`, e.g.:

```bash
# Reach the in-cluster Alertmanager, then silence by label matcher.
kubectl -n observability port-forward svc/alertmanager-operated 9093:9093
amtool --alertmanager.url=http://localhost:9093 silence add \
  alertname=RouterHighTemperature routerboard_name=<board> \
  --duration=2h --comment="known heatwave, ticket OPS-123"
```

!!! warning "Operator input needed — Alertmanager access URL"
    The repo defines **no Alertmanager Ingress**, so there is no committed external URL.
    Reach it by `kubectl port-forward` as above, or record the actual access method
    (any ad-hoc Ingress / port-forward convention) here for handover. The exact service
    name may differ by chart version — confirm with
    `kubectl -n observability get svc | grep alertmanager`.

### Stop / soften the tunnel-trampoline

Silencing the trampoline is a Terraform change on
`terraform/aws/network/af-south-1/tunnel-trampoline/terragrunt.hcl` (apply manually with
`AWS_PROFILE=network`):

- **Kill switch** — `enabled = false` disables the EventBridge schedule; the Lambda
  never runs.
- **Back to observe-only** — `dry_run = true` evaluates and Slacks `[DRY-RUN] would
  replace …` to `#networking-warnings` and calls `ReplaceVpnTunnel(DryRun=true)` (IAM
  validation only; no tunnel touched).
- **Broaden remediation** — `replace_strategy = "both"` mirrors the manual "replace both
  tunnels" runbook when active-only replaces don't clear a blackhole.

### Test a page without a real outage

Force the CloudWatch alarm, then reset it (exercises the whole SNS → PagerDuty + Slack
pipeline):

```bash
aws --profile network --region af-south-1 cloudwatch set-alarm-state \
  --alarm-name vpn-tunnel-down-client-g \
  --state-value ALARM --state-reason "pipeline test"
# expect: red post in #networking-alerts + a PagerDuty page. Reset with --state-value OK.
```

## See also

- [CI/CD & Slack notifications](../handover/cicd-and-notifications.md) — the full wiring of the
  three alerting surfaces, the platform-bot bot token (two Secrets Manager stores), and the
  add/rotate/change runbooks.
- [Kubernetes Observability](kubernetes-observability.md) — `kube-prometheus-stack`,
  `cloudwatch-exporter` (YACE), blackbox probes, and the PrometheusRule/Alertmanager
  detail.
- [AWS — network & edge](terraform-aws-network-edge.md) — the `vpn`, `vpn-alerting`,
  `pagerduty`, and `tunnel-trampoline` live leaves in the `network` account.
```
