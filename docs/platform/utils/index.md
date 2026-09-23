# The platform-utils companion repository

`platform-utils` is the sibling repository to `platform-infra`. It is the **build home** for the small, single-purpose utility container images that the platform runs on the EKS clusters — exporters, reporters, cleanup jobs and reconcilers — and, in the app-repo GitOps model, it is also the **home of their Kubernetes manifests** (`k8s/base` + `k8s/overlays`). `platform-infra` does not vendor these images or their workloads; instead Flux in `platform-infra` points *back* at this repo (as a `GitRepository` source) and at the images this repo pushes to GHCR.

!!! note "Two repos, one system"
    - **`platform-utils`** (this repo) — Python/Bash/Go source, `Dockerfile`s, `docker-bake.hcl`, and the Kustomize `k8s/` tree. It builds+pushes images to `ghcr.io/example-org/<name>` and holds the raw manifests.
    - **`platform-infra`** — the fleet GitOps repo. `kubernetes/apps/utils` wires each component into Flux: a shared `GitRepository` (`platform-utils`), per-component `ImageRepository`/`ImagePolicy`/`ImageUpdateAutomation`, and Flux `Kustomization`s that render this repo's `k8s/overlays/<env>/<component>` paths onto the cluster.

Source: platform-utils · `docker-bake.hcl` · `k8s/`

## Components at a glance

Every row below is a Docker Bake target in `docker-bake.hcl`; each builds to `ghcr.io/example-org/<name>` (tags `:${VERSION}` and `:latest`). Source lives under `src/<name>/`.

| Component | Built image (`ghcr.io/example-org/…`) | Purpose |
| --- | --- | --- |
| camera-probe-propagator | `camera-probe-propagator` | Generates Prometheus `ScrapeConfig` CRDs from `camera_profile` (camera monitoring) |
| camera-image-size-report | `camera-image-size-report` | Analyses S3 image storage per device ID and reports usage to Slack |
| cluster-capacity-analysis | `cluster-capacity-analysis` | Kubernetes cluster capacity planning (per-node, KRR hooks); daily CronJob |
| distance-cache-cleanup | `distance-cache-cleanup` | Cleans old rows from the `camera_distance_cache` table (documented in platform-infra) |
| harddisk-hoover | `harddisk-hoover` | EKS node disk cleanup (logs, journal, unused container images) |
| mysql-archival | `mysql-archival` | Archives old MySQL data to S3 + DB maintenance (monthly CronJob) |
| capture-exporter | `capture-exporter` | Prometheus exporter for per-camera capture capture-event counts from Mongo `ingest.captures` (no PII) |
| s3-bucket-size | `s3-bucket-size` | Calculates S3 bucket size/object counts on a schedule |
| sonic-stragglers-report | `sonic-stragglers-report` | Reports cameras still talking to the old SonicWall/CHR IP instead of AWS (migration tracking) |
| watchlist-log-items | `watchlist-log-items` | Monitors watchlist (watchlist match) log items in Mongo, alerts Slack when none found |
| mikrotik-wireguard-exporter | `mikrotik-wireguard-exporter` | Prometheus exporter for RouterOS WireGuard peer health over read-only SSH |
| router-fleet-resolver | `router-fleet-resolver` | Classifies MikroTik routers into authenticated (mktxp) vs blackbox tier and emits their scrape config |
| router-lifetime-reconciler | `router-lifetime-reconciler` | Aligns MikroTik IPsec IKE/child-SA lifetimes + DPD on AWS VPN peers with the AWS side (audit-first) |

!!! note "Source dirs that are NOT build targets"
    `src/client-c-migration` and `src/s3-sums` exist under `src/` but have **no** target in `docker-bake.hcl` and are not built or published. Treat them as scratch/one-off material, not shipped components.

### Which page documents which component

- **distance-cache-cleanup** — documented in **platform-infra** (not deep-documented here; it is listed above only as a one-line row).
- Each remaining built component has its own page in this section (e.g. capture-exporter, mikrotik-wireguard-exporter, camera-probe-propagator, watchlist-log-items, harddisk-hoover, router-fleet-resolver, router-lifetime-reconciler, sonic-stragglers-report, camera-image-size-report, cluster-capacity-analysis, mysql-archival, s3-bucket-size), covering its language/deps, Dockerfile, deployment manifest, config/secrets, and metrics/output.

## Multi-arch build system (Docker Bake)

Images are built with `docker buildx bake` against `docker-bake.hcl`. Key variables (all overridable from the environment):

| Variable | Default | Meaning |
| --- | --- | --- |
| `VERSION` | `latest` | Image tag (set to the semantic-release version by CI) |
| `REGISTRY` | `ghcr.io` | Target registry |
| `REPO_NAME` | `platform-utils` | Used in OCI `image.source`/`image.repo` labels |
| `PLATFORMS` | `linux/amd64` | Comma-separated build platforms (`split(",", PLATFORMS)` → multi-arch when set, e.g. `linux/amd64,linux/arm64`) |

Each target sets `context = "src/<name>"`, `dockerfile = "Dockerfile"`, pushes two tags (`:${VERSION}` and `:latest`), stamps OCI labels (`image.source`, `image.version`, `image.created`, `image.description`), and uses BuildKit registry cache (`cache-from type=registry …:buildcache`, `cache-to type=inline`) with `output = ["type=image,push=true"]`.

