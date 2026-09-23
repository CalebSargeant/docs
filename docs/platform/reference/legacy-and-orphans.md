# Legacy & Orphans

A repo-wide sweep of obsolete, orphaned, superseded, duplicated, mid-migration,
and accidentally-committed material in `platform-infra`. This page is the
consolidated cleanup backlog: each item is documented so a maintainer can decide, per
item, whether to **delete**, **migrate**, **archive**, **review**, or **keep**.

!!! success "Cleanup progress — some items already actioned"
    A cleanup PR has already **deleted** several high-confidence items below: the committed
    secrets (Azure AVD password, the Google OAuth comment, the rendered `ecosystem.config.js`,
    `ansible/inventory.ini`), the 12.9 MB `amp-migrate` binary, `.old.enc.tar.gz`, and the
    orphaned inline staging capture manifest tree. Those values remain in git **history** — rotate
    any real credentials. The rest of this list is still open.

!!! note "Scope and cross-references"
    Several subsystems carry their own legacy sections (Kubernetes controllers,
    Kubernetes utils, capture platform, Terraform AWS/Azure, CI/CD). Where a finding
    is already documented in depth there, this page summarises and points at it
    rather than repeating everything. The GitHub source links are absolute so the
    page survives a strict MkDocs build.

## The big three (committed binary artefacts & opaque archives)

These are the highest-value cleanups — large binary blobs committed into a
config/IaC repo.

| Item | Size | What it is | Recommendation |
| --- | --- | --- | --- |
| `kubernetes/…/observability/overlays/prod/amp-migrate` | ~12.9 MB | A compiled **Mach-O 64-bit arm64 executable** (the built output of `amp_query_migrate.go`), committed with mode `100755` into a Kustomize overlay. | **delete** — never commit compiled binaries; rebuild from source if needed |
| `.old.enc.tar.gz` | ~4.4 MB | An opaque SOPS/encrypted tarball at the repo root. **Tracked in git despite** `.gitignore` carrying `.old*`. Contents unknown from the repo. | **review** then **archive/delete** — move out of the live repo history |
| `PROJECT_INDEX.json` | ~10 KB | A generated repo index at root. Intentionally tracked as the Claude Code structural index; regenerate after major refactors per `CLAUDE.md`. | **keep** |

!!! danger "The `amp-migrate` binary should not be in git"
    A 12.9 MB architecture-specific executable bloats every clone and cannot be
    reviewed. It is the compiled twin of the `amp_query_migrate.go` source that
    sits next to it. Delete the binary; keep (or also retire) the source — see the
    AMP migration section below.

## `dockerfiles/` — all legacy (image builds moved to `platform-utils`)

The repo's own guidance is explicit. `.claude/COMMON_MISTAKES.md` states:
*"container builds moved to the sibling repo platform-utils. `dockerfiles/` is
legacy"*, and `docs/index.md`
says the directory *"is legacy and should not be extended."*

Everything under `dockerfiles/`
is therefore superseded source. The running images are built and published from
`platform-utils`; the Flux wiring for these apps lives under
`kubernetes/apps/utils/`. The copies here are historical.

| Directory | Files | Former purpose | Notes |
| --- | --- | --- | --- |
| `camera-image-size-report/` | `Dockerfile`, `main.py`, `requirements.txt` | Report on per-camera image sizes | Now a `utils` CronJob built in platform-utils |
| `camera-console/` | `Dockerfile`, `app.py`, `requirements.txt`, `deployment.yaml`, `templates/cameras.html` | Flask camera-console web app (namespace `misc`, `replicas: 2`) | Ships via `kubernetes/apps/camera-console`. The loose `deployment.yaml` here is **not** referenced by any Kustomize base — a stray manifest |
| `mysql-archival/` | `Dockerfile`, `README.md`, `ROLLBACK_PLAN.md`, `scripts/{db_archival,db_rollback,healthcheck}.sh` | Archive MySQL data >18 months old to S3 + DB maintenance | Full runbook + rollback plan; a genuine one-off migration tool |
| `capture-exporter/` | `test-query.js` **only** | capture capture-count Prometheus exporter | **Orphan stub** — no `Dockerfile`; the real exporter lives in platform-utils (see the capture-exporter memory) |
| `sonic-stragglers-report/` | `Dockerfile`, `main.py`, `test_connection.py`, `.gitignore` | Report "sonic" straggler connections | Committed `.gitignore` warns "SSH Keys — NEVER commit these" |
| `watchlist-log-items/` | `Dockerfile`, `main.py`, `utils.py`, `README.md` | Watch watchlist log items in MongoDB, alert to Slack | Containerised version of the old watchlist alerter |

!!! warning "Do not extend `dockerfiles/`"
    New container work belongs in `platform-utils`. Treat this directory as
    read-only history. Recommendation for the whole tree: **archive** (or delete
    once confirmed the utils repo is authoritative for every one of these apps).

