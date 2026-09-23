# Kubernetes Applications (Flux App Wiring)

`kubernetes/apps/` holds the Flux GitOps **wiring** for the platform's first-party
application workloads. With one exception (the `utils`
sub-apps' Kubernetes manifests, which live in `platform-utils`), these
directories contain **only** Flux custom resources — the actual
`Deployment` / `Service` / `Ingress` manifests live in each application's own
source repository. This page documents that wiring; it sits under `kubernetes/`
alongside `infrastructure/` (cluster controllers) and `overlays/` (per-cluster
root kustomizations), and is pulled into the cluster by
`kubernetes/overlays/{prod,staging}-cpt-aws`.

Source directory:
`kubernetes/apps/`

!!! note "Scope"
    The edge capture product is documented on its own page.
    This page covers the *Flux wiring* of the `backend`, `driver`,
    `public-api`, `camera-console`, `status` and `utils` apps.
    `backend` and `driver` are the capture admin-backend and capture-driver services;
    only their wiring is described here.

## The pattern: base + overlays

Each app follows a Kustomize **base + overlays** layout:

```
kubernetes/apps/<app>/
├── base/                     # cluster-side bootstrap + Flux ImageRepository
│   ├── namespace.yaml        # (some apps)
│   ├── serviceaccount.yaml   # (some apps) default SA with imagePullSecrets
│   ├── externalsecret.yaml   # (some apps) ghcr-credentials via ESO
│   ├── imagerepository.yaml  # Flux ImageRepository (scans GHCR)
│   └── kustomization.yaml
└── overlays/
    ├── prod/                 # stable-release wiring
    │   ├── gitrepository.yaml          # Flux GitRepository → app repo, main
    │   ├── flux-kustomization.yaml     # Flux Kustomization → app repo ./k8s/overlays/prod
    │   ├── imagepolicy.yaml            # selects stable v-semver tags
    │   ├── imageupdateautomation.yaml  # writes bumps back to app repo main
    │   └── kustomization.yaml
    └── staging/              # release-candidate wiring (branch: staging)
        └── … (same shape, rc-semver policy)
```

The per-cluster root kustomizations reference **both** the `base` and the
matching `overlays/<env>` for each app. From
`kubernetes/overlays/prod-cpt-aws/kustomization.yaml`:

```yaml
resources:
  - flux-system
  - ../../infrastructure/controllers
  - ../../infrastructure/configs
  # backend
  - ../../apps/backend/base
  - ../../apps/backend/overlays/prod
  # public-api
  - ../../apps/public-api/base
  - ../../apps/public-api/overlays/prod
  # … camera-console, driver, status, utils …
```

The staging root
(`overlays/staging-cpt-aws/kustomization.yaml`)
mirrors this but points at each app's `overlays/staging`.

### What each Flux resource does

| Resource | apiVersion (kind) | Where it lives | Role |
| --- | --- | --- | --- |
| `ImageRepository` | `image.toolkit.fluxcd.io/v1beta2` | `base/` (ns `flux-system`) | Scans a GHCR image every 5m for available tags. |
| `ImagePolicy` | `image.toolkit.fluxcd.io/v1beta2` | `overlays/<env>/` (ns `flux-system`) | Filters tags (regex) and picks the newest per a semver range. |
| `GitRepository` | `source.toolkit.fluxcd.io/v1` | `overlays/<env>/` (ns `flux-system`) | The app's own repo, a specific branch, auth via `github-app`. |
| `Kustomization` (Flux) | `kustomize.toolkit.fluxcd.io/v1` | `overlays/<env>/` (ns `flux-system`) | Applies the app repo's `./k8s/overlays/<env>` manifests. |
| `ImageUpdateAutomation` | `image.toolkit.fluxcd.io/v1beta1` (v1beta2 for `public-api`) | `overlays/<env>/` (ns `flux-system`) | Rewrites the `# {"$imagepolicy": …}` Setter marker in the app repo and pushes the bump. |
| `ExternalSecret` | `external-secrets.io/v1beta1` | `base/` (app ns) | Syncs the `ghcr-credentials` pod pull-secret from AWS Secrets Manager. |
| `ServiceAccount` | `v1` | `base/` (app ns) | The namespace `default` SA, wired with `imagePullSecrets: [ghcr-credentials]`. |
| `Namespace` | `v1` | `base/` | The app's target namespace. |

!!! note "Two different `ghcr-credentials`"
    There are two secrets of the same name. The **`flux-system`** one (referenced
    by every `ImageRepository.secretRef`) lets the image-reflector-controller scan
    private GHCR; it is provisioned by
    `infrastructure/configs/ghcr-image-pull/secret.yaml`
    (SOPS-encrypted). The **per-namespace** one is created by each app's
    `ExternalSecret` from Secrets Manager (key `github`, property `image-pull`,
    base64-decoded to a `dockerconfigjson`) and is the *pod* pull-secret used by
    the `default` ServiceAccount.

## App inventory

| App | Namespace | App source repo | Container image | Flux Kustomization | Manifests path (in app repo) | Health check |
| --- | --- | --- | --- | --- | --- | --- |
| `backend` | `ingest` | `admin-backend` | `ghcr.io/example-org/backend` | `admin-backend` | `./k8s/overlays/{prod,staging}` | Deployment `admin-backend`/`ingest` |
| `driver` | `ingest` | `ingest-driver` | `ghcr.io/example-org/driver` | `driver` | `./k8s/overlays/{prod,staging}` | Deployment `driver`/`ingest` |
| `public-api` | `dashboard` | `public-api` | `ghcr.io/example-org/public-api` | `public-api` | `./k8s/overlays/{prod,staging}` | Deployment `public-api`/`dashboard` |
| `camera-console` | `camera-console` | `camera-console` | `ghcr.io/example-org/camera-console` | `camera-console` | `./k8s/overlays/{prod,staging}` | none (`timeout: 2m`) |
| `status` | `status` | `status-page` | `ghcr.io/example-org/status` | `status-page` | `./k8s/overlays/{prod,staging}` | none (`wait: true`) |
| `utils` (× many) | `utils` / `misc` | `platform-utils` | `ghcr.io/example-org/<util>` | per sub-app | `./k8s/overlays/<env>/<util>` | none |

!!! note "ImageRepository vs ImagePolicy names"
    Several apps name the `ImageRepository`/`ImagePolicy` differently from the app
    dir: `backend` → `admin-backend`, `driver` → `ingest-driver`,
    `status` → `status-page`. `public-api` and `camera-console` keep the same
    name. This matters when correlating the `# {"$imagepolicy": "flux-system:<name>"}`
    markers in the app repos.

## Image automation & promotion model

Two promotion channels are encoded entirely in the `ImagePolicy` tag filters and
the `GitRepository` branch:

| | **prod** | **staging** |
| --- | --- | --- |
| GitRepository branch | `main` | `staging` |
| Tag pattern | `^v[0-9]+\.[0-9]+\.[0-9]+$` (stable) | `^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$` (release candidate) |
| semver range | `>=1.0.0` | `>=1.0.0-rc.0` |
| Bump pushed to | app repo `main` | app repo `staging` |
| Commit author | `platform-bot <actions@users.noreply.github.com>` | `platform-bot` |

`ImageUpdateAutomation` uses `strategy: Setters` — the image-automation-controller
locates the `# {"$imagepolicy": "flux-system:<policy>"}` marker in the app repo's
overlay manifest, rewrites the tag to whatever the `ImagePolicy` selected, and
commits with `[ci skip]`.

Example — `public-api` prod vs staging `ImagePolicy`
(prod):

```yaml
# prod: bounded range so Flux never auto-selects an unreviewed major (1.x)
policy:
  semver:
    range: '>=1.0.0 <2.0.0'
```

```yaml
# staging: any release candidate
filterTags:
  pattern: '^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$'
policy:
  semver:
    range: '>=0.1.0-rc.0'
```

!!! note "Per-app deviations from the standard policy"
    - **`public-api` prod** uses a *bounded* range `>=1.0.0 <2.0.0` (the only
      app that caps the major) and its `ImageUpdateAutomation` is `v1beta2`
      (others are `v1beta1`). Staging range is `>=0.1.0-rc.0` (not `>=1.0.0-rc.0`).
    - **`camera-console` staging** has an anomalous `ImageUpdateAutomation` — see
      the legacy notes below.

## Per-app detail

### backend (capture admin-backend)

- **Namespace:** `ingest`.
  `base/`
  creates the `ingest` Namespace, the `ghcr-credentials` ExternalSecret, the
  `default` ServiceAccount (with `imagePullSecrets`), and the
  `admin-backend` ImageRepository (`ghcr.io/example-org/backend`).
- **Source:** `github.com/example-org/admin-backend`, Flux Kustomization
  named `admin-backend`, applying `./k8s/overlays/{prod,staging}`.
- **Health check:** Deployment `admin-backend` in `ingest`; `wait: true`,
  `timeout: 5m`. Carries the `app.kubernetes.io/sops: "enabled"` label.

!!! warning "Shared `ingest` namespace (mid-migration)"
    The `base/namespace.yaml` comment states the `ingest` namespace is *"to be
    split-up into separate namespaces for backend and driver"*. That split has
    not happened — `backend` and `driver` both live in `ingest`, and `driver` relies
    on `backend/base` to create the namespace, ExternalSecret and ServiceAccount
    (see below).

### driver (capture capture-driver)

- **Namespace:** `ingest` (shared with `backend`).
- **`base/` is `imagerepository.yaml` only** —
  `driver/base`
  defines just the `ingest-driver` ImageRepository
  (`ghcr.io/example-org/driver`). It has **no** namespace/SA/ExternalSecret
  of its own and depends on `backend/base` being applied first (both are pulled
  into the same root kustomization, so ordering is satisfied within one build).
- **Source:** `github.com/example-org/ingest-driver`, Flux Kustomization
  `driver`, Deployment `driver`/`ingest` health check, SOPS-enabled.

### public-api

- **Namespace:** `dashboard` — a dedicated namespace *(kept out of `ingest`)* for
  the API and related dashboard/BI workloads, labelled
  `example.com/role: observability-dashboard` and
  `app.kubernetes.io/managed-by: flux`.
- **`base/`** creates the `dashboard` Namespace and the `public-api`
  ImageRepository only — **no ExternalSecret or ServiceAccount** (unlike
  `backend`/`status`). See legacy note.
- **Source:** `github.com/example-org/public-api`, Deployment
  `public-api`/`dashboard` health check. The Flux Kustomization is **not**
  SOPS-labelled.

### camera-console

- **Namespace:** `camera-console`.
- **Source:** `github.com/example-org/camera-console` (note: repo
  name is prefixed `example-`, unlike the `camera-console` image/policy names).
- **Flux Kustomization** `camera-console`: `timeout: 2m`, **no health checks**, not
  SOPS-labelled, and its `sourceRef` omits the `namespace: flux-system` the other
  apps set explicitly.
- Several files in this app's tree are present-but-unreferenced (base excludes
  `externalsecret.yaml`/`serviceaccount.yaml`; overlays exclude
  `gitrepository.yaml`) and the staging `ImageUpdateAutomation` is misconfigured
  — **see legacy notes**, this app's wiring is the least consistent.

