# The edge capture platform

The edge capture platform is the workload the whole estate exists to serve: a fleet of ~800+ vendor-A capture cameras that continuously stream capture images into a set of Node.js microservices running on the Cape Town EKS clusters. This page documents the capture application domain — the camera fleet, the `capture-driver` ingest path, the admin/backend/worker microservices, and the two different deployment models the repo uses to ship them (the current app-repo GitOps model vs. the legacy inline staging manifests).

Everything runs in the Kubernetes namespace **`ingest`** (the `camera-console` companion app runs in its own `camera-console` namespace).

## What the platform does

At a high level:

1. **Cameras** (~800+ vendor-A units, concentrated around one metro area) are configured with an "alarm server" pointed at the platform. On each capture event they open a long-lived TCP connection and push the capture image over **TCP port 3333**.
2. The **`capture-driver`** (a Kubernetes `DaemonSet` listening on `hostPort: 3333` on every node) accepts those connections, parses the vendor-A payload, and writes the image to **S3** and the read metadata to **MongoDB** (with Redis/Valkey used for coordination).
3. A set of **worker Deployments** (`work-*`, `auto-*`, `watch-mongo`) consume that data to resolve captures, detect duplicates, raise **watchlist match** alerts, track camera up/down status, and fan out notifications (Slack, Telegram).
4. The **`admin-backend`** (REST API + socket.io) and **`admin-frontend`** (web UI) expose the data to operators at `staging.example.com` / production equivalents.
5. **`camera-console`** is a companion service (separate repo and namespace) used for camera management.

Source of truth for the fleet-level description is the repo `README.md` ("Camera Infrastructure" section).

!!! note "Cameras bypass the AWS NLB for port 3333"
    Because AWS Network Load Balancers enforce a hardcoded 350-second TCP idle timeout that was killing the long-lived camera connections, port 3333 traffic does **not** go through the NLB. It is NAT'd straight to the EKS nodes by the MikroTik CHR routers. See [NLB idle-timeout workaround](#the-nlb-350s-idle-timeout-workaround) below.

## Two deployment models (read this first)

The capture workloads appear in the repo **twice**, in two very different shapes. Understanding which is live matters.

| Model | Location | What lives in this repo | Live? |
|-------|----------|-------------------------|-------|
| **App-repo GitOps (current)** | `kubernetes/apps/{backend,driver,camera-console,...}` | Only Flux CRs (`GitRepository`, `ImageRepository`, `ImagePolicy`, `ImageUpdateAutomation`, `Kustomization`). The actual `Deployment`/`DaemonSet` manifests live in each **application's own GitHub repo** under `k8s/overlays/<env>`. | **Yes** — wired into both cluster roots. |
| **Inline manifests (legacy)** | `kubernetes/overlays/staging-cpt-aws/apps/edge-capture` | Full inline `Deployment`/`DaemonSet`/`ConfigMap`/`Secret`/`Ingress` manifests for every capture service. | **No** — orphaned, see below. |

In the **app-repo model**, this infra repo tells Flux *where to find* the app and *which image tag policy to apply*; Flux then reconciles the manifests that live in `ingest-driver`, `admin-backend`, `camera-console`, etc. In the **inline model**, the manifests themselves were checked into this repo. The inline tree predates the app-repo migration and has been left behind.

!!! danger "The inline staging capture manifests are not deployed"
    Flux on staging syncs the path `./kubernetes/overlays/staging-cpt-aws` with `prune: true` (see `flux-system/gotk-sync.yaml`). That root `kustomization.yaml` references the **app-repo** resources (`../../apps/backend/overlays/staging`, `../../apps/driver/overlays/staging`, `../../apps/camera-console/overlays/staging`, …) but does **not** reference the local `./apps` aggregator. Nothing in the tree includes `apps/kustomization.yaml`, so the entire inline `edge-capture` tree is dead code. It is documented here for completeness and historical context, not because it runs.

## The camera fleet