## AMP → Prometheus migration tooling (one-off, complete)

A self-contained one-off migration that pulled historical metrics out of AWS
Managed Prometheus (AMP, workspace `ws-aaaa1111-…`, Shared account
`123456789012`) into the in-cluster Prometheus. It lives — unusually — **inside a
Flux Kustomize overlay** but is **not referenced** by that overlay's
`kustomization.yaml`,
so Flux never applies it. The AMP source is now dead (superseded by the
kube-prometheus-stack / Thanos topology), so the whole set is spent.

| File | Purpose | Recommendation |
| --- | --- | --- |
| `amp_query_migrate.go` | The migrator (SigV4-signed AMP query → remote-write into local Prometheus) | **archive** — move to a tools repo or delete |
| `go.mod` / `go.sum` | Go module for the migrator, sitting inside a k8s overlay | **delete** with the source |
| amp-migrate | Compiled 12.9 MB binary of the above | **delete** (see big-three) |
| `run_migration.sh` | Local driver (port-forwards Prometheus, chunked backfill, checkpoint file) | **archive** |
| `amp-migrate-job/` | In-cluster Job variant: `job.yaml`, `job-prod-amp.yaml`, `serviceaccount.yaml`, `setup-iam.sh`, `teardown.sh` | **archive** — Job has `backoffLimit: 0`, resumes from a checkpoint PVC |

!!! note "Not wired to Flux"
    None of the `amp-migrate*` paths appear in the overlay `kustomization.yaml`.
    They were run by hand (`run_migration.sh`) or applied ad-hoc. Keeping them in
    the reconciled tree risks confusion; move them out.

## Dashboard generators & archived dashboards (observability)

Under `…/observability/base/grafana/dashboards/`:

- `gen_cameras.py`
  and `gen_routers.py`
  are Python generators that emit the committed `cameras.json` / `routers.json`
  dashboards. **They are not referenced by any `kustomization.yaml`** — Grafana
  loads the JSON, not the generators. They are developer helper scripts checked
  in beside their output. Recommendation: **keep** (useful), but document that the
  JSON is generated and hand-edits will be overwritten on the next `python
  gen_*.py`.
- `.archive/`
  holds **12 explicitly-retired dashboards** (`blackbox-exporter-public.json`,
  `fluent-bit-public.json`, `krr-custom.json`, `loki-operational-upstream.json`,
  `mongodb-public.json`, `mysql-exporter-public.json`, `ping2-custom.json`,
  `postgres-exporter-public.json`, `redis-exporter-public.json`, and four
  `thanos-*-upstream.json`). These were consolidated away (see the Grafana camera
  dashboard consolidation work). Recommendation: **keep as archive** or **delete**
  once no one needs the reference copies — they are dot-prefixed so Kustomize
  ignores them.

## Ansible — legacy roles & a superseded duplicate

Under `ansible/roles/`:

| Role | Status | Detail |
| --- | --- | --- |
| v1_app | **Legacy architecture** | Bootstraps the pre-Kubernetes "v1" admin app onto VMs (`/home/{{user}}/repos/admin-{backend,frontend}`). Wired via `v1_app_bootstrap.yaml` and `cpt/jhb … v1` host groups in `_hosts.yaml`. Templates under `templates/dist_*/` are git-ignored |
| v1_driver | **Legacy architecture** | The v1 capture-driver VM bootstrap counterpart. Wired via `v1_driver_bootstrap.yaml`. Corresponds to the `OLD_DRIVER_*` addressing still referenced in capture secrets |
| k8s-fluxcd-bootstrap | **Superseded duplicate** | Replaced by `k8s-fluxcd-bootstrap-improved`, which is the role the live playbooks (`k8s_bootstrap_prod_cpt.yaml`, `k8s_bootstrap_staging_cpt.yaml`) actually call. The old role appears orphaned |

Recommendation: `v1_app` / `v1_driver` — **keep** while any v1 VM still runs, else
**archive**; `k8s-fluxcd-bootstrap` (non-improved) — **review/delete** if no
playbook references it.

## `root.hcl` — placeholder region & unused environments/regions

In `terraform/aws/root.hcl`:

- **`testing123` region** (network env, CIDR `10.161.160.0/19`) — a
  placeholder/test region name. **No leaf directory** references it. Cruft in the
  network env map. Recommendation: **delete**.
- **`dev` environment** (account `111122223333`, CIDR `10.161.128.0/19`) — defined
  in the environments map but there is **no `terraform/aws/dev/` directory** and no
  Kubernetes overlay for it. A declared-but-unused environment. Recommendation:
  **review** (delete if dev is not a real target).
- **`eu-central-1` region** — declared for both `network` and `prod` (Frankfurt,
  CIDR `10.119.x`) but **no `eu-central-1` leaf directory exists** anywhere under
  `terraform/aws`. Declared-but-unbuilt region. Recommendation: **review**.
