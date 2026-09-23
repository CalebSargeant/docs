# Backup & disaster recovery

Where each datastore's data lives, how it is backed up, and — the part that was missing — **how to restore it**. Backup *configuration* is spread across several Terraform modules and the CNPG cluster manifest; this page consolidates the posture and adds the restore runbooks.

## Datastores at a glance

| Datastore | Holds | Where |
|-----------|-------|-------|
| **MongoDB Atlas** | The capture capture events (`ingest.captures`) and watchlist log (`ingest.VOIlog`) — the primary capture datastore | External MongoDB Atlas (SaaS), reached over AWS PrivateLink |
| **RDS MySQL** (`capture_admin_portal`) | Admin/portal + camera config data | AWS RDS (prod `db.m5.xlarge`, staging `db.t4g.micro`) |
| **CloudNativePG** (Postgres) | Shared in-cluster Postgres (see [Data services](kubernetes-data-services.md)) | In-cluster CNPG, 1 instance, 5 Gi gp3 |
| **S3** (`example-prod-media`, …) | Camera capture images | AWS S3 |
| **MinIO** | Durable write buffer | In-cluster (`minio-ingest`) |

## Backup posture

| Datastore | Mechanism | Schedule | Retention | Restore path |
|-----------|-----------|----------|-----------|--------------|
| CNPG Postgres | `barman-cloud` continuous WAL + base backups to S3 (PITR), IRSA-authed | Continuous | **30 d** (`retentionPolicy`; bucket `noncurrent_days = 30`) | Recovery `Cluster` from the barman store (below) |
| RDS MySQL | Automated backups + a **final snapshot on delete** (`skip_final_snapshot = false`); `deletion_protection = true`; `multi_az = true` | Daily, **03:00–04:00 UTC** (maintenance Sun 04:00–05:00 UTC) | **7 days** | Restore-from-snapshot / PITR (below) |
| MongoDB Atlas | Atlas-managed backups (external) | **To be confirmed** | **To be confirmed** | Atlas console/API (below) |
| S3 image buckets | Bucket versioning + lifecycle | — | Versioned; objects **expire at 550 days** | Restore prior object version |
| MinIO | Durable write buffer, WORM enabled — **no backup to a second location** | — | — | Not a restore source; see [Data services](kubernetes-data-services.md) |
| Long-term MySQL archive | `mysql-archival` CronJob copies rows >18 mo to `s3://example-prod-backups/database_archives/` | Monthly | S3 | Manual re-import (`db_rollback.sh`, see platform-utils) |

Values above are the configured defaults in
`_modules/rds/variables.tf`,
`_modules/cnpg-backups`
and `_modules/s3/main.tf`;
neither the prod nor the staging leaf overrides the RDS values.

### Recovery objectives

These are **observed capability derived from the configuration above**, not agreed service levels.
Agreeing targets with the business is an open item.

| Datastore | Effective RPO | Effective RTO | Notes |
|-----------|---------------|---------------|-------|
| RDS MySQL | Seconds (PITR within the 7-day window) | Hours — a restore creates a **new instance**, so DNS/secrets must be repointed | Recoverable window ends at **7 days**; there is no copy beyond it |
| CNPG Postgres | Seconds (continuous WAL) | Hours — recovery provisions a new `Cluster` | Staging only; prod has no CNPG cluster |
| MongoDB Atlas | **Unknown** — Atlas policy not recorded | **Unknown** | Primary capture datastore; see the admonition below |
| S3 images | Version-level | Minutes per object | No cross-region or cross-account copy |
| Cluster (EKS) | N/A — rebuilt from Git | Hours, unrehearsed | [Flux bootstrap](../runbooks/flux-bootstrap.md) |