| Attribute | Value |
|-----------|-------|
| Camera type | vendor-A capture cameras |
| Approximate count | ~800+ |
| Geography | Single country, concentrated in one metro area |
| Ingest protocol | TCP, capture images pushed by the camera on each read |
| Ingest port | **3333** |
| Timezone / clocks | `Africa/Johannesburg` (see driver `ConfigMap`) |

Cameras are configured with an **alarm server** address that points them at the platform. Fleet-wide alarm-server changes are driven from Ansible via `ansible/run_change_alarm_server_playbook.py` (see the repo README "Camera Inventory Management").

## The capture-driver DaemonSet

The driver is the ingest hot path. It is deployed as a `DaemonSet` so a listener exists on every node, using host networking so cameras can reach `nodeIP:3333` directly (bypassing kube-proxy / the NLB).

Key spec (from the inline `capture-driver/daemonset.yaml`; the live prod version lives in the `ingest-driver` repo):

```yaml
kind: DaemonSet
metadata:
  name: capture-driver
  namespace: ingest
spec:
  template:
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      containers:
        - name: capture-driver
          image: ghcr.io/example-org/driver
          command: ["node", "dist/server.js"]
          ports:
            - containerPort: 3333
              hostPort: 3333
              protocol: TCP
          env:
            - name: DRIVER_PORT
              value: "3333"
          envFrom:
            - configMapRef: { name: driver-config }
            - secretRef:    { name: driver-secrets }
```

- **`hostNetwork: true` + `hostPort: 3333`** — every node binds `:3333`, which is what the MikroTik NAT rules target. `dnsPolicy: ClusterFirstWithHostNet` keeps in-cluster DNS working despite host networking.
- **Image** `ghcr.io/example-org/driver` — same repo/image used by the `work-driver-captures` worker.
- **Config** comes from the `driver-config` `ConfigMap` and `driver-secrets` `Secret`.

`driver-config` (`capture-driver/configmap.yaml`):

| Key | Value |
|-----|-------|
| `TIME_ZONE` | `Africa/Johannesburg` |
| `DATE_FORMAT` | `YYYYMMDDTHHmmss` |
| `DATE_FORMAT_TZ` | `YYYYMMDDTHHmmssZZ` |

`driver-secrets` (`capture-driver/secret.yaml`, SOPS/Age-encrypted) carries the storage wiring: `MONGO_URL`, `MONGO_LOGIN`, `MONGO_PASSWORD`, `MONGO_DB`, `MONGO_COLLECTION`, `REDIS_URL`/`REDIS_PORT`/`REDIS_PASSWORD`, `AZURE_CONNECTION_STRING`, `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`S3_BUCKET`, `DRIVER_PORT`, and `FILE_STORAGE_ROOT_FOLDER`.

### Monitoring the driver

From the repo README:

```bash
# Driver logs
kubectl logs -n ingest daemonset/capture-driver --tail=50

# Successful uploads in the last 10 minutes
kubectl logs -n ingest daemonset/capture-driver --since=10m | grep "✅ Job completed" | wc -l

# Errors in the last hour
kubectl logs -n ingest daemonset/capture-driver --since=1h | grep -iE "error|timeout|refused"
```

## The NLB 350s idle-timeout workaround

Discovered September 2025: AWS NLBs have a **hardcoded 350-second TCP idle timeout** that was silently killing the long-lived, mostly-idle camera connections and causing capture-event drop-off. The fix is to keep port 3333 traffic off the NLB entirely and NAT it straight to the EKS nodes with the two production **MikroTik CHR** routers (`hub-aws-prod-chr1` / `hub-aws-prod-chr2`, which also provide failover).

Operational checks (from the README) target the NAT'd node VIP `10.255.255.254:3333`:

```bash
# Count live camera connections through each CHR
ssh hub-aws-prod-chr1 "/ip firewall connection print where dst-address=10.255.255.254:3333" | wc -l
ssh hub-aws-prod-chr2 "/ip firewall connection print where dst-address=10.255.255.254:3333" | wc -l

