# Cluster housekeeping

Two platform-utils components keep the EKS clusters tidy and observable:

- **harddisk-hoover** — a privileged, node-level disk-cleanup job that prunes logs, core dumps, journal data, package caches and unused container images across every node, then reports what it freed to Slack.
- **cluster-capacity-analysis** — a read-only, in-cluster capacity-planning tool that renders visual per-node CPU/memory request-vs-limit breakdowns and flags misconfigured pod resource specs.

Both live under `src/` and `k8s/` in platform-utils, are built by `docker-bake.hcl`, and are wired into platform-infra via Flux under `kubernetes/apps/utils/`.

!!! note "distance-cache-cleanup is documented separately"
    A third housekeeping component, `distance-cache-cleanup`, is intentionally **not** covered on this page.

---

## harddisk-hoover

Automated, cluster-wide disk cleanup for EKS nodes, designed to run safely against production without disrupting workloads. It is the productionised (GitOps-driven) version of the manual runbook in platform-infra's `docs/eks-node-disk-cleanup.md`.

### Architecture: controller + ephemeral DaemonSet

harddisk-hoover is a two-stage design, which is important to understand before touching it:

1. A **CronJob** (`harddisk-hoover`) runs a lightweight *controller* pod (image `bitnami/kubectl:latest`, unprivileged). The controller does **not** clean anything itself — it orchestrates.
2. The controller renders a **DaemonSet** from a ConfigMap template and `kubectl apply`s it. That DaemonSet lands one **privileged** cleanup pod (image `ghcr.io/example-org/harddisk-hoover`) on every node, each of which runs the actual `cleanup.sh` against the host filesystem.
3. The controller waits, scrapes each cleanup pod's logs to compute per-node freed space, posts a Slack summary, then deletes the DaemonSet.

The DaemonSet name is timestamped (`harddisk-hoover-<epoch>`) so each run is uniquely labelled (`run=<timestamp>`), and the controller reaps stale DaemonSets from previous runs before creating a new one.

### The cleanup image

- **Language:** POSIX shell — `src/harddisk-hoover/cleanup.sh`.
- **Base image:** `ubuntu:24.04` (pinned by digest `sha256:b359f10…9006b`) — see `src/harddisk-hoover/Dockerfile`. Ubuntu is used (not Alpine) so that `nsenter` (`util-linux`), `findutils` and `coreutils` behave like the host tooling; the script `nsenter`s into PID 1's namespaces to run host `journalctl`, `yum`, and `crictl`.
- **Built image:** `ghcr.io/example-org/harddisk-hoover:<version>` (+ `:latest`) via the `harddisk-hoover` target in `docker-bake.hcl` (context `src/harddisk-hoover`).
- Runs as **root** (`USER root`); entrypoint `CMD ["/bin/sh", "/app/cleanup.sh"]`.

#### What `cleanup.sh` prunes

The host root is mounted at `/hostroot`. Each run, in order:

| Step | Action | Deleted or truncated? |
|------|--------|-----------------------|
| Large logs | `find /hostroot/var/log … -size +100M` | **truncated** to 0 (preserves file handles) |
| Archived logs | `*.gz` and `*.[0-9]` under `/var/log` | deleted |
| Old k8s logs | `*.log` in `/var/log/pods` >7 days; symlinks in `/var/log/containers` >7 days | deleted |
| Large current pod logs | `*.log` in `/var/log/pods` >100M | **truncated** |
| Core dumps | anchored regex `.*/core\.[0-9]+` >50M under `/var/lib/containerd` and `/var/log` | deleted |
| systemd coredumps | everything under `/var/lib/systemd/coredump` | deleted |
| systemd journal | `journalctl --vacuum-size=100M` (via `nsenter -t 1`) | vacuumed |
| yum cache | `yum clean all` + wipe `/var/cache/yum` and `/var/cache/amzn2extras` (only if no `yum.pid` lock) | deleted |
| Exited containers | `crictl rm` for Exited containers dead **>24h** | removed |
| Unused images | `crictl rmi --prune` | pruned |

!!! warning "Deliberate safety guards — don't 'simplify' these"
    - Active logs are **truncated, never deleted**, to keep running processes' file handles valid.
    - The core-dump regex is **anchored** (`.*/core\.[0-9]+`) so a >50MB data file merely *named* `core.2024.db` is never deleted, and 0-byte jsonschema `core` files are ignored.
    - Only **Exited** containers dead **>24h** are reaped (`crictl rm` without `--force` refuses Running ones). The 24h gate preserves `kubectl logs -p` for recently-crashed pods and this DaemonSet's own previous-run logs. Any unparseable `finishedAt` timestamp falls back to `ts=0` → skip, so it never over-reaps.
    - After finishing, the pod `sleep 180` (3 min) so the controller can scrape its logs before the container exits.

### Deployment (k8s manifests)

Base kustomization: `k8s/base/harddisk-hoover/` — pulls in `rbac.yaml`, `daemonset-template.yaml`, `cronjob.yaml`, `secret.enc.yaml`. Everything deploys to the **`misc`** namespace.

