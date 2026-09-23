# Releases & promotion (application repositories)

Every other page in this repo starts at the point where **an image tag already exists in
GHCR**. This page covers the step before that: how a change in an application repository
becomes a versioned image, who has to approve it, and where responsibility passes to Flux.

It is an **inventory of what is configured today**, not a tutorial. The mechanics of GitHub
Actions, `python-semantic-release`, Docker Buildx Bake and Flux image automation are
documented by their own projects and are not restated here:

- Release Workflows — the shared org release action
- [GitHub Actions](https://docs.github.com/en/actions)
- [python-semantic-release](https://python-semantic-release.readthedocs.io/)
- [Docker Buildx Bake](https://docs.docker.com/build/bake/)
- [Flux image update automation](https://fluxcd.io/flux/guides/image-update/)

!!! note "Scope boundary"
    This page ends at the moment Release Workflows pushes a semver tag to GHCR. From there,
    [GitOps with Flux](gitops-flux.md) and [Kubernetes applications](kubernetes-apps.md)
    take over. The release pipeline for `platform-infra` *itself* — which is the same
    action with the same settings — is documented in
    [CI/CD & tooling](cicd-and-tooling.md#release-versioning-release-workflows-semantic-release).

---

## Where release automation lives

There is **no central release pipeline**. Each application repository carries its own
`.github/workflows/release.yml`, and each one calls the same shared org action,
`example-org/release-workflows`, pinned to a full commit SHA. `platform-infra` runs the same
workflow for its own versioning.

The reference example is
`admin-backend/.github/workflows/release.yml`.
It is the most recently updated of the set and carries the fullest configuration; the other
repos are the same workflow at an earlier revision.

### What the workflow is configured to do

Two Release Workflows steps, selected by event:

| Event | Step | `mode` | Configured outcome |
|-------|------|--------|--------------------|
| Pull request (`opened`, `synchronize`, `reopened`) | PR image build | `ci` | Builds a `pr-<N>` image — only in repos that have a `docker-bake.hcl` |
| Push to `staging` | Release | `release` | `rc` prerelease for the `staging` environment |
| Push to `main` | Release | `release` | Stable version for the `prod` environment |
| `workflow_dispatch` | Release | `release` | Manual release run from the selected branch |

The release step's inputs, identical across every app repo:

```yaml
mode: release
deployment-model: bbd
branch-map: '{"staging": "staging", "main": "prod"}'
environments: '["staging", "prod"]'
prerelease-identifiers: '{"staging": "rc"}'
```

Three consequences of that configuration are worth stating explicitly, because they are the
things people ask about:

- **The environment is derived from the branch, not chosen.** Under `deployment-model: bbd`
  there is no environment input to set, so a push or a manual dispatch from `staging` can
  only ever cut an `rc`. `prod` is reachable only from `main`.
- **A repo builds an image only if it has a `docker-bake.hcl`.** Release Workflows auto-detects the
  image name from that file. A repo without one runs versioning only — it still tags and
  bumps, it just publishes nothing to GHCR.
- **Push events ignore documentation-only changes.** Every workflow sets `paths-ignore` for
  `**/*.md`, `docs/**`, `LICENSE` and `.gitignore` (plus the docs-site files in
  `admin-backend` and `platform-infra`), so a docs change does not cut a version.

### `admin-required-from: prod`

`admin-backend` and `public-api` set `admin-required-from: prod` explicitly. Per the
comment in the workflow itself, this is *already the Release Workflows default* (`@last`, the last
entry in `environments`); it is pinned to make the intent visible. It puts the `prod`
environment behind the action's manual-release admin guardrail. The four repos still on the
earlier revision do not set the input and therefore inherit the same default.

`admin-backend` and `public-api` also expose a `workflow_dispatch` input `bump`
(`auto` | `patch` | `minor` | `major`) wired to the Release Workflows `force-bump`, with `auto` mapped
to an empty string so the tool decides from commits. The other repos have a bare
`workflow_dispatch` with no inputs.

---

## Who approves a release

Merge is the approval gate. There is no separate release sign-off step.

Each app repo's `.github/CODEOWNERS` routes every path to one team:

```text
* @example-org/release-approvers
```

This is the same team and the same single-line pattern used by `platform-infra`
(see [CI/CD & tooling](cicd-and-tooling.md#codeowners)). Present in `admin-backend`,
`ingest-driver`, `camera-console`, `status-page` and `platform-utils`.

!!! note "`public-api` has no CODEOWNERS file"
    `public-api` carries `.github/dependabot.yml`, `release.yml` and `security.yml`, but
    no `.github/CODEOWNERS` on `main`. Reviews on that repo are therefore not routed to
    `release-approvers` by code ownership. Whether a branch ruleset covers it instead is
    **to be confirmed** — rulesets are a GitHub setting and are not visible in Git.

!!! note "Not recorded here"
    The **membership** of `@example-org/release-approvers`, and the per-repo branch
    protection / ruleset configuration that makes CODEOWNERS review *required* rather than
    merely *requested*, live in GitHub settings and are not captured in either repository.
    Both are **to be confirmed** and would be worth recording during handover.

---

## Application repository inventory

| App repo | Image(s) published | `docker-bake.hcl` | `staging` branch | Prod branch | Flux app path |
|----------|--------------------|-------------------|------------------|-------------|---------------|
| `admin-backend` | `ghcr.io/example-org/backend` | Yes | Yes | `main` | `kubernetes/apps/backend` |
| `ingest-driver` | `ghcr.io/example-org/driver` | Yes | Yes | `main` | `kubernetes/apps/driver` |
| `public-api` | `ghcr.io/example-org/public-api` | Yes | Yes | `main` | `kubernetes/apps/public-api` |
| `camera-console` | `ghcr.io/example-org/camera-console` | Yes | **No** | `main` | `kubernetes/apps/camera-console` |
| `status-page` | *(none built here)* | **No** | **No** | `main` | `kubernetes/apps/status` |
| `platform-utils` | 13 bake targets, one image per utility | Yes | Yes | `main` | `kubernetes/apps/utils` |

`platform-utils` is the one multi-image repo: its bake file declares a `default` group of
13 targets (`camera-probe-propagator`, `camera-image-size-report`,
`cluster-capacity-analysis`, `distance-cache-cleanup`, `harddisk-hoover`, `mysql-archival`,
`capture-exporter`, `s3-bucket-size`, `sonic-stragglers-report`, `watchlist-log-items`,
`mikrotik-wireguard-exporter`, `router-fleet-resolver`, `router-lifetime-reconciler`), each
publishing `ghcr.io/example-org/<target>`. That is a superset of the sub-apps wired in
`kubernetes/apps/utils` — see [Kubernetes applications](kubernetes-apps.md#utils-utility-cronjobs-exporters).

### Release Workflows pin per repo

| Pin | Repositories |
|-----|--------------|
| `v2.4.4` (`aaaaaaa…`) | `admin-backend`, `public-api` |
| `v2.3.0` (`bbbbbbb…`) | `ingest-driver`, `camera-console`, `status-page`, `platform-utils` |

The app repos are not covered by the `platform-infra` Dependabot config, which watches only
that repo's own Actions. Whether each app repo runs its own Dependabot for Action SHAs is
**to be confirmed** (`public-api` has a `dependabot.yml`; the others were not checked in
detail).

---

## Staging and prod are independent version lines

Under branch-based deployment, `staging` and `main` each carry their own semver history.
Staging is **not** "prod minus one" — the two lines advance separately and can be far apart.

- `main` produces stable `vX.Y.Z` tags, selected by the prod `ImagePolicy`.
- `staging` produces `vX.Y.Z-rc.N` tags, selected by the staging `ImagePolicy`.

An `rc` on `staging` is not a candidate that later "becomes" the prod version; a change
reaches prod only when it is merged to `main` and `main` cuts its own stable version.

This is visible in `admin-backend` today: the prod overlay pins a `v2.18.x` stable tag while
the staging overlay pins a `v2.8.x-rc.N` tag — over ten minor versions apart, on two
independent lines. Check the live values rather than trusting any number written down:

```bash
git show origin/main:k8s/overlays/prod/kustomization.yaml       | grep -A2 '^images:'
git show origin/staging:k8s/overlays/staging/kustomization.yaml | grep -A2 '^images:'
```

!!! warning "The staging overlay on `main` is not the deployed staging overlay"
    Each app repo has a `k8s/overlays/staging/` directory on *both* branches. Flux reads it
    from the `staging` branch, and the `ImageUpdateAutomation` writes bumps back there. The
    copy on `main` drifts and is not what runs. In `admin-backend` the two carry different
    pinned tags. Always read the staging overlay from `origin/staging`.

---

## Handoff to Flux

the Release Workflows last act is publishing a semver-tagged image to GHCR. Nothing in the app repo
deploys anything. The handoff is:

1. **Release Workflows** pushes `ghcr.io/example-org/<image>:vX.Y.Z` (or `…-rc.N`).
2. **`ImageRepository`** (in `kubernetes/apps/<app>/base/`) scans that GHCR repository on a
   `5m` interval.
3. **`ImagePolicy`** (in `overlays/<env>/`) selects the newest tag matching the environment's
   pattern — stable for prod, `-rc.N` for staging.
4. **`ImageUpdateAutomation`** (`5m` interval) rewrites the `# {"$imagepolicy": …}` setter
   marker in the app repo's `k8s/overlays/<env>/kustomization.yaml` and commits the bump as
   **platform-bot** with `[ci skip]`, to `main` for prod and `staging` for staging.
5. **`GitRepository`** + Flux **`Kustomization`** (`5m` intervals) reconcile that commit into
   the cluster.

The full resource-by-resource detail is in
[GitOps with Flux](gitops-flux.md#flux-image-automation) and the per-app wiring is in
[Kubernetes applications](kubernetes-apps.md#image-automation-promotion-model). Two points
worth carrying over here:

- **`[ci skip]` on the automation commit** is what stops the tag bump from re-triggering
  `release.yml` and cutting another version.
- **Do not hand-edit an image tag in an app repo.** The setter automation owns those lines
  and will overwrite them on its next pass.

---

## Hotfix path

The configured path for an urgent production fix — no special mode, no separate workflow:

1. Open a PR against the app repo's `main` branch (`release-approvers` review applies).
2. Merge. The push to `main` runs `release.yml`; Release Workflows cuts a stable patch version from
   the commit types and publishes the image.
3. The prod `ImagePolicy` sees the new tag within roughly **5 minutes** (`ImageRepository`
   scan interval).
4. `ImageUpdateAutomation` commits the tag bump back to `main` (another ~5m interval).
5. The Flux `Kustomization` reconciles it into the cluster (5m interval, or force it — see
   below).

Worst case that is roughly 15 minutes of polling end to end, plus the build. Forcing the
reconcile shortens the tail but not the image scan.

!!! note "Rolling prod back is a roll *forward*"
    The prod `ImagePolicy` selects the **newest** tag in its range, so removing or moving a
    tag does not move prod backwards. Reverting means merging the revert to `main` and
    letting it cut a new, higher stable version. `admin-backend` carries a `hotfix/staging`
    branch on origin; whether it is live or a remnant is **to be confirmed**.

---

## How to tell it landed

Verification is the standard Flux check set — the commands are in
[GitOps with Flux → Operational quick reference](gitops-flux.md#operational-quick-reference)
and [Kubernetes applications → Operational notes](kubernetes-apps.md#operational-notes).
In short: `flux get image repository` / `policy` / `update` to see what the automation
selected, `flux get kustomizations` for reconcile state, and
`flux reconcile kustomization <name> -n flux-system --with-source` to stop waiting on the
interval.

!!! note "Reconciliation failures are not pushed anywhere"
    The Flux **notification-controller is installed** (it ships with `gotk-components.yaml`
    in both cluster overlays), but there are **no `Provider` or `Alert` resources** anywhere
    in this repository. Nothing routes Flux events to Slack or PagerDuty. A failed
    reconcile, a stuck `ImageUpdateAutomation` or a `GitRepository` that cannot resolve its
    branch is discovered only by running the commands above — checking is a **pull**
    operation today. The Slack and PagerDuty paths described in
    [Alerting & on-call](alerting-and-on-call.md) are fed by Prometheus/Alertmanager and
    CloudWatch, not by Flux.

---

## Known inconsistencies to resolve

Recorded here so they are not rediscovered. None is currently causing a prod outage.

### Two apps have no `staging` branch

`camera-console` and `status-page` have only `main` on origin. Verify:

```bash
git ls-remote --heads https://github.com/example-org/camera-console.git staging
git ls-remote --heads https://github.com/example-org/status-page.git staging
```

Both return nothing. Meanwhile the staging Flux wiring in this repo references that branch:

| App | Staging `GitRepository` file | `ref.branch` | Referenced by the staging overlay `kustomization.yaml`? |
|-----|------------------------------|--------------|--------------------------------------------------------|
| `camera-console` | `kubernetes/apps/camera-console/overlays/staging/gitrepository.yaml` | `staging` | **No** — the overlay lists only `flux-kustomization`, `imagepolicy`, `imageupdateautomation` |
| `status` | `kubernetes/apps/status/overlays/staging/gitrepository.yaml` | `staging` | Yes |

!!! note "Two different failure shapes"
    For **`status`**, the `GitRepository` *is* applied and points at a branch that does not
    exist, so the source will not resolve and the staging `Kustomization` has nothing to
    apply. For **`camera-console`**, the `GitRepository` is never applied at all — neither the
    prod nor the staging overlay `kustomization.yaml` lists `gitrepository.yaml` — so its
    Flux `Kustomization` references a `GitRepository` named `camera-console` that the overlay
    does not create. Resolving this means either creating the `staging` branches in the two
    app repos, or changing the staging references to a branch that exists — plus, for
    `camera-console`, deciding whether the unreferenced `gitrepository.yaml` files should be
    wired in or removed. The `camera-console` wiring inconsistencies are also listed in
    [Kubernetes applications](kubernetes-apps.md#camera-console).

### `status-page` builds no image

`status-page` has no `docker-bake.hcl` on `main`, so its `release.yml` runs versioning
only. A root `Dockerfile` is present and the repo has only two workflows (`release.yml`,
`security.yml`), neither of which builds it. `kubernetes/apps/status/base/imagerepository.yaml`
nevertheless scans `ghcr.io/example-org/status`. What currently produces that image, and
whether the existing tags are historical, is **to be confirmed**.

### Release Workflows pins have drifted apart

Four repos are two revisions behind `admin-backend` and `public-api` (`v2.3.0` vs
`v2.4.4`). The release contract they configure is the same, so behaviour matches, but the
older four lack the explicit `admin-required-from` pin and the manual `bump` input.