!!! note "Scope of the current posture"
    All backup here is **per-service native**. There is no AWS Backup plan or vault, no immutable or
    cross-account copy, and no secondary region — single-region is the current deliberate posture.
    Nothing in this table has been verified by a rehearsed restore; see
    [Restore verification](#restore-verification).

## Restore — CloudNativePG (Postgres)

CNPG streams WAL + base backups to `s3://<env>-cnpg-backups-<account-id>/` (e.g. `staging-cnpg-backups-444455556666/`) — the bucket and IRSA role are in `_modules/cnpg-backups`, wired into `spec.backup.barmanObjectStore` of the CNPG cluster manifest. Retention is 30 days, so point-in-time recovery is possible to any moment in that window.

Recovery **provisions a new `Cluster`** that bootstraps from the barman store — it does not restore in place:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: postgres-restore, namespace: <ns> }
spec:
  instances: 1
  storage:
    size: 5Gi
    storageClass: gp3
  serviceAccountTemplate:
    metadata:
      annotations:
        eks.amazonaws.com/role-arn: <ARN>  # same role as the primary cluster; find it in _modules/cnpg-backups Terraform output
  bootstrap:
    recovery:
      source: barman-backup
      # omit recoveryTarget to restore to the latest WAL, or set a PITR target:
      # recoveryTarget: { targetTime: "<YYYY-MM-DD HH:MM:SS+00>" }
  externalClusters:
    - name: barman-backup
      barmanObjectStore:
        destinationPath: s3://<env>-cnpg-backups-<account-id>/
        endpointURL: https://s3.af-south-1.amazonaws.com
        s3Credentials: { inheritFromIAMRole: true }
```

!!! warning "Recovery is out-of-place"
    CNPG recovery bootstraps a **fresh** cluster from the backup. Validate it, then repoint the consuming apps' connection at the recovered cluster (or promote/rename). Never delete the original until the restore is verified.

## Restore — RDS MySQL

RDS keeps automated backups for `backup_retention_period` days and takes a **final snapshot** named `<env>-db-final-snapshot-<timestamp>` when the instance is destroyed (`skip_final_snapshot = false`). `deletion_protection` guards prod against accidental teardown.

- **Point-in-time restore** (within the retention window) or **restore from a snapshot** creates a *new* instance:
  ```bash
  aws rds restore-db-instance-to-point-in-time \
    --source-db-instance-identifier <env>-db --target-db-instance-identifier <env>-db-restore \
    --restore-time 2026-07-29T09:00:00Z --profile prod
  # or from a specific snapshot:
  aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier <env>-db-restore --db-snapshot-identifier <snapshot-id> --profile prod
  ```
- Then repoint the app (update the DB host secret) once the restored instance is available.
- For exporting/importing a snapshot to S3 (e.g. to seed staging), see the [RDS snapshot export runbook](../runbooks/rds-snapshot-export.md).

## MongoDB Atlas — the primary capture datastore

The capture data lives in **MongoDB Atlas** (external SaaS), reached from the clusters over the AWS **PrivateLink** provisioned by `_modules/mongodb-private-link` (a VPC endpoint; note there is currently no live Terraform leaf for it — see the [legacy inventory](legacy-and-orphans.md)). Workloads connect using the `MONGODB_URI` secret; the utility jobs read collections such as `ingest.captures` and `ingest.VOIlog`.

!!! warning "Operator input needed — Atlas is external to this repo"
    The Atlas account is **not** described anywhere in Git. For handover, confirm and record here: the Atlas **organisation / project / cluster** name, its **region and tier**, **who owns/administers** the account, and the **Atlas backup policy** (snapshot schedule + retention) and restore procedure. Atlas backups and restores are driven from the Atlas console/API, not from this repo.

## SOPS/Age keys

Restoring or standing up a cluster also needs the Age private key that decrypts every SOPS secret.
The encryption mechanics are in [Secrets (SOPS + Age)](secrets-sops.md); **where the key is held and
who can retrieve it** is tracked in [Secret stores](secret-stores.md).

!!! warning "The Age key is a prerequisite for cluster recovery"
    Without it a rebuilt cluster cannot decrypt anything, and several Terragrunt leaves cannot even
    plan. Confirm access to the key before relying on any recovery procedure on this page.

## Restore verification

No restore path on this page has been recorded as tested. This table is the record — update it
whenever a restore is exercised, including on staging.

| Restore path | Last verified | Verified by | Notes |
|--------------|---------------|-------------|-------|
| RDS MySQL PITR | Never recorded | — | |
| RDS snapshot restore | Never recorded | — | |
| CNPG recovery `Cluster` | Never recorded | — | Staging only |
| MongoDB Atlas restore | Never recorded | — | Procedure not yet documented |
| S3 object version restore | Never recorded | — | |
| Cluster rebuild (Flux bootstrap) | Never recorded | — | See [Flux bootstrap](../runbooks/flux-bootstrap.md) |

!!! note "Why this table exists"
    An untested restore is a plan, not a capability. Recording "never verified" honestly is more
    useful to whoever is on call than an implied guarantee — and it makes the first rehearsal easy
    to prioritise.