**CronJob** (`cronjob.yaml`):

- **Schedule:** `0 2 * * 0` — weekly, Sunday 02:00 UTC.
- `concurrencyPolicy: Forbid`, `startingDeadlineSeconds: 600`.
- `successfulJobsHistoryLimit: 3`, `failedJobsHistoryLimit: 3`.
- Job template: `ttlSecondsAfterFinished: 86400`, `activeDeadlineSeconds: 7200` (2h, to wait on all nodes), `backoffLimit: 2`, `restartPolicy: Never`.
- Controller runs as `serviceAccountName: harddisk-hoover-controller`, image `bitnami/kubectl:latest`, with a long inline `bash` orchestration script (see architecture above).
- Env: `NAMESPACE` (downward API), `SLACK_BOT_TOKEN` (from secret `harddisk-hoover-slack` key `bot-token`, `optional: true`), `SLACK_CHANNEL` and `CLUSTER_NAME` (placeholder values, overridden per overlay).

**DaemonSet template** (`daemonset-template.yaml`) — a ConfigMap `harddisk-hoover-daemonset-template` holding the DaemonSet YAML with a literal `TIMESTAMP` placeholder the controller `sed`-replaces:

- Container `harddisk-hoover`, image `ghcr.io/example-org/harddisk-hoover`.
- `securityContext: privileged: true, runAsUser: 0, allowPrivilegeEscalation: true`; pod `hostPID: true` (needed for `nsenter -t 1`).
- Host mounts: `/` → `/hostroot`, `/var/log`, `/var/lib/containerd`, `/run/containerd`.
- **Tolerations:** `disk-cleanup=true:NoSchedule`, plus `node-role.kubernetes.io/control-plane` and `.../master` (Exists). Admission markers `security.example.io/privileged-workload: approved` and a `justification` annotation flag it as an approved privileged workload.

!!! note "The DaemonSet has no nodeSelector"
    The `src` README describes a `disk-cleanup=true` node-selection model, but the shipped template only sets **tolerations** (no `nodeSelector`). As deployed, the cleanup pod runs on **every** node — the tolerations simply let it also land on tainted control-plane/cleanup nodes. Treat the label workflow in the README as aspirational, not enforced.

**RBAC** (`rbac.yaml`) — ServiceAccount `harddisk-hoover-controller` in `misc`, plus:

- Namespaced **Role** (`misc`): `daemonsets` (create/get/list/watch/delete), `pods` (get/list/watch), `pods/log` (get), `configmaps` (get).
- **ClusterRole** `harddisk-hoover-node-reader`: `nodes` (get/list) — so the controller can count expected pods.

**Secret** — `harddisk-hoover-slack` (`Opaque`, key `bot-token`) is stored SOPS-encrypted in `secret.enc.yaml` (age recipient `age1example…`). The Flux Kustomization is labelled `app.kubernetes.io/sops: "enabled"` for decryption.

### Overlays

| | Image tag | `SLACK_CHANNEL` (env[2]) | `CLUSTER_NAME` (env[3]) |
|---|---|---|---|
| prod | `v1.3.0` | `C000000AAA2` | `prod` |
| staging | `v0.0.0-rc.1` | `#scratch-test` | `staging` |

Overlays patch the two env values by JSON-patch path and carry the Flux `$imagepolicy` setter marker on the image tag.

### Output (Slack report)

On completion the controller posts to `chat.postMessage` a "Harddisk Hoover - Cluster Cleanup" block message containing: cluster name, nodes cleaned / expected, total space freed (GB), and a **per-node breakdown** (`before → after`, percentage, freed GB), parsed from each pod's `df -h /hostroot` before/after lines. Icon is `:white_check_mark:` on success or `:warning:` if any pod failed. If `SLACK_BOT_TOKEN`/`SLACK_CHANNEL` are unset it silently skips. Reference result (prod-eks2, Jan 2026): ~7 GB freed per node, <5 min, zero pod disruption.

### How platform-infra consumes it

Under `kubernetes/apps/utils/`:

- `base/harddisk-hoover/imagerepository.yaml` — Flux `ImageRepository` scanning GHCR.
- `overlays/prod/harddisk-hoover/` and `overlays/staging/harddisk-hoover/` — each has a Flux `Kustomization` (`flux-kustomization.yaml`, path `./k8s/overlays/<env>/harddisk-hoover`, `prune: true`, sops-enabled), an `ImagePolicy`, and an `ImageUpdateAutomation` that commits bumped tags back to platform-utils `main` as author **platform-bot** with `[ci skip]`.

### Manual trigger

```bash
kubectl create job harddisk-hoover-manual-$(date +%s) \
  --from=cronjob/harddisk-hoover -n misc
kubectl logs -n misc -l app=harddisk-hoover --tail=100 -f
```

---

## cluster-capacity-analysis

A visual Kubernetes capacity-planning tool that renders cluster-wide and per-node CPU/memory usage (requests vs limits) as progress bars, flags misconfigured pod resource specs, and can export JSON for downstream tooling (KRR / Prometheus). It is a read-only reporter — it changes nothing in the cluster.