- **Commented-out generator blocks** — the trailing `generate "locals"` (fortigate
  locals) and the `sops` provider/`sops_version` blocks (lines ~104, ~203–229) are
  dead commented HCL. Recommendation: **delete** or restore intentionally.

## Local `.terragrunt-cache/` directories (on disk, not committed)

Present on disk in this worktree:

- `terraform/aws/staging/af-south-1/openreplay/.terragrunt-cache` (~896 KB)
- `terraform/aws/staging/af-south-1/cnpg-backups/.terragrunt-cache` (~892 KB)

These are **git-ignored** (`.gitignore` has `.terragrunt-cache/`) and **not
tracked** — local Terragrunt run artefacts, not committed cruft. Safe to
`rm -rf`. Recommendation: **delete** locally; no repo action needed. Consistent
with the newly-built (unapplied-in-CI) OpenReplay and CNPG-backups staging units.

```bash
find terraform -type d -name .terragrunt-cache -exec rm -rf {} +
```

## Security-flavoured stragglers (TODO / plaintext secrets)

| Location | Issue | Recommendation |
| --- | --- | --- |
| `terraform/azure/prod/southafricanorth/avd/terragrunt.hcl` (~line 62) | `admin_password = "P@ssw0rd123!"  # TODO: Use Azure Key Vault or generate randomly` — a hard-coded AVD admin password | **review — high priority**: move to Key Vault / random |
| `kubernetes/overlays/staging-cpt-aws/apps/edge-capture/capture-driver/secret.yaml` | `# todo: encrypt with sops` — an unencrypted secret manifest | **review** (though the whole inline capture tree is orphaned — see below) |

Other benign `TODO`s were found in Ansible flux-bootstrap tasks (`changed_when`
hygiene, macOS `~/.zshrc` note) and `github-runner/base/statefulset.yaml` ("Add
more tools here"). These are minor notes, **keep**.

## Cross-referenced legacy (documented in depth elsewhere)

These are real legacy/orphan items whose primary write-up lives on another page.
Listed here so the sweep is complete.

- **Orphaned inline staging capture manifests** —
  `overlays/staging-cpt-aws/apps/edge-capture/`
  and the sibling `apps/kustomization.yaml` aggregator are **not referenced by the
  staging root** `kustomization.yaml`; the whole inline tree is dead code
  superseded by the app-repo GitOps model. Includes commented-out ingresses and a
  hardcoded `10.161.64.109` external-endpoint hack. See the capture platform page.
- **`staging-cpt-aws/common/`** overlay (references cert-manager) — un-wired,
  stale. See the Kubernetes controllers page.
- **cert-manager** — commented out of `controllers/kustomization.yaml`; manifests
  exist but are only referenced by the orphaned staging `common/` overlay. TLS is
  actually terminated by AWS ACM on the ALBs. See Kubernetes controllers.
- **`camera-console` base** — `kustomization.yaml` omits `serviceaccount.yaml` and
  `externalsecret.yaml` that sit in the same directory, so the pull-secret/SA are
  not created. See the capture platform page.
- **Terraform orphans** — `workspaces` module (no leaf references it),
  `config-fortigate` (broken/orphaned), `cross-account-grafana` (hard-coded shared
  role ARN + accepted-but-unused `environment` var), observability's
  required-but-unused `oidc_provider_arn`, and network-edge "no-op kept for older
  state" blocks. See the Terraform AWS platform-data / overview / network-edge
  pages and the Terraform Azure page.
- **`README.md` drift** — the root README describes a `kubernetes/base/` +
  `kubernetes/_common/` layout and components (`work-cameras`, `up-down-status`)
  that **no longer exist**; the real layout is `kubernetes/{apps,infrastructure,
  overlays,docs}`. Recommendation: **review/rewrite**.
- **Flux CRD deprecation warnings** — `overlays/prod-cpt-aws/flux-system/
  gotk-components.yaml` carries upstream `v1beta1/v1beta2` Bucket/GitRepository/
  HelmChart deprecation notices. These are vendored Flux CRDs; **keep** (updated by
  `flux bootstrap`), just be aware on the next Flux upgrade.

## Suggested priority order

1. **Delete** the committed `amp-migrate` binary (12.9 MB) — biggest, clearest win.
2. **Review/relocate** `.old.enc.tar.gz` (4.4 MB) out of live history.
3. **Fix** the hard-coded AVD admin password.
4. **Archive** the AMP migration tooling and the whole `dockerfiles/` tree.
5. **Delete** the `testing123` region + dead commented blocks in `root.hcl`;
   decide on `dev` / `eu-central-1`.
6. **Rewrite** the stale root `README.md` layout section.
7. **Review** the duplicate `k8s-fluxcd-bootstrap` role.
