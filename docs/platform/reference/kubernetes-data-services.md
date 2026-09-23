# Kubernetes Data Services

The shared, in-cluster stateful backing stores that platform applications consume instead of
bundling their own databases, caches and object stores. They live under
`kubernetes/infrastructure/services`
(plus one controller under
`kubernetes/infrastructure/controllers`)
and are reconciled by Flux onto the `staging-cpt-aws` EKS cluster. The design intent is a single
shared **CloudNativePG** Postgres cluster and a single shared **Valkey** cache in the `database`
namespace, with **MinIO** object storage as a durable write buffer for the capture pipeline.

All four subsystems are Kustomize `base` + `overlays/<env>` trees driven by Flux
`Kustomization` CRs. Everything currently wired for reconciliation targets **staging only** —
prod is a separate cluster (see the per-environment notes and the legacy warnings below).

---

## Subsystem inventory

| Subsystem | Kind | Namespace | Deployed today? | Source |
|-----------|------|-----------|-----------------|--------|
| CloudNativePG operator | Helm operator (chart `cloudnative-pg` `0.23.*`) | `cloudnative-pg` | Yes (staging) | `services/cloudnative-pg` |
| Postgres (shared CNPG `Cluster` + backups) | CNPG `Cluster` + `ScheduledBackup` | `database` | Yes (staging) | `services/postgres` |
| Valkey (shared cache/broker) | `StatefulSet` + PVC + headless `Service` | `database` | Yes (staging) | `services/valkey` |
| MinIO tenant (object storage) | Helm `tenant` chart `7.1.*` | `minio-ingest` | **No — flux-kustomization commented out** | `services/minio` |
| MinIO operator | Helm `operator` chart `7.1.*` | `minio-operator` | Yes (via controllers) | `controllers/minio-operator` |
| CNPG backup bucket + IRSA | Terraform module | (AWS) | Yes (staging) | `terraform/aws/_modules/cnpg-backups` |

### Reconciliation order

The Flux `Kustomization`s form a dependency chain so CRDs and namespaces always exist before the
resources that reference them. From the staging root
`kubernetes/overlays/staging-cpt-aws/kustomization.yaml`:

```
cloudnative-pg  (wait: true — operator Ready + CRDs installed)
      │  dependsOn
      ▼
postgres        (healthChecks: Cluster postgres healthy)
      │  dependsOn
      ▼
valkey          (database namespace already created by postgres)
      │
      ▼
openreplay / defectdojo / dependency-track / sonarqube / observability(grafana)
                (each declares a Database CR + managed role on the shared cluster)
```

The `minio-operator` controller reconciles as part of
`infrastructure/controllers`
(applied before the app GitOps wiring). The MinIO **tenant** is intentionally not yet wired — its
Flux `Kustomization` is commented out in both the staging and prod roots.

---

## CloudNativePG operator

The CNPG operator is the Postgres control plane. It installs the `postgresql.cnpg.io/v1` CRDs
(`Cluster`, `Database`, `ScheduledBackup`, managed roles, …) that the shared Postgres service and
every consuming app declare against.

### What it deploys

Source:
`services/cloudnative-pg/base`

| Resource | Detail |
|----------|--------|
| `Namespace` | `cloudnative-pg`, label `app.kubernetes.io/part-of: data-stores` |
| `HelmRepository` | `cloudnative-pg` in `flux-system`, URL `https://cloudnative-pg.github.io/charts`, interval `1h` |
| `HelmRelease` | chart `cloudnative-pg` version `0.23.*`, interval `1h`, install/upgrade remediation `retries: 3`, tests disabled |
| `PriorityClass` | `openreplay-low`, value `-20`, `preemptionPolicy: Never` |

Key HelmRelease values (`helmrelease.yaml`):

```yaml
values:
  crds:
    create: true          # operator installs/owns the CNPG CRDs
  resources:
    requests: { cpu: 50m, memory: 100Mi }
    limits:   { memory: 200Mi }
```

The operator `Deployment` gets `priorityClassName: openreplay-low` stamped on via a
`postRenderers` Kustomize patch (chart-independent) rather than a chart value:

```yaml
postRenderers:
  - kustomize:
      patches:
        - target: { kind: Deployment }
          patch: |
            - op: add
              path: /spec/template/spec/priorityClassName
              value: openreplay-low
```

### The `openreplay-low` PriorityClass

Defined here — in the foundation service that reconciles first — so it always exists before any
pod references it (otherwise dependent pods would be admission-rejected with
`no PriorityClass openreplay-low` and the deploy would deadlock). It is shared by the CNPG
operator, the CNPG cluster pods, and Valkey.

| Field | Value | Rationale |
|-------|-------|-----------|
| `value` | `-20` | Below `ingest-besteffort` (`-10`) and default priority (`0`) — evicted first under node memory pressure |
| `preemptionPolicy` | `Never` | These pods never preempt anything else |
| `globalDefault` | `false` | Opt-in only |

!!! note "Why so low"
    The shared data stores run on the shared **capture nodes**. Keeping them below every capture tier
    means that under memory pressure the capture camera/capture workloads are protected and the data
    stores are shed first. Their EBS PVCs survive a reschedule, so eviction is recoverable.

### Flux wiring

`overlays/staging/flux-kustomization.yaml`
uses `wait: true` (interval `10m`, `timeout: 10m`) so the Kustomization only reports `Ready` once
the operator is running **and** the CRDs are installed. The `postgres` Kustomization `dependsOn`
this, so its `Cluster` CR never applies into a cluster that lacks the CNPG CRDs.

---

## Postgres — the shared CloudNativePG cluster

A single `postgresql.cnpg.io/v1` `Cluster` named `postgres` in the `database` namespace. Apps do
**not** bundle their own Postgres; instead each declares a `Database` CR and a managed role
against this one cluster. Source:
`services/postgres/base`.

### Cluster spec

From `cluster.yaml`:

| Setting | Value | Notes |
|---------|-------|-------|
| `instances` | `1` | Staging = single instance, no failover. Comment: bump to `3` for HA in prod |
| `imageName` | *(unset)* | Operator pins its version-matched default image — **PostgreSQL 17** |
| `priorityClassName` | `openreplay-low` | Same eviction tier as the operator/Valkey |
| `storage` | `5Gi`, `storageClass: gp3` | Encrypted EBS |
| `resources` | requests `100m` / `256Mi`, limit `768Mi` | |
| `bootstrap.initdb` | database `app`, owner `app` | Default DB; per-app DBs created via `Database` CRs |
| `monitoring.enablePodMonitor` | `true` | Scraped by the staging kube-prometheus-stack |

Postgres tuning parameters (`spec.postgresql.parameters`):

```yaml
max_connections:      "200"
shared_buffers:       "128MB"
effective_cache_size: "512MB"
work_mem:             "4MB"
maintenance_work_mem: "64MB"
```

### Managed roles

CNPG reconciles **only** the roles declared in `spec.managed.roles`, and each attribute is
reconciled to exactly what is declared. Every role is `login: true`, `superuser: false`,
`createdb/createrole: false`, `inherit: true`, `connectionLimit: -1`, with its password enforced
from an ESO-synced `kubernetes.io/basic-auth` secret in the `database` namespace.

| Role | Owns database | Password secret | Consumer |
|------|---------------|-----------------|----------|
| `openreplay` | `openreplay` | `openreplay-db-owner` | OpenReplay session replay |
| `defectdojo` | `defectdojo` | `defectdojo-db-owner` | DefectDojo |
| `dependencytrack` | `dependencytrack` | `dependencytrack-db-owner` | Dependency-Track |
| `sonarqube` | `sonarqube` | `sonarqube-db-owner` | SonarQube |
| `grafana` | `grafana` | `grafana-db-owner` | Grafana (observability) — stores state here instead of sqlite |

### How apps consume the shared cluster

