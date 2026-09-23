# Prometheus exporters

Two long-running Prometheus exporters live in platform-utils and feed the prod observability stack. Unlike the CronJob-style utilities in this repo, both are **Deployments** that serve `/metrics` forever:

| Exporter | Polls | Port | Metric prefix |
| --- | --- | --- | --- |
| capture-exporter | MongoDB `ingest.captures` (per-camera capture read counts, no PII) | `9109` | `lpr_*` |
| mikrotik-wireguard-exporter | MikroTik RouterOS WireGuard peers over read-only SSH | `9110` | `mikrotik_*` |

Both are deployed into the `observability` namespace on prod-eks, scraped via a `ServiceMonitor`, and released through Flux image automation. A third, **`mktxp`** (an upstream RouterOS API exporter), is deployed from the same `k8s/base` tree and is documented at the end because it is the API-tier sibling of the WireGuard exporter.

!!! note "Why these sit next to the blackbox camera probes"
    The design intent of both exporters is to join natively with the blackbox camera-reachability metrics (`probe_success{job="blackbox-camera-icmp"}`). `capture-exporter`'s `camera_id` label equals the blackbox `camera_id`; the WireGuard exporter's `public_key` label is the join key that `camera-probe-propagator` stamps onto each camera's scrapeconfig. Together they let an operator tell "camera broken" from "the tunnel carrying that camera is down".

---

## capture-exporter

### What it does

A Prometheus exporter for **per-camera capture capture-event counts** with **no PII**. It counts new documents in the MongoDB `ingest.captures` collection per camera and exposes them as counters, so capture-event volume and health can be graphed in Grafana next to the blackbox camera-reachability metrics.

It only ever groups on `cameraProfileId` and counts documents — it never reads or exposes `captureId`, pictures, capture coordinates, or vehicle attributes.

Source: `src/capture-exporter/main.py`, `README.md`.

### How it counts (skew-robust)

The `ingest.captures` `isoDate` field is unreliable — camera clock skew produces capture dates as far out as year 2033. Instead the exporter windows on the document `_id` (an `ObjectId`, which embeds the monotonic **server** insertion time).

Every `REFRESH_INTERVAL_SECONDS` it runs a `$match` + `$group` aggregation counting docs whose `_id` is in `(last_boundary, now]`, grouped by `cameraProfileId`, and increments each camera's counter by that delta:

```python
pipeline = [
    {"$match": {"_id": {"$gt": lower_oid, "$lte": upper_oid}}},
    {"$group": {"_id": "$cameraProfileId", "c": {"$sum": 1}}},
]
```

Bounded windows (exclusive lower, inclusive upper) mean no double-counting and no gaps across intervals. Counting starts at process start (no historical backfill); a process restart resets the counter to 0, which Prometheus `rate()`/`increase()` handle natively.

!!! tip "Outage self-heal (`MAX_CATCHUP_SECONDS`)"
    The lower bound is capped to `MAX_CATCHUP_SECONDS` (default 600s). Without this cap, a long Mongo outage would grow the `(last_boundary, now]` window without bound; on recovery the catch-up query would scan the whole outage, exceed `MONGO_MAX_TIME_MS`, and wedge the exporter forever. When the window would exceed the cap it skips ahead (logging a warning and accepting a bounded, unrecorded gap) so recovery always self-heals. A transient Mongo error sets `capture_exporter_up=0`, does **not** advance the boundary (so the next successful cycle covers the gap), and never crashes the `/metrics` server.

The Mongo client connects with `readPreference="secondaryPreferred"` to keep read load off the primary, `appname="capture-exporter"`, and a 15s server-selection timeout.

### Metrics exposed