# NAT rule hit stats (rules are tagged with a CAPTURE comment)
ssh hub-aws-prod-chr1 "/ip firewall nat print stats where comment~CAPTURE"
ssh hub-aws-prod-chr2 "/ip firewall nat print stats where comment~CAPTURE"
```

!!! warning "Declining capture events? Check the CHR connections first"
    A drop in capture events is frequently this path, not the app. Verify the CHRs still hold the expected number of `:3333` connections and that the `CAPTURE` NAT rules are incrementing before digging into the driver or MongoDB.

## Storage backends

| Backend | Used for | Wired via |
|---------|----------|-----------|
| **S3** | Capture image blobs | `AWS_*` + `S3_BUCKET` in `driver-secrets` / `backend-secrets` |
| **MongoDB** | Capture read metadata / collections | `MONGO_URL`, `MONGO_DB`, `MONGO_COLLECTION`, `MONGO_LOGIN`, `MONGO_PASSWORD` |
| **Redis / Valkey** | Coordination, queues, socket state | `REDIS_URL`, `REDIS_PORT`, `REDIS_PASSWORD` |
| **RDS (SQL, via Knex)** | Admin/relational data | `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` in `backend-secrets` (the `admin-backend` init container runs `knex migrate:latest`) |
| **Azure Blob** | Legacy/secondary image storage | `AZURE_CONNECTION_STRING` in `driver-secrets` |

## The capture microservices

All services run in namespace `ingest`, use the `default` ServiceAccount (which carries the `ghcr-credentials` image pull secret), and pull from GHCR. The two application images are `ghcr.io/example-org/admin-backend` (the Node monolith, invoked with different entrypoints per service), `ghcr.io/example-org/admin-frontend`, and `ghcr.io/example-org/driver`.

The table below inventories every service defined in the inline staging tree, with its type, container entrypoint, replica count, priority class and purpose. (Replica/limit values are from the inline manifests; the live app-repo overlays may differ.)

| Service | Type | Image | Entrypoint (`command`) | Replicas | Priority | Purpose |
|---------|------|-------|------------------------|:--------:|----------|---------|
| `capture-driver` | DaemonSet | `driver` | `node dist/server.js` | per-node | (none set) | Listens on TCP 3333, receives capture images from cameras, writes to S3/Mongo |
| `admin-backend` | Deployment | `admin-backend` | `node --no-network-family-autoselection dist/index.js` | 2 | `ingest-critical` | REST API + socket.io backend for the admin UI. Init container runs `npm run knex migrate:latest` |
| `admin-frontend` | Deployment | `admin-frontend` | (image default) | 2 | `ingest-critical` | Web UI for camera/capture management, served on :3000 |
| `auto-import` | Deployment | `admin-backend` | `node ... dist/src/autoImport.js` | 1 | `ingest-high` | Automated import job |
| `auto-resolve` | Deployment | `admin-backend` | `node --expose-gc dist/src/autoResolve.js` | 2 | `ingest-high` | Auto-resolves capture events (GC-tuned) |
| `watch-mongo` | Deployment | `admin-backend` | `node ... dist/src/watchMongo.js` | 1 | `ingest-high` | Watches MongoDB change stream and reacts |
| `work-driver-captures` | Deployment | `driver` | `node dist/src/workers/captures.js` | **1 (do not scale)** | `ingest-high` | Database-driven capture processing worker |
| `work-camera-status` | Deployment | `admin-backend` | `node dist/src/workers/cameraStatus.js` | 2 | `ingest-high` | Camera status monitoring |
| `work-control-room` | Deployment | `admin-backend` | `node dist/src/workers/controlRoom.js` | 2 | `ingest-high` | Control-room worker |
| `work-duplicate-captures` | Deployment | `admin-backend` | `node ... dist/src/workers/duplicateCapturesAlert.js` | 2 | (none set) | Detects/alerts on duplicate capture events. Uses pod anti-affinity |
| `work-capture-search-alerts` | Deployment | `admin-backend` | `node ... dist/src/workers/captureSearchAlert.js` | 2 | `ingest-high` | Capture-search alerting |
| `work-unknown-reads` | Deployment | `admin-backend` | `node dist/src/workers/unknownReads.js` | 2 | `ingest-high` | Handles unknown/unmatched reads |
| `work-updown-telegram-notification` | Deployment | `admin-backend` | `node dist/src/workers/telegramNotification.js` | 2 | `ingest-high` | Up/down Telegram notifications |
| `work-updown-unknown-reads` | Deployment | `admin-backend` | `node dist/src/workers/unknownReadsAlert.js` | 2 | `ingest-high` | Up/down + unknown-reads alerting |
| `work-watchlist-alerts` | Deployment | `admin-backend` | `node ... dist/src/workers/voiItemAlert.js` | 2 | `ingest-high` | watchlist match (watchlist) alerts |

!!! warning "work-driver-captures must stay at a single replica"
    `work-driver-captures/deployment.yaml` carries the inline comment `NB! DO NOT DUPLICATE - ONLY 1 REPLICA ALLOWED IN THE CLUSTER!`. Running two replicas would double-process the driver capture queue.

### Priority classes

capture pods are scheduled against a dedicated set of `PriorityClass` objects from `infrastructure/configs/priority-classes.yaml` (higher value = less likely to be evicted):

| Priority class | Value | Intended for |
|----------------|------:|--------------|
| `ingest-critical` | 1000 | Admin interfaces and camera drivers |
| `ingest-high` | 500 | Data-processing and monitoring workers |
| `ingest-medium` | 100 | Alerts and notifications |
| `ingest-low` | 10 | Restartable workers |
| `ingest-besteffort` | -10 | Testing/debug/optional (never preempts) |

In the inline manifests only `ingest-critical` and `ingest-high` are actually used; `ingest-medium`/`ingest-low`/`ingest-besteffort` are defined but unreferenced.

### Scheduling / resilience

- **admin-backend / admin-frontend / auto-* / watch-mongo / most work-\***: use `topologySpreadConstraints` — `maxSkew: 1` on `kubernetes.io/hostname` (`DoNotSchedule`) and on `topology.kubernetes.io/zone` (`ScheduleAnyway`), spreading replicas across nodes and AZs.
- **work-duplicate-captures**: uses a `podAntiAffinity` (`preferredDuringScheduling`, weight 100) on `kubernetes.io/hostname` instead.
- **work-driver-captures**: no spread constraints (single replica by design).

### Config & secrets (shared)

The backend-family services all consume two shared objects (defined in the app repo, not this repo, for the live deployment):

- **`backend-config`** `ConfigMap` — non-secret backend settings.
- **`backend-secrets`** `Secret` — the large SOPS-encrypted secret (inline copy) covering DB/Mongo/Redis, `API_SECRET`/`API_KEY`, admin roles, mail (`GMAIL_*`, `OFFICE_360_*`), driver addressing (`DRIVER_URL`/`DRIVER_IP`/`DRIVER_IP_VPN`, plus `VENDOR_B_*` and `OLD_DRIVER_*`), Sentry, AWS/S3, a large set of Slack webhooks/channels, Telegram, and `MAPBOX_ACCESS_TOKEN`.

The `admin-frontend` instead uses `frontend-config` (server/socket URLs, e.g. `https://staging.example.com/api/v1`) and `frontend-secrets`.

