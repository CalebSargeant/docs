# Storage & data ops

This page documents the storage and data-lifecycle utilities that live in the
sibling repository platform-utils.
These tools deal with S3 sizing/costing and MySQL data archival, plus a couple of
one-off, developer-local working sets that are checked in (or left) under `src/` but are
**not** built or deployed.

Four components are covered:

| Component | Language | Built image? | Deployed? | Cadence |
|-----------|----------|--------------|-----------|---------|
| [`s3-bucket-size`](#s3-bucket-size) | Bash | Yes (`ghcr.io/example-org/s3-bucket-size`) | Yes — CronJob | Monthly |
| [`s3-sums`](#s3-sums) | Python | No | No | Local analysis only |
| [`mysql-archival`](#mysql-archival) | Bash | Yes (`ghcr.io/example-org/mysql-archival`) | Yes — CronJob | Monthly (prod), monthly dry-run (staging) |
| [`client-c-migration`](#client-c-migration) | n/a (docs + data) | No | No | One-off working set (untracked) |

!!! note "Two of these are not container components"
    Only `s3-bucket-size` and `mysql-archival` are real deployable utilities with a
    `Dockerfile`, a `docker-bake.hcl` target, and Kubernetes manifests. `s3-sums`
    and `client-c-migration` are developer-local working directories that happen to sit under
    `src/`. `s3-sums` has no committed source at all (only a `__pycache__/` and a
    `venv/`), and `client-c-migration` is entirely untracked (`git status` shows `?? src/client-c-migration/`).
    They are documented here for completeness so a new owner knows what they are and why
    nothing deploys them.

---

## s3-bucket-size

A Bash utility that walks every S3 bucket in an AWS account and reports each bucket's total
size and object count to a CSV, with special recursive per-prefix handling for the very large
`example-prod-media` bucket. It can be run locally against a named AWS profile, or on a schedule as a
Kubernetes CronJob for periodic storage audits.

- **Language:** Bash (single script)
- **Source:** `src/s3-bucket-size/s3-bucket-size.sh`,
  `README.md`
- **Key tooling:** `aws` CLI (`s3 ls`, `s3api list-objects-v2`), `jq`, `awk`

### What it does

- Lists all buckets (`aws s3 ls`) and, for each, runs `aws s3 ls --recursive --human-readable --summarize`
  to extract **Total Objects** and **Total Size**, appending a row to `allregions-buckets-s3-sizes.csv`
  (header `Bucket/Path,Objects,Size`).
- **Special-cases `example-prod-media`:** instead of sizing the whole (huge) bucket, it marks it `SKIPPED`
  and recurses into its prefixes with `analyze_subdirectories()`, using `s3api list-objects-v2 --delimiter '/'`
  to discover common prefixes and descending **up to 3 levels deep** (`if [ ${depth} -lt 3 ]`).
- Writes a live progress log `s3_calculation_progress.log` (tail-able while running) and prints
  formatted result boxes per prefix.
- Cleans up and recreates the CSV/progress files on each run.

The AWS profile is controlled by `PROFILE` (defaults to `default`); locally you run e.g.
`PROFILE=prod ./s3-bucket-size.sh`.

### Dockerfile & image

- **Base image:** `ubuntu:22.04` (Dockerfile)
- Installs `awscli`, `jq`, `bash`, `curl`, `ca-certificates`, `tzdata`; runs as non-root user `s3user` (uid 1000);
  `ENTRYPOINT` is the script.
- **Built image:** `ghcr.io/example-org/s3-bucket-size` (tags `:${VERSION}` and `:latest`), from the
  `s3-bucket-size` bake target in
  `docker-bake.hcl`
  (context `src/s3-bucket-size`). It is part of the default build group, so it builds with the rest of the fleet.

### Kubernetes deployment

Deployed as a **CronJob** in the `misc` namespace.

- **Base manifest:** `k8s/base/s3-bucket-size/cronjob.yaml`
- **Schedule:** `0 2 1 * *` — **monthly, 1st of the month at 02:00 UTC**
- **Job policy:** `concurrencyPolicy: Forbid`, `activeDeadlineSeconds: 14400` (4h cap for large scans),
  `backoffLimit: 2`, `ttlSecondsAfterFinished: 86400`, `restartPolicy: Never`, history limits 3/3.
- **Hardened pod:** `runAsNonRoot`, uid 1000, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`,
  drops all capabilities; an `emptyDir` is mounted at `/app/output`.

**Config & credentials:**

- A `ConfigMap` `s3-bucket-size-config` supplies `AWS_REGION: us-east-1` (injected as env `AWS_REGION`).
- **AWS auth is via IRSA — no static keys in-cluster.** The `s3-bucket-size` ServiceAccount is annotated:

  ```yaml
  eks.amazonaws.com/role-arn: "arn:aws:iam::777788889999:role/s3-bucket-size-role"
  ```

!!! note "README vs. actual deployment"
    The component README shows an optional variant using static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
    env vars and even an `amazon/aws-cli` base image. The **committed, deployed** setup does neither: the real
    `Dockerfile` is Ubuntu-based, and the real CronJob authenticates with the IRSA role above and only needs
    S3 read permissions (`s3:ListAllMyBuckets`, `s3:ListBucket`, `s3:GetBucketLocation`).

!!! warning "Output is ephemeral"
    The CSV and progress log are written into the container filesystem / `emptyDir` and are **not** shipped
    anywhere (no S3 upload, no Slack). In the CronJob you read results from the pod logs. If you need durable
    or notified output, that has to be added.

**Prod overlay:** `k8s/overlays/prod/s3-bucket-size/kustomization.yaml`
pins the image to `newTag: v0.1.0`. There is also a staging overlay
(`k8s/overlays/staging/s3-bucket-size/`).

### Flux / platform-infra wiring

The CronJob image line and the overlay `newTag` both carry the marker
`# {"$imagepolicy": "flux-system:s3-bucket-size:tag"}`, so Flux image automation updates the pinned tag as new
images are published. platform-infra drives this via its Flux `GitRepository` on `platform-utils` and a
`Kustomization` pointing at the prod overlay path.

---

## s3-sums

A Python **S3 storage-cost analysis / modelling toolkit**.
It projects and compares the cost of holding capture/camera-image data across S3 storage classes over a
24-month horizon and emits a report with charts.

!!! warning "Not deployed, and source is not committed"
    `src/s3-sums/` contains **only** a `__pycache__/` (compiled `*.cpython-314.pyc`) and a local `venv/`.
    There is **no committed `.py` source, no `Dockerfile`, no `docker-bake.hcl` target, and no `k8s/` manifests.**
    It is an analyst's local working directory. Everything below is reconstructed from the compiled modules and
    is here so a new owner understands what the folder is — treat it as an offline spreadsheet-style analysis,
    not a running service.

### What it does (from the compiled modules)

The toolkit is organised as a set of cooperating modules:

- **`main.py`** — orchestrator ("S3 STORAGE COST ANALYSIS / the platform Systems"). Reads CSV files from a
  `data/` directory (S3 billing exports), optionally runs a sampling pass (`--sample`), projects costs, and
  drives chart/report generation.
- **`calculations.py`** — "Centralized S3 Cost Calculations Module", the single source of truth for
  **af-south-1** pricing constants (`STANDARD_STORAGE_RATE`, tiered `..._50TB/_450TB/_500TB`,
  `GLACIER_RATE`, `GLACIER_RETRIEVAL`, `IT_DEEP_ARCHIVE_RATE`, `TIER1/2/4_RATE`, `MIN_SIZE_GLACIER_IR_KB`,
  etc.) and cost↔GB-month conversion helpers.
- **`generate_report.py`** — writes a `REPORT.md` with sections and links to discovered graphs
  (executive summary, cumulative costs, cost-per-GB, cost-per-million-objects, break-even, IT-vs-Glacier crossover…).
- **`hybrid_migration.py`** / **`hybrid_glacier.py`** — model "keep old Intelligent-Tiering data static, send new
  data to S3 Standard / Glacier IR from month _N_" scenarios.
- **`direct_upload_comparison.py`**, **`simple_comparison.py`**, **`analyze_it_breakeven.py`** — additional
  scenarios comparing S3 Standard, Intelligent-Tiering (+ Deep Archive), and Glacier Instant Retrieval, and
  analysing what access rate would make IT cheaper than Glacier IR.

**Inputs/outputs:** input is CSV billing-export data in a `data/` directory; output is charts plus a generated
`REPORT.md`. There are no AWS credentials or secrets involved — it is pure offline cost arithmetic.

---

## mysql-archival

A containerised maintenance job that **archives old MySQL rows to S3 and then prunes them from the database**,
reclaiming space in the capture admin-portal database. Runs as a monthly CronJob (with a dry-run staging variant)
and ships a companion rollback script for restoring archived data from S3.

- **Language:** Bash
- **Source:** `src/mysql-archival/` —
  `scripts/db_archival.sh`
  (main), `scripts/db_rollback.sh`
  (restore), `scripts/healthcheck.sh`,
  `README.md`,
  `ROLLBACK_PLAN.md`

### Archival flow

The `db_archival.sh` script (`set -e`, structured logging to `/tmp/db_archival_<ts>.log`) archives data **older
than 18 months** (`ARCHIVE_DATE` = now − 18 months, computed per-OS for Linux/macOS):

1. **Prerequisite checks** — `DB_PASSWORD` must be set (no default, for safety); verifies MySQL connectivity
   (`SELECT 1`), the AWS CLI, and S3 bucket access before touching anything.
2. **Export** each target table's older-than-18-months rows to a `.csv.gz`, plus a `.sql.gz` schema dump.
3. **Upload** to S3 under `database_archives/<DB_NAME>/<table>/…` and **verify the upload** before deleting.
4. **Delete** archived rows from the DB in batches (`BATCH_SIZE`, default `10000`).
5. **Optimize** tables to reclaim disk space.

**Tables archived** (per the README): `up_down_status`, `voi_item_log`, `search_reason`, `search_log`,
`user_log`.

**Archive layout in S3** (from `ROLLBACK_PLAN.md`):

```text
s3://example-prod-backups/database_archives/capture_admin_portal/
├── up_down_status/  <table>_archive_<YYYYMMDD_HHMMSS>.csv.gz + _schema_...sql.gz
├── search_log/      ...
├── search_reason/   ...
├── voi_item_log/    ...
└── logs/            db_archival_<ts>.log
```

Safety features: dry-run mode, S3-upload verification before any delete, batched deletes, signal handling for
graceful interruption, and retrying health checks (S3 read/write with exponential backoff, DB connectivity).

### Rollback flow

`db_rollback.sh` restores archived data from S3 back into MySQL. See
`ROLLBACK_PLAN.md`
for the full runbook. Key commands:

```bash
./scripts/db_rollback.sh --list                          # list available archives
./scripts/db_rollback.sh --table up_down_status          # restore latest for a table
./scripts/db_rollback.sh --table up_down_status --date 20250806   # point-in-time
./scripts/db_rollback.sh --dry-run --table search_log    # preview
```

Restoration uses `LOAD DATA LOCAL INFILE` (tab-separated, ignore header) with `INSERT IGNORE` semantics to
tolerate overlapping data.

### Dockerfile & image

- **Base image:** `ubuntu:22.04` (Dockerfile)
- Installs `mysql-client`, `awscli`, `gzip`, `curl`, `ca-certificates`, `tzdata`; runs as non-root `dbarchiver`
  (uid 1000). Has a container `HEALTHCHECK` running `/app/healthcheck.sh`; `ENTRYPOINT` is `db_archival.sh`.
- **Built image:** `ghcr.io/example-org/mysql-archival` (`:${VERSION}` and `:latest`), from the
  `mysql-archival` bake target in
  `docker-bake.hcl`
  (context `src/mysql-archival`). Part of the default build group.

### Kubernetes deployment

Deployed as CronJob **`mysql-db-archival`** in the `misc` namespace
(`k8s/base/mysql-archival/cronjob.yaml`).

- **Prod schedule:** `0 2 1 * *` — **monthly, 1st at 02:00 UTC**, `DRY_RUN=false`.
- **Staging schedule:** `0 3 15 * *` — **monthly, 15th at 03:00 UTC**, patched to `DRY_RUN=true`
  (see staging overlay).
- **Job policy:** `concurrencyPolicy: Forbid`, `activeDeadlineSeconds: 14400` (4h cap), `backoffLimit: 1`,
  `ttlSecondsAfterFinished: 86400`, `restartPolicy: Never`.
- **Hardened pod:** non-root uid 1000, `readOnlyRootFilesystem: true`, no privilege escalation, all caps dropped;
  an `emptyDir` mounted at `/tmp` for the working files.

**Config (`ConfigMap` `mysql-archival-config`):**

| Key | Value |
|-----|-------|
| `DB_HOST` | `db-proxy.internal.prod.cpt.aws.example.net` |
| `DB_USER` | `captureadmin` |
| `DB_NAME` | `capture_admin_portal` |
| `S3_BUCKET` | `example-prod-backups` |
| `BATCH_SIZE` | `10000` |
| `DRY_RUN` | `false` (patched to `true` in staging) |

**Secrets (`Secret` `mysql-archival-secret`, injected as env):** `DB_PASSWORD`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`. The base manifest ships placeholder values
(`REPLACE_WITH_ACTUAL_*`) — real values are supplied out-of-band (the README notes SOPS encryption).

!!! note "Auth model differs from s3-bucket-size"
    Unlike `s3-bucket-size` (IRSA role), `mysql-archival` uses **static AWS access keys** from a Kubernetes
    Secret. Per the README these belong to an IAM user `db-archival-service-prod` writing to the
    `example-prod-backups` bucket, whose S3 lifecycle policy transitions archives Standard → Standard-IA →
    Glacier → Deep Archive over time.

**Overlays:** prod
and staging
both pin `newTag: v0.1.0` and carry the `# {"$imagepolicy": "flux-system:mysql-archival:tag"}` marker for Flux
image automation, driven from platform-infra's Flux `GitRepository`/`Kustomization` the same way as
`s3-bucket-size`.

---

## client-c-migration

A **one-off, developer-local working set** for a City of Cape Town (Client C) capture migration / VPN-outage
investigation. It is **not** a container component: it has no `Dockerfile`, no `docker-bake.hcl` target, and no
`k8s/` manifests, and the entire directory is **untracked in git** (`git status` reports `?? src/client-c-migration/`).
It is documented here only so an owner knows what the folder contains and that nothing builds or deploys it.

**Contents on disk** (`src/client-c-migration/`):

- `RCA-tunnel2-ipsec-phase2.md` — a Root Cause Analysis (dated 2026-07-02, by the platform engineer) of a ~7-hour
  Client C capture-event outage caused by a RouterOS 7.23 IPsec phase-2 regression on the Client C TMC MikroTik
  CCR2004 terminating the AWS Site-to-Site VPN. (Cross-refers the broader AWS↔Client C VPN topology.)
- `reachability.log`, `reachability2.log` — probe/ping output captured during that investigation.
- `kubeconfigs` — cluster access material used during the work.
- `camera_profile.csv` — an export of the Client C camera fleet (~314 Client C capture cameras): device id, name/location,
  host/port/protocol, coordinates, model/make/serial/firmware, VPN and reachability flags, NTP config, etc.
- `.env` — a read-only Mongo connection string (`MONGO_URI_READ_ONLY`) used to query the Client C capture data.
- `client_c_readonly` — a read-only access credential/key.

!!! warning "Sensitive, untracked, and not a deployable"
    This directory holds live-looking operational data and credentials (a Mongo URI, a `client_c_readonly` key, and
    a camera CSV that includes per-camera hostnames and login/password columns). It is deliberately not committed
    and must never be baked into an image or checked in. There is nothing to "run" here — it is investigation
    scratch and reference data tied to the Client C migration/outage work, distinct from the recurring utilities
    above. If you are cleaning up `src/`, treat this as data to preserve/secure or remove locally, not as code to
    maintain.
