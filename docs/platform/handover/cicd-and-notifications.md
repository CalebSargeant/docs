# CI/CD pipelines & Slack notifications

How code ships in `platform-infra` (the org security gate + release tooling) and — the substantive half — every Slack / PagerDuty alerting surface the platform engineer owns: the VPN alerting pipeline, the tunnel-trampoline auto-remediator, and the in-cluster Alertmanager routing.

---

## Part 1 — CI/CD pipelines (orientation, not deep-dive)

This repo's pipelines are mostly **thin wrappers around two org-wide tools**. Do not try to re-learn their internals from the YAML here — the logic lives in the tool repos:

- **Security Gate** — the shared security gate (MegaLinter-backed, net-new PR-diff gating). Source & docs: `github.com/example-org/security-gate`
- **Release Workflows** — release / versioning (semantic-release, branch-based prod/rc flow). Source & docs: `github.com/example-org/release-workflows`

Pipelines in the **other** repos under `example-org` (e.g. `platform-utils`, `shared-workflows`) are ordinary GitHub Actions workflows — nothing bespoke to learn beyond [the GitHub Actions docs](https://docs.github.com/actions). This repo also *consumes* a reusable workflow from `shared-workflows` (see `terragrunt-plan-cost-deploy.yaml`).

### This repo's own workflows

All live in `.github/workflows/`. Actions are pinned by commit SHA (the trailing `# vX.Y.Z` comment is the resolved tag).

| Workflow | Trigger | Purpose |
|---|---|---|
| `release.yml` | PR, push to `staging`/`main`, dispatch | Release Workflows release/versioning. PRs build a `pr-<N>` image (mode `ci`); push to `staging` → `rc` prerelease, push to `main` → stable prod version (`deployment-model: bbd`, `branch-map {"staging":"staging","main":"prod"}`). |
| `security.yml` | `pull_request` only | The org's **Security Gate** workflow. Produces the required `security-gate` status check on the PR; gates on net-new findings. Skips Dependabot PRs (SHA bumps only). |
| `terragrunt-plan-cost-deploy.yaml` | push/PR touching `terraform/aws/staging/**` or `prod/**` | "Infrastructure Deployment". Detects changed env, then calls the reusable `shared-workflows/.github/workflows/terragrunt-plan-cost-apply.yaml@main` for **staging** (af-south-1, self-hosted runner). The **prod** job is commented out (manual apply). Infracost is disabled (commented). |
| `generate-wireguard-tunnel.yml` | `workflow_dispatch` + `repository_dispatch` (n8n webhook, type `generate-tunnel`) | Runs `scripts/wireguard/generate_flexible_tunnels_v2.py` to build MikroTik `.rsc` site-to-site tunnel configs against `hub`, then opens a PR with the configs and updated `tunnel_state.json`. |
| `invite-avd-user.yaml` | `workflow_dispatch` (firstname input) | Azure login (`AZURE_CREDENTIALS`) then runs `scripts/invite-avd-user.sh` to invite an Azure Virtual Desktop user. |
| `deploy-docs.yml` | push to `main` / PR touching `docs/**` etc. | Publishes **this** MkDocs Material site to a Cloudflare Worker behind Cloudflare Access. PR = `mkdocs build --strict` check only (no preview URL, docs are Access-gated); `main` = `wrangler deploy`. Needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` Actions secrets. |

### Runner toggle — `SELFHOSTED_GITHUB_RUNNER`

`release.yml`, `security.yml`, and `deploy-docs.yml` all run on `${{ vars.SELFHOSTED_GITHUB_RUNNER || 'ubuntu-latest' }}`. Set the repo **variable** `SELFHOSTED_GITHUB_RUNNER` to a self-hosted label (for `platform-infra` → `prod-cpt-aws`) to route managed workflows onto the cluster runner pool (free minutes + warm MegaLinter image). **Blank it** to fall straight back to GitHub-hosted — the instant escape hatch if the self-hosted pool breaks. (`terragrunt-plan-cost-deploy.yaml`, `generate-wireguard-tunnel.yml`, and `invite-avd-user.yaml` hard-code `[self-hosted, linux]`.)

### Local quality gates & versioning

- `.pre-commit-config.yaml` — installs `pre-commit` **and** `pre-push` hooks: the Security Gate hook set (`shellcheck`, `actionlint`, `hadolint`, `eslint`, `kustomize`, `trivy`, `trufflehog`, `semgrep`, `pip-audit`, `npm-audit`, `govulncheck`, `checkov`).
- `.mega-linter.yml` — trims MegaLinter (which Security Gate runs whole-repo) to a lean IaC/security linter allowlist (secretlint, gitleaks, trivy, checkov, tflint, hadolint, actionlint, shellcheck), cutting the scan from ~15 min to ~3–5 min. Security Gate force-sets `VALIDATE_ALL_CODEBASE`, `DISABLE_ERRORS`, and the SARIF reporter — leave those alone.
- `pyproject.toml` — `[tool.semantic_release]` config Release Workflows auto-detects. **Conventional Commits** drive the bump: `feat` → minor; `fix`/`perf`/`chore` → patch (`chore` is intentionally a patch bump so Flux reconciles on trivial changes like adding a camera); `major_on_zero = true`; tag format `v{version}`.

---

## Part 2 — Slack notifications & alerting

There is **one Slack bot** — **platform-bot** — and **three networking channels**. Everything below posts as platform-bot via `chat.postMessage` (bot-token, by channel *ID* — never incoming webhooks, so the same token works across channels).

| Channel | ID | Role |
|---|---|---|
| `#networking-alerts` | `C000000AAA5` | Paging / genuine failures. The **only** channel that also pages PagerDuty. |
| `#networking-warnings` | `C000000AAA6` | Routine remediations + device/connection health warnings. |
| `#networking-info` | `C000000AAA3` | The tunnel-trampoline "all clear" heartbeat (liveness). |

PagerDuty is a **single all-hands service, "AWS VPN Tunnels"**, defined in `terraform/aws/network/af-south-1/pagerduty/terragrunt.hcl`. There is **no rotation** — every engineer is paged at once (`network-lead@`, `platform-lead@`, `technical@`, `ops-engineer@`, `systems@` — all `@example.com`). The `pagerduty` provider reads `PAGERDUTY_TOKEN` (1Password: `op://platform/PagerDuty/API Key`) and is **applied manually** (network account is not in CI). Each service gets its own CloudWatch integration key, surfaced via the leaf's `integration_urls["aws-vpn-tunnels"]` output.

### Alert source → destination map

| Source | Event | Slack | PagerDuty |
|---|---|---|---|
| **vpn-alerting** (CloudWatch `AWS/VPN TunnelState`) | Every tunnel on a connection DOWN (`Maximum < 1`) | `#networking-alerts` (via Lambda) | ✅ AWS VPN Tunnels |
| vpn-alerting | Recovery (`OK`) | `#networking-alerts` (green) | auto-resolves |
| **tunnel-trampoline** | Routine detect-and-replace of a blackholed (UP-but-silent) tunnel | `#networking-warnings` | — |
| tunnel-trampoline | Replace did **not** restore traffic, or daily cap hit | `#networking-alerts` | ✅ AWS VPN Tunnels |
| tunnel-trampoline | `ReplaceVpnTunnel` call itself failed (IAM/throttle/API) | `#networking-warnings` (`:x:`) | ✅ AWS VPN Tunnels |
| tunnel-trampoline | Clean sweep (nothing wrong) | `#networking-info` heartbeat | — |
| **Alertmanager** `ClientRouterDown` (blackbox ICMP) | Named client router unreachable 5m | `#networking-alerts` | ✅ AWS VPN Tunnels |
| Alertmanager monitoring-integrity (`MktxpExporterDown`, `RouterFleetResolverStalled`, `RouterBlackboxProbesMissing`) | `severity: critical` | `#networking-alerts` | — (Slack only) |
| Alertmanager router health (latency, errors, reboot, temp, CPU, mem, disk, voltage, degraded reachability) | `severity: warning` | `#networking-warnings` | — |

### 1. VPN alerting pipeline — "a connection has no working tunnel"

Module: `terraform/aws/_modules/vpn-alerting/`. Leaf: `terraform/aws/network/af-south-1/vpn-alerting/terragrunt.hcl`.

```
AWS/VPN TunnelState (per connection, per tunnel: 1=up / 0=down)
  └─ CloudWatch alarm  vpn-tunnel-down-<name>   (Maximum < 1 ⇒ EVERY tunnel down)
       └─ SNS topic  infra-alerts  (KMS-CMK encrypted)
            ├─ HTTPS  → PagerDuty CloudWatch integration        → pages all-hands
            └─ Lambda infra-alerts-slack-notifier → chat.postMessage → #networking-alerts
```

- **Why `Maximum < 1`:** `TunnelState` is 1/0 per tunnel; the `Maximum` over `VpnId` stays 1 while *any* tunnel is up and only drops below 1 when *all* are down. Fires on true connectivity loss, and never false-alarms on single-tunnel links like the OCI `client-g` connection (whose unused `tunnel2` is permanently 0). See `main.tf`.
- **One alarm per connection** — `for_each` over `var.vpn_connection_ids` (`{ name = vpn-id }`, wired from the `vpn` leaf's `vpn_connection_ids` output). Alarm name `vpn-tunnel-down-<name>`. Defaults: period 300s, 1 evaluation period, 1 datapoint, `treat_missing_data = missing`. Both `alarm_actions` and `ok_actions` publish to the SNS topic.
- **Slack Lambda** — `slack_notifier.py` (Python 3.12, stdlib `urllib` + bundled `boto3`, no deps). SNS-triggered; parses the CloudWatch alarm JSON, maps `VpnId` → friendly name via `VPN_NAME_MAP`, and posts a red (`ALARM`) / green (`OK`) / amber attachment. Reads the bot token from Secrets Manager (cached across warm invokes). Env: `SLACK_SECRET_ARN`, `SLACK_SECRET_KEY`, `SLACK_CHANNEL_ID` (`C000000AAA5`), `VPN_NAME_MAP`. No DLQ by design — a dropped Slack notice is acceptable because **PagerDuty is the reliable path**.
- **Encryption** — a customer-managed KMS key (alias `alias/infra-alerts`) with a policy granting CloudWatch, SNS, and CloudWatch Logs, reused for the SNS topic, the Lambda log group, and the Slack secret. (The `aws/sns` managed key would silently drop notifications.)
- **Secret** — `alerting/slack-bot-token` (JSON key `slack-bot-token`) in the **network** account. Terraform creates it with a `REPLACE_WITH_BOT_TOKEN` placeholder and `ignore_changes = [secret_string]`; the real `xoxb-…` value is written **out of band** (see runbook). Must match the platform-bot token in the prod account's `slack-credentials` secret.

### 2. tunnel-trampoline — "UP-but-silent" auto-remediation

Module: `terraform/aws/_modules/tunnel-trampoline/`. Leaf: `terraform/aws/network/af-south-1/tunnel-trampoline/terragrunt.hcl`.

Complements vpn-alerting. It catches the failure vpn-alerting is blind to: a tunnel that reports `TunnelState = 1` (UP, BGP present) but passes **zero data** — a dead Phase 2 data plane (stale/asymmetric child SA after a rekey/flap). The proven manual fix is the console's **Actions → Replace VPN Tunnel**; this Lambda does that automatically.

```
EventBridge rate(5 minutes)
  └─ Lambda tunnel-trampoline
       ├─ DescribeVpnConnections + GetMetricData (TunnelDataIn)
       ├─ classify: all-down→skip / idle→skip / metric-lag→wait / diurnal-quiet→skip / BLACKHOLE
       ├─ ReplaceVpnTunnel (guardrailed)         → busiest UP tunnel (replace_strategy=active)
       ├─ Slack chat.postMessage (direct)        → #networking-warnings / -alerts / -info
       ├─ DynamoDB tunnel-trampoline-state        → per-vpn cooldown / incident state
       ├─ SNS <fn>-escalation → PagerDuty         → only on escalation
       └─ SQS <fn>-dlq                            → async-invoke DLQ (14-day retention)
```

Notification policy is **deliberately quiet** (full matrix in the README): routine replaces → `#networking-warnings`; a replace that **fails to restore traffic** (re-checked after the cooldown) or the daily cap → `#networking-alerts` + PagerDuty; a clean sweep → a one-line `#networking-info` heartbeat whose **absence is a dead-man's switch** that the sweep has stopped.

!!! note "The diurnal guard — 'no cars at night ≠ blackhole'"
    Many managed links are **capture camera sites** that go ~silent overnight. A naïve check flagged `client-e` as blackholed every night ~00:40–07:00. The guard (`diurnal_comparison_days`, default 2) compares "now" to the link's own same-time-of-day traffic on recent days; only silence that *departs* from the rhythm is a blackhole. See `trampoline.py` and `test_trampoline.py`.

**Live configuration** (from the leaf — this is what is actually deployed):

- `dry_run = false`, `enabled = true` — **live remediation** (the dry-run soak is complete; the diurnal guard shipped in the same change so live replace could never ship without it).
- Channels: `slack_channel_warnings = C000000AAA6`, `slack_channel_alerts = C000000AAA5`, `slack_channel_info = C000000AAA3`, `heartbeat_min_interval_minutes = 0` (posts on every 5-min sweep, ~288/day).
- Guardrails: `detection_window_minutes = 30`, `cooldown_minutes = 40` (must exceed the detection window so the post-replace read is clean), `max_replaces_per_day = 6` (per connection; on breach it **stops acting** and pages), `replace_strategy = "active"` (busiest UP tunnel only).
- DOWN remediation (leaf inputs `remediate_down = true`, `down_dry_run = false`, `down_persistence_minutes = 15`) — closes the gap that left Client A/Client C/Client B down ~3 days on 2026-07-17: once a normally-active connection has had every tunnel DOWN for 15m, the trampoline replaces the down tunnel(s) for real. vpn-alerting still pages immediately on all-down; a successful auto-fix clears that page via `TunnelState` recovery.

**Shared plumbing** (via the `vpn-alerting` Terragrunt dependency): it **reuses** vpn-alerting's Slack bot-token secret (`slack_secret_arn`) and KMS CMK (`kms_key_arn`), and pages the **same** "AWS VPN Tunnels" PagerDuty service — but owns its **own** dedicated escalation SNS topic (`tunnel-trampoline-escalation`) so escalations never fan out through vpn-alerting's Slack notifier. Everything at rest (DynamoDB, SNS, SQS, log group, Lambda env vars) uses the shared alerts CMK. `ReplaceVpnTunnel` IAM is scoped to exactly the managed `vpn-connection` ARNs; a single reserved concurrency slot prevents overlapping sweeps. Log retention is 365 days (org policy). `ReplaceVpnTunnel` requires Tunnel Endpoint Lifecycle Control (already enabled on all managed connections).

### 3. In-cluster alerting — Alertmanager (kube-prometheus-stack, prod)

Directory: `kubernetes/infrastructure/services/observability/overlays/prod/kube-prometheus-stack/`. This is the router-fleet monitoring stack — it alerts on **blackbox ICMP reachability** and **mktxp device metrics**, not the AWS VPN tunnels (those are the Lambdas above).

**Routing** (in `helmrelease.yaml` `alertmanagerSpec.config`) — default receiver is `"null"` (swallow anything not explicitly routed); `Watchdog` → null:

| Matcher | Receiver | Destination |
|---|---|---|
| `alertname = "ClientRouterDown"` | `networking-critical` | `#networking-alerts` (Slack) **+ PagerDuty** |
| `team = "networking"`, `severity = "warning"` | `networking-warnings` | `#networking-warnings` (Slack) |
| `team = "networking"` (catch-all critical) | `networking-alerts` | `#networking-alerts` (Slack only) |

Alertmanager posts Slack via `api_url: https://slack.com/api/chat.postMessage` with a Bearer token read from a mounted file (`/etc/alertmanager/secrets/slack-credentials/slack-bot-token`) — the **same platform-bot bot** as the Lambdas. PagerDuty uses `routing_key_file: /etc/alertmanager/secrets/pagerduty-credentials/routing-key`. Both secrets are mounted via `alertmanagerSpec.secrets`.

**What fires** (PrometheusRules; only rules labelled `release: kube-prometheus-stack` are discovered):

- `prometheusrule-router-icmp.yaml` — the **paging** `ClientRouterDown` alert. `probe_success == 0` for 5m, restricted to three endpoints only: `hx0000000c3.sn.mynetname.net` (Client B), `hx0000000a1.sn.mynetname.net` (Client A), `client-c-tmc.ddns.net` (Client C TMC). The rest of the fleet is dashboarded but not paged.
- `prometheusrule-router-health.yaml` — all **Slack-only**. Monitoring-integrity criticals (`MktxpExporterDown`, `RouterFleetResolverStalled`, `RouterBlackboxProbesMissing`) → `#networking-alerts`; health warnings (`RouterReachabilityDegraded`, `RouterHighLatency`, `RouterInterfaceErrors`, `RouterUnexpectedReboot`, `RouterHighTemperature`, `RouterHighCPU`, `RouterHighMemory`, `RouterDiskFull`, `RouterLowVoltage`) → `#networking-warnings`.

- `prometheusrule-vpn-tunnels.yaml` — Prometheus-native VPN tunnel alerts off the `cloudwatch-exporter` series (`aws_vpn_tunnel_state_maximum` / `aws_vpn_tunnel_data_*`), all **Slack-only** (`team = networking`): `VpnTunnelDown` (one tunnel of a pair down 15m → warning), `VpnConnectionDown` (all tunnels down 10m → critical), `VpnTunnelRekeyChurn` (>6 state changes in an hour — the early warning of the flapping/rekey-colliding tunnel that preceded the 2026-07-17 outage), and `VpnMetricsExporterDown` (dead-man's switch on the exporter).

!!! note "AWS VPN alerting is layered by design"
    VPN tunnel health is alerted **two ways**: the Terraform Lambdas (§1, §2) own the *paging* path (CloudWatch alarm → SNS → PagerDuty + Slack), and `prometheusrule-vpn-tunnels.yaml` adds the Prometheus-native, **Slack-only** early-warning / flap-detection view beside the Grafana dashboard. PagerDuty for a fully-down connection comes **only** from the CloudWatch alarm, so the two never double-page.

### Secrets & tokens

| Secret | Where | Consumed by |
|---|---|---|
| `alerting/slack-bot-token` (key `slack-bot-token`) | AWS Secrets Manager, **network** acct (210987654321), af-south-1 | vpn-alerting Lambda + (reused) tunnel-trampoline Lambda |
| `slack-credentials` (property `slack-bot-token`) | AWS Secrets Manager, **prod** acct | Pulled into the `slack-credentials` k8s Secret by `base/krr/externalsecret.yaml`; mounted by Alertmanager and used by the KRR CronJob |
| `pagerduty-credentials` (property `routing-key`) | AWS Secrets Manager, prod acct | `externalsecret-pagerduty.yaml` → mounted by Alertmanager |
| `PAGERDUTY_TOKEN` (env) | 1Password `op://platform/PagerDuty/API Key` | The `pagerduty` Terragrunt leaf's provider (manual apply) |

All three AWS secrets reach Kubernetes via **External Secrets** (`ClusterSecretStore` `aws-secrets-manager`). The Slack side is one bot token (platform-bot) held in two places (network-acct SM for the Lambdas, prod-acct SM for the cluster) — keep them in sync when rotating.

!!! warning "`SLACK_BOT_TOKEN` is not a GitHub Actions secret here"
    Despite the name, `SLACK_BOT_TOKEN` is **not** referenced by any workflow in `.github/`. It appears only as a **container env-var name** in the KRR CronJob (`base/krr/cronjob.yaml`), sourced from the `slack-credentials` k8s Secret (`key: slack-bot-token`), and as a runtime env var in the utility images under `dockerfiles/` (e.g. `sonic-stragglers-report`, `camera-image-size-report`, `watchlist-log-items`). CI does not inject a Slack token.

---

## How to… (runbooks)

### Set / rotate the platform-bot Slack bot token

The token is written **out of band** (never in Git/state). Update **both** stores:

```bash
# 1) Network account — used by the vpn-alerting & tunnel-trampoline Lambdas
aws --profile network --region af-south-1 secretsmanager put-secret-value \
  --secret-id alerting/slack-bot-token \
  --secret-string '{"slack-bot-token":"xoxb-your-new-token"}'

# 2) Prod account — pulled into the cluster (Alertmanager + KRR) via External Secrets
aws --profile prod --region af-south-1 secretsmanager put-secret-value \
  --secret-id slack-credentials \
  --secret-string '{"slack-bot-token":"xoxb-your-new-token"}'
```

Requirements: platform-bot must be a member of `#networking-alerts`, `#networking-warnings`, and `#networking-info`, with the `chat:write` scope. External Secrets refreshes the k8s Secret automatically; the Lambdas pick it up on the next cold start (the token is cached per warm invocation).

### Test the VPN alerting pipeline without a real outage

```bash
aws --profile network --region af-south-1 cloudwatch set-alarm-state \
  --alarm-name vpn-tunnel-down-client-g \
  --state-value ALARM --state-reason "pipeline test"
# expect: red post in #networking-alerts + a PagerDuty page. Reset with --state-value OK.
```

### Add a new VPN connection to alerting / trampoline

Add the `{ name = vpn-id }` entry to the `vpn` leaf's outputs. Both `vpn-alerting` and `tunnel-trampoline` consume `dependency.vpn.outputs.vpn_connection_ids`, so a new connection automatically gets a CloudWatch alarm and is swept for blackholes on the next apply. Apply the network-account Terragrunt leaves manually (`AWS_PROFILE=network`).

### Change a Slack channel / add a notification

- **Lambda channels** — edit the channel **ID** in the relevant leaf: `slack_channel_id` in `vpn-alerting/terragrunt.hcl`; `slack_channel_warnings` / `slack_channel_alerts` / `slack_channel_info` in `tunnel-trampoline/terragrunt.hcl`. Re-apply. (Invite platform-bot to the new channel first.)
- **Alertmanager (router) alerts** — routing is by **label**, not by channel string. To page, give the rule `team: networking` + the matcher `ClientRouterDown` (or add a new matcher/receiver in `helmrelease.yaml`); for Slack-only, use `severity: warning` (→ warnings) or another `team: networking` critical (→ alerts). Add the alert to a `PrometheusRule` labelled `release: kube-prometheus-stack`. Flux reconciles the HelmRelease.
- **New PagerDuty source** — add an entry to `services` in `pagerduty/terragrunt.hcl` (each gets its own CloudWatch integration key on the shared all-hands escalation policy), then wire its `integration_urls[...]` output into the consuming module. Remember: `export PAGERDUTY_TOKEN=…` and apply manually.

### Escalate / silence the tunnel-trampoline

- **Kill switch:** set `enabled = false` in the trampoline leaf and apply — the EventBridge schedule is disabled and the Lambda never runs.
- **Back to observe-only:** set `dry_run = true` — it evaluates and Slacks `[DRY-RUN] would replace …` to `#networking-warnings` and calls `ReplaceVpnTunnel(DryRun=true)` (IAM validation only, no tunnel touched).
- **If active-only replaces don't clear a blackhole:** set `replace_strategy = "both"` to mirror the manual "replace both tunnels" runbook.
