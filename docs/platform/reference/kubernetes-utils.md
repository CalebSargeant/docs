# Utility workloads (`kubernetes/apps/utils`)

The `utils` app is the GitOps entry point for the platform's in‑house operational
tooling — a fleet of small Prometheus exporters, reconcilers, cleanup jobs and
reporting jobs that keep the camera / router estate observable and tidy. It lives
under `kubernetes/apps/utils`
and, like the other app entries in `kubernetes/apps/`, it contains **only Flux
custom resources** — the actual Kubernetes workload manifests (Deployments,
CronJobs, ConfigMaps, secrets) live in a *separate* repository,
platform-utils.

!!! note "Two-repo split — read this first"
    This directory does **not** contain any `Deployment` / `CronJob` / `Job`
    manifests. What you find here is the wiring: a Flux `GitRepository` pointing
    at `platform-utils`, plus per-component `ImageRepository`, `ImagePolicy`,
    `ImageUpdateAutomation` and Flux `Kustomization` resources. Each Flux
    `Kustomization` reconciles a `path:` **inside the `platform-utils` repo**
    (`./k8s/overlays/<env>/<component>`). To see a component's actual container
    spec, kind, schedule, env vars and mounted secrets, look in `platform-utils`,
    not here. Everything documented below about kind / schedule is therefore
    **inferred from naming and image automation**, and is flagged as such.

## Where it sits in the platform

The `utils` app is pulled into both environment overlays:

| Environment overlay | References |
| --- | --- |
| `kubernetes/overlays/prod-cpt-aws` | `../../apps/utils/base` + `../../apps/utils/overlays/prod` |
| `kubernetes/overlays/staging-cpt-aws` | `../../apps/utils/base` + `../../apps/utils/overlays/staging` |