### status

- **Namespace:** `status`.
  `base/`
  is the "full" set: Namespace, ExternalSecret, ServiceAccount, and the
  `status-page` ImageRepository (`ghcr.io/example-org/status`).
- **Source:** `github.com/example-org/status-page`, Flux Kustomization
  `status-page`, SOPS-enabled, `wait: true` but **no explicit health checks**.

### utils (utility CronJobs / exporters)

A collection of small utilities in the **`utils`** namespace (the base also
creates a **`misc`** namespace). Each has its own page; here they are only listed
as wiring. Real Kubernetes manifests live in
`github.com/example-org/platform-utils` under
`./k8s/overlays/<env>/<util>`, sourced by the shared `GitRepository`
**`platform-utils`** (branch `main`).

`utils/base` (top level) provides the shared plumbing: the `platform-utils`
GitRepository, the `utils` + `misc` Namespaces, `ghcr-credentials` ExternalSecrets
and `default` ServiceAccounts in both namespaces. Each sub-app has a
`base/<util>/imagerepository.yaml` and an `overlays/<env>/<util>/` with a Flux
Kustomization, ImagePolicy and ImageUpdateAutomation (except `mktxp`, which is a
pure Flux Kustomization).

**Prod sub-apps** (from
`overlays/prod/kustomization.yaml`):

