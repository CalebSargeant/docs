# Security & AppSec Services

Self-hosted application-security (AppSec) and CI-support tooling that lives under
`kubernetes/infrastructure/services/`
and is delivered by Flux. This page covers the SAST/DAST + vulnerability-management
stack (SonarQube, Dependency-Track, DefectDojo and the glue that wires them together),
the shared AppSec foundation they hang off, the self-hosted GitHub Actions runners, and
the OpenReplay session-replay deployment.

Almost all of these services sit in a single `security` namespace on the
`staging-cpt-aws` cluster (whose `clusterName` is `staging-eks`), lean on **shared**
data stores rather than bundling their own, and are exposed through the shared AWS ALB
behind Google Workspace SSO. OpenReplay is the exception — it spans its own
`openreplay-db` / `openreplay-app` namespaces and is backed by real S3 via IRSA.

!!! warning "Deployment status: mostly scaffolded, not yet reconciled"
    With the exception of the **prod GitHub runners**, none of the services on this page
    are currently wired into a cluster-level `kustomization.yaml`, so Flux does not
    reconcile them yet. The manifests are committed to `main` (the AppSec stack landed via
    PR #525, `feat/staging-security-tooling`) but the `overlays/prod` variants carry
    explicit *"present in main but NOT deployed"* banners, and the staging overlays are
    likewise not referenced from
    `kubernetes/overlays/staging-cpt-aws/kustomization.yaml`.
    See [Deployment status](#deployment-status) for the per-service breakdown.

## Deployment status

| Service | Role | Overlays present | Wired into a cluster kustomization? |
| --- | --- | --- | --- |
| `appsec-foundation` | Shared `security` ns + Google OIDC secret + ALB RBAC | staging, prod | No — scaffolded |
| `sonarqube` | SAST (Community Edition) | staging, prod | No — scaffolded |
| `dependency-track` | SBOM / dependency (SCA) analysis | staging, prod | No — scaffolded |
| `defectdojo` | Vulnerability aggregation / triage | staging, prod | No — scaffolded |
| `security-integrations` | Hourly sync CronJobs (DT/Sonar → DefectDojo, GitHub issues) | staging, prod | No — scaffolded |
| `github-runner` | Self-hosted GitHub Actions runners (DinD) | prod only | **Yes — prod deployed** |
| `openreplay` | Session replay | staging only | No — scaffolded (TF + Flux built, not applied) |

The only entry actually reconciled by Flux is
`github-runner/overlays/prod/flux`,
referenced from
`prod-cpt-aws/kustomization.yaml`.

## Shared foundations

Everything in the AppSec stack shares a common set of platform primitives rather than
running self-contained bundles:

| Concern | Choice | Endpoint / detail |
| --- | --- | --- |
| Namespace | `security` (created by `appsec-foundation`) | label `example.com/role: security` |
| PostgreSQL | Shared **CloudNativePG** cluster (`services/postgres`, ns `database`) | `postgres-rw.database.svc.cluster.local:5432` |
| Cache / broker | Shared **Valkey** (`services/valkey`, ns `database`), Redis-compatible | `valkey.database.svc.cluster.local:6379` |
| Exposure | Shared ALB IngressGroup (`staging-alb` / `prod-alb`) | AWS Load Balancer Controller, `ingressClassName: alb` |
| TLS | ACM cert on the ALB (cert-manager is **disabled** on this cluster) | wildcard `*.<env>.cpt.aws.example.net` |
| DNS | external-dns → Route53 | `external-dns.alpha.kubernetes.io/hostname` |
| Edge auth | Google Workspace **OIDC at the ALB** (same client as MinIO/Grafana) | secret `google-oidc-secret` |
| Secrets | `ExternalSecret`s against the `aws-secrets-manager` `ClusterSecretStore` | AWS Secrets Manager, staging acct `444455556666`, `af-south-1` |

Each tool follows the same **two-Ingress split** on one host: an unauthenticated
`/api` path (low `group.order`, matched first) so CI can push findings/SBOMs with an
API token, and a catch-all `/` path gated by Google SSO for the human UI. Each tool
owns a logical CNPG `Database` + a CNPG-managed login role; the DB password lives once
in Secrets Manager and is synced to both the app (ns `security`) and the CNPG role
secret (ns `database`) so the two stay in lockstep.

Intended Flux ordering (encoded via `dependsOn`):

```
cloudnative-pg → postgres / valkey → appsec-foundation → defectdojo / dependency-track / sonarqube → security-integrations
```

---

## appsec-foundation

The prerequisite layer every other AppSec service depends on. It creates nothing
application-specific — just the shared namespace, the Google OIDC secret, and the RBAC
the ALB controller needs.
Source: `services/appsec-foundation`.

| File | Kind | Purpose |
| --- | --- | --- |
| `base/namespace.yaml` | `Namespace` | The `security` namespace, `managed-by: flux`, `example.com/role: security` |
| `base/externalsecret-google-oidc.yaml` | `ExternalSecret` | Syncs `google-oidc-secret` (`clientID`/`clientSecret`) from Secrets Manager key `google`. Environment-neutral (per-cluster `ClusterSecretStore`) |
| `base/alb-secret-reader-rbac.yaml` | `Role` + `RoleBinding` | Grants the `aws-load-balancer-controller` SA (ns `kube-system`) `get/list/watch` on Secrets in `security`, so it can resolve the Ingress OIDC `secretName` |

- The `google-oidc-secret` is the **same Google OAuth client** as the MinIO console —
  no new credential is minted. Redirect URIs must be added to that existing client per
  environment (see the module README):
  `https://<tool>.<env>.cpt.aws.example.net/oauth2/idpresponse`.
- The ALB controller's base `ClusterRole` deliberately omits blanket secret access, so
  each OIDC-authenticated namespace must grant `list/watch` (which cannot be
  `resourceName`-scoped) — the accepted-risk Checkov skip `CKV2_K8S_5` is annotated
  in-place.
- Both overlays (`staging`, `prod`) are thin — they just point a Flux `Kustomization`
  at the base with a 5m timeout and `wait: true`.

!!! note "Required Secrets Manager keys (staging `444455556666`, af-south-1)"
    The foundation README enumerates the out-of-band secrets that must exist before Flux
    reconciles: `appsec/defectdojo`, `appsec/dependency-track`, `appsec/sonarqube`,
    `appsec/security-integrations`, plus the pre-existing `google` secret. The manifests
    reference these but cannot create them.

---

## SonarQube — SAST (Community Edition)

Static application-security testing. Single-node **Community Edition** (no branch/PR
analysis). Chart from the SonarSource Helm repo.
Source: `services/sonarqube`.

**Key config** (from `base/helmrelease.yaml`):

| Setting | Value |
| --- | --- |
| Chart | `sonarqube` `2026.3.1` (repo `https://SonarSource.github.io/helm-chart-sonarqube`) |
| Edition | `community.enabled: true` |
| Elasticsearch sysctl | `initSysctl.enabled: true`, `vmMaxMapCount: 524288` (privileged init container) |
| Database | `jdbcOverwrite` → `jdbc:postgresql://postgres-rw.database.svc.cluster.local:5432/sonarqube`, user `sonarqube`, password from Secret `sonarqube-db` |
| Monitoring passcode | `monitoringPasscodeSecretName: sonarqube-monitoring` (gates `/api/monitoring`; pod won't become Ready without it) |
| Persistence | `5Gi`, `gp3`, `ReadWriteOnce` |
| Service | port `9000` |
| Ingress | `enabled: false` (exposure via the overlay ALB Ingress) |
| Resources | requests `500m` CPU / `2Gi`, memory limit `6Gi` |

**Supporting resources:**

| File | Kind | Purpose |
| --- | --- | --- |
| `base/database.yaml` | CNPG `Database` | Logical `sonarqube` DB, owner `sonarqube`, `databaseReclaimPolicy: retain`. SonarQube migrates its own schema but does not create the DB |
| `base/externalsecret-db.yaml` | `ExternalSecret` | `sonarqube-db` basic-auth Secret from `appsec/sonarqube` `db-password` |
| `base/externalsecret-app.yaml` | `ExternalSecret` | `sonarqube-monitoring` passcode from `appsec/sonarqube` `monitoring-passcode` |
| `base/helmrepository.yaml` | `HelmRepository` | SonarSource chart repo |

**Exposure** (overlay `ingress.yaml`): host `sonarqube.<env>.cpt.aws.example.net`, backend
Service `sonarqube-sonarqube:9000`.

- `sonarqube-api` — path `/api`, `group.order: 10`, **no** auth (CI scanners
  authenticate with a SonarQube token).
- `sonarqube` — path `/`, `group.order: 20`, Google OIDC at the ALB **plus** SonarQube's
  own local login. Healthcheck `/api/system/status`, success `200`.

---

## Dependency-Track — SBOM / dependency (SCA) analysis

Software Bill of Materials analysis: ingests CycloneDX SBOMs and continuously tracks
component vulnerabilities. Split into an `api-server` and a `frontend` SPA.
Source: `services/dependency-track`.

**Key config** (from `base/helmrelease.yaml`):

| Setting | Value |
| --- | --- |
| Chart | `dependency-track` `1.1.0` (repo `https://dependencytrack.github.io/helm-charts`) |
| Secret key | `common.secretKey.createSecret: false`, `existingSecretName: dependency-track-secret-key` (Alpine encrypts persisted integration creds with it — must be stable across restarts) |
| api-server PVC | `10Gi`, `gp3` (local index/scratch) |
| Database | `ALPINE_DATABASE_MODE: external`, URL `jdbc:postgresql://postgres-rw.database.svc.cluster.local:5432/dependencytrack`, creds from Secret `dependency-track-db`, pool max `10` |
| JVM | `EXTRA_JAVA_OPTIONS: -Xmx2048m` |
| OIDC | **Not** configured natively (no `ALPINE_OIDC_*`) — the ALB Google SSO gateway fronts the UI and local admin login sits behind it |
| api-server resources | requests `500m` / `1Gi`, memory limit `3Gi` |
| frontend resources | requests `100m` / `64Mi`, memory limit `128Mi` |
| Ingress | `enabled: false` (overlay ALB Ingress) |

**Supporting resources:** CNPG `Database` `dependencytrack` (owner `dependencytrack`,
`retain`); `ExternalSecret` `dependency-track-secret-key` (`secret.key` from
`appsec/dependency-track` `secret-key`); `ExternalSecret` `dependency-track-db`
basic-auth (from `db-password`); `HelmRepository`.

**Exposure** (overlay `ingress.yaml`): host `dependencytrack.<env>.cpt.aws.example.net`.

- `dependency-track-api` — path `/api`, `group.order: 10`, **no** auth (CI posts SBOMs to
  `/api/v1/bom` with an API key). Backend `dependency-track-api-server:8080`, healthcheck
  `/api/version`.
- `dependency-track` — path `/`, `group.order: 20`, Google OIDC. Backend
  `dependency-track-frontend:8080`.

The overlays patch in the environment-specific `frontend.apiBaseUrl`
(`https://dependencytrack.<env>.cpt.aws.example.net`).

---

## DefectDojo — vulnerability aggregation / triage

The central vulnerability-management hub. All the other scanners feed findings here,
where they are deduped, triaged and (via `security-integrations`) optionally pushed out
as GitHub issues. Django + Celery worker/beat.
Source: `services/defectdojo`.

**Key config** (from `base/helmrelease.yaml`):

| Setting | Value |
| --- | --- |
| Chart | `defectdojo` `1.9.29` (repo `https://raw.githubusercontent.com/DefectDojo/django-DefectDojo/helm-charts`); appVersion image `defectdojo/defectdojo-django:2.58.4` |
| PostgreSQL | `postgresql.enabled: false`; `postgresServer: postgres-rw.database.svc.cluster.local`, DB/user `defectdojo`, password from `defectdojo-postgresql-specific` |
| Broker | `redis.enabled: false`; `redisServer: valkey.database.svc.cluster.local:6379` (shared Valkey) |
| Secret generation | `createSecret` / `createRedisSecret` / `createPostgresqlSecret` all `false` — supplied via ExternalSecrets |
| Django | `replicas: 1`, media PVC `5Gi` `gp3` RWO, uWSGI req `100m`/`512Mi` limit `1Gi`, nginx req `50m`/`64Mi` limit `250m`/`128Mi`, autoscaling off |
| Celery | worker `replicas: 1` (req `100m`/`192Mi` limit `500m`/`384Mi`), beat `replicas: 1` |
| Prometheus / networkPolicy / cloudsql | all disabled |

**Supporting resources:**

| File | Kind | Purpose |
| --- | --- | --- |
| `base/database.yaml` | CNPG `Database` | `defectdojo`, owner `defectdojo`, `retain` |
| `base/externalsecret-app.yaml` | `ExternalSecret` | Secret `defectdojo` with `DD_SECRET_KEY`, `DD_CREDENTIAL_AES_256_KEY`, `DD_ADMIN_PASSWORD` from `appsec/defectdojo` |
| `base/externalsecret-db.yaml` | `ExternalSecret` | `defectdojo-postgresql-specific` (`postgresql-password`) |
| `base/valkey-password-empty.yaml` | `Secret` | Empty `defectdojo-valkey-specific` broker-password — the chart always mounts one even though the shared Valkey needs no auth |

**Exposure** (overlay `ingress.yaml`): host `defectdojo.<env>.cpt.aws.example.net`, backend
Service `defectdojo-django:80`.

- `defectdojo-api` — path `/api`, `group.order: 10`, **no** auth (CI posts findings with a
  DefectDojo API token). Healthcheck `/login`, success `200,302`.
- `defectdojo` — path `/`, `group.order: 20`, Google OIDC.

The overlays supply the public host via a patched HelmRelease: `host`, `site_url`, and
`django.extraEnv` (`DD_ALLOWED_HOSTS`, `DD_CSRF_TRUSTED_ORIGINS`) — base is
environment-neutral.

---

## security-integrations — sync CronJobs (the glue)

Two hourly `CronJob`s that pull findings from Dependency-Track and SonarQube into
DefectDojo, and (for the DT job) optionally open GitHub issues for high-severity
findings. Both run in the DefectDojo Django image so they can use the Django ORM
directly.
Source: `services/security-integrations`.

| File | Kind | Purpose |
| --- | --- | --- |
| `base/cronjob-dt-sync.yaml` | `CronJob` `dt-defectdojo-sync` | Schedule `0 * * * *`. DT → DefectDojo + GitHub issues |
| `base/cronjob-sonarqube-sync.yaml` | `CronJob` `sonarqube-defectdojo-sync` | Schedule `30 * * * *` (offset 30m). SonarQube → DefectDojo |
| `base/configmap-sync-script.yaml` | `ConfigMap` `dt-defectdojo-sync` | The DT sync `sync.py` |
| `base/configmap-sonarqube-sync.yaml` | `ConfigMap` `sonarqube-defectdojo-sync` | The Sonar sync `sync.py` |
| `base/externalsecret-sync.yaml` | `ExternalSecret` `security-integrations` | `DTRACK_API_KEY`, `SONARQUBE_TOKEN` from `appsec/security-integrations` |
| `base/externalsecret-github-targets.yaml` | `ExternalSecret` `github-issue-targets` | `GITHUB_TARGETS` JSON from `appsec/security-integrations` `github-targets` (optional) |

**What the sync jobs do:**

- **`dt-defectdojo-sync`** — for every active Dependency-Track project it exports findings
  in FPF (`/api/v1/finding/project/<uuid>/export`) and `reimport-scan`s them into
  DefectDojo (`auto_create_context` creates product/engagement/test and dedupes on
  re-runs). It then resolves a GitHub repo **by name** across the configured targets
  (github.com first, then any GitHub Enterprise server) and opens issues for new Active
  findings at/above `GITHUB_MIN_SEVERITY` (default `High`), recording a `GITHUB_Issue` per
  finding so re-runs dedupe. Per-run cap `MAX_GITHUB_ISSUES_PER_RUN` (default `50`).
- **`sonarqube-defectdojo-sync`** — for every SonarQube project it ensures a DefectDojo
  Tool Configuration + per-product API Scan Configuration, then triggers DefectDojo's
  native *"SonarQube API Import"* to pull `VULNERABILITY` + `SECURITY_HOTSPOT` findings
  (security only, not code smells/bugs).

Both mint a DefectDojo API token via the ORM (no password needed), talk only to
**in-cluster** service endpoints (no Cloudflare round-trip) + GitHub, and are idempotent.
API keys are `optional` secretKeyRefs so the job starts and exits cleanly (logging
`... is empty; aborting`) before the Secrets Manager key exists.

**Zero-touch GitHub push:** there is **no per-repo config**. GitHub accounts (server +
owners + token) are listed once in the `github-targets` Secrets Manager property; a DT
project maps to a repo of the same name under those owners. Omitting `github-targets`
disables GitHub issue creation (findings still import). PATs are fine-grained (Issues
read/write + Metadata read).

**Pod hardening** (both CronJobs): `concurrencyPolicy: Forbid`, `backoffLimit: 1`,
`activeDeadlineSeconds: 1800`, `automountServiceAccountToken: false`, `runAsNonRoot`
UID/GID `10001`, `readOnlyRootFilesystem: true`, `capabilities: drop [ALL]`,
`seccompProfile: RuntimeDefault`, AppArmor `runtime/default`, `nodeSelector`
`node-role.kubernetes.io/worker`.

!!! warning "Image tag must track the DefectDojo chart appVersion"
    Both sync containers pin `defectdojo/defectdojo-django:2.58.4` so the Django ORM
    matches the running DefectDojo schema. **Bump this together with the DefectDojo chart
    on upgrades.** The tag pin + `IfNotPresent` (not a digest) is the house convention;
    the accepted Checkov/KICS findings (`CKV_K8S_11/15/43/35`) are annotated in-place
    because Checkov does not honour `# kics-scan` line markers.

**Overlays** patch the DT sync container with the environment-specific `DD_SITE_URL`
(the public DefectDojo URL used to build GitHub-issue back-links) via an inline JSON-6902
patch, and set `dependsOn: [defectdojo, dependency-track]`.

---

## github-runner — self-hosted GitHub Actions runners

**The one service on this page that is actually deployed** (prod only). A StatefulSet of
self-hosted, org-level GitHub Actions runners with Docker-in-Docker, used to run
Security Gate/MegaLinter and the Release Workflows release pipeline.
Source: `services/github-runner`.

| File | Kind | Purpose |
| --- | --- | --- |
| `base/statefulset.yaml` | `StatefulSet` | `replicas: 3`; init `token-fetcher` + `docker-dind` + `runner` containers |
| `base/namespace.yaml` | `Namespace` | `github-runner` |
| `base/service.yaml` | headless `Service` | `clusterIP: None`, selector `app: github-runner` |
| `base/serviceaccount.yaml` | `ServiceAccount` + `Role`/`RoleBinding` | Pod/secret read; `use` on the `privileged` PSP |
| `base/externalsecret.yaml` | `ExternalSecret` | `github-app-secret` (`private-key.pem` from Secrets Manager `github` → `platform-bot-private-key.pem`) |

**Container images / versions:**

| Container | Image | Notes |
| --- | --- | --- |
| initContainer `token-fetcher` | `alpine:3.18` (runAsUser 0) | Mints a GitHub App JWT → installation token → runner registration token; robust PEM-normalization (raw / escaped-newline / base64 / rebuilt-PEM attempts) |
| `docker-dind` | `docker:24-dind` (**privileged**) | Hosts the MegaLinter container; TLS certs on shared `emptyDir`, `DOCKER_DRIVER=overlay2` |
| `runner` | `ghcr.io/actions/actions-runner:latest` | runAsUser 1001; installs Azure CLI + `gh 2.96.0` into `~/.local/bin` at startup |

**Runner registration** (via the prod ConfigMap
`overlays/prod/configmap.yaml`):

```yaml
RUNNER_WORKDIR: "/opt/runner-work"
RUNNER_GROUP: "default"
RUNNER_NAME_PREFIX: "prod-cpt"
LABELS: "kubernetes,self-hosted,prod-cpt-aws,platform"
GITHUB_URL: "https://github.com/example-org"   # org-level runners
GITHUB_APP_ID: "1234567"
GITHUB_INSTALLATION_ID: "97627469"
```

Runners are named `prod-cpt-<ordinal>`, register `--unattended --replace`, and
deregister on `preStop`. The GitHub App is **platform-bot** (matching the SM key
`platform-bot-private-key.pem`).

**Work-dir / propagation gotchas** (documented inline in the StatefulSet):

- The runner work dir lives at `/opt/runner-work`, **not** under `/tmp` — the `docker:dind`
  image mounts a tmpfs over `/tmp`, which would shadow the bind mount and make the checkout
  invisible to nested MegaLinter containers (empty dir → Security Gate exit 2, no SARIF).
- The dind work-dir mount uses `mountPropagation: Bidirectional` so nested
  `docker run -v /opt/runner-work/<repo>:...` mounts resolve to the real checkout.
- A `JOB_STARTED` hook `chown`s the reused-emptyDir work dir back to the runner UID before
  each `actions/checkout`, because Security Gate/MegaLinter runs as root and leaves root-owned
  `megalinter-reports/` behind (otherwise the next job's checkout fails with `EACCES`).
- `gh` is installed at runner start because the `actions-runner` image doesn't ship it, and
  the Release Workflows release step shells out to `gh release create`.

**Resources** are applied via a Kustomize `PatchTransformer`
(`overlays/prod/resources.yaml`):
init `10m`/`128Mi` limit `512Mi`; **docker-dind** `10m`/`128Mi` limit **`6Gi`** (governs
the whole MegaLinter scan; `512Mi` OOM-kills it); runner `10m`/`128Mi` limit `500m`/`2Gi`.
Limits are noted as KRR-pending.

**Flux wiring:** `overlays/prod/flux/flux-kustomization.yaml` (interval `5m`, timeout `2m`)
is referenced from `prod-cpt-aws`. There is **no staging overlay**; the commented staging
reference in `staging-cpt-aws/kustomization.yaml` points at a non-existent path.

!!! note "hostNetwork off, privileged DinD on"
    The runner pods set `hostNetwork: false` but the dind container runs `privileged: true`
    and the ServiceAccount is granted `use` on the `privileged` PodSecurityPolicy — required
    for Docker-in-Docker builds, but worth knowing when reasoning about the blast radius of
    a compromised CI job.

---

## OpenReplay — session replay (staging)

Self-hosted [OpenReplay](https://github.com/openreplay/openreplay) session replay,
Community/OSS edition, on `staging-eks`. Slim footprint co-tenanted with the capture
workload. Unlike the AppSec tools it spans **two dedicated namespaces**
(`openreplay-db`, `openreplay-app`) and is backed by real S3 via IRSA.
Source: `services/openreplay`
and the Terraform module
`terraform/aws/_modules/openreplay`.

### Kubernetes layout

OpenReplay publishes no Helm repo, so the charts are consumed straight from the upstream
monorepo via a Flux `GitRepository` pinned to tag **`v1.27.0`**, trimmed with `ignore` to
just `/scripts/helmcharts`. Two `HelmRelease`s:

| Release | Namespace | Chart | Contents |
| --- | --- | --- | --- |
| `openreplay-databases` | `openreplay-db` | `./scripts/helmcharts/databases` | **ClickHouse only** (`10Gi` gp3; req `300m`/`700Mi`, limit `1`/`2Gi`). MinIO/Kafka/Vault/Postgres/Redis all disabled |
| `openreplay` | `openreplay-app` | `./scripts/helmcharts/openreplay` | ~15 OSS microservices + bundled ingress-nginx (ClusterIP). `dependsOn` the databases release |

**Deviations from a stock install** (see
`base/helmrelease-openreplay.yaml`):

- **Postgres** is the shared CNPG cluster (`global.postgresql.postgresqlHost:
  postgres-rw.database.svc.cluster.local`, DB/user `openreplay`); the `openreplay` role +
  database are declared via the CNPG `Database` CR in
  `overlays/staging/database.yaml`.
- **Redis** is the shared **Valkey** (`valkey.database.svc.cluster.local:6379`, no auth).
- **ClickHouse** stays OpenReplay-local (sole consumer, OpenReplay-specific schema).
- **Kafka disabled** — the OSS edition uses Redis, not Kafka.
- **Object storage = real S3 via IRSA**: `global.s3.endpoint`/`accessKey`/`secretKey` are
  empty so the AWS SDK uses the web-identity token; service accounts are annotated with the
  IRSA role `arn:aws:iam::444455556666:role/staging-openreplay-role`. Bucket names are the
  Terraform-created `staging-openreplay-{recordings,assets,sourcemaps,spots}-444455556666`.
- **Secrets** (Postgres password + JWT/assist keys) come from Secrets Manager via ESO and
  are injected with `valuesFrom` from Secret `openreplay-sm-values` — deliberately **not**
  named `openreplay-secrets` (the chart's pre-install hook owns that name).
- Registry `public.ecr.aws/a1b2c3d4`, `ORSecureAccess: true` (ALB terminates TLS),
  `ee-components.enabled: false`, `enterpriseEditionLicense: ""`.
- Every component carries explicit requests+limits; **`assist` scaled to 1** (its health
  gate blocks account creation), **`canvases`/`spot` scaled to 0**, `connector` disabled.

**Ingress / auth** (overlay
`ingress.yaml`):
shared `staging-alb`, host `openreplay.staging.cpt.aws.example.net`, both Ingresses backed by
the bundled `openreplay-ingress-nginx-controller:80`.

- `openreplay-ingest` — path `/ingest`, `group.order: 10`, **no** auth (the JS tracker POSTs
  with a per-project token from end-user browsers).
- `openreplay` — path `/`, `group.order: 100`, Google Workspace OIDC. `auth-session-timeout`
  `28800`.

The staging overlay also creates the ALB secret-reader RBAC in `openreplay-app` and the
`openreplay-sm-values` + `google-oidc-secret` ExternalSecrets.

### PriorityClass — capture protection

All OpenReplay pods (and the shared CNPG/Valkey stores) run under PriorityClass
**`openreplay-low` (value `-20`, `preemptionPolicy: Never`)**, below `ingest-besteffort`
(-10), so under node memory pressure OpenReplay is evicted before any capture tier. The
subcharts don't template `priorityClassName`, so it is stamped on via HelmRelease
`postRenderers` (Kustomize patches). The class itself is defined in the `cloudnative-pg`
foundation
(`priorityclass.yaml`)
so it exists before any pod references it. ClickHouse's `volumeClaimTemplate` is likewise
pinned to `gp3` on post-render.

### Terraform backing (S3 + IRSA + secrets)

Module `terraform/aws/_modules/openreplay`,
consumed by
`terraform/aws/staging/af-south-1/openreplay`
(depends on `../eks`):

| Resource | Detail |
| --- | --- |
| 4 S3 buckets | `recordings`, `assets`, `sourcemaps`, `spots` — SSE-S3 (AES256), versioned, public-access-blocked |
| Lifecycle | current objects expire after `recording_retention_days` **30d** (recordings/assets/spots) / `sourcemaps_retention_days` **90d**; noncurrent versions 7d; abort incomplete MPU 3d |
| IRSA role `staging-openreplay-role` | Trust policy allows **any** SA in `openreplay-app` (`StringLike sub = system:serviceaccount:openreplay-app:*`); policy = S3 list + object get/put/delete on the four buckets |
| Secrets | `random_password` for `postgresql-password` (24ch) + 7 JWT/assist keys (32ch) → Secrets Manager `staging-openreplay-app-secrets` (recovery window 7d), consumed by ESO |

**Rotation** is deliberate (`terragrunt apply -replace=...`), not automatic — the
CNPG-managed `openreplay` role password propagates to both the app (via ESO →
`openreplay-secrets`) and the enforced DB role (via ESO → `openreplay-db-owner`). See the
service README
for the full runbook, tracker-side privacy defaults (mask-by-default), and capacity math.

!!! note "Deploy order: Terraform first, then Flux"
    The HelmReleases reference the S3 buckets, IRSA role and Secrets Manager secret that the
    Terraform module creates, so Terraform must be applied before Flux reconciles. Per the
    README, staging reconciles `platform-infra@staging`, and go-live is promoting the branch
    — the manifests are **built and PR'd (#517) but not yet applied**.

---

## Per-environment differences

| Aspect | Staging | Prod |
| --- | --- | --- |
| Cluster / account | `staging-eks`, `444455556666` | `prod-cpt-aws`, `777788889999` |
| AppSec hosts | `<tool>.staging.cpt.aws.example.net` | `<tool>.prod.cpt.aws.example.net` |
| ALB IngressGroup | `staging-alb` | `prod-alb` |
| ACM cert | `.../certificate/bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb` | `.../certificate/aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa` |
| SonarQube / DefectDojo / Dependency-Track | overlays present, **not wired** | overlays present, **not wired** (explicit banner) |
| security-integrations `DD_SITE_URL` | `https://defectdojo.staging.cpt.aws.example.net` | `https://defectdojo.prod.cpt.aws.example.net` |
| github-runner | no overlay (commented, dangling) | **deployed**, prefix `prod-cpt`, label `prod-cpt-aws` |
| OpenReplay | staging overlay only | none |

The AppSec `overlays/prod` for SonarQube/DefectDojo/Dependency-Track/security-integrations
mirror staging but change only the host, cert ARN and account, and each carries a
"present in main but NOT deployed" comment plus a `dependsOn` that additionally waits on
`valkey` (DefectDojo) as appropriate.

## Secrets Manager inventory (staging `444455556666`, af-south-1)

| Secret | Properties | Consumed by |
| --- | --- | --- |
| `appsec/defectdojo` | `db-password`, `secret-key`, `credential-aes-256-key`, `admin-password` | DefectDojo |
| `appsec/dependency-track` | `db-password`, `secret-key` | Dependency-Track |
| `appsec/sonarqube` | `db-password`, `monitoring-passcode` | SonarQube |
| `appsec/security-integrations` | `dependency-track-api-key`, `sonarqube-token`, `github-targets` (optional) | security-integrations |
| `google` | `oidc-client-id`, `oidc-client-secret` | ALB OIDC (all UIs) — shared with MinIO/Grafana |
| `github` | `platform-bot-private-key.pem` | github-runner |
| `staging-openreplay-app-secrets` | `postgresql-password` + 7 JWT/assist keys | OpenReplay (via ESO `valuesFrom`) |

`db-password` for each AppSec tool is the CNPG-enforced role password — set once, used by
both the CNPG role (ns `database`) and the app (ns `security`).

## Operational notes & gotchas

- **cert-manager is disabled** on these clusters — TLS terminates at the ALB using the ACM
  cert in the Ingress annotations.
- **API paths are intentionally unauthenticated** on every AppSec tool (lower
  `group.order`, matched before the SSO catch-all) so CI can push findings/SBOMs with a
  token. Do not "fix" this by adding OIDC to the `/api` Ingress.
- **The AppSec UIs sit behind two gates**: Google SSO at the ALB *and* each tool's own
  login. SonarQube keeps its local login; Dependency-Track/OpenReplay have no external SSO
  so the first visitor creates the initial account.
- **DefectDojo cross-tool dedup** requires `enable_deduplication` (set by the DefectDojo
  bootstrap) — without it, findings from Sonar/DT/Trivy/MegaLinter won't collapse.
- **The sync image tag and the DefectDojo chart appVersion must move together** (both at
  `2.58.4`).

## Legacy / observations

- **`ghcr.io/actions/actions-runner:latest`** in the runner StatefulSet is an unpinned
  mutable tag (as are `docker:24-dind` and `alpine:3.18` to a lesser degree) — a rollout can
  silently change the runner version, which is at odds with the repo's tag-pinning
  convention elsewhere.
- **Prod AppSec Ingress annotations reuse the staging subnet IDs**
  (`subnet-0394a6c5716c56715,subnet-0607d300daadc5c55`) while switching cert/account — the
  files themselves flag *"confirm the prod ALB subnets/cert are current before wiring into
  prod-cpt-aws"*. This is a copy-paste risk to resolve at prod go-live.
- **Dangling commented reference:**
  `staging-cpt-aws/kustomization.yaml` has a commented
  `github-runner/overlays/staging/flux-kustomization.yaml` line, but no `overlays/staging`
  exists for github-runner. Harmless while commented, but misleading.
- **Whole AppSec + OpenReplay stack is scaffolded, not reconciled** — the manifests are in
  `main` but not referenced by any cluster `kustomization.yaml` (neither `main` nor the
  `staging` branch), so Flux does not apply them. Only the prod GitHub runners are live.
- (Out of scope, noted in passing) the `staging-cpt-aws/flux-system/` directory contains a
  number of committed Syncthing `*.sync-conflict-*.yaml` artifacts — stale files that don't
  belong in Git.