The environment overlay applies the *shared base* (namespaces, GitRepository,
image-pull secret, service accounts) **and** the environment-specific overlay
(the per-component Flux CRs). The same environment overlays also apply a global
patch that turns on SOPS decryption for every Flux `Kustomization` carrying the
label `app.kubernetes.io/sops: "enabled"` (see [SOPS decryption](#sops-decryption)).

## Directory layout

```text
kubernetes/apps/utils/
├── base/                         # shared infra + per-component ImageRepository
│   ├── kustomization.yaml        # gitrepository + namespace + externalsecret + serviceaccount
│   ├── gitrepository.yaml        # Flux source: platform-utils repo
│   ├── namespace.yaml            # utils + misc namespaces
│   ├── serviceaccount.yaml       # default SA (utils, misc) w/ ghcr imagePullSecret
│   ├── externalsecret.yaml       # ghcr-credentials (utils, misc)
│   ├── camera-image-size-report/     # each: kustomization.yaml + imagerepository.yaml
│   ├── camera-probe-propagator/
│   ├── cluster-capacity-analysis/    # ⚠ base present but NOT referenced by any overlay
│   ├── distance-cache-cleanup/
│   ├── harddisk-hoover/
│   ├── mikrotik-wireguard-exporter/
│   ├── capture-exporter/
│   ├── router-fleet-resolver/
│   ├── router-lifetime-reconciler/
│   ├── sonic-stragglers-report/
│   └── watchlist-log-items/
└── overlays/
    ├── prod/                     # 11 components wired in kustomization.yaml
    │   └── <component>/          # each: kustomization + flux-kustomization + imagepolicy + imageupdateautomation
    └── staging/                  # only 3 components wired; 3 more dirs present but orphaned
        └── <component>/
```

## Shared base resources

`base/kustomization.yaml`
aggregates only the shared infra (it does **not** include the per-component
`ImageRepository` subdirectories — those are pulled in individually by each
overlay component):

| Resource | Kind | Namespace(s) | Purpose |
| --- | --- | --- | --- |
| `platform-utils` | `GitRepository` (`source.toolkit.fluxcd.io/v1`) | `flux-system` | Flux source for the workload manifests; branch `main`, interval `5m`, `provider: github`, auth via `secretRef: github-app` |
| `utils`, `misc` | `Namespace` | — | The two namespaces util workloads run in |
| `default` | `ServiceAccount` | `utils`, `misc` | Default SA in each namespace with `imagePullSecrets: [ghcr-credentials]` |
| `ghcr-credentials` | `ExternalSecret` (`external-secrets.io/v1beta1`) | `utils`, `misc` | Docker config JSON image-pull secret, synced from AWS Secrets Manager |

### GitRepository — the `platform-utils` source

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: platform-utils
  namespace: flux-system
spec:
  interval: 5m
  provider: github
  ref:
    branch: main
  secretRef:
    name: github-app
  url: https://github.com/example-org/platform-utils
```

Every per-component Flux `Kustomization` (in both prod and staging overlays)
uses this single `GitRepository` as its `sourceRef`, and every
`ImageUpdateAutomation` writes back to it.

!!! note "The source is always branch `main`"
    The `GitRepository` tracks `main`. Staging `ImageUpdateAutomation` resources
    check out and push to the `staging` branch of the same repo (see
    [Image automation](#image-automation)), but the reconciled *source of truth*
    the cluster reads from is the `main` branch — meaning staging components read
    manifests from `./k8s/overlays/staging/<component>` on `main`.

### Image-pull secret (`ghcr-credentials`)

`externalsecret.yaml`
defines an identical `ExternalSecret` in both `utils` and `misc`. It renders a
`kubernetes.io/dockerconfigjson` secret from a single AWS Secrets Manager key so
that GHCR-hosted images (`ghcr.io/example-org/*`, which are private) can be
pulled:

```yaml
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: ghcr-credentials
    creationPolicy: Owner
    template:
      type: kubernetes.io/dockerconfigjson
  data:
    - secretKey: .dockerconfigjson
      remoteRef:
        key: github
        property: image-pull
        decodingStrategy: Base64
```

The same secret name (`ghcr-credentials`) is referenced by each component's
`ImageRepository` (`secretRef`) so Flux can read image tags from the private
registry, and by the `default` ServiceAccount so pods can pull.

## Per-component anatomy (the four-file pattern)

Every wired component is described by the same four files. Using
`capture-exporter` (prod) as the worked example:

**1. `base/<component>/imagerepository.yaml`** — tells Flux which GHCR image to
scan for tags:

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: capture-exporter
  namespace: flux-system
spec:
  image: ghcr.io/example-org/capture-exporter
  interval: 5m
  provider: generic
  secretRef:
    name: ghcr-credentials
```

**2. `overlays/<env>/<component>/flux-kustomization.yaml`** — the Flux
`Kustomization` that actually deploys the workload from the `platform-utils`
repo:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: capture-exporter
  namespace: flux-system
spec:
  interval: 5m
  # Path inside the platform-utils repo (the actual k8s manifests live there).
  path: ./k8s/overlays/prod/capture-exporter
  prune: true
  sourceRef:
    kind: GitRepository
    name: platform-utils
    namespace: flux-system
  timeout: 5m
  wait: true
```

**3. `overlays/<env>/<component>/imagepolicy.yaml`** — selects the newest
matching tag (prod = stable semver, staging = `-rc` prereleases; see below).

**4. `overlays/<env>/<component>/imageupdateautomation.yaml`** — commits the new
tag back to `platform-utils` as the `platform-bot` bot, using the `Setters` strategy.

**5. `overlays/<env>/<component>/kustomization.yaml`** — ties the four together:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../../base/capture-exporter
  - flux-kustomization.yaml
  - imagepolicy.yaml
  - imageupdateautomation.yaml
```

## Image automation

Flux image automation is configured per component and **differs by environment**.
Prod tracks stable releases; staging tracks release candidates.

| Aspect | Prod | Staging |
| --- | --- | --- |
| `ImagePolicy` tag pattern | `^v[0-9]+\.[0-9]+\.[0-9]+$` | `^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$` |
| `ImagePolicy` semver range | `>=1.0.0` | `>=1.0.0-rc.0` |
| `ImageUpdateAutomation` checkout/push branch | `main` | `staging` |
| Update `path` | `./k8s/overlays/prod/<component>` | `./k8s/overlays/staging/<component>` |
| Update strategy | `Setters` | `Setters` |
| Commit author | `platform-bot <actions@users.noreply.github.com>` | `platform-bot <actions@users.noreply.github.com>` |

The commit message template on every automation is:

```text
chore: update <component> image to {{ range .Updated.Images }}{{ println . }}{{ end }}

[ci skip]
```

!!! note "`[ci skip]` and the `platform-bot` bot"
    Image-bump commits are authored by the `platform-bot` bot and carry `[ci skip]` so
    they don't re-trigger CI. They are pushed straight to `main` (prod) or
    `staging` (staging) of the **`platform-utils`** repo — the platform-bot automation
    writes to the *other* repo and uses a normal author.

## Component inventory

The table below lists every component directory in scope. "Deployed to" reflects
what the overlay `kustomization.yaml` files actually reference (not merely which
directories exist). Kind/purpose are **inferred from naming**; authoritative specs
live in `platform-utils`.

| Component | GHCR image (`ghcr.io/example-org/…`) | Deployed to | SOPS | Likely kind | Inferred purpose |
| --- | --- | --- | --- | --- | --- |
| capture-exporter | `capture-exporter` | prod | no | Deployment (exporter) | Prometheus exporter of per-camera capture capture-event counts |
| mikrotik-wireguard-exporter | `mikrotik-wireguard-exporter` | prod | no | Deployment (exporter) | Prometheus exporter of MikroTik/RouterOS WireGuard peer health |
| `mktxp` | *(none in this repo)* | prod | no | Deployment (exporter) | MikroTik RouterOS Prometheus exporter (`mktxp`) — no image automation here |
| router-fleet-resolver | `router-fleet-resolver` | prod | no | CronJob/Job | Resolves the MikroTik router fleet (inventory / target list) |
| router-lifetime-reconciler | `router-lifetime-reconciler` | prod | no | CronJob/Deployment | Reconciles router lifecycle / lifetime state |
| camera-probe-propagator | `camera-probe-propagator` | prod (+ staging dir, orphaned) | yes | CronJob | Propagates camera blackbox/ICMP probe targets |
| camera-image-size-report | `camera-image-size-report` | prod (+ staging dir, orphaned) | yes | CronJob (report) | Reports camera image sizes |
| sonic-stragglers-report | `sonic-stragglers-report` | prod (+ staging dir, orphaned) | yes | CronJob (report) | Reports "sonic" stragglers |
| distance-cache-cleanup | `distance-cache-cleanup` | prod + staging | yes | CronJob | Cleans up a distance cache |
| harddisk-hoover | `harddisk-hoover` | prod + staging | yes | CronJob | Reclaims disk space ("hoovers" up used storage) |
| watchlist-log-items | `watchlist-log-items` | prod + staging | yes | CronJob | Processes watchlist log items |
| cluster-capacity-analysis | `cluster-capacity-analysis` | **none** (orphaned base) | — | CronJob/Job | Analyses cluster capacity |

All `ImageRepository` resources share the same shape: `flux-system` namespace,
`interval: 5m`, `provider: generic`, `secretRef: ghcr-credentials`.

!!! warning "Purposes are inferred, not verified from source"
    The container image, entrypoint, CronJob schedule, env vars and mounted
    secrets for each component are defined in `platform-utils`
    (`./k8s/overlays/<env>/<component>`), which is outside this repo. The
    "Likely kind" and "Inferred purpose" columns are best-effort reads of the
    component names and should be confirmed against the workload manifests before
    relying on them operationally.

### Notable per-component notes

- **`capture-exporter`** — exporter naming and the operational history (Python
  Prometheus exporter reading per-camera capture-event counts from MongoDB
  `ingest.captures`, no PII) indicate a long-running Deployment scraped by Prometheus.
  Image `ghcr.io/example-org/capture-exporter`.
- **`mikrotik-wireguard-exporter`** — exporter of RouterOS WireGuard peer health,
  correlated to cameras via allowed-address CIDRs; long-running Deployment.
  Image `ghcr.io/example-org/mikrotik-wireguard-exporter`.
- **`mktxp`** — the well-known open-source MikroTik RouterOS Prometheus exporter.
  Unlike the others it has **no `base/` directory** in this repo and therefore
  **no `ImageRepository` / `ImagePolicy` / `ImageUpdateAutomation`** — its
  `overlays/prod/mktxp` consists solely of a `kustomization.yaml` and a
  `flux-kustomization.yaml` pointing at `./k8s/overlays/prod/mktxp` in
  `platform-utils`. Its image tag is pinned/managed in `platform-utils`, not by
  Flux image automation here. Prod-only.
- **`router-fleet-resolver` / `router-lifetime-reconciler`** — the router-fleet
  tooling; prod-only, no SOPS label. Related context: the MikroTik monitoring
  stack uses a `router-fleet-credentials` secret in the prod account (77
  routers).
- **`camera-probe-propagator`, `camera-image-size-report`, `sonic-stragglers-report`,
  `distance-cache-cleanup`, `harddisk-hoover`, `watchlist-log-items`** — all carry the
  SOPS label (their workloads consume SOPS-encrypted secrets committed in
  `platform-utils`).

## Environment differences

### Prod (`overlays/prod/kustomization.yaml`)

Wires **11** components:

```yaml
resources:
  - camera-image-size-report
  - distance-cache-cleanup
  - harddisk-hoover
  - sonic-stragglers-report
  - watchlist-log-items
  - camera-probe-propagator
  - capture-exporter
  - mikrotik-wireguard-exporter
  - router-fleet-resolver
  - router-lifetime-reconciler
  - mktxp
```

### Staging (`overlays/staging/kustomization.yaml`)

Wires only **3** components:

```yaml
resources:
  - distance-cache-cleanup
  - harddisk-hoover
  - watchlist-log-items
```

Staging therefore runs a small subset: the two cleanup jobs plus `watchlist-log-items`.
The exporters (`capture-exporter`, `mikrotik-wireguard-exporter`, `mktxp`) and the
router tooling are **prod-only**.

!!! warning "Three staging overlay directories exist but are not wired in"
    The directories `overlays/staging/camera-image-size-report`,
    `overlays/staging/camera-probe-propagator` and
    `overlays/staging/sonic-stragglers-report` are fully populated (each has
    `kustomization.yaml`, `flux-kustomization.yaml`, `imagepolicy.yaml`,
    `imageupdateautomation.yaml`) but are **not** listed in
    `overlays/staging/kustomization.yaml`, so Kustomize never builds them and
    Flux never reconciles them. They were added in the same commit that created
    the staging overlay (`a6afcb6a`, "restructure overlays … for staging") and
    appear to be staged-but-not-enabled. See [Legacy / orphaned config](#legacy-orphaned-config).

## SOPS decryption

Six components' Flux `Kustomization` resources carry the label
`app.kubernetes.io/sops: "enabled"` in **both** prod and staging:
`camera-image-size-report`, `camera-probe-propagator`, `distance-cache-cleanup`,
`harddisk-hoover`, `sonic-stragglers-report`, `watchlist-log-items`.

The environment overlays (`prod-cpt-aws` / `staging-cpt-aws`) apply a strategic
patch that adds SOPS decryption to every `Kustomization` matching that label:

```yaml
patches:
  - patch: |
      apiVersion: kustomize.toolkit.fluxcd.io/v1beta2
      kind: Kustomization
      metadata:
        name: all
      spec:
        decryption:
          provider: sops
          secretRef:
            name: sops-keys
    target:
      kind: Kustomization
      labelSelector: app.kubernetes.io/sops=enabled
```

The five non-labelled components (`capture-exporter`,
`mikrotik-wireguard-exporter`, `router-fleet-resolver`,
`router-lifetime-reconciler`, `mktxp`) do not get SOPS decryption, implying their
manifests in `platform-utils` do not include SOPS-encrypted resources (they rely
on `ExternalSecret`s / plain config instead).

## Operational notes

- **All image bumps land in `platform-utils`, not here.** When a new image tag
  matches an `ImagePolicy`, the `ImageUpdateAutomation` commits the setter change
  to `platform-utils` (`main` for prod, `staging` for staging). This repo only
  reconciles the Flux CRs; you will not see image-tag churn in `platform-infra`.
- **Promotion path.** A component is promoted staging → prod by cutting a stable
  `vX.Y.Z` tag (prod `ImagePolicy` only accepts non-prerelease semver); staging
  consumes `vX.Y.Z-rc.N` prereleases.
- **`interval: 5m` everywhere.** `GitRepository`, every `ImageRepository`, every
  Flux `Kustomization` and every `ImageUpdateAutomation` reconcile on a 5-minute
  interval.
- **`wait: true` + `timeout: 5m`.** Every component's Flux `Kustomization` waits
  for its workload to become ready and fails the reconciliation after 5 minutes.
- **`prune: true`.** Removing a component from an overlay `kustomization.yaml`
  will cause Flux to garbage-collect its workloads.
- **Namespaces.** Workloads land in `utils` (and possibly `misc`); both
  namespaces and their `default` ServiceAccount + `ghcr-credentials` secret are
  created by the shared base.

## Legacy / orphaned config

!!! danger "Orphaned base: `cluster-capacity-analysis`"
    `base/cluster-capacity-analysis/` defines an `ImageRepository` (and a
    `kustomization.yaml` referencing it) but **no overlay** references it — it is
    absent from both `overlays/prod/kustomization.yaml` and
    `overlays/staging/kustomization.yaml`, and there is no
    `overlays/*/cluster-capacity-analysis/` directory at all. As a result the
    `ImageRepository` is never built into either environment. It has not been
    touched since the folder-structure refactor (`40cf9505`, 2026‑02‑23). It is
    effectively dead configuration — either wire it into an overlay or remove it.

!!! warning "Unwired staging overlays (3)"
    `overlays/staging/{camera-image-size-report,camera-probe-propagator,sonic-stragglers-report}`
    are complete, self-consistent overlay directories that are **not listed** in
    `overlays/staging/kustomization.yaml`. They are inert (never reconciled). If
    staging is meant to run these, add them to the staging `kustomization.yaml`;
    otherwise they are stale scaffolding that should be pruned to avoid confusion
    about what actually runs in staging.

!!! note "Naming ambiguity: `watchlist-log-items` / `sonic-stragglers-report`"
    The purpose of `watchlist-log-items` and `sonic-stragglers-report` cannot be
    determined from the manifests in this repo (they only reference GHCR images
    and a `platform-utils` path). Their behaviour is defined entirely in
    `platform-utils`; treat the inferred purposes in the inventory table as
    unverified.