| Metric | Type | Labels | Notes |
| --- | --- | --- | --- |
| `capture_events_total` | counter | `camera_id` | capture events per camera; `camera_id` == blackbox `camera_id` (docs with an empty `cameraProfileId` are skipped) |
| `capture_exporter_up` | gauge | – | 1 if the last Mongo query succeeded, else 0 |
| `capture_exporter_last_success_timestamp_seconds` | gauge | – | unix ts of last successful query (staleness signal) |
| `capture_exporter_scrape_duration_seconds` | gauge | – | wall time of the last Mongo query |
| `capture_exporter_window_reads` | gauge | – | reads counted across all cameras in the last window |
| `capture_exporter_cameras_reading` | gauge | – | distinct cameras with ≥1 read in the last window |

### Configuration and secrets

Language: Python 3.12. Key deps (`requirements.txt`): `pymongo==4.6.0`, `prometheus_client==0.20.0`. Base image `python:3.12-slim` running as UID 10001, `PYTHONUNBUFFERED=1`, with a `urllib`-based `HEALTHCHECK` against `:9109/metrics`.

| Env | Required | Default | Source | Notes |
| --- | --- | --- | --- | --- |
| `MONGO_URI` | yes | – | Secret `capture-exporter-mongo` key `MONGO_URI_READ_ONLY` | read-only URI |
| `MONGO_DB` | no | `ingest` | ConfigMap | |
| `MONGO_COLLECTION` | no | `captures` | ConfigMap | |
| `REFRESH_INTERVAL_SECONDS` | no | `60` | ConfigMap | Mongo query cadence |
| `MONGO_MAX_TIME_MS` | no | `60000` | image/env default | server-side query timeout |
| `MAX_CATCHUP_SECONDS` | no | `600` | image/env default | outage catch-up cap |
| `SCRAPE_PORT` | no | `9109` | image default (deliberately **not** in the ConfigMap, so it stays in sync with the container/Service port) | |

Non-secret tunables come from ConfigMap `capture-exporter-config`; the read-only Mongo URI is injected via `secretKeyRef`.

### Kubernetes deployment

Base manifests: `k8s/base/capture-exporter/` (namespace `observability`).

