# Kubernetes Observability

The `observability` subsystem is the in-cluster monitoring, alerting, logging and
metrics-scraping stack that runs on both the prod and staging EKS clusters
(`af-south-1`). It is built around the community **kube-prometheus-stack** Helm chart
(Prometheus + Alertmanager + Grafana) with a self-hosted **Thanos** long-term store,
**Loki** + **Fluent Bit** for logs, a fleet of purpose-built exporters, and the
per-camera / per-router blackbox probes that feed the network dashboards.

Everything lives under
`kubernetes/infrastructure/services/observability`,
plus the small privileged debug DaemonSet
`kubernetes/infrastructure/services/netshoot`.
It is deployed by Flux and all workloads land in the `observability` namespace.

---

## Layout: base vs overlays

The directory follows a **base + overlays (prod / staging)** Kustomize pattern, but with
one deliberate twist: **`base/` has no aggregating `kustomization.yaml`**. Each overlay
fans out to the individual `base/<component>` directories itself, so prod and staging can
pick a different subset of components. Staging is described as "the prod
kube-prometheus-stack, mirrored via the prod per-component fan-out".

```
observability/
├── base/                     # shared component manifests (no top-level kustomization)
│   ├── kube-prometheus-stack/ (HelmRelease + HelmRepository + namespace)
│   ├── blackbox-exporter/     (deployment, config, service, servicemonitor)
│   ├── cloudwatch-exporter/   (YACE — AWS/VPN metrics)
│   ├── thanos-query/ thanos-store/ thanos-compactor/
│   ├── loki/ fluent-bit/ krr/
│   ├── mongodb-exporter/ mysql-exporter/ postgres-exporter/ redis-exporter/
│   └── grafana/               (dashboards + generators)
└── overlays/
    ├── prod/                  # patched for prod (16Gi Prom, AMs, camera scrapeconfigs, VPN, rules)
    │   └── flux/flux-kustomization.yaml
    └── staging/               # patched for the small staging cluster
        └── flux/flux-kustomization.yaml
```

### How it wires into Flux and the clusters

Each overlay ships a Flux `Kustomization` CR under its `flux/` directory that points Flux
at the overlay path:

| Env | Flux Kustomization path | Notes |
|-----|------------------------|-------|
| prod | `./kubernetes/infrastructure/services/observability/overlays/prod` | interval 5m, `prune: true`, timeout 2m |
| staging | `./kubernetes/infrastructure/services/observability/overlays/staging` | same, plus `dependsOn: postgres` (Grafana state lives in CNPG) |

The cluster-level Kustomize overlays wire these in:
`kubernetes/overlays/prod-cpt-aws`
references `observability/overlays/prod/flux`, and
staging-cpt-aws
references `observability/overlays/staging/flux/flux-kustomization.yaml`. **netshoot** is
referenced directly (not through a Flux Kustomization CR) by both cluster overlays.

### Which components run where

| Component | prod | staging | Notes |
|-----------|:----:|:-------:|-------|
| kube-prometheus-stack | ✅ | ✅ | single-replica Prometheus in both (see resources) |
| blackbox-exporter | ✅ | ✅ | staging = base only; prod adds camera probes/scrapeconfigs |
| cloudwatch-exporter | ✅ | ❌ | AWS/VPN metrics, prod only |
| thanos (query/store/compactor) | ✅ | ✅ | different S3 buckets |
| loki + fluent-bit | ✅ | ✅ | RF 2 (prod) / RF 1 (staging) |
| krr | ✅ | ✅ | different Slack channel + Prometheus URL |
| mongodb-exporter | ✅ | ✅ | |
| redis-exporter | ✅ | ✅ | prod → `cache.internal`, staging → Valkey |
| mysql-exporter | ✅ | ❌ | needs staging RDS wiring (follow-up) |
| postgres-exporter | ✅ | ❌ | needs staging CNPG credential wiring (follow-up) |
| PrometheusRules (vpn / router) | ✅ | ❌ | defined only in the prod overlay |
| Alertmanager routing config | ✅ | ❌ | full Slack/PagerDuty config is prod-only |