### The tool

- **Language:** Python 3, **standard library only** (no dependencies) — `src/cluster-capacity-analysis/main.py`.
- **Base image:** `python:3.11-alpine` — Dockerfile. Installs a **checksum-verified** `kubectl` (fetches `stable.txt`, downloads the matching binary + `.sha256`, `sha256sum -c`), copies `main.py` to `/usr/local/bin/cluster-capacity`. `ENTRYPOINT` is the script; default `CMD ["--help"]`. Multi-arch aware via `TARGETOS`/`TARGETARCH`.
- **Built image:** `ghcr.io/example-org/cluster-capacity-analysis:<version>` (+ `:latest`) via the `cluster-capacity-analysis` target in `docker-bake.hcl` (context `src/cluster-capacity-analysis`).

!!! note "README/file name mismatch"
    The component README refers to `cluster-capacity.py`, but the actual script is `main.py` (that is what the Dockerfile copies). Same program, different filename.

### How it works

`get_cluster_data()` shells out to `kubectl get nodes -o json` and `kubectl get pods -A -o json`, then:

- Builds per-node allocatable CPU (millicores) and memory (bytes) from `.status.allocatable`.
- Sums each scheduled pod's container `requests`/`limits` onto its node (`parse_cpu` / `parse_memory` handle `m`, `Ki`/`Mi`/`Gi`/`Ti` suffixes).
- **Flags issues** per container: malformed memory using a bare `m` suffix (e.g. `3435973836800m` instead of `4Gi`), missing CPU limit, missing memory limit.

CLI flags (`argparse`): default prints the cluster summary + notes; `--per-node`/`-n` prints per-node breakdown; `--all`/`-a` prints both; `--json FILE`/`-j FILE` exports a simplified JSON structure (cluster totals + per-node capacity/usage/pod_count/issues_count). Status thresholds: ✅ <80%, ⚡ 80–100%, ⚠️ >100% (over-committed).

### Deployment (k8s manifests)

Base: `k8s/base/cluster-capacity-analysis/` → `cronjob.yaml` only. Namespace **`misc`**.

**CronJob** (`cronjob.yaml`):

- **Schedule:** `0 6 * * *` — daily 06:00 UTC (base).
- Args: `--all`.
- `concurrencyPolicy: Forbid`, `startingDeadlineSeconds: 300`, `successfulJobsHistoryLimit: 7`, `failedJobsHistoryLimit: 3`.
- Job template: `ttlSecondsAfterFinished: 21600` (6h), `activeDeadlineSeconds: 600` (10 min), `backoffLimit: 2`, `restartPolicy: Never`.
- **Hardened, non-privileged** securityContext (the opposite of harddisk-hoover): `runAsNonRoot: true`, `runAsUser: 1000`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities: drop: [ALL]`.
- Image line carries the Flux `$imagepolicy` setter marker.

**RBAC** (in the same file) — ServiceAccount `cluster-capacity-analysis` (`misc`), a **ClusterRole** granting `nodes` and `pods` **get/list** only, and a matching ClusterRoleBinding. Read-only, cluster-wide, no write verbs.

### Overlays

| | Image tag | Schedule |
|---|---|---|
| prod | `v0.1.0` | `0 6 * * *` (base default, daily) |
| staging | `v0.1.0` | `0 */6 * * *` (patched — every 6h for testing) |

### Output

Results go to **stdout / pod logs only** — there is no Slack, S3 or Mongo sink. The default `--all` run prints the cluster summary and per-node breakdown (with `█`/`░` usage bars and ✅/⚡/⚠️ status), plus KRR-integration notes. `--json` can write a file to the container's `/output` workdir, but the shipped CronJob uses `--all` with no mounted volume, so JSON export is not persisted by default. View results with:

```bash
kubectl logs -n misc -l app=cluster-capacity-analysis --tail=100
```

The README documents this as complementary to [KRR](https://github.com/robusta-dev/krr): this tool = current capacity from live `kubectl` state; KRR = historical usage-based recommendations from Prometheus. JSON export exists as the bridge between them. Future-enhancement ideas (S3 upload, Prometheus push, Slack alerts) are listed but **not implemented**.

### How platform-infra consumes it

`kubernetes/apps/utils/base/cluster-capacity-analysis/` defines a Flux `ImageRepository` (`imagerepository.yaml`, `provider: generic`, `secretRef: ghcr-credentials`) plus a base kustomization.

!!! warning "Not currently wired into the prod/staging overlays"
    Unlike harddisk-hoover, `cluster-capacity-analysis` has **no** directory under `kubernetes/apps/utils/overlays/prod` or `.../overlays/staging`. Only the `base` ImageRepository exists in platform-infra, so as of this writing the CronJob is not deployed through the Flux app overlays — it would need an overlay Kustomization (and ImagePolicy/ImageUpdateAutomation) added, or a direct `kubectl apply -k k8s/overlays/<env>/cluster-capacity-analysis`, to actually run.