Two groups are defined, and — as currently written — **they contain the identical 13 targets**:

- `group "default"` — the target list used by a bare `docker buildx bake`.
- `group "all"` — an explicit "build everything" alias with the same 13 targets.

!!! tip "Build examples"
    ```bash
    # Build+push every utility, multi-arch, at an explicit version:
    VERSION=v1.22.0 PLATFORMS=linux/amd64,linux/arm64 \
      docker buildx bake --file docker-bake.hcl all

    # Build a single image locally:
    VERSION=dev docker buildx bake --file docker-bake.hcl capture-exporter
    ```

## Release & versioning (Release Workflows + semantic-release)

Releases run through the `Release` workflow, which delegates to **Release Workflows** (`example-org/release-workflows@v2.3.0`), the org's branch-based release action. Versioning tool and image name are auto-detected: Release Workflows reads `image_name` from `docker-bake.hcl` and picks `semantic-release-python` because `pyproject.toml` carries a `[tool.semantic_release]` block.

Environment flow (deployment-model `bbd`, branch-map `{"staging":"staging","main":"prod"}`):

1. **Pull requests** → Release Workflows `mode: ci` builds a throwaway `pr-<N>` image (no version bump).
2. **Push to `staging`** → `rc` **prerelease** (`prerelease_token = "rc"`), tagged `v{version}` per `tag_format`.
3. **Push to `main`** → stable **prod** release; builds+pushes the versioned + `latest` images and updates `CHANGELOG.md`.

Semantic-release parses Conventional-Commit subjects: `feat` → minor, `fix`/`perf` → patch, and `major_on_zero = true`. `paths-ignore` skips releases for pure docs/markdown/`mkdocs.yml`/`LICENSE`/`.gitignore` changes. The `SELFHOSTED_GITHUB_RUNNER` repo variable (shared with the security workflow) can route the job onto the cluster's self-hosted runner pool; blank keeps it on `ubuntu-latest`.

## Kubernetes manifest layout & how platform-infra's Flux consumes it

Manifests live under `k8s/` as a Kustomize base + overlays tree:

```text
k8s/
├── base/<component>/        # cronjob.yaml / deployment.yaml, rbac, externalsecret, configmap, secret.enc.yaml …
└── overlays/
    ├── staging/             # kustomization.yaml + resources.yaml (transformer) + per-component patches
    └── prod/                # kustomization.yaml + resources.yaml + per-component patches
```

The overlay `kustomization.yaml` files select which components ship per environment (staging currently: distance-cache-cleanup, harddisk-hoover, watchlist-log-items, camera-probe-propagator; prod adds capture-exporter; sonic-stragglers-report and camera-image-size-report are commented out "need to fix"). Overlays also carry a Flux SOPS-decryption patch keyed off the `app.kubernetes.io/sops=enabled` label.

`platform-infra` drives all of this from `kubernetes/apps/utils`:

- **Source** — a single GitRepository named `platform-utils` (branch `main`, 5m interval, GitHub App auth) in `flux-system`.
- **Image discovery** — per component, an `ImageRepository` (`ghcr.io/example-org/<name>`, `ghcr-credentials`) and an `ImagePolicy` filtering tags `^v[0-9]+\.[0-9]+\.[0-9]+$` with semver range `>=1.0.0`.
- **Auto-bump** — an `ImageUpdateAutomation` commits the new image tag *back into this repo's* `k8s/overlays/<env>/<component>` path (Setters strategy), author `platform-bot`, `[ci skip]` — which is why `CHANGELOG.md` is full of `chore: update <component> image to …` commits.
- **Render** — a Flux `Kustomization` per component points `path: ./k8s/overlays/<env>/<component>` at the `platform-utils` `GitRepository`, with `app.kubernetes.io/sops: "enabled"` for SOPS decryption.

!!! note "Secrets"
    Manifests carry no plaintext credentials. Secrets are provided either via **SOPS** (`secret.enc.yaml`, decrypted by Flux — see `.sops.yaml` below) or via **ExternalSecrets** (`externalsecret.yaml`, backed by AWS Secrets Manager). The `k8s/README.md` documents four secret-provisioning options (kubectl, SealedSecret, ExternalSecret, SOPS).

## CI, pre-commit & SOPS

- **Security gate (security-gate)** — the `Security` workflow runs `example-org/security-gate@v2.7.0` on `pull_request` only. Security Gate is the org's MegaLinter-backed gate that fails on **net-new** findings in the PR diff, producing the required `security-gate` status check. It intentionally has **no push trigger** (so the Release Workflows release commits don't re-scan) and **skips Dependabot** PRs. DefectDojo/Dependency-Track are deliberately not wired.
- **pre-commit** — `.pre-commit-config.yaml` installs `pre-commit` + `pre-push` hooks from `example-org/security-gate@v1`: `shellcheck`, `actionlint`, `hadolint`, `eslint`, `kustomize`, `trivy`, `trufflehog`, `semgrep`, `pip-audit`, `npm-audit`, `govulncheck`, `checkov`.
- **SOPS** — `.sops.yaml` encrypts only `data`/`stringData` (`encrypted_regex: '^(data|stringData)$'`) with the age recipient `age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5`. Flux decrypts these in-cluster via the SOPS overlay patch.