---

## kube-prometheus-stack

Deployed as a Flux `HelmRelease`
(base)
from the `prometheus-community` `HelmRepository`
(`https://prometheus-community.github.io/helm-charts`).

| Field | Value |
|-------|-------|
| Chart | `kube-prometheus-stack` **v68.2.2** |
| Release namespace | `observability` |
| `fullnameOverride` | `prometheus` (so the Prometheus Service is `prometheus`) |
| Reconcile interval | 1h (timeout 15m) |
| CRDs | `CreateReplace` on install + upgrade |

### Prometheus

Base `prometheusSpec`:

- `replicas: 2` (overridden to **1** in both overlays — see resources below)
- Retention **7d** / **49GiB** (Thanos holds long-term); storage 50Gi `gp3` PVC
- **Thanos sidecar** `quay.io/thanos/thanos:v0.37.2`, `objStorageConfigFile
  /etc/thanos/objstore.yml`, mounting the `thanos-objstore-config` ConfigMap
- `thanosService.enabled: true` (creates the `prometheus-thanos-discovery` gRPC service
  that thanos-query fans out to)
- `thanosRuler.enabled: true`

**Prod** (overlay):

```yaml
prometheus:
  serviceAccount:
    annotations:
      eks.amazonaws.com/role-arn: arn:aws:iam::777788889999:role/prod-thanos-role
  prometheusSpec:
    enableRemoteWriteReceiver: true      # accepts remote-write (used by amp-migrate)
    tsdb:
      outOfOrderTimeWindow: 180d          # allows back-filling historical samples
    externalLabels:
      cluster: prod
      replica: $(POD_NAME)
```

!!! warning "Prod IRSA/Thanos-sidecar trust quirk"
    Prod annotates the **chart-created** `prometheus` ServiceAccount with
    `prod-thanos-role`, but that SA is **not** in the role's trust scope
    (`system:serviceaccount:observability:thanos`). The sidecar's S3 upload only works
    via an out-of-band trust-policy edit. Staging does this "correctly" by running the
    Prometheus pod as the `thanos` SA (`serviceAccount.create: false, name: thanos`) so
    the IRSA subject matches `staging-thanos-role`. See the comments in the staging
    `helmrelease.yaml`.

**Staging** externalLabels: `cluster: staging`, `replica: $(POD_NAME)`.

### Resource sizing (`resources.yaml` PatchTransformer)

Both overlays apply a builtin `PatchTransformer`
(prod,
staging)
that injects requests/limits on every workload (the base manifests declare none, so
without this they schedule as `BestEffort` and are first-evicted). Highlights:

| Setting | prod | staging |
|---------|------|---------|
| Prometheus replicas | **1** | **1** |
| Prometheus mem request / limit | 2Gi / **16Gi** | 2Gi / **3Gi** |
| Prometheus CPU request / limit | 250m / 2000m | 250m / 2000m |
| Alertmanager mem | 64Mi | 64Mi |
| Most exporters mem limit | 512Mi (until KRR runs) | 512Mi |

!!! danger "Prod Prometheus is single-replica by incident, not by design"
    The prod patch drops Prometheus to a single replica (incident 2026-06-10): the
    memory-heavy Prometheus must stay off the operator-flagged **sensitive single-node
    AZ**, and pod-1's EBS volume is AZ-locked there. The mem limit was raised 4Gi→16Gi
    after the head ballooned to ~22Gi and OOM-crashlooped WAL replay for ~3 months.
    Restore `replicas: 2` only once dedicated capacity exists in that AZ **and** pod-1's
    stale WAL has been flushed. Staging is single-replica simply because the small nodes
    cannot fit a second 2Gi replica.

### Alertmanager (prod only)

