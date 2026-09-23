# Camera & capture utilities

These four utilities in platform-utils support the camera fleet and the edge capture pipeline: generating blackbox-probe monitoring targets, chasing down un-migrated cameras, watching the watchlist match ingestion stream, and reporting per-camera S3 storage usage.

Each is a small Python container built from `src/<name>/` and deployed by `platform-infra` as a Kubernetes `CronJob` via Flux. This page documents:

| Utility | What it does | Kind / Schedule | Namespace |
|---|---|---|---|
| [`camera-probe-propagator`](#camera-probe-propagator) | Generates Prometheus `ScrapeConfig` CRDs from the camera DB and commits them to `platform-infra` | CronJob `*/30 * * * *` | `utils` |
| [`sonic-stragglers-report`](#sonic-stragglers-report) | Finds cameras still uploading captures to the old SonicWall IP (now a MikroTik CHR) | CronJob `0 1 * * *` (runs 23 h) | `misc` |
| [`watchlist-log-items`](#watchlist-log-items) | Alerts to Slack when the watchlist MongoDB collection stops receiving items | CronJob `*/30 * * * *` | `misc` |
| [`camera-image-size-report`](#camera-image-size-report) | Analyses S3 capture-image storage per device and reports to Slack | CronJob `0 8 * * 1` (weekly) | `misc` |

!!! note "Where the images and manifests live"
    Source, `Dockerfile`, and the canonical `k8s/` manifests are in **platform-utils**. Images are published to `ghcr.io/example-org/<name>`. **platform-infra** consumes them under `kubernetes/apps/utils/` — an `ImageRepository` / `ImagePolicy` / `ImageUpdateAutomation` per component plus a Flux `Kustomization` that points at the platform-utils `k8s/overlays/<env>/<name>` path.

---

## camera-probe-propagator

The most involved of the four. It turns the camera inventory in MySQL into two Prometheus `ScrapeConfig` CRDs (ICMP and HTTP blackbox probes) and pushes them straight into the `platform-infra` Git repository, so the blackbox-exporter always probes the live set of cameras without anyone hand-editing YAML.

Source: `src/camera-probe-propagator/` — `main.py`, `mikrotik.py`.

### What it does (pipeline)

1. **Auth to GitHub** as a GitHub App (App ID `1234567`), minting an installation access token (`get_installation_token`). Skipped entirely in local `OUTPUT_DIR` mode.
2. **Query MySQL** (`_CAMERA_QUERY`) — selects from `camera_profile` where `is_activated = 1` and `host` is non-empty, ordered by name. Columns become scrapeconfig labels: `device_id` → `camera_id`, `name`, `site_name`, `host`, `port`, `is_vpn`, `camera_model`, `camera_make`, `camera_serial_number`, `camera_firmware`, `is_activated`, `connectionType`, `camera_lat`, `camera_long`. **Aborts (exit 1) if the query returns zero cameras** — a guard against writing empty scrapeconfigs.
3. **Camera→WireGuard-peer correlation** (best-effort, see below).
4. **Build two ScrapeConfig documents** (`monitoring.coreos.com/v1alpha1`, namespace `observability`, label `release: kube-prometheus-stack`):
   - `blackbox-camera-icmp` — `scrapeInterval: 30s`, `scrapeTimeout: 10s`, module `icmp_camera`, targets are bare hosts (port stripped via relabeling).
   - `blackbox-camera-http` — `scrapeInterval: 120s`, `scrapeTimeout: 30s`, module `http_camera`, targets are `http://<host>:<port>` (port defaults to 80).
   - Both relabel `__address__` to `blackbox-exporter.observability.svc.cluster.local:9115` and set `instance`/`__param_target`.
5. **Commit to GitHub** (`push_files`) via the Git Data API (blob → tree → commit → advance ref) as a *single* commit of both files. It first GETs current file contents and **skips the commit if nothing changed**. Commit message: `chore: regenerate camera scrapeconfigs [<ISO-timestamp>]`.
6. **Slack notification** (`send_slack_notification`) — diffs the old vs new HTTP scrapeconfig by `camera_id` and posts an "added / removed / changed" summary with per-field before→after values. Silently skipped if `SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID` are unset.

A sample of the generated output lives in the repo at `output/scrapeconfig-camera-icmp.yaml`:

```yaml
- targets:
  - client-f.ddns.net
  labels:
    camera_id: "11111111-2222-3333-4444-555555555555"
    camera_name: "SiteA-MainSt@FirstAve R:Northbound"
    site_name: "Client B"
    is_vpn: "false"
    camera_model: "VA-2CD7A46-IZHS"
    camera_make: "VendorA"
    camera_firmware: "V5.7.80 build 000000"
    camera_lat: "-33.92000000"
    camera_long: "18.42000000"
```

### Camera → WireGuard peer correlation

Only VPN cameras (`is_vpn = 'true'`) sit behind a WireGuard peer. When `PEER_CORRELATION_ENABLED=true` (default), the job SSHes every router in its inventory read-only (`mikrotik.fetch_wg_peers`), builds the peer list, and finds the peer whose `allowed-address` CIDR contains each camera's IP (longest-prefix match, `best_peer_for_ip`). Matched cameras get three extra labels — `peer`, `router`, `peer_pubkey` — so Grafana can filter cameras by peer and join to the MikroTik WireGuard exporter's per-peer health on `public_key == peer_pubkey`.

This path is **fully best-effort and never blocks scrapeconfig generation**:

- Any exception is caught and the run continues without peer labels.
- On a *partial* router outage (`all_ok = False`), an unmatched VPN camera keeps its **last-known peer label** — read back from the current ICMP scrapeconfig on GitHub (`_prior_peer_labels`) — so a single router being unreachable does not flap the committed YAML.
- Kill-switch: set `PEER_CORRELATION_ENABLED=false` to skip router SSH entirely.

The router inventory is the `routers.json` ConfigMap (`routers-configmap.yaml`) — the **same inventory as `mikrotik-wireguard-exporter`**; keep the two in sync:

```json
{ "routers": [
  {"name": "client-c",       "host": "client-c-tmc.ddns.net",             "port": 8101},
  {"name": "client-a",     "host": "hx0000000a1.sn.mynetname.net", "port": 22},
  {"name": "client-b", "host": "hx0000000c3.sn.mynetname.net", "port": 22, "enabled": false}
] }
```

### Build & image

- **Language / deps** (`requirements.txt`): Python — `mysql-connector-python`, `PyYAML`, `PyJWT`, `cryptography`, `requests`, `paramiko` (router SSH).
- **Dockerfile**: base `python:3.12-slim`, installs `gcc`/`libssl-dev`, runs as non-root `appuser` (UID 1000).
- **Image**: `ghcr.io/example-org/camera-probe-propagator` (bake target `camera-probe-propagator` in `docker-bake.hcl`).

### Deployment

Manifests: `k8s/base/camera-probe-propagator/`. This is the only one of the four that runs in the **`utils`** namespace (the others use `misc`).

- **CronJob** `camera-probe-propagator` — `schedule: "*/30 * * * *"`, `concurrencyPolicy: Forbid`, `activeDeadlineSeconds: 300`, `backoffLimit: 1`, `ttlSecondsAfterFinished: 86400`. `automountServiceAccountToken: false` (no cluster API access needed). Pod `securityContext` sets `fsGroup: 1000` so the non-root UID can read the `0440` SSH key file.
- **Container security**: `runAsNonRoot`, `runAsUser: 1000`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, all capabilities dropped.
- **Resources**: requests 100m CPU / 128Mi, limits 1 CPU / 512Mi.
- **Volumes**: `tmp` emptyDir; `github-key` secret at `/secrets/github`; `mikrotik-ssh` secret (key `id_ed25519`, mode `0440`) at `/etc/camera-probe-propagator/ssh`; `inventory` ConfigMap at `/etc/camera-probe-propagator/inventory`.

**Config** comes from the `camera-probe-propagator-config` ConfigMap (base values blank, filled by the prod overlay `k8s/overlays/prod/camera-probe-propagator/kustomization.yaml`):

| Key | Prod value |
|---|---|
| `GITHUB_APP_ID` | `1234567` |
| `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` / `GITHUB_BRANCH` | `example-org` / `platform-infra` / `main` |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_DATABASE` | `db-proxy.internal.prod.cpt.aws.example.net` / `3306` / `capture_admin_portal` |
| `SLACK_CHANNEL_ID` | `C000000AAA2` (#engineering-info) |
| `SCRAPECONFIG_ICMP_PATH` | `kubernetes/infrastructure/services/observability/overlays/prod/blackbox-exporter/scrapeconfig-camera-icmp.yaml` |
| `SCRAPECONFIG_HTTP_PATH` | `kubernetes/infrastructure/services/observability/overlays/prod/blackbox-exporter/scrapeconfig-camera-http.yaml` |
| `PEER_CORRELATION_ENABLED` | `true` |

**Secrets** (`externalsecret.yaml`) — four ExternalSecrets from the `aws-secrets-manager` ClusterSecretStore:

| K8s Secret | Source (AWS Secrets Manager) | Used as |
|---|---|---|
| `camera-probe-propagator-db` | `prod-db-readonly-credentials` (`username`, `password`) | `MYSQL_USER`, `MYSQL_PASSWORD` |
| `camera-probe-propagator-github` | `github` → `platform-bot-private-key.pem` | mounted PEM → `GITHUB_PRIVATE_KEY_FILE=/secrets/github/private-key.pem` |
| `camera-probe-propagator-slack` | `slack-credentials` → `slack-bot-token` | `SLACK_BOT_TOKEN` (optional) |
| `camera-probe-propagator-mikrotik-ssh` | `mikrotik` → `readonly-private-key` | shared read-only router SSH key |

!!! tip "Local / dry-run mode"
    Setting `OUTPUT_DIR` makes the generator **write the YAML files to disk instead of pushing to GitHub**, and GitHub credentials are not required. See `.env.local.example` and `docker-compose.yml` for the local workflow (SSH-tunnel to the DB, mount the PEM at `secrets/github-app-key.pem`).

**platform-infra wiring**: `kubernetes/apps/utils/overlays/prod/camera-probe-propagator/` holds the Flux `Kustomization` (path `./k8s/overlays/prod/camera-probe-propagator` on the `platform-utils` GitRepository), plus `ImagePolicy` (semver `>=1.0.0`, tags `^v[0-9]+\.[0-9]+\.[0-9]+$`) and `ImageUpdateAutomation` that bumps the pinned tag in the utils repo (commit author `platform-bot`).

!!! warning "This job writes to platform-infra `main`"
    A run commits regenerated scrapeconfigs directly to `platform-infra` `main` (when files differ). The `is_activated = 1 AND host != ''` filter plus the zero-row abort are the safety rails against an empty or wildly-wrong DB result wiping the probe targets.

---

## sonic-stragglers-report

Tracks the SonicWall→AWS camera migration by finding cameras still uploading license captures to the **old firewall public IP**, which now terminates on a MikroTik CHR. The CHR is polled over SSH for its live firewall connection table; any camera still hitting TCP port **3333** (the capture-upload port) is a "straggler" that hasn't been repointed to AWS.

Source: `src/sonic-stragglers-report/` — `main.py`, `README.md`.

### What it does

1. **Monitor** (`collect_tcp_connections`) — for `MONITORING_DURATION` seconds (default 82800 = 23 h), loops every 10 s running `ssh … /ip/firewall/connection/print` against the CHR. It parses each line for `tcp` connections to `:3333` in an established state (`SACsd`/`Sd`/`sd`), extracts and validates the source IP, and appends `ip,established,<ts>` to a per-run file under `/tmp`. SSH args are validated (`validate_ssh_parameters`) and the command is built as an argv list — no `shell=True`.
2. **Analyse** (`analyze_ip_patterns`) — dedupes to unique IPs with connection counts, then geolocates up to 50 IPs (threaded) via `ipapi.co` (if `IPAPI_KEY`) or the free `ip-api.com`. Flags each camera `HIGH`/`NORMAL` priority relative to the average.
3. **Report** — writes a CSV (`<date>_sonic_stragglers_migration.csv`) with columns `Camera_IP, Capture_Upload_Count, Connection_States, Migration_Priority, Country, Region, City, Organization, ISP, Last_Seen`, plus a human-readable summary `.txt`. If **no** stragglers are found it still writes a one-row "all cameras migrated" CSV.
4. **Slack** (`send_slack_report`) — posts a summary message and uploads the CSV via `files_upload_v2`. Skipped with a warning if Slack isn't configured.

The repo also contains a committed **`match_cameras/`** helper set (README) — shell + `dig` scripts (`extract_public_ips.sh`, `compare_ips.sh`, `fetch_geoip.py`) that cross-reference straggler IPs against `camera_profile.csv` to name the offending cameras, plus a historical migration CSV/summary from 2026-02-04.

### Build & image

- **Deps** (`requirements.txt`): `slack-sdk`, `requests`.
- **Dockerfile**: `python:3.11-slim`, installs `openssh-client`, non-root `appuser` (UID 1000), pre-seeds `known_hosts` for `firewall.example.com`.
- **Image**: `ghcr.io/example-org/sonic-stragglers-report`.

### Deployment

Manifests: `k8s/base/sonic-stragglers-report/`. Namespace `misc`.

- **CronJob** `sonic-stragglers-report` — `schedule: "0 1 * * *"` (daily 01:00 UTC), `activeDeadlineSeconds: 86400` (24 h — 23 h run + 1 h buffer), `concurrencyPolicy: Forbid`, `backoffLimit: 1`.
- **Security**: non-root UID 1000, `readOnlyRootFilesystem`, all caps dropped. Volumes: `tmp` emptyDir, and an **in-memory** (`emptyDir: {medium: Memory}`) `/app/.ssh` where the runtime SSH key is written.
- **Config** (`sonic-stragglers-config` ConfigMap): `SLACK_CHANNEL_ID: C000000AAA1`, `ROUTER_HOST: firewall.example.com`, `ROUTER_USER: admin`, `MONITORING_DURATION: 82800`.
- **Secrets** (`sonic-stragglers-secret`, SOPS-encrypted `secret.enc.yaml`): `SLACK_BOT_TOKEN`, `SSH_KEY_CONTENT` (router private key, injected at runtime — never baked into the image), optional `IPAPI_KEY`.

**Environment variables** consumed by `main.py`: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `ROUTER_HOST`, `ROUTER_USER`, `SSH_KEY_PATH` (default `/app/.ssh/runtime_key`), `SSH_KEY_CONTENT`, `MONITORING_DURATION`, `IPAPI_KEY`. A `--local` CLI flag switches to a system SSH config alias (default `hub-az-chr`) for laptop runs.

**Staging overlay** (`k8s/overlays/staging/…`) patches the run down to 1 h (`MONITORING_DURATION: 3600`, `activeDeadlineSeconds: 7200`) and shifts the schedule to `0 2 * * *`.

**platform-infra wiring**: `kubernetes/apps/utils/overlays/prod/sonic-stragglers-report/` — Flux `Kustomization` + image automation (prod tag currently `v1.22.0`).

!!! note "Output destination"
    A per-run CSV + summary in `/tmp` (ephemeral), surfaced to the Slack channel. Nothing is written to a database or S3 — the CSV attachment in Slack is the deliverable.

---

## watchlist-log-items

A liveness monitor for the **watchlist (watchlist match)** ingestion pipeline. Every 30 minutes it counts recent documents in the capture MongoDB and pages Slack if the count is zero — an early signal that cameras have stopped logging watchlist hits or the ingestion pipeline has stalled.

Source: `src/watchlist-log-items/` — `main.py`, `utils.py`.

### What it does

1. Sleeps a random 0–5 s (guards against duplicate executions if two pods start at once).
2. Connects to MongoDB (`connect_to_mongo`, `pymongo.MongoClient`) and counts documents in **`ingest.VOIlog`** where `capture.isoDate >= now - CHECK_INTERVAL_MINUTES` (default 30 min).
3. **Alerting logic**:
   - `total_records == 0` → posts `<!channel> No watchlist log items in the last N minutes.` and **exits 1** (failure).
   - Otherwise → posts `✅ *watchlist Item Log* - *N* records in N min` and exits 0.
4. On any exception it attempts a Slack error message and exits 1.

It also prints machine-readable lines (`STATUS=…`, `TOTAL_RECORDS=…`, `CHECK_INTERVAL=…`, `TIMESTAMP=…`) to stdout for K8s log scraping.

### Build & image

- **Deps** (`requirements.txt`): `pymongo==4.6.0`, `slack_sdk==3.21.3`.
- **Dockerfile**: `python:3.11-slim`, non-root `appuser` (UID 1000), copies `main.py` + `utils.py`.
- **Image**: `ghcr.io/example-org/watchlist-log-items`.

### Deployment

Manifests: `k8s/base/watchlist-log-items/`. Namespace `misc`.

- **CronJob** `watchlist-log-items-monitor` — `schedule: "*/30 * * * *"`, `activeDeadlineSeconds: 300`, `backoffLimit: 2`, `ttlSecondsAfterFinished: 21600`, `concurrencyPolicy: Forbid`.
- **Security**: non-root UID 1000, `readOnlyRootFilesystem`, all caps dropped, `tmp` emptyDir.
- **Config** (`watchlist-log-items-config` ConfigMap): `CHECK_INTERVAL_MINUTES: "30"`; the prod overlay patches `SLACK_CHANNEL_ID: C000000AAA1` (#info).
- **Secrets** (`externalsecret.yaml`) from `aws-secrets-manager`:
  - `mongo-uri` → key `mongo` property `MONGO_URI_READ_ONLY` → env `MONGO_URI` (read-only Mongo user).
  - `slack-credentials` → key `slack-credentials` property `slack-bot-token` → env `SLACK_BOT_TOKEN`.

**Environment variables**: `MONGO_URI` (required), `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `CHECK_INTERVAL_MINUTES`.

**platform-infra wiring**: `kubernetes/apps/utils/overlays/prod/watchlist-log-items/` — Flux `Kustomization` + image automation (prod tag `v1.22.0`). This container replaces the old `watchlist-alerts-alerter1.yaml` GitHub Actions workflow.

!!! note "Output destination"
    Slack only — an alert message to the configured channel (`@channel` mention on failure). The non-zero exit on the failure path also surfaces the run as a failed Job in Kubernetes.

---

## camera-image-size-report

A weekly storage-accounting report. For every online camera it walks the day's capture images in S3, computes per-device size metrics, enriches them with camera names from MySQL, and posts a sorted CSV to Slack — used for capacity planning and spotting cameras generating abnormal image volumes.

Source: `src/camera-image-size-report/` — `main.py`.

### What it does

1. **Select online cameras** (`run_query`) — `SELECT device_id FROM camera_profile WHERE id IN (SELECT DISTINCT camera_profile_id FROM up_down_status WHERE is_online = 1)`; writes the device IDs to `bucket_names.txt`.
2. **Walk S3** (`process_objects_in_s3_prefix`, 50-way `ThreadPoolExecutor`) — for each `device_id`, paginates `list_objects_v2` on `S3_BUCKET_NAME` under prefix `<device_id>/<YYYY-MM-DD>` (target date = **yesterday**). Sums object count and bytes, computing total GB, average KiB per capture, and captures-per-GB. Appends a row per device to `<date>_camera_usage.csv`.
3. **Enrich & sort** (`pandas`) — joins each `Device_Id` to its `name` from `camera_profile` (`get_camera_name`), recomputes `Number_of_captures_per_Gig`, and sorts by `Average_size_per_capture_KiB` descending. Final columns: `camera_name, Device_Id, Total_number_of_captures, Total_size_of_captures_GB, Average_size_per_capture_KiB, Number_of_captures_per_Gig`.
4. **Slack** (`send_slack`) — posts `Camera image size report for <date>` and uploads the CSV.

### Build & image

- **Deps** (`requirements.txt`): `boto3`, `mysql-connector-python`, `pandas`, `slack-sdk`.
- **Dockerfile**: `python:3.11-slim`, non-root `appuser` (UID 1000).
- **Image**: `ghcr.io/example-org/camera-image-size-report`.

### Deployment

Manifests: `k8s/base/camera-image-size-report/`. Namespace `misc`.

- **CronJob** `camera-image-size-report` — `schedule: "0 8 * * 1"` (Mondays 08:00 UTC), `activeDeadlineSeconds: 3600`, `backoffLimit: 2`, `concurrencyPolicy: Forbid`.
- **Security**: non-root UID 1000, `readOnlyRootFilesystem`, all caps dropped, `tmp` emptyDir.
- **Config** (`camera-image-size-report-config` ConfigMap): `SLACK_CHANNEL_ID: C000000AAA1`, `AWS_REGION: us-east-1`, `S3_BUCKET_NAME: example-prod-media`, `MYSQL_HOST: db-proxy.internal.prod.cpt.aws.example.net`, `MYSQL_PORT: 3306`, `MYSQL_DATABASE: capture_admin_portal`, `MYSQL_USER: captureadmin`.
- **Secrets** (`camera-image-size-report-secret`, SOPS-encrypted `secret.enc.yaml`): `SLACK_BOT_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `MYSQL_PASSWORD`.

**Environment variables**: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`, `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_DATABASE`/`MYSQL_USER`/`MYSQL_PASSWORD`.

!!! note "S3 access via static keys"
    Unlike the other utilities, S3 access here uses **static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`** from the SOPS secret rather than IRSA. Required IAM: `s3:ListBucket`, `s3:GetObject` on the `example-prod-media` bucket.

**platform-infra wiring**: `kubernetes/apps/utils/overlays/prod/camera-image-size-report/` — Flux `Kustomization` + image automation (prod tag `v1.22.0`).

!!! note "Output destination"
    A CSV report (`<date>_camera_usage.csv`) uploaded to the Slack channel. No persistent store — the metrics live in the Slack attachment and job logs.

---

## Common patterns

- **Deployment shape**: all four are Flux-managed `CronJob`s. The base + overlay manifests live in `platform-utils/k8s/`; `platform-infra` references them per-env under `kubernetes/apps/utils/overlays/<env>/<name>` and drives image bumps via `ImageRepository` → `ImagePolicy` → `ImageUpdateAutomation` (setters that rewrite the pinned `newTag` in the utils repo, committed as `platform-bot`).
- **Security baseline**: non-root UID 1000, `readOnlyRootFilesystem`, dropped capabilities, `concurrencyPolicy: Forbid`, bounded `activeDeadlineSeconds`.
- **Secrets**: sourced from AWS Secrets Manager via `external-secrets` (`camera-probe-propagator`, `watchlist-log-items`) or committed SOPS-encrypted secrets (`sonic-stragglers-report`, `camera-image-size-report`).
- **Data sources**: the capture MySQL `camera_profile` table (`capture_admin_portal` on `db-proxy.internal.prod.cpt.aws.example.net`) is the common camera inventory; `camera-probe-propagator` and `camera-image-size-report` both read it, `watchlist-log-items` reads MongoDB `ingest.VOIlog`, and `sonic-stragglers-report` reads the MikroTik CHR firewall table over SSH.