Apps connect over the CNPG-generated read-write service
`postgres-rw.database.svc.cluster.local:5432` (no in-cluster auth beyond the role password). Each
app creates a `Database` CR — it never creates a new `Cluster`. Example
(openreplay's `database.yaml`):

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Database
metadata:
  name: openreplay
  namespace: database
spec:
  cluster:
    name: postgres
  name: openreplay
  owner: openreplay
  databaseReclaimPolicy: retain   # keep the DB if the CR is pruned
```

The pattern per consumer:

1. The **role** and its `passwordSecret` are declared centrally in `cluster.yaml`.
2. The **password `ExternalSecret`** is co-located in the postgres staging overlay (see below) so
   it exists when the `Cluster` first reconciles its managed roles.
3. The **`Database` CR** lives in the consuming service's own directory
   (defectdojo,
   dependency-track,
   sonarqube,
   grafana),
   all with `databaseReclaimPolicy: retain`.

!!! note "Password lockstep"
    Each `*-db-owner` ExternalSecret reads the **same** Secrets Manager value the app itself
    connects with, so the CNPG-enforced role password and the app's connection password stay in
    lockstep. They are deliberately co-located in the postgres overlay rather than the downstream
    app overlay — otherwise CNPG could not set the role password until the app reconciled much
    later.

### Password ExternalSecrets

The staging overlay
(`overlays/staging/kustomization.yaml`)
adds five ExternalSecrets, all `refreshInterval: 1h` against the `aws-secrets-manager`
`ClusterSecretStore`, rendering a `basic-auth` secret:

| ExternalSecret | Secrets Manager key | Property |
|----------------|--------------------|----------|
| `openreplay-db-owner` | `staging-openreplay-app-secrets` | `postgresql-password` |
| `defectdojo-db-owner` | `appsec/defectdojo` | `db-password` |
| `dependencytrack-db-owner` | `appsec/dependency-track` | `db-password` |
| `sonarqube-db-owner` | `appsec/sonarqube` | `db-password` |
| `grafana-db-owner` | `grafana` | `db-password` |

### StorageClass `gp3`

`storageclass.yaml`
defines the cluster-scoped `gp3` class used by both Postgres and Valkey (the cluster default is
`gp2`). Defined once here as the foundational data service.

```yaml
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer   # volume lands in the pod's AZ
allowVolumeExpansion: true
```

### Flux wiring

`overlays/staging/flux-kustomization.yaml`
`dependsOn` `cloudnative-pg` and gates readiness on a `healthCheck` for the `Cluster` being
actually healthy (not just the CR applied), so dependents (valkey, openreplay) don't start their
migration/app pods before Postgres accepts connections. It uses `wait: false`.

---

## Postgres backups — barman-cloud + S3 + IRSA

Continuous backup to S3 via CNPG's built-in `barman-cloud`. Setting `barmanObjectStore` makes CNPG
configure WAL archiving (`archive_command`) automatically, so base backups plus streamed WAL give
point-in-time recovery (PITR).

### In-cluster backup config

From `spec.backup` in
`cluster.yaml`:

```yaml
backup:
  barmanObjectStore:
    destinationPath: s3://staging-cnpg-backups-444455556666/
    endpointURL: https://s3.af-south-1.amazonaws.com   # af-south-1 is opt-in; pin it explicitly
    s3Credentials:
      inheritFromIAMRole: true                          # web-identity via IRSA, no static keys
    wal:  { compression: gzip, maxParallel: 2 }
    data: { compression: gzip }
  retentionPolicy: "30d"   # barman prunes base backups + no-longer-needed WAL; NOT an S3 lifecycle expiry
```

IRSA is wired through the `serviceAccountTemplate` on the `Cluster`, which annotates the
ServiceAccount CNPG generates (named `postgres`) so the barman sidecar inherits the pod's
web-identity credentials:

```yaml
serviceAccountTemplate:
  metadata:
    annotations:
      eks.amazonaws.com/role-arn: arn:aws:iam::444455556666:role/staging-cnpg-backups-role
```

!!! warning "Account-specific values"
    The `destinationPath` bucket name and the IRSA `role-arn` both embed the **staging** account
    id `444455556666`. There is no prod overlay yet — a prod deployment must update both alongside
    the Terraform-provisioned role ARN.

### Daily base backup

`scheduled-backup.yaml`
drives a daily base backup; WAL is archived continuously in between.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata:
  name: postgres-daily
  namespace: database
spec:
  schedule: "0 0 2 * * *"   # 6-field cron (leading seconds) → 02:00 daily
  immediate: true           # first base backup on CR create, proving backups work at apply time
  backupOwnerReference: self
  cluster: { name: postgres }
```

### Terraform: `_modules/cnpg-backups`

The S3 bucket and IRSA role are provisioned by
`terraform/aws/_modules/cnpg-backups`,
mirroring the S3+IRSA pattern in `_modules/openreplay`. It is invoked via Terragrunt at
`terraform/aws/staging/af-south-1/cnpg-backups`,
which `dependencies` on `../eks` (the module reads the EKS OIDC issuer via a data source).

**What it creates** (`main.tf`):

| Resource | Detail |
|----------|--------|
| `aws_s3_bucket` | `${environment}-cnpg-backups-${account_id}` (globally-unique, account-suffixed) |
| `aws_s3_bucket_public_access_block` | All four blocks `true` |
| `aws_s3_bucket_versioning` | `Enabled` |
| `aws_s3_bucket_server_side_encryption_configuration` | SSE-S3 `AES256` (no CMK — accepted for staging) |
| `aws_s3_bucket_lifecycle_configuration` | Reaps **noncurrent** versions after 30d + aborts incomplete multipart uploads after 3d; does **not** expire current objects |
| `aws_iam_role` | `${environment}-cnpg-backups-role`, trust `sts:AssumeRoleWithWebIdentity` |
| `aws_iam_policy` + attachment | barman-cloud S3 permissions |

The trust policy pins the subject with `StringEquals` (not a wildcard) to exactly one
ServiceAccount — `system:serviceaccount:database:postgres`
(from vars `cluster_namespace = database`, `cluster_service_account = postgres`).

!!! danger "Retention is barman's job, not S3's"
    The lifecycle rule intentionally only expires **noncurrent** object versions. barman manages
    backup retention itself via `spec.backup.retentionPolicy` (`30d`). An S3 lifecycle expiry on
    current objects could delete base backups / WAL segments barman still needs to recover, so it
    is deliberately omitted.

barman IAM permissions granted by the policy:

```
BucketAccess:  s3:ListBucket, s3:GetBucketLocation, s3:ListBucketMultipartUploads   (on the bucket)
ObjectAccess:  s3:GetObject, s3:PutObject, s3:DeleteObject,
               s3:AbortMultipartUpload, s3:ListMultipartUploadParts                  (on bucket/*)
```

Module outputs (`bucket_name`, `destination_path`, `role_arn`, `service_account_annotations`) are
documented to be wired back into the `Cluster` manifest's `barmanObjectStore.destinationPath` and
`serviceAccountTemplate` annotation. Today those values are **hand-copied** into `cluster.yaml`
(Kubernetes manifests and Terraform state are separate), so the two must be kept in sync manually.

---

## Valkey — shared cache / broker

A single-instance, Redis-compatible cache/broker in the `database` namespace. Source:
`services/valkey/base`.

### What it deploys

| Resource | Detail |
|----------|--------|
| `StatefulSet` `valkey` | `replicas: 1`, image `valkey/valkey:8.1-alpine`, `imagePullPolicy: IfNotPresent` |
| `PersistentVolumeClaim` `valkey` | `2Gi`, `gp3`, `ReadWriteOnce` (static claim, **not** a volumeClaimTemplate) |
| `Service` `valkey` | headless (`clusterIP: None`), TCP `6379` |

Container args and sizing
(`statefulset.yaml`):

```yaml
args: ["--appendonly", "yes", "--maxmemory", "256mb", "--maxmemory-policy", "noeviction"]
resources:
  requests: { cpu: 25m,  memory: 64Mi }
  limits:   { cpu: 500m, memory: 320Mi }
```

Security / scheduling hardening:

- `priorityClassName: openreplay-low` (same eviction tier as Postgres).
- `automountServiceAccountToken: false` — a cache needs no API access.
- Pod `securityContext`: `runAsNonRoot`, `runAsUser: 999`, `fsGroup: 999`
  (the image runs as uid/gid 999 and can't chown a fresh EBS volume; `fsGroup` makes `/data`
  group-writable), `seccompProfile: RuntimeDefault`.
- Container `securityContext`: `allowPrivilegeEscalation: false`, `capabilities: drop [ALL]`.
- Liveness + readiness probes both exec `valkey-cli ping`.

!!! warning "Do not scale beyond 1 replica"
    The StatefulSet mounts one shared RWO PVC via a static `claimName` (not a
    `volumeClaimTemplate`), so multiple replicas would contend for the same EBS volume. It is
    explicitly a single-instance cache.

The StatefulSet carries `checkov.io/skip*` annotations documenting accepted security-gate/Checkov
findings (tag-pinned image with `IfNotPresent`, fixed non-root uid 999, writable working dir on the
mounted PVC, tag `8.1-alpine` rather than a digest).

### How apps consume Valkey

Clients resolve `valkey.database.svc.cluster.local:6379` (no auth, matching how the shared CNPG
tier is reachable in-cluster). OpenReplay uses it as its Redis via
`global.redis.redisHost: valkey.database.svc.cluster.local`
(`helmrelease-openreplay.yaml`).

### Flux wiring

`overlays/staging/flux-kustomization.yaml`
`dependsOn` `postgres` (which creates the `database` namespace), interval `10m`, `timeout: 10m`.

---

## MinIO — object storage (operator + tenant)

S3-compatible object storage intended as the durable **write buffer** for the capture pipeline. It is
split into a cluster-wide **operator** (a controller) and a per-tenant **MinIO cluster**.

!!! warning "Not yet reconciled"
    The MinIO **tenant** is not deployed. Its Flux `Kustomization` is commented out in **both**
    root overlays with the note `we are not ready for this yet`
    (staging,
    prod).
    The **operator** *is* reconciled (it is listed in
    `infrastructure/controllers/kustomization.yaml`),
    so today there is a running operator with no tenant.

### MinIO operator (controller)

Source:
`controllers/minio-operator`.

| Resource | Detail |
|----------|--------|
| `Namespace` | `minio-operator` |
| `HelmRepository` | `minio` in `flux-system`, URL `https://operator.min.io`, interval `1h` |
| `HelmRelease` `minio-operator` | chart `operator` version `7.1.*` |

Values (`helmrelease.yaml`):

```yaml
operator:
  replicaCount: 2          # HA; chart spreads replicas across nodes by default
  resources:
    requests: { cpu: 100m, memory: 128Mi }
    limits:   { memory: 256Mi }
```

Both `install` and `upgrade` use `crds: CreateReplace` and `remediation.retries: 3`. The
`HelmRepository` named `minio` is shared by the tenant HelmRelease below.

### MinIO tenant (service)

Source:
`services/minio/base`.
The `HelmRelease` `minio-tenant` (`dependsOn` the operator) deploys the tenant `minio-ingest` into the
`minio-ingest` namespace via chart `tenant` version `7.1.*`.

| Setting | Base (staging) value | Notes |
|---------|----------------------|-------|
| Tenant name | `minio-ingest` | |
| Image | `quay.io/minio/minio:RELEASE.2025-04-08T15-41-24Z` | `IfNotPresent` |
| Credentials | `configSecret: minio-env-configuration` (existing) | Must pre-exist in `minio-ingest` with a `config.env` key |
| Pool `pool-0` | `servers: 4`, `volumesPerServer: 2` | 8 drives → MinIO auto-selects **EC:4** (4 data + 4 parity), tolerates loss of any 4 drives |
| Drive size | `50Gi` | 8 × 50Gi = 400Gi raw, ~200Gi usable after EC:4 |
| StorageClass | `minio-gp3` | |
| Anti-affinity | `requiredDuringScheduling` on `kubernetes.io/hostname` | No two MinIO pods on one node — **requires ≥4 schedulable workers** |
| `priorityClassName` | `ingest-critical` | Protected from eviction (critical write buffer) |
| `mountPath` / `subPath` | `/export` / `/data` | |
| `exposeServices` | `minio: false`, `console: false` | ClusterIP only; console exposed via Ingress in overlays |
| `metrics` | `enabled: true`, port `9000`, `http` | Prometheus-compatible on the API port |

Security context: runs as uid/gid `1000`, `runAsNonRoot`, `allowPrivilegeEscalation: false`,
`drop: [ALL]`, `seccompProfile: RuntimeDefault`, `fsGroupChangePolicy: OnRootMismatch` (avoids
recursive chown on large volumes). Base resource requests are `500m` CPU / `1Gi` memory, limit
`2Gi`.

#### StorageClass `minio-gp3`

Dedicated gp3 class
(`storageclass.yaml`),
separate from the `database` tier's `gp3`:

```yaml
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Retain      # EBS volumes are NOT deleted with the PVC — durable write buffer
allowVolumeExpansion: true
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  csi.storage.k8s.io/fstype: xfs   # recommended for MinIO on EBS
```

!!! danger "Retain reclaim policy"
    `reclaimPolicy: Retain` means removing a PVC leaves the EBS volume behind. Decommissioning
    requires **manual** PV/EBS cleanup. This is deliberate — MinIO is treated as a durable store
    where data loss is unacceptable.

#### Root credentials secret

`secret.yaml`
is a **placeholder** `Secret` named `minio-env-configuration` whose header instructs sealing it
with external-secrets/sealed-secrets before committing. It carries shell exports MinIO reads at
startup:

```bash
export MINIO_ROOT_USER=REPLACE_ME_ROOT_USER
export MINIO_ROOT_PASSWORD=REPLACE_ME_ROOT_PASSWORD
export MINIO_SITE_OBJECT_LOCK_ENABLED=on   # site-wide WORM (Write Once Read Many)
```

!!! danger "WORM is irreversible"
    `MINIO_SITE_OBJECT_LOCK_ENABLED=on` enables object locking (WORM) for all buckets site-wide.
    Per the file's own warning it cannot be disabled once data is written without potential data
    loss — appropriate for a durable write buffer but a one-way door.

### MinIO per-environment overlays

Both overlays add an ESO-synced `google-oidc-secret` (Google OIDC creds, also used by Grafana,
synced into `minio-ingest` so the AWS Load Balancer Controller can configure OIDC auth for the
Console Ingress) and a `minio-console` Ingress fronted by an OIDC-authenticated ALB. The Console
sits behind Google SSO (`auth-type: oidc`, 28800s session, `authenticate` on unauthenticated).

| Aspect | Staging (overlay) | Prod (overlay) |
|--------|---------|------|
| Drive size / resources | Base defaults (50Gi, small) — no patch | Patched to `500Gi` per drive (8 × 500Gi = 4TiB raw, ~2TiB usable), requests `2` CPU / `4Gi`, limits `4` CPU / `8Gi` |
| Console host | `minio.staging.cpt.aws.example.net` | `minio.prod.cpt.aws.example.net` |
| ALB | `staging-alb` (shared IngressGroup `group.name: staging-alb` with public-api metrics), `backend-protocol: HTTPS`, console port `9443` | `prod-alb`, static EIP allocations + subnet mappings, console port `9001` |
| ACM cert account | `444455556666` (staging) | `777788889999` (prod) |
| Extra RBAC | `aws-load-balancer-controller-secret-reader` Role/RoleBinding granting the kube-system ALB controller SA read on secrets in `minio-ingest` | (inherited via base + prod externalsecret) |

!!! note "Shared staging ALB re-homing"
    The staging Console Ingress joins the `staging-alb` IngressGroup so it shares one ALB with the
    public-api metrics Ingress. Both Ingresses must carry the same `group.name` or the second
    `CreateLoadBalancer` fails with `DuplicateLoadBalancerName`. Adding the group re-homes the ALB,
    so the controller recreates `staging-alb` once (new DNS suffix; external-dns repoints).

---

## Per-environment summary

| | Staging (`staging-cpt-aws`) | Prod (`prod-cpt-aws`) |
|--|------------------------------|------------------------|
| CNPG operator | Deployed | No overlay / not wired |
| Postgres cluster | 1 instance, 5Gi gp3, backups → `staging-cnpg-backups-444455556666` | Not present (comments say scale to 3 instances) |
| Valkey | Deployed, 1 replica, 2Gi | Not present |
| MinIO operator | Deployed (via controllers) | Deployed (via controllers) |
| MinIO tenant | Overlay exists, **commented out** in root | Overlay exists (500Gi), **commented out** in root |
| CNPG backup Terraform | `terraform/aws/staging/af-south-1/cnpg-backups` | No prod Terragrunt unit found |

The `database`-namespace data stores (CNPG operator, Postgres, Valkey) are **staging-only** today.
The `cluster.yaml` and `scheduled-backup.yaml` live in `base` but only a `staging` overlay wires
them, and account-specific backup values are hard-coded to the staging account.

---

## Operational notes

- **Namespaces:** `cloudnative-pg` (operator), `database` (Postgres cluster + Valkey),
  `minio-operator` (operator), `minio-ingest` (tenant). The `database` namespace is created by the
  postgres service; Valkey depends on it.
- **In-cluster endpoints:** Postgres RW `postgres-rw.database.svc.cluster.local:5432`; Valkey
  `valkey.database.svc.cluster.local:6379`. Neither enforces network-level auth in-cluster;
  Postgres role passwords are enforced by CNPG.
- **Backups / DR:** PITR via barman base backups (daily 02:00) + continuous WAL to S3, IRSA-scoped,
  30-day retention managed by barman. To restore, use CNPG's `barmanObjectStore` recovery bootstrap
  against `s3://staging-cnpg-backups-444455556666/`.
- **Eviction ordering:** Postgres, Valkey and the CNPG operator all sit at `openreplay-low`
  (`-20`) and are shed first under node memory pressure; MinIO tenant sits at `ingest-critical` and is
  protected. EBS PVCs survive reschedules.
- **Monitoring:** the CNPG cluster exposes a `PodMonitor` (`enablePodMonitor: true`) scraped by the
  staging kube-prometheus-stack; the MinIO tenant exposes Prometheus metrics on port 9000.
- **CRDs:** owned by the operators (`crds.create: true` for CNPG, `crds: CreateReplace` for MinIO).
  Removing an operator can strand CRs; the reconciliation ordering exists to avoid `no matches for
  kind Cluster`-style deadlocks.

---

## Legacy / cleanup flags

!!! danger "Committed OIDC credentials in the staging MinIO ExternalSecret"
    `overlays/staging/externalsecret.yaml`
    has a real-looking Google **OIDC client id and client secret** hard-coded in leading comment
    lines (a `GOCSPX-…` value). The manifest body correctly pulls these from Secrets Manager, so
    the comment is dead but leaks live-looking credentials into git history. It should be scrubbed
    and the credential rotated.

!!! warning "MinIO tenant is orphaned mid-migration"
    The tenant Flux `Kustomization` is commented out in both root overlays (`we are not ready for
    this yet`) while the operator runs. A full MinIO base/overlay tree (including a hand-copied
    prod overlay and a placeholder root-credentials secret) exists but reconciles nothing.

!!! warning "Placeholder root-credentials secret committed"
    `base/secret.yaml`
    is a plaintext `Secret` with `REPLACE_ME_ROOT_USER` / `REPLACE_ME_ROOT_PASSWORD` placeholders
    and a `REPLACE: seal with external-secrets…` header, yet it is committed and part of the base
    kustomization. There is no ExternalSecret for MinIO root creds — the tenant can't stand up
    without a real secret being supplied.

!!! note "No prod path for the shared data stores"
    Postgres, Valkey and the CNPG operator have **staging overlays only**. `cluster.yaml` hard-codes
    the staging account id in the backup `destinationPath` and IRSA role ARN, and no prod
    Terragrunt unit for `cnpg-backups` exists. The in-code comments (`bump to 3 for HA in prod`)
    describe an unbuilt prod deployment.

!!! note "Prod MinIO Ingress TLS host mismatch"
    In the prod `ingress.yaml`
    the rule host is `minio.prod.cpt.aws.example.net` but the `tls.hosts` block lists
    `minio-console.prod.cpt.aws.example.net`, and the prod console backend port (`9001`) differs from
    staging (`9443`). Worth reconciling before the prod tenant is enabled.

!!! note "Terraform ↔ manifest values are hand-synced"
    `_modules/cnpg-backups` outputs (`bucket_name`, `role_arn`, `service_account_annotations`) are
    meant to feed the CNPG `Cluster` manifest, but the manifest hard-codes them. Bucket name and
    role ARN must be kept in sync manually across Terraform and Kubernetes.