The prod overlay carries the full Alertmanager config. It mounts two secrets
(`slack-credentials` — the shared platform-bot bot token, also used by KRR — and
`pagerduty-credentials`) and routes by label:

| Route matcher | Receiver | Destination |
|---------------|----------|-------------|
| `alertname = "Watchdog"` | `null` | dropped (dead-man's switch) |
| `alertname = "ClientRouterDown"` | `networking-critical` | #networking-alerts (`C000000AAA5`) **+ PagerDuty** |
| `team = networking, severity = warning` | `networking-warnings` | #networking-warnings (`C000000AAA6`) |
| `team = networking` | `networking-alerts` | #networking-alerts (Slack only) |
| everything else | `null` | swallowed |

Slack is posted via `chat.postMessage` with a Bearer bot token (not incoming webhooks),
so the token is reusable across channels. **PagerDuty is reserved for `ClientRouterDown`
only** — VPN paging already comes from the CloudWatch alarms in the `vpn-alerting`
Terraform module, so the Prometheus VPN rules are deliberately Slack-only to avoid
double-paging.

### Grafana

| Setting | Value |
|---------|-------|
| Admin creds | `grafana-credentials` (ExternalSecret from SM secret `grafana`) |
| Default timezone | `Africa/Johannesburg` |
| Datasources | Prometheus (`prometheus.observability...:9090`, POST) + Loki (`loki-gateway`) |
| `defaultDashboardsEnabled` | **false** in both overlays (ship only the platform dashboards) |
| Ingress | **prod**: none — served via the cloudflared tunnel, gated by Cloudflare Access.<br>**staging**: ALB, `internet-facing`, Google OIDC auth (`google-oidc-secret`) |

Grafana stores its state in Postgres (not the sqlite PVC):

- **prod**: external `postgres.internal.prod.cpt.aws.example.net:5432`, DB `grafana`,
  `ssl_mode: require`; host `grafana.example.com`.
- **staging**: shared in-cluster CNPG at `postgres-rw.database.svc.cluster.local:5432`;
  host `grafana.staging.cpt.aws.example.net`. The `grafana` role/password come from
  `grafana-postgres-credentials` (ESO), and the CNPG
  Database
  CR (`owner: grafana`, `databaseReclaimPolicy: retain`) creates it. This is why the
  staging Flux Kustomization `dependsOn: postgres`.

### Grafana access control (prod)

prod Grafana has **no Ingress**. It is reachable only through the in-cluster
cloudflared
tunnel, which serves `grafana.example.com` from
`kube-prometheus-stack-grafana.observability.svc.cluster.local:80`. A **Cloudflare Access**
application in front of that hostname decides who gets in, so access is managed in
Cloudflare rather than by ALB Google OIDC.

Access forwards the verified identity in `Cf-Access-Authenticated-User-Email`, and Grafana
consumes it via `auth.proxy` — people sign in as themselves instead of sharing the admin
credential. New users are auto-provisioned as **Viewer** (`auto_assign_org_role`); promote
deliberately in Grafana. Access controls *who gets in*, Grafana controls *what they can do*.

!!! danger "auth.proxy depends on Grafana having no public route"
    The `Cf-Access-Authenticated-User-Email` header is only trustworthy because the tunnel
    is the sole network path to the Service (`auth.proxy.whitelist` additionally requires
    the request to come from inside `10.161.0.0/16`). Re-adding an Ingress, a LoadBalancer
    Service, or otherwise exposing Grafana makes the header spoofable — anyone could then
    set it and sign in as anyone. If you must re-expose it, disable `auth.proxy` first.

The built-in Grafana login form is deliberately left enabled as break-glass: with no
Ingress it is only reachable via `kubectl port-forward`, using the admin credential from
`grafana-credentials`.

The Cloudflare-side config (tunnel public hostname, Access application and its policies) is
managed in the Cloudflare dashboard, matching how the
[infra docs site](https://docs.example.com) is gated — it is not in this repo.

The other ALB-OIDC services (defectdojo, minio, dependency-track, sonarqube) still use
Google OIDC on the ALB with `google-oidc-secret`; prod Grafana is the first migrated.

---

## Thanos (long-term metrics)

Three self-hosted Thanos components (all `quay.io/thanos/thanos:v0.37.2`) plus the
sidecar in the Prometheus pod. Every S3-touching component runs as the `thanos`
ServiceAccount (IRSA `prod-thanos-role` / `staging-thanos-role`).

| Component | Kind | Replicas | Storage | Key args |
|-----------|------|:--------:|---------|----------|
| thanos-query | Deployment | 2 | — | `--query.replica-label=replica`, stores = `prometheus-thanos-discovery` + `thanos-store` (dnssrv), `--query.timeout=5m`, `--query.lookback-delta=15m` |
| thanos-store | StatefulSet | 2 | 10Gi gp3 | `--index-cache-size=512MB`, `--chunk-pool-size=512MB` |
| thanos-compactor | StatefulSet | 1 | 20Gi gp3 | retention raw **30d** / 5m **180d** / 1h **365d**, `--delete-delay=48h`, `--wait --wait-interval=3h` |

The object store is an S3 bucket with `SSE-S3`, wired via the `thanos-objstore-config`
ConfigMap per overlay:

| Env | Bucket |
|-----|--------|
| prod | `prod-thanos-777788889999` |
| staging | `staging-thanos-444455556666` |

Buckets and IRSA roles are created by the `terraform/aws/<env>/af-south-1/observability`
Terraform. `thanos-query` is the datasource behind long-range Grafana queries; the
Prometheus sidecar uploads TSDB blocks and thanos-store serves them back.

---

## Blackbox exporter and the camera probes

The base
blackbox-exporter
is `prom/blackbox-exporter:v0.25.0` (replicas 2) with two modules:

- **`icmp_camera`** — ICMP, 5s timeout, IPv4, ttl 64
- **`http_camera`** — HTTP GET, 5s, accepts `200/401/403`, HTTP/1.1 + HTTP/2, no SSL fail

A `ServiceMonitor` (label `release: kube-prometheus-stack`, the label the stack's
Prometheus selects on) scrapes the exporter's own `/metrics`.

### Prod probe targets (network + cameras)

The **prod overlay** adds the actual probe targets. Staging deploys only the base
exporter (no probe targets).

**`probe-public.yaml`** — a `Probe` CR (`blackbox-icmp`, module `icmp_camera`, 30s) with a
hand-maintained `staticConfig` of ~120 network endpoints: public DNS anchors
(`1.1.1.1`, `8.8.8.8`), platform Azure/AWS CHRs, ISP next-hops, and every platform/Client C WireGuard
public endpoint (`*.sn.mynetname.net`, `client-c-tmc.ddns.net`, …). Used for general egress /
path monitoring.

**`scrapeconfig-camera-http.yaml`** and **`scrapeconfig-camera-icmp.yaml`** — two
`ScrapeConfig` CRs (`monitoring.coreos.com/v1alpha1`) driving the blackbox exporter
against the capture camera fleet:

| ScrapeConfig | jobName | Interval / timeout | Module | Targets |
|--------------|---------|--------------------|--------|---------|
| camera-http | `blackbox-camera-http` | 120s / 30s | `http_camera` | **926** camera HTTP endpoints |
| camera-icmp | `blackbox-camera-icmp` | 30s / 10s | `icmp_camera` | **926** camera hosts |

Each target carries a rich per-camera label set (`camera_id`, `camera_name`, `site_name`,
`is_vpn`, `camera_make`, `camera_model`, `camera_serial_number`, `camera_firmware`,
`connection_type`, `camera_lat`, `camera_long`). Standard blackbox `relabelings` move
`__address__` → `__param_target` → `instance` and point `__address__` at
`blackbox-exporter.observability.svc.cluster.local:9115`; the ICMP config also strips a
trailing `:port` off the address before probing.

!!! note "These two files are machine-generated (and huge)"
    `scrapeconfig-camera-http.yaml` and `scrapeconfig-camera-icmp.yaml` are ~500KB /
    ~14k lines each, produced from the camera inventory by the
    **camera-scrapeconfig-generator** (an out-of-repo/utils job), then committed. The
    matching `router-blackbox-icmp` job's targets/labels are produced by
    **router-fleet-resolver**
    (`kubernetes/apps/utils/base/router-fleet-resolver`),
    not this directory. Treat the camera scrapeconfigs as generated artifacts — edit the
    generator, not the YAML.

---

## cloudwatch-exporter (AWS/VPN metrics) — prod only

cloudwatch-exporter
is **YACE** (`ghcr.io/prometheus-community/yet-another-cloudwatch-exporter:v0.62.0`),
a single-replica (`Recreate`) scraper that bridges CloudWatch `AWS/VPN` metrics into
Prometheus.

- Runs as SA `cloudwatch-exporter` with `automountServiceAccountToken: false`; AWS creds
  come from **EKS Pod Identity** (assumes `vpn-metrics-exporter`, which **role-chains**
  into `arn:aws:iam::210987654321:role/vpn-metrics-cloudwatch-reader` in the network
  account where the Site-to-Site VPNs live).
- Config (prod configmap)
  tag-discovers `AWS/VPN` resources, exports `Customer`/`Name` tags onto every series, and
  collects `TunnelState` (Max), `TunnelDataIn`/`TunnelDataOut` (Sum) at 300s period /
  600s length.
- Scraped via a `ServiceMonitor` at 60s (and duplicate `prometheus.io/scrape`
  annotations). Series land as `aws_vpn_tunnel_state_maximum`,
  `aws_vpn_tunnel_data_{in,out}_sum` with `dimension_VpnId`, `dimension_TunnelIpAddress`,
  `tag_Customer` labels — consumed by the VPN dashboard and PrometheusRules.

---

## PrometheusRules / alerts (prod only)

Three `PrometheusRule` objects, all labelled `release: kube-prometheus-stack` (required
for discovery) and routed by the `team=networking` labels above.

### `router-icmp` — the only paging rule

`prometheusrule-router-icmp.yaml`
defines **`ClientRouterDown`** (`severity: critical`): `probe_success == 0` for 5m against
a hand-picked set of three sites only (Client B, Client A, Client C TMC public endpoint). This
is the alert that pages PagerDuty. The rest of the fleet is dashboarded but not paged.

### `router-health` — Slack-only fleet health

`prometheusrule-router-health.yaml`
groups:

- **monitoring-integrity** (critical → #networking-alerts): `MktxpExporterDown`,
  `RouterFleetResolverStalled` (no CronJob run in >2h), `RouterBlackboxProbesMissing`.
- **connection-health** (warning → #networking-warnings): `RouterReachabilityDegraded`
  (10–50% loss), `RouterHighLatency` (>500ms), `RouterInterfaceErrors`.
- **device-health** (warning, mktxp subset): `RouterUnexpectedReboot`,
  `RouterHighTemperature` (>70°C), `RouterHighCPU` (>90%), `RouterHighMemory` (>90%),
  `RouterDiskFull` (>90%), `RouterLowVoltage` (<20V).

### `vpn-tunnels`

`prometheusrule-vpn-tunnels.yaml`
alerts on the cloudwatch-exporter series (Slack-only, `team: networking`):

| Alert | Condition | Severity |
|-------|-----------|----------|
| `VpnTunnelDown` | one tunnel `state == 0` for 15m | warning |
| `VpnConnectionDown` | all tunnels of a connection `== 0` for 10m | critical |
| `VpnTunnelRekeyChurn` | `changes(...[1h]) > 6` for 10m (flapping) | warning |
| `VpnMetricsExporterDown` | `up{job="cloudwatch-exporter"} == 0` for 15m | warning |

---

## Grafana dashboards + generators

Dashboards live in
`base/grafana/dashboards`
and are provisioned via a `configMapGenerator` (label `grafana_dashboard: "1"`,
`disableNameSuffixHash: true`) that the Grafana sidecar picks up. Both overlays reference
`base/grafana` unchanged (staging additionally adds the CNPG `Database`).

| Dashboard | uid | Source | Notes |
|-----------|-----|--------|-------|
| `cameras.json` | `example-cameras` | generated by `gen_cameras.py` | capture camera fleet health |
| `routers.json` | `example-routers` | generated by `gen_routers.py` | MikroTik fleet view |
| `mktxp.json` | `example-mktxp` | upstream Grafana **#13679**, datasource-adapted | per-device MikroTik deep-dive |
| `vpn-tunnels.json` | `example-vpn-tunnels` | hand-written | AWS Site-to-Site VPN tunnel health |

!!! warning "Bump `version` on every dashboard change"
    Grafana's file provisioner only re-imports a provisioned dashboard when its integer
    `version` **increases**. A content change with the same `version` is silently ignored
    and the old dashboard stays live. The generators embed the current versions
    (`cameras` v15, `routers` v6, `vpn-tunnels` v1) — bump them when regenerating.

### `gen_cameras.py`

`gen_cameras.py`
builds the single **Cameras** dashboard (`python gen_cameras.py` writes `cameras.json`
next to it). Key design:

- **HTTP is the primary reachability test** (a dead HTTP endpoint = unusable camera);
  ICMP is kept for RTT / packet-loss. "Sending" = ≥1 capture event in the last 1h
  (`increase(capture_events_total[1h]) > 0`).
- Per-camera tri-state health glyph (0 = not sending/red, 1 = sending but HTTP-down/yellow,
  2 = OK/green) computed as `sending * (1 + http_up)`.
- Template variables from the scrapeconfig labels (site, make, model, link type, VPN,
  `/24` subnet, camera name) **plus** `router`/`peer` (from the
  camera-probe-propagator peer labels) and two custom cascade filters (Reachability,
  Sending) that inject a verbatim PromQL clause into every panel.
- Panels: overview stat rows, an over-time timeseries, a **geomap** of camera health, a
  merged status table, and collapsed ICMP / HTTP / capture / **WireGuard peers** sections.
  The peers section joins `mikrotik_wireguard_peer_*` (from mikrotik-wireguard-exporter)
  onto the camera `peer_pubkey`.

!!! note "The lumpy capture counter"
    `capture_events_total` is incremented once per ~60s exporter cycle, so `rate()` over a
    narrow window aliases into a sawtooth. The dashboard deliberately uses a **15m** rate
    window (a query-level fix) because the ripple is baked into stored samples that no
    scrape/exporter change can retro-smooth.

### `gen_routers.py`

`gen_routers.py`
builds the **Routers** fleet dashboard. Two tiers produced by `router-fleet-resolver`:

- **blackbox (ICMP)** reachability for every router — the reliable spine
  (`job="router-blackbox-icmp"`, labels `site_name`, `router_endpoint`, `tier`, `client`).
- **mktxp** (RouterOS API) device metrics for the authenticated subset, joined onto the
  filtered spine on `routerboard_address == router_endpoint`.

It renders a fleet table (reachability + auth status + CPU/mem/disk/temp/volts/uptime),
an interfaces table, connection-health and device-health timeseries, and firewall traffic
panels. Per-device drill-down is deferred to `mktxp.json`. Template vars: client / site /
tier / router.

### `vpn-tunnels.json`

Hand-written dashboard (`example-vpn-tunnels`) reading the cloudwatch-exporter AWS/VPN
series: per-tunnel state (stepped 0/1), and tunnel data in/out (bps).

---

## Loki + Fluent Bit (logs)

**Loki** (statefulset):
`grafana/loki:3.6.7`, StatefulSet replicas 2, 10Gi gp3, runs as SA `loki`
(IRSA `prod-loki-role` / `staging-loki-role`). Services: `loki` (3100/9096),
`loki-memberlist` (7946 headless), `loki-gateway` (:80 → 3100, the write/read entry point
and the Grafana datasource URL).

Config differs per env
(prod /
staging):
`auth_enabled: false`, TSDB shipper on S3, schema v13, **31-day retention** (`744h`),
ingestion 16MB/s (burst 32MB), compactor with retention deletes.

| Env | S3 bucket | replication_factor | memberlist |
|-----|-----------|:------------------:|:----------:|
| prod | `prod-loki-777788889999` | 2 | yes (join `loki-memberlist`) |
| staging | `staging-loki-444455556666` | 1 | not configured |

!!! note "Staging Loki replica/RF mismatch"
    Staging sets `replication_factor: 1` and omits the memberlist ring config, but does
    **not** override the base StatefulSet `replicas: 2`. Two staging Loki replicas run
    without a configured memberlist join — a minor inconsistency worth being aware of when
    debugging staging log ingestion.

**Fluent Bit** (daemonset):
`fluent/fluent-bit:3.2.2` DaemonSet (tolerates all taints), SA `fluent-bit` with a
ClusterRole granting `get/list/watch` on namespaces + pods. It tails
`/var/log/containers/*.log`, enriches via the `kubernetes` filter, strips
`pod_id`/`docker_id`/`container_hash`, and ships to `loki-gateway:80` stamping
`cluster=prod` / `cluster=staging` and namespace/pod/container labels. No ServiceMonitor
(exposes only the HTTP health server on 2020).

---

## KRR (right-sizing)

krr
(`robustadev/krr:v1.28.0`) is a CronJob that runs **Mondays 09:00** (`0 9 * * 1`),
queries Prometheus for resource recommendations, and posts a CSV to Slack via the shared
`slack-credentials` bot token. Its ClusterRole grants cluster-wide `get`/`list`.

| Env | `PROMETHEUS_URL` | Slack channel |
|-----|------------------|---------------|
| prod | `http://prometheus.observability.svc.cluster.local:80` | `C000000AAA2` (#engineering-info) |
| staging | `http://prometheus-prometheus.observability.svc.cluster.local:9090` | `C000000AAA4` (#staging-engineering-info) |

The many `# higher mem limit until KRR runs for this resource` comments in
`resources.yaml` are placeholders awaiting these KRR recommendations.

!!! note "Prod vs staging Prometheus URL differ"
    Prod points KRR at the `prometheus` service on port 80; staging explicitly points at
    `prometheus-prometheus:9090` with a comment that the plain `prometheus` service "only
    the now-removed orphan owned". Worth confirming the prod URL still resolves to the
    live kube-prometheus-stack Prometheus.

---

## Metric exporters

All four are `Deployment`s scraped either by a `ServiceMonitor`
(label `release: kube-prometheus-stack`) or `prometheus.io/scrape` annotations.

| Exporter | Image | Replicas | Target (prod) | Target (staging) | Credentials |
|----------|-------|:--------:|---------------|------------------|-------------|
| mongodb-exporter | `bitnami/mongodb-exporter` (pinned by digest), `--collect-all` | 2 | `mongo-uri` SM | `mongo-uri` SM | ExternalSecret `mongo-uri` (`MONGO_URI_READ_ONLY`) |
| mysql-exporter | `prom/mysqld-exporter:v0.18.0` | 2 | `db-proxy.internal.prod...:3306` | *(not deployed)* | ExternalSecret `mysql-credentials` → `.my.cnf` from `prod-db-readonly-credentials` |
| postgres-exporter | `quay.io/prometheuscommunity/postgres-exporter:v0.19.0` | 2 | `postgres.internal.prod...:5432` | *(not deployed)* | ExternalSecret `postgres-credentials` (`readonly_*` from SM `postgres`) |
| redis-exporter | `quay.io/oliver006/redis_exporter:v1.56.0` | 2 | `cache.internal.prod...:6379` | `valkey.database.svc:6379` | none (no-auth) |

Notes:

- **postgres-exporter** ships a `queries.yaml` ConfigMap with custom queries
  (`pg_replication` lag, `pg_postmaster`, `pg_stat_user_tables`). The base DSN uses a
  literal `@hostname` placeholder that the **prod overlay patches** to the real host.
- **mysql/postgres** are intentionally omitted on staging pending RDS/CNPG credential
  wiring (see the staging `kustomization.yaml` comment).
- The exporter SAs (e.g. `mongodb-exporter`) set `automountServiceAccountToken: false`.

---

## netshoot

netshoot
is a network-debug DaemonSet in its own `netshoot` namespace, deployed directly by both
cluster overlays.

```yaml
image: nicolaka/netshoot:latest        # sleeps forever; kubectl exec in to debug
hostNetwork: true
hostPID: true
securityContext:
  privileged: true                     # full node network/PID visibility
resources: { requests: {64Mi,100m}, limits: {128Mi,200m} }
```

!!! warning "Privileged, host-network, mutable tag"
    This pod runs `privileged` with `hostNetwork`/`hostPID` and pulls `:latest` — powerful
    for on-node network troubleshooting but a standing high-privilege workload with a
    non-pinned image. It exists purely for interactive `kubectl exec` debugging.

---

## Legacy / migration artifacts (AMP → Prometheus)

The `overlays/prod` directory contains a **one-off AMP (Amazon Managed Prometheus) →
in-cluster Prometheus migration** toolkit that is **not wired into any Kustomization or
Flux** — it is standalone tooling run by hand. It is effectively dead once the migration
completed and the AMP workspaces are deleted.

- `amp_query_migrate.go`
  — Go program that pages metric names from AMP (SigV4-signed, optional cross-account
  assume-role), queries in 30m chunks and remote-writes into Prometheus with a resumable
  checkpoint. `go.mod` / `go.sum` sit beside it.
- `run_migration.sh` — local runner (port-forwards Prometheus, builds + runs the binary
  against shared account `123456789012`, workspace `ws-aaaa1111…`).
- `amp-migrate-job/` — the in-cluster variant: `job.yaml` (shared AMP, cross-account
  assume-role), `job-prod-amp.yaml` (prod AMP workspace `ws-bbbb2222…`), `serviceaccount.yaml`
  (`amp-migrator`, IRSA `prod-amp-migrator-role`), and `setup-iam.sh` / `teardown.sh` that
  create/destroy the cross-account IAM and the `amp-migrate-src` ConfigMap. Both jobs
  build the Go source from a ConfigMap at pod start.

!!! note "The committed 12.9 MB binary was removed"
    `overlays/prod/amp-migrate` — a **Mach-O 64-bit arm64 executable** (~12.9 MB), the
    locally-built output of `amp_query_migrate.go` — was git-tracked and has been **deleted in a
    cleanup PR** (`run_migration.sh` rebuilds it on demand). The `amp-migrate-job/` manifests and
    the Go source remain; they are a one-off AMP→Prometheus migration and can be removed once the
    migration is confirmed complete.

Other archived / generated weight in-tree:

- `base/grafana/dashboards/.archive/` — **13 archived Grafana dashboards (~704 KB)** kept
  in git after the Grafana clean-up (blackbox, fluent-bit, krr, loki, mongodb, mysql,
  postgres, redis, ping2, and four Thanos dashboards). Intentionally retained but dead
  (not provisioned).
- The two camera `ScrapeConfig` YAMLs (~500 KB each) are committed generated artifacts.