| Sub-app | Image (`ghcr.io/example-org/…`) | Image automation | SOPS |
| --- | --- | --- | --- |
| `camera-image-size-report` | `camera-image-size-report` | yes | yes |
| `camera-probe-propagator` | `camera-probe-propagator` | yes | yes |
| `distance-cache-cleanup` | `distance-cache-cleanup` | yes | yes |
| `harddisk-hoover` | `harddisk-hoover` | yes | yes |
| `sonic-stragglers-report` | `sonic-stragglers-report` | yes | yes |
| `watchlist-log-items` | `watchlist-log-items` | yes | yes |
| `capture-exporter` | `capture-exporter` | yes | no |
| `mikrotik-wireguard-exporter` | `mikrotik-wireguard-exporter` | yes | no |
| `router-fleet-resolver` | `router-fleet-resolver` | yes | no |
| `router-lifetime-reconciler` | `router-lifetime-reconciler` | yes | no |
| `mktxp` | (manifests in `platform-utils`) | **none** — Flux Kustomization only | no |

**Staging sub-apps** (only three referenced):
`overlays/staging/kustomization.yaml`
enables `distance-cache-cleanup`, `harddisk-hoover`, `watchlist-log-items` only.

## Prerequisites & how it wires to the platform

Before these app kustomizations reconcile, `infrastructure/controllers` and
`infrastructure/configs` must be applied (the root kustomization lists them
first). Key dependencies:

- **`flux-system/ghcr-credentials`** (dockerconfigjson) — from
  `infrastructure/configs/ghcr-image-pull/secret.yaml`.
  Used by every `ImageRepository.secretRef`.
- **`flux-system/github-app`** — from
  `infrastructure/configs/github-app/github-app-secret.yaml`.
  Used by every `GitRepository.secretRef` and the automation push credentials.
- **`aws-secrets-manager` ClusterSecretStore** — the External Secrets Operator
  store every app `ExternalSecret` reads from (pod `ghcr-credentials`).
- **SOPS decryption** — the root kustomization applies a patch to every Flux
  `Kustomization` labelled `app.kubernetes.io/sops: "enabled"`, wiring
  `spec.decryption.provider: sops` / `secretRef: sops-keys`. SOPS-labelled apps:
  `backend`, `driver`, `status`, and the six SOPS-labelled `utils` sub-apps
  above. `public-api`, `camera-console` and the four router/exporter utils are
  **not** SOPS-decrypted at the Flux-Kustomization level.

The `flux-system` `GitRepository`/`Kustomization` that bootstraps all of this is
generated by `flux bootstrap` under
`kubernetes/overlays/<cluster>/flux-system/gotk-sync.yaml`.
Prod watches **semver tags** (`semver: ">=1.0.0"`) on this repo (so releases are
cut by tagging); staging watches its branch.

## Per-environment differences (summary)

| Aspect | prod | staging |
| --- | --- | --- |
| App repo branch | `main` | `staging` |
| Image tags | stable `vX.Y.Z` | `vX.Y.Z-rc.N` |
| `utils` sub-apps | 11 enabled | 3 enabled (`distance-cache-cleanup`, `harddisk-hoover`, `watchlist-log-items`) |
| Extra services in root | observability, github-runner, netshoot | observability, netshoot, CNPG/Postgres/Valkey, OpenReplay, AppSec stack |
| infra flux-system source | semver tags on `platform-infra` | branch |

!!! note "Legacy bundled staging manifests"
    A separate, older path —
    `kubernetes/overlays/staging-cpt-aws/apps/`
    (`edge-capture/*`, hard-coded image tags like `backend:v295`) —
    is the pre-Flux-from-repo way of shipping these services and is being phased
    out where the `kubernetes/apps/**` wiring exists. It is **not** referenced by
    the staging root kustomization. Treat `kubernetes/apps/**` as the source of
    truth for app delivery.

## Operational notes

- **Force a resync:** `flux reconcile kustomization <name> -n flux-system`
  (e.g. `admin-backend`, `driver`, `public-api`, `status-page`,
  `camera-console`, or a `utils` sub-app name).
- **Check what tag a policy selected:**
  `flux get image policy <policy> -n flux-system` (policy names: `admin-backend`,
  `ingest-driver`, `public-api`, `camera-console`, `status-page`,
  and each `utils` sub-app).
- **Promotion is a tag, not a manifest edit:** publish a `vX.Y.Z-rc.N` image to
  land it in staging, and a `vX.Y.Z` image to land it in prod — the automation
  writes the bump back to the app repo. Do not hand-edit image tags in the app
  repos; the Setter automation will overwrite them.