## Ingress / external exposure

Only the inline `admin-frontend` ships an Ingress (`admin-frontend/ingress.yaml`):

- **Host**: `staging.example.com`, nginx ingress class, `cert-manager` `letsencrypt-dns` cluster issuer, forced SSL redirect.
- **Routing**:
  - `/socket\.io.*` (regex) → `admin-backend:8082`
  - `/api/v1` → `admin-backend:8082`
  - `/` → `admin-frontend:3000`
- **Tuning**: 120s proxy read/send/connect timeouts (matched to the backend's ~90s query timeout), 50m body size, large upstream keepalive pools (320 connections / 10000 requests), retry on 5xx, and rate limits (100 rps / 6000 rpm).

The `admin-backend` Ingress file exists but is **entirely commented out** (`backend-staging.example.com`); the backend is reached through the frontend ingress instead. The frontend ingress also contains a commented-out `admin-backend-external` `Service`/`Endpoints` pair pointing at a hardcoded IP `10.161.64.109` — a legacy external-endpoint hack.

## The app-repo GitOps wiring (what actually runs)

For prod (and the live staging deployment), each capture app is represented in `kubernetes/apps/` by a `base` (shared Flux `ImageRepository` + namespace/SA/pull-secret) and per-environment `overlays/{prod,staging}` (the Flux `GitRepository`, `ImagePolicy`, `ImageUpdateAutomation` and `Kustomization`). These are aggregated by the cluster roots `overlays/prod-cpt-aws/kustomization.yaml` and `overlays/staging-cpt-aws/kustomization.yaml`.

### backend (`kubernetes/apps/backend`)

| Resource | Detail |
|----------|--------|
| `GitRepository` | `admin-backend` → `https://github.com/example-org/admin-backend`, branch `main` (prod) / `staging` (staging), GitHub App auth (`github-app` secret) |
| Flux `Kustomization` | name `admin-backend`, path `./k8s/overlays/{prod,staging}` in the app repo, `prune: true`, `wait: true`, health-checks Deployment `admin-backend` in `ingest`, SOPS-enabled label |
| `ImageRepository` | `admin-backend` → `ghcr.io/example-org/backend` |
| `ImagePolicy` | prod: semver `>=1.0.0` matching `^v[0-9]+\.[0-9]+\.[0-9]+$`; staging: RC channel `>=1.0.0-rc.0` matching `-rc.N` |
| `ImageUpdateAutomation` | commits image bumps as `platform-bot <actions@users.noreply.github.com>` with `[ci skip]`, pushing to the matching branch |
| `base` | creates the shared `ingest` `Namespace`, `default` `ServiceAccount` (with `ghcr-credentials`), and the `ghcr-credentials` `ExternalSecret` (AWS Secrets Manager, key `github`/`image-pull`) |

!!! note "The backend base bootstraps the whole `ingest` namespace"
    `apps/backend/base/kustomization.yaml` is what creates the `ingest` namespace, its `default` ServiceAccount, and the GHCR pull secret. The `driver` app's base only ships an `ImageRepository` and relies on the backend base having created the namespace/SA (both deploy into `ingest`). The kustomization comments note an intent to split `ingest` into separate `backend` and `driver` namespaces, not yet done.

### driver (`kubernetes/apps/driver`)

Same shape as backend, pointed at the driver app:

| Resource | Detail |
|----------|--------|
| `GitRepository` | `driver` → `https://github.com/example-org/ingest-driver`, branch `main` (prod) / `staging` (staging) |
| Flux `Kustomization` | name `driver`, path `./k8s/overlays/{prod,staging}`, health-checks Deployment `driver` in `ingest` |
| `ImageRepository` | `ingest-driver` → `ghcr.io/example-org/driver` |
| `ImagePolicy` | prod stable semver `>=1.0.0`; staging RC channel `>=1.0.0-rc.0` |
| `ImageUpdateAutomation` | `platform-bot`, `[ci skip]`, push to matching branch, `Setters` strategy |

The staging apps aggregator currently pins driver to `v1.0.0-rc.3`, backend to `v295`, frontend to `v107` (see the `images:` block in `apps/kustomization.yaml`) — but note that file is part of the dead inline tree.

### camera-console (`kubernetes/apps/camera-console`)

The one capture-domain app with its **own namespace** (`camera-console`) rather than `ingest`:

| Resource | Detail |
|----------|--------|
| `GitRepository` | `camera-console` → `https://github.com/example-org/camera-console`, branch `main` (prod) / `staging` (staging) |
| Flux `Kustomization` | name `camera-console`, path `./k8s/overlays/{prod,staging}`, `prune: true`, `timeout: 2m` |
| `ImageRepository` | `camera-console` → `ghcr.io/example-org/camera-console` |
| `ImagePolicy` | prod stable semver; staging RC channel |
| `base` | `camera-console` `Namespace`, `default` `ServiceAccount` (with `ghcr-credentials`), and a `ghcr-credentials` `ExternalSecret` |

!!! warning "camera-console base does not apply its ServiceAccount / ExternalSecret"
    `apps/camera-console/base/kustomization.yaml` only lists `imagerepository.yaml` and `namespace.yaml`. The `serviceaccount.yaml` and `externalsecret.yaml` files exist in the directory but are **not** included, so the `camera-console` namespace's pull-secret and SA are not created by this base (unlike the backend base, which includes all four). Flagged as a legacy finding.

## Per-environment differences

| Aspect | Staging | Prod |
|--------|---------|------|
| Flux source branch (infra) | `main` (the dedicated `staging` branch was decommissioned after drifting ~3 weeks behind) | semver tags |
| App image channel | Release candidates (`-rc.N`, `>=1.0.0-rc.0`) | Stable semver (`>=1.0.0`) |
| App repo branch tracked | `staging` | `main` |
| EKS cluster | `staging-eks` / `staging-cpt-aws`, af-south-1 | `prod-cpt-aws`, af-south-1 |
| Resource footprint | Inline tree includes a `resources-patch.yaml` that strips every service to ~32Mi/25m requests (see legacy note) | Full requests/limits from the app-repo manifests |
| MikroTik CHRs | — | 2 CHRs handle port-3333 NAT + failover |

## Operational notes

- **Namespace**: `ingest` for the driver + backend + workers + frontend; `camera-console` for camera-console.
- **Image pulls**: all via the `ghcr-credentials` secret, sourced from AWS Secrets Manager (`github` / `image-pull`) by External Secrets Operator; the inline tree instead references the SOPS-based `infrastructure/configs/ghcr-image-pull`.
- **Secrets**: SOPS + Age; Flux Kustomizations labeled `app.kubernetes.io/sops: "enabled"` get the cluster-root SOPS decryption patch applied.
- **DB migrations**: the `admin-backend` runs `knex migrate:latest` as an init container on every rollout — a failed migration blocks the rollout.
- **Preview a build locally**:

```bash
# Renders the (legacy) inline capture overlay
kubectl kustomize kubernetes/overlays/staging-cpt-aws/apps/edge-capture
```

- **Reconcile the live app-repo deployments**:

```bash
flux get kustomizations
flux reconcile kustomization admin-backend
flux reconcile kustomization driver
flux reconcile kustomization camera-console
```

## Legacy / cleanup flags

The following were noted while documenting this subsystem (see structured findings for detail):

- The **entire inline `apps/edge-capture` tree is orphaned** — not referenced by the staging cluster root, superseded by the app-repo model.
- The inline **aggregator kustomization is almost entirely commented out** (only `work-watchlist-alerts` is active), so even if re-wired it would deploy nearly nothing.
- **`resources-patch.yaml`** targets deployments that don't exist as files (`work-cameras`, `up-down-status`), patches `auto-import` twice (second block mislabeled "Watch Mongo"), and isn't referenced by any kustomization.
- **camera-console base** omits its ServiceAccount and ExternalSecret; its **staging `ImageUpdateAutomation`** pushes to branch `feat/k8s` (checkout is `staging`), uses a `Pinky <…pinkroccade.ghe.com>` author, path `./k8s/overlays`, and a non-standard object name — inconsistent with every other app.
- The repo **`README.md` references `kubernetes/base/edge-capture/README.md` and a `kubernetes/base/` + `kubernetes/_common/` layout that no longer exist** (actual layout is `kubernetes/{apps,infrastructure,overlays,docs}`), and lists components (`work-cameras`, `up-down-status`) that don't match the real service set.
- Assorted dead/commented files: `admin-backend/ingress.yaml` (fully commented), the `admin-backend-external` Service/Endpoints (hardcoded `10.161.64.109`) in the frontend ingress, and a stale `# todo: encrypt with sops` comment on an already-encrypted `capture-driver/secret.yaml`.