- **Deployment** (`deployment.yaml`) — `replicas: 1` (a second replica would double-count the in-process counter). Image `ghcr.io/example-org/capture-exporter:latest` with a Flux `$imagepolicy` setter. Requests `25m`/`128Mi`, limits `250m`/`256Mi` (Burstable QoS + memory OOM backstop in the shared namespace). Hardened `securityContext`: `runAsNonRoot`, `runAsUser: 10001`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, all capabilities dropped, writable `tmp` emptyDir. Liveness/readiness probe `/metrics` on the `metrics` port.
- **ConfigMap** `capture-exporter-config` — `MONGO_DB`, `MONGO_COLLECTION`, `REFRESH_INTERVAL_SECONDS`, `MONGO_MAX_TIME_MS`.
- **ExternalSecret** (`externalsecret.yaml`) — two secrets from AWS Secrets Manager via the `aws-secrets-manager` `ClusterSecretStore`:
    - `capture-exporter-mongo` ← SM secret `mongo`, property `MONGO_URI_READ_ONLY` (distinct target name from the mongodb-exporter's `mongo-uri` to avoid two `creationPolicy: Owner` ExternalSecrets fighting over one k8s Secret).
    - `capture-exporter-ghcr` ← SM secret `github`, property `image-pull` (dockerconfigjson; the `observability` namespace has no shared ghcr-credentials).
- **Service** `capture-exporter` (ClusterIP, port `9109`, `metrics`).
- **ServiceAccount** — `automountServiceAccountToken: false` (no cluster API access); only attaches the `capture-exporter-ghcr` image-pull secret.
- **ServiceMonitor** (`servicemonitor.yaml`) — carries the mandatory `release: kube-prometheus-stack` label (so the stack discovers it), scrapes port `metrics` at **`interval: 60s`**.

!!! warning "Scrape at the update cadence (60s), not faster"
    The counter only changes once per minute (one Mongo-query lump), so scraping every 30s over-samples it and makes `rate()` alias into a ±1-step sawtooth. The ServiceMonitor interval is deliberately pinned to match `REFRESH_INTERVAL_SECONDS`.

---

## mikrotik-wireguard-exporter

### What it does

A Prometheus exporter for **MikroTik RouterOS WireGuard peer health**. It polls each router in an inventory over **read-only SSH** every `REFRESH_INTERVAL_SECONDS` and exposes per-peer handshake and traffic metrics, so the WireGuard tunnels that carry the Client C cameras can be graphed in Grafana alongside the blackbox camera-reachability metrics.

The reason it exists alongside the blackbox probes is to distinguish two failure modes that "a whole subnet of cameras is down" collapses together:

| Symptom | last-handshake | rx/tx rate | cameras (`probe_success`) | meaning |
| --- | --- | --- | --- | --- |
| Tunnel down | stale | flat | 0 | peer/router offline |
| Remote router blocking | fresh | flowing | 0 | tunnel up, but the site router isn't forwarding |
| Healthy | fresh | flowing | 1 | fine |

The join key back to the cameras is the peer **public key**: `camera-probe-propagator` stamps each camera's scrapeconfig with the `peer_pubkey` whose `allowed-address` contains that camera IP (longest-prefix match, `mikrotik.best_peer_for_ip`).

It is strictly **read-only**: one `print` command per router, no state mutation, and it reads no secrets beyond the SSH key it authenticates with.

Source: `main.py`, `mikrotik.py`, `README.md`.

### How it polls and parses

`main.py` runs a custom prometheus_client collector (`MikrotikCollector`) that **rebuilds every series from the latest per-router state on each scrape** rather than mutating long-lived Gauge objects. This buys three things:

- a peer removed/renamed on a router simply stops being emitted, so its handshake timestamp does not freeze into a false "tunnel stale" alert;
- a changing label value (e.g. a peer endpoint or edited comment) can never accumulate duplicate `..._peer_info` series, which would break the `group_left` join with "many-to-one matching must be unique";
- exporter-side cardinality stays bounded by the *current* peer count.

A router whose latest poll **failed** keeps its last-known peers frozen (with `router_up=0`) so the handshake-staleness signal still fires for a down tunnel. Routers are polled concurrently via a `ThreadPoolExecutor` (`MIKROTIK_MAX_WORKERS`, default 8); one failing router is isolated to `router_up=0` and never affects the others or the `/metrics` server.

The SSH client and RouterOS parser live in `mikrotik.py`:

- Per-command connect (no pooling); `look_for_keys=False`, `allow_agent=False` (use only the passed key). The TCP-connect timeout stays snappy (`MIKROTIK_CONNECT_TIMEOUT`, 8s) while the banner/auth handshake gets a separate longer budget (≥30s) — RouterOS is slow to emit its SSH banner, and inheriting the short connect timeout makes reachable routers fail with "Error reading SSH protocol banner". Both `paramiko.SSHException` and `OSError` (socket timeout) become a single `TransportError` so one bad router never kills the caller.
- Host-key policy: if `MIKROTIK_KNOWN_HOSTS` is set it loads that file and uses trust-on-first-use (paramiko rejects a *changed* key); if unset it accepts the unpinned key but logs its fingerprint once per host so a real pin can be added later.
- The default poll command is `/interface/wireguard/peers/print detail without-paging`. The parser (`parse_wg_peers`) handles both `export` ("add key=val …" with trailing-backslash line wrapping) and `print detail` (numbered items with `;;;` sidecar comments) output shapes, and converts RouterOS durations (`1w2d3h4m5s`, `never`) and byte counts (`1023.4KiB`) into numbers.

!!! note "`mikrotik.py` is a vendored byte-for-byte copy"
    The same `mikrotik.py` is duplicated between `src/mikrotik-wireguard-exporter/` and `src/camera-probe-propagator/` (each service builds as its own image, so there is no shared package). Any change to one MUST be mirrored to the other verbatim. It is validated by `test_mikrotik.py` against real RouterOS 7.21.4 output.

### Metrics exposed

| Metric | Type | Labels | Notes |
| --- | --- | --- | --- |
| `mikrotik_wireguard_peer_info` | gauge (=1) | `router`, `public_key`, `name`, `comment`, `interface`, `peer_endpoint` | peer identity; join health metrics here for display labels |
| `mikrotik_wireguard_peer_last_handshake_timestamp_seconds` | gauge | `router`, `public_key` | unix ts of last handshake (`0` = never) |
| `mikrotik_wireguard_peer_rx_bytes` | gauge | `router`, `public_key` | cumulative rx; `rate()` it (resets on router reboot) |
| `mikrotik_wireguard_peer_tx_bytes` | gauge | `router`, `public_key` | cumulative tx; `rate()` it |
| `mikrotik_exporter_router_up` | gauge | `router` | 1 if the last SSH poll succeeded |
| `mikrotik_exporter_router_peers` | gauge | `router` | peers returned by the last poll |
| `mikrotik_exporter_router_scrape_duration_seconds` | gauge | `router` | wall-clock duration of the last poll |
| `mikrotik_exporter_router_last_success_timestamp_seconds` | gauge | `router` | unix ts of the last successful poll |

Peers with no `public_key` are skipped (no stable identity). rx/tx are the router's cumulative counters exposed verbatim as gauges — keeping them raw means an exporter restart does **not** reset them (the router keeps counting); `rate()` handles the reset on a router reboot.

!!! tip "The `peer_endpoint` label is deliberately not called `endpoint`"
    `peer_endpoint` is the *current* connected endpoint (`current-endpoint-address`, volatile, falling back to the configured `endpoint-address` for peers that have not connected). It is **not** named `endpoint` because the ServiceMonitor scrapes a port named `metrics`, so Prometheus already stamps `endpoint="metrics"` on every series; a metric label named `endpoint` would be clobbered under `honor_labels=false`. Peer freshness in PromQL:

    ```promql
    (time() - mikrotik_wireguard_peer_last_handshake_timestamp_seconds)
      * on(router,public_key) group_left(comment,interface) mikrotik_wireguard_peer_info
    ```

### Configuration and secrets

Language: Python 3.12. Key deps (`requirements.txt`): `paramiko==3.5.0`, `prometheus_client==0.20.0`. Base image `python:3.12-slim` running as UID 10001, `HEALTHCHECK` against `:9110/metrics`.

| Env | Default | Source | Meaning |
| --- | --- | --- | --- |
| `SCRAPE_PORT` | `9110` | image default (kept in sync with the Service) | /metrics port |
| `REFRESH_INTERVAL_SECONDS` | `60` | ConfigMap | poll cadence; match the ServiceMonitor interval |
| `ROUTERS_CONFIG` | `/etc/mikrotik-exporter/inventory/routers.json` | ConfigMap | inventory path (mounted from the routers ConfigMap) |
| `MIKROTIK_SSH_KEY` | `/etc/mikrotik-exporter/ssh/id_ed25519` | ConfigMap | private key path (mounted from the SSH Secret) |
| `MIKROTIK_SSH_USER` | `readonly` | ConfigMap | default username (per-router override in the inventory) |
| `MIKROTIK_WG_COMMAND` | `/interface/wireguard/peers/print detail without-paging` | ConfigMap | poll command |
| `MIKROTIK_CONNECT_TIMEOUT` / `MIKROTIK_COMMAND_TIMEOUT` | `8` / `30` | ConfigMap | TCP-connect vs handshake+command budgets |
| `MIKROTIK_KNOWN_HOSTS` | _(unset)_ | – | optional known_hosts to pin host keys |
| `MIKROTIK_MAX_WORKERS` | `8` | – | concurrent router polls |
| `LOG_LEVEL` / `LOG_RAW_SAMPLE` | `INFO` / `false` | – | logging; `LOG_RAW_SAMPLE` logs the first 1.5 KB of raw output per poll |

**Router inventory** (`routers.json`, ConfigMap `mikrotik-wireguard-exporter-routers`) — each entry is `{name, host, [port], [username], [enabled]}`. `enabled: false` keeps a router documented but skipped. All routers share one read-only SSH key. Current inventory:

```json
{
  "routers": [
    {"name": "client-c",       "host": "client-c-tmc.ddns.net",             "port": 8101},
    {"name": "client-a",     "host": "hx0000000a1.sn.mynetname.net", "port": 22},
    {"name": "client-b", "host": "hx0000000c3.sn.mynetname.net", "port": 22, "enabled": false}
  ]
}
```

### Kubernetes deployment

Base manifests: `k8s/base/mikrotik-wireguard-exporter/` (namespace `observability`).

- **Deployment** (`deployment.yaml`) — `replicas: 1` (a second replica just doubles the SSH load). Image `ghcr.io/example-org/mikrotik-wireguard-exporter:latest` with a Flux `$imagepolicy` setter. Requests `25m`/`64Mi`, limits `250m`/`128Mi`. `securityContext.fsGroup: 10001` so the non-root UID can read the `0440` SSH key file; container hardening matches capture-exporter (`runAsNonRoot`, UID 10001, `readOnlyRootFilesystem`, seccomp RuntimeDefault, drop ALL). Three volume mounts: the SSH key Secret (`/etc/mikrotik-exporter/ssh`, read-only, `defaultMode: 0440`), the inventory ConfigMap (`/etc/mikrotik-exporter/inventory`, read-only), and a writable `tmp` emptyDir. Liveness/readiness on `/metrics`.
- **ConfigMap** `mikrotik-wireguard-exporter-config` — the non-secret tunables above.
- **ConfigMap** `mikrotik-wireguard-exporter-routers` — the `routers.json` inventory.
- **ExternalSecret** (`externalsecret.yaml`):
    - `mikrotik-wireguard-exporter-ssh` ← AWS SM secret `mikrotik`, property `readonly-private-key` (the shared read-only SSH key, mounted as `id_ed25519`).
    - `mikrotik-wireguard-exporter-ghcr` ← SM secret `github`, property `image-pull` (dockerconfigjson).
- **Service** `mikrotik-wireguard-exporter` (ClusterIP, port `9110`, `metrics`).
- **ServiceAccount** — `automountServiceAccountToken: false`; only attaches the ghcr image-pull secret.
- **ServiceMonitor** (`servicemonitor.yaml`) — `release: kube-prometheus-stack` label, scrapes port `metrics` at **`interval: 60s`** (same sawtooth reasoning as capture-exporter — values change once per poll).

---

## mktxp (upstream RouterOS API exporter)

`mktxp` is the **API-tier sibling** of the WireGuard exporter. Where `mikrotik-wireguard-exporter` polls WireGuard peer health over SSH, `mktxp` ([`akpw/mktxp`](https://github.com/akpw/mktxp)) polls each router's RouterOS **HTTP API** and exports full device-health metrics (memory, temperature, interface counters, etc.). It is an **upstream image** (`ghcr.io/akpw/mktxp:latest`), not built or Flux-managed in this repo. Its per-router credentials config Secret (`mktxp-config`) is **generated by `router-fleet-resolver`**, which classifies the MikroTik fleet into the authenticated (mktxp) tier vs the blackbox tier.

Base manifests: `k8s/base/mktxp/` (namespace `observability`).

- **Deployment** (`deployment.yaml`) — `replicas: 1`, `strategy: Recreate` (see below). Runs as UID 1000 with `fsGroup: 1000`. An **init container** (`seed-config`) copies mktxp's own packaged config into a writable `cfg` emptyDir, flips the fleet to parallel fetch (`fetch_routers_in_parallel = True`, `max_worker_threads = 10`, `max_scrape_duration = 25`, `total_max_scrape_duration = 45`), keeps only the `[default]` section from the packaged `mktxp.conf`, and appends the resolver-generated per-router sections from the optional `mktxp-config` Secret. Serves metrics on port `49090`; args `mktxp --cfg-dir /etc/mktxp export`, `HOME=/tmp`. Requests `50m`/`96Mi`, limits `500m`/`512Mi`.
- **Service** `mktxp` (ClusterIP, port `49090`).
- **ServiceMonitor** (`servicemonitor.yaml`) — `release: kube-prometheus-stack` label, `interval: 90s`, `scrapeTimeout: 55s`. It **relabels** every series: `instance` is pinned to the constant `mktxp` and the churning `pod`/`endpoint` labels are dropped, so each router's series stays continuous across pod restarts (every mktxp metric already carries `routerboard_name`/`routerboard_address`).

!!! warning "mktxp operational gotchas (encoded in the manifest)"
    - **Probe the TCP socket, not `/metrics`** — a `GET /metrics` triggers a synchronous scrape of every router (tens of seconds), which made an HTTP probe block and time out, SIGKILLing the pod mid-scrape (exit 137 crash loop). Liveness/readiness use `tcpSocket` on the metrics port.
    - **`strategy: Recreate`** — the ServiceMonitor pins `instance` to a constant, so a rolling update would briefly have two pods scraping under the same pinned instance and clashing on duplicate samples. Recreate guarantees exactly one mktxp pod at a time (a single-replica exporter absorbs the ~30s gap).
    - **Writable `cfg` emptyDir is mandatory** — mktxp rewrites files in its `--cfg-dir` on startup; a read-only mount produced "OSError: Read-only file system". The `cfg` dir is ephemeral pod-local storage seeded from the read-only `config-src` projection by the init container.
    - **Bounded collection** — with every collector enabled across ~10 routers (worse when an authenticated router is unreachable and each collector burns its full budget), sequential collection ran 28–45s and blew past the scrape timeout, so every scrape returned `up=0`. Parallel fetch + `total_max_scrape_duration = 45s` (under the 55s `scrapeTimeout`) keeps it bounded; an unreachable router is skipped for that cycle.

---

## Build and image automation

Both exporters are built with Docker Bake (`docker-bake.hcl`) and released through Flux image automation. `mktxp` is exempt (upstream image).

| Component | Bake target / context | Image |
| --- | --- | --- |
| capture-exporter | `capture-exporter`, `src/capture-exporter` | `ghcr.io/example-org/capture-exporter:${VERSION}` (+ `:latest`) |
| mikrotik-wireguard-exporter | `mikrotik-wireguard-exporter`, `src/mikrotik-wireguard-exporter` | `ghcr.io/example-org/mikrotik-wireguard-exporter:${VERSION}` (+ `:latest`) |

Each image is tagged with a semver `${VERSION}` and `latest`, and pushes a registry `buildcache`. The prod overlay kustomizations (`k8s/overlays/prod/capture-exporter`, `.../mikrotik-wireguard-exporter`) each pin an image `newTag` carrying the `$imagepolicy` setter comment that Flux rewrites.

!!! note "How platform-infra consumes these"
    The manifests live in `platform-utils`, but Flux runs from **platform-infra**. Under `kubernetes/apps/utils/` infra defines, per exporter:

    - a Flux **`Kustomization`** whose `path` points into the utils repo (e.g. `./k8s/overlays/prod/capture-exporter`) with `sourceRef` → the `platform-utils` GitRepository, `prune: true`, `wait: true`;
    - an **`ImageRepository`** (`ghcr.io/example-org/<name>`, `secretRef: ghcr-credentials`) and an **`ImagePolicy`** (semver filter `^v[0-9]+\.[0-9]+\.[0-9]+$`, range `>=1.0.0`);
    - an **`ImageUpdateAutomation`** that commits the new tag back to the utils overlay's `$imagepolicy` marker.

    All three (`capture-exporter`, `mikrotik-wireguard-exporter`, `mktxp`) are listed in `kubernetes/apps/utils/overlays/prod/kustomization.yaml`. `mktxp` gets a Flux Kustomization (path `./k8s/overlays/prod/mktxp`) but no ImageRepository/Policy, since it tracks the upstream `akpw/mktxp` image. These exporters are **prod-only** — there is no staging overlay for any of them in `platform-utils`.
