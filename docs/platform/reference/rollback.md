# Rollback procedures

How to undo a bad change in the platform estate. Every layer here is reconciled from Git by an
automated controller, so **the reconciler will undo your manual fix unless you stop it first**. Each
section below gives the order of operations that actually holds.

This page states what to do *here*. For how the underlying tools work, see the
[Flux documentation](https://fluxcd.io/flux/), the
[Terragrunt documentation](https://terragrunt.gruntwork.io/docs/), and the
[AWS documentation](https://docs.aws.amazon.com/).

---

## Before you start

!!! note "Notify first, then act"
    1. Post in **`#networking-alerts`** (`C000000AAA5`) that you are rolling back, what you are
       rolling back, and which environment. See
       [Alerting & on-call](alerting-and-on-call.md) for the channel map.
    2. If a PagerDuty incident is open on the **"AWS VPN Tunnels"** service, acknowledge it so the
       all-hands escalation stops paging while you work — the escalation policy pages
       **every engineer at once; there is no rotation**
       ([Acknowledge a PagerDuty page](alerting-and-on-call.md#acknowledge-a-pagerduty-page)).
    3. Confirm which cluster your `kubectl` context points at before running anything:

        ```bash
        kubectl config current-context          # expect the prod-eks or staging-eks ARN
        aws eks update-kubeconfig --region af-south-1 --name prod-eks --profile prod
        ```

    4. Note the current state before you change it (`flux get kustomizations`,
       `flux get image policy`, `kubectl get deploy -A`). You will need it to verify.

---

## What broke → where to go

| Symptom | Layer | Section |
|---|---|---|
| A new application image tag is bad (`admin-backend`, `driver`, `public-api`, `camera-console`, `status-page`, a `utils` component) | Flux image automation | [Application image rollback](#application-image-rollback) |
| A change merged to `platform-infra` broke cluster wiring (Flux CRs, controllers, namespaces, patches) | Cluster root | [Cluster-root rollback](#cluster-root-rollback) |
| A Helm-managed platform service is failing after an upgrade (external-secrets, CNPG, MinIO, SonarQube, DefectDojo, Dependency-Track, OpenReplay, minio-operator) | Helm | [Helm service rollback](#helm-service-rollback) |
| A `terragrunt apply` created or destroyed the wrong AWS/Azure resources | Terraform | [Infrastructure rollback](#infrastructure-rollback) |
| Terraform state is locked, or a resource address is wrong in state | Terraform state | [Terraform state & backends](terraform-state.md#state-operations-that-are-safe-to-document) |
| Data is lost or corrupt (Postgres, RDS MySQL, MongoDB, S3 objects) | Data | [Data restore](#data-restore) |
| The cluster itself is gone or Flux cannot be recovered in place | Cluster | [Cluster recovery](#cluster-recovery) |

!!! warning "A hand-revert alone never holds"
    Every layer on this page is continuously reconciled. `kubectl edit`, `kubectl rollout undo`,
    `helm rollback`, and a hand-edited image tag are all reverted by their controller within one
    reconcile interval — **5 minutes** for image automation and for both cluster roots. Suspend the
    controller first; that is what the numbered steps below do.

---

## Application image rollback

Applications are deployed from their own repos. `platform-infra` holds only the Flux wiring and the
image-automation triad. The trap is in the automation.

### Why a hand-revert does not hold

Three facts, all in this repo:

| Fact | Where | Value |
|---|---|---|
| The prod policy always selects the **highest** matching semver tag | `kubernetes/apps/backend/overlays/prod/imagepolicy.yaml` | `filterTags.pattern: '^v[0-9]+\.[0-9]+\.[0-9]+$'`, `policy.semver.range: '>=1.0.0'` |
| GHCR is rescanned every 5 minutes | `kubernetes/apps/backend/base/imagerepository.yaml` | `interval: 5m` |
| The automation commits the selected tag straight into the app repo every 5 minutes | `kubernetes/apps/backend/overlays/prod/imageupdateautomation.yaml` | `interval: 5m`, `push.branch: main`, `update.path: "./k8s/overlays/prod"` |

So if you revert the image tag in `admin-backend` by hand, `image-automation-controller` sees that
the highest tag matching `>=1.0.0` is still the bad one, rewrites the setter-marked tag under
`k8s/overlays/prod/`, and pushes it back to `main` as **platform-bot** — typically **within 5 minutes**. The
bad release redeploys and it looks like your revert never happened.

### Prod image-automation resources

Suspend the `ImageUpdateAutomation` for the affected app. All objects are in the `flux-system`
namespace.

| App / component | Flux `Kustomization` | `ImageUpdateAutomation` | `ImagePolicy` | App repo | Tag written under |
|---|---|---|---|---|---|
| backend | `admin-backend` | `admin-backend` | `admin-backend` | `admin-backend` | `./k8s/overlays/prod` |
| driver | `driver` | `driver` | `ingest-driver` | `ingest-driver` | `./k8s/overlays/prod` |
| API | `public-api` | `public-api` | `public-api` | `public-api` | `./k8s/overlays/prod` |
| camera-console | `camera-console` | `camera-console` | `camera-console` | `camera-console` | `./k8s/overlays/prod` |
| status | `status-page` | `status-page` | `status-page` | `status-page` | `./k8s/overlays/prod` |
| utils components | one per component | `camera-image-size-report`, `camera-probe-propagator`, `distance-cache-cleanup`, `harddisk-hoover`, `mikrotik-wireguard-exporter`, `capture-exporter`, `router-fleet-resolver`, `router-lifetime-reconciler`, `sonic-stragglers-report`, `watchlist-log-items` | same name as the automation | `platform-utils` | `./k8s/overlays/prod/<component>` |

If you are unsure of the name, list them live:

```bash
flux get image update
flux get image policy
```

!!! note "`mktxp` has no image automation"
    `kubernetes/apps/utils/overlays/prod/mktxp` carries only a `flux-kustomization.yaml`. Its tag is
    not auto-bumped, so a plain revert in `platform-utils` is sufficient for that component.

### Procedure — roll back a bad prod image

The example uses `admin-backend`. Substitute the names from the table for any other app.

1. **Suspend the image automation.** Do this first. Until it is suspended, nothing you do to the tag
   survives.

    ```bash
    flux suspend image update admin-backend -n flux-system
    flux get image update            # confirm SUSPENDED for that row
    ```

2. **Revert the tag in the application repo.** The tag lives in the setter-marked `images:` entry of
   `k8s/overlays/prod/kustomization.yaml` in `admin-backend`. Revert the automation's own commit
   (`chore: update admin-backend image to …`) and merge to `main`:

    ```bash
    git -C <path-to>/admin-backend revert --no-edit <automation-commit-sha>
    git -C <path-to>/admin-backend push origin main
    ```

3. **Pull the revert into the cluster.**

    ```bash
    flux reconcile kustomization admin-backend -n flux-system --with-source
    ```

4. **Watch the workload settle.**

    ```bash
    kubectl rollout status deployment/admin-backend -n ingest --timeout=5m
    kubectl get pods -n ingest -l app=admin-backend
    ```

5. **Decide what happens next — do not resume yet.** See below.

!!! warning "Leaving automation suspended has a cost"
    A suspended `ImageUpdateAutomation` also blocks every *good* release for that app. Suspension is
    a hold, not a fix. Record it in the incident channel and close it out the same day.

### Resuming safely

```bash
flux resume image update admin-backend -n flux-system
```

!!! danger "Resuming while the bad tag is still the highest semver redeploys it immediately"
    `flux resume image update` does not reconsider the policy — the policy is unchanged, the bad tag
    is still the highest match for `>=1.0.0`, and the controller pushes it back on its next 5-minute
    interval.

    **The durable fix is a new, higher patch release** of the application containing the revert (for
    example `v2.17.1` superseding a bad `v2.17.0`). Cut that release, let it publish to GHCR, confirm
    the policy has selected it, and only then resume:

    ```bash
    flux reconcile image repository admin-backend -n flux-system
    flux get image policy admin-backend -n flux-system   # LATEST IMAGE must be the new tag
    flux resume image update admin-backend -n flux-system
    ```

    Deleting the bad tag from GHCR also works, but leaves a hole in the release history and does not
    help anyone who already pulled it. Prefer rolling forward.

    Narrowing the `ImagePolicy` range (for example to `>=1.0.0 <2.17.0`) is a `platform-infra`
    change and therefore **does not reach prod until a new `platform-infra` tag is cut** — see
    [Cluster-root rollback](#cluster-root-rollback). It is slower than a patch release, not faster.

### Staging

Staging uses the same triad with a release-candidate pattern
(`^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$`) and its own `ImageUpdateAutomation` objects under
`kubernetes/apps/*/overlays/staging/`. The procedure is identical; the highest-`rc`-wins trap is
identical.

### What health checks do and do not do

Most prod app `Kustomization`s set `wait: true` with a `healthChecks` entry — for example
`kubernetes/apps/backend/overlays/prod/flux-kustomization.yaml` waits on
`Deployment/admin-backend` in `ingest`, and `public-api` waits on `Deployment/public-api` in
`dashboard`.

!!! warning "`wait` + `healthChecks` detect a bad release; they never revert one"
    A failing health check marks the `Kustomization` `NotReady` and stops it reporting success. The
    bad manifests stay applied and the bad pods stay running. Nothing rolls back on its own — the
    procedure above is the only path. Note also that `camera-console` sets neither `wait` nor
    `healthChecks` (`timeout: 2m` only), so a bad `camera-console` release will not even show as
    `NotReady`.

---

## Cluster-root rollback

Use this when a change to `platform-infra` itself broke the cluster — Flux CR wiring, the
controller set, shared namespaces, priority classes, or the SOPS decryption patch.

### The two Git refs are not the same thing

This distinction is where most rollback mistakes start.

| | Tracks | Defined in |
|---|---|---|
| **Cluster root** (`GitRepository`/`Kustomization` named `flux-system`) | **prod:** semver tags on `platform-infra` — `semver: ">=1.0.0"`.<br>**staging:** `branch: main` on `platform-infra`. | `kubernetes/overlays/prod-cpt-aws/flux-system/gotk-sync.yaml`, `kubernetes/overlays/staging-cpt-aws/flux-system/gotk-sync.yaml` |
| **Per-app `GitRepository`** (`admin-backend`, `driver`, `public-api`, `camera-console`, `status-page`, `platform-utils`) | `branch: main` on **each application's own repo** — for both prod and staging overlays. | `kubernetes/apps/*/overlays/<env>/gitrepository.yaml`, `kubernetes/apps/utils/base/gitrepository.yaml` |

!!! warning "Staging's cluster root tracks `main`, not a `staging` branch"
    The dedicated `staging` branch of `platform-infra` was decommissioned after drifting behind.
    `kubernetes/overlays/staging-cpt-aws/flux-system/gotk-sync.yaml` reads `branch: main`. Any
    guidance that tells you to `git revert` on a `platform-infra` `staging` branch to roll back the
    staging cluster is wrong — that branch is not what staging reconciles.

    A `staging` branch *does* exist for **application** repos in the release workflow (it publishes
    `-rc` prereleases), which is the likely source of the confusion. Application branch ≠ cluster
    root ref.

### Prod — revert and roll forward to a higher tag

Prod's root resolves `semver: ">=1.0.0"`, which selects the **highest** `vX.Y.Z` tag on
`platform-infra`. Tags are cut by the release workflow (`.github/workflows/release.yml`) on pushes
to `main`; the current series is `v1.66.x`.

Two consequences, both load-bearing:

- Merging a fix to `main` **does not reach prod** until a tag is cut. The workflow's `paths-ignore`
  skips `docs/**`, `**/*.md`, `mkdocs.yml` — a docs-only commit cuts no tag.
- You **cannot** roll prod back by pushing a *lower* tag. The highest tag always wins, exactly as
  with image policies.

Procedure:

1. Identify the last known-good tag and the offending commit.

    ```bash
    git -C <path-to>/platform-infra fetch --tags
    git -C <path-to>/platform-infra tag --sort=-v:refname | head
    git -C <path-to>/platform-infra log --oneline v1.66.12..v1.66.13
    ```

2. Revert the offending commit on `main` and merge it. The release workflow cuts a **new, higher**
   tag containing the revert.

    ```bash
    git -C <path-to>/platform-infra revert --no-edit <bad-commit-sha>
    ```

3. Once the tag exists, pull it in rather than waiting for the 5-minute interval.

    ```bash
    flux reconcile source git flux-system -n flux-system
    flux reconcile kustomization flux-system -n flux-system
    flux get kustomizations
    ```

!!! danger "Do not hand-pin the root `GitRepository` ref"
    `flux-system/` is listed as the **first resource** of
    `kubernetes/overlays/prod-cpt-aws/kustomization.yaml`, so the root `Kustomization` reconciles
    `gotk-sync.yaml` — the root source manages itself. A `kubectl patch` of the root `GitRepository`
    ref is overwritten on the next root reconcile. `gotk-sync.yaml` is also Flux-generated and marked
    `DO NOT EDIT`.

    If you need to stop the bleeding faster than a release can be cut, **freeze** instead of
    re-pointing:

    ```bash
    flux suspend kustomization flux-system -n flux-system   # freezes the ENTIRE cluster root
    ```

    This halts all reconciliation for that cluster, including every app and infrastructure service.
    Treat it as a short-lived emergency measure, announce it, and resume with
    `flux resume kustomization flux-system -n flux-system` as soon as the corrected tag exists.

    To freeze only the affected area, suspend the individual child `Kustomization` instead
    (`flux suspend kustomization <name> -n flux-system`).

### Staging — revert on `main`

Staging's root tracks `branch: main` directly, so a merged revert reaches it on the next interval
with no tag required:

```bash
flux reconcile source git flux-system -n flux-system
flux reconcile kustomization flux-system -n flux-system
```

---

## Helm service rollback

Platform services are delivered as Flux `HelmRelease` objects. Their rollback behaviour is **not
uniform** — check which group your service is in before acting.

### Services that roll back automatically

Nine `HelmRelease` definitions set `install.remediation.retries: 3` and
`upgrade.remediation.retries: 3`. Flux's default remediation strategy is `rollback`, so a failed
upgrade is retried and then rolled back to the previous release without operator action.

Verify the list yourself:

```bash
grep -rl 'remediation' kubernetes/infrastructure --include='helmrelease*.yaml'
```

| `HelmRelease` | Namespace | Definition |
|---|---|---|
| `external-secrets` | `external-secrets` | `kubernetes/infrastructure/controllers/external-secrets/helmrelease.yaml` |
| `minio-operator` | `minio-operator` | `kubernetes/infrastructure/controllers/minio-operator/helmrelease.yaml` |
| `cloudnative-pg` | `cloudnative-pg` | `kubernetes/infrastructure/services/cloudnative-pg/base/helmrelease.yaml` |
| `defectdojo` | `security` | `kubernetes/infrastructure/services/defectdojo/base/helmrelease.yaml` |
| `dependency-track` | `security` | `kubernetes/infrastructure/services/dependency-track/base/helmrelease.yaml` |
| `minio-tenant` | `minio-ingest` | `kubernetes/infrastructure/services/minio/base/helmrelease.yaml` |
| `openreplay-databases` | `openreplay-db` | `kubernetes/infrastructure/services/openreplay/base/helmrelease-databases.yaml` |
| `openreplay` | `openreplay-app` | `kubernetes/infrastructure/services/openreplay/base/helmrelease-openreplay.yaml` |
| `sonarqube` | `security` | `kubernetes/infrastructure/services/sonarqube/base/helmrelease.yaml` |

Remediation covers a **failed** upgrade — a Helm hook error, a chart that will not install, a timeout.
It does not cover an upgrade that succeeds and then behaves badly. For that, use the manual procedure.

### Services with no remediation configured

Everything else, including `external-dns`
(`kubernetes/infrastructure/controllers/external-dns/helmrelease.yaml`) and `kube-prometheus-stack`
(`kubernetes/infrastructure/services/observability/**`), has no `remediation` block. A failed upgrade
there stays failed until an operator intervenes.

### Procedure — manual Helm rollback

1. **Read the current state.**

    ```bash
    flux get helmreleases -A
    kubectl describe helmrelease <name> -n <namespace>
    ```

2. **Suspend the release** so Flux stops re-applying the bad values.

    ```bash
    flux suspend helmrelease <name> -n <namespace>
    ```

3. **Revert the chart version or values in `platform-infra`** — this is a Git change, not a
   `helm rollback`. Edit the `helmrelease.yaml` (or the env overlay under
   `kubernetes/infrastructure/services/<svc>/overlays/<env>/`), then ship it through the route for
   that cluster: **a new tag for prod**, **a merge to `main` for staging**
   ([Cluster-root rollback](#cluster-root-rollback)).

4. **Resume and reconcile.**

    ```bash
    flux resume helmrelease <name> -n <namespace>
    flux reconcile helmrelease <name> -n <namespace>
    ```

!!! warning "`helm rollback` is a stopgap, not a fix"
    A direct `helm rollback` restores the previous release immediately, which is useful when you need
    the service back in seconds. It does **not** change Git, so `helm-controller` re-applies the bad
    version on the next reconcile unless the `HelmRelease` is suspended. Suspend first, then commit
    the real change.

---

## Infrastructure rollback

AWS and Azure resources are managed by Terragrunt/OpenTofu under `terraform/`. There is no automatic
rollback — reverting infrastructure means reverting the code and applying it.

State-level operations (`force-unlock`, `state mv`, `state rm`, `import`) are documented in
[Terraform state & backends](terraform-state.md#state-operations-that-are-safe-to-document) and are
not repeated here. Use that page when the *ledger* is wrong; use this section when the *resources*
are wrong.

### Procedure — revert and apply

1. **Identify the offending change and revert it in Git.**

    ```bash
    git -C <path-to>/platform-infra log --oneline -- terraform/aws/prod/af-south-1/<leaf>
    git -C <path-to>/platform-infra revert --no-edit <bad-commit-sha>
    ```

2. **Plan the revert in the affected leaf, and read the plan in full.** Run from inside the leaf
   directory with that account's profile — never from the tree root.

    ```bash
    cd terraform/aws/prod/af-south-1/<leaf>
    AWS_PROFILE=prod terragrunt plan -lock=false
    ```

3. **Confirm the plan contains only your revert.** This is the step that matters — see the drift
   caveat below.

4. **Apply.** This takes a `terraform-locks` row for the duration of the write.

    ```bash
    AWS_PROFILE=prod terragrunt apply
    ```

5. **Re-plan to confirm convergence.**

    ```bash
    AWS_PROFILE=prod terragrunt plan -lock=false     # expect: no changes
    ```

!!! danger "On a drifted leaf, revert-and-apply applies more than your revert"
    The [Terraform drift register](terraform-drift.md) records a full sweep of the **36 AWS leaves**:
    **21 report drift** and **6 are plan-blocked**. On a drifted leaf, `terragrunt apply` applies
    *everything* the plan proposes — the accumulated drift and any un-applied committed
    configuration, not just the commit you reverted.

    Some of those pending diffs are large and destructive. `network/af-south-1/vpc`, for example,
    plans **+58 creates** (net-new subnets, route tables, EC2 instances, EIPs, hosted zones), and
    `network/af-south-1/vpn` plans **8 destroys**. Applying a one-line revert in such a leaf would
    also execute all of that.

    Before applying:

    - Read the whole plan output. Do not apply on a summary line.
    - Check the leaf's entry in the [drift register](terraform-drift.md) — but re-run the plan, since
      that page is a point-in-time snapshot (2026-07-29).
    - If the plan contains anything you did not intend, **stop and escalate**. Narrowing the apply
      with `-target` is a deliberate, reviewed decision, not a default.
    - The `network` account is applied by hand and is not wired into CI
      ([Alerting & on-call](alerting-and-on-call.md)) — there is no pipeline gate to catch you there.

!!! note "Destroyed resources do not come back by reverting code"
    Reverting a commit that destroyed a stateful resource re-creates an **empty** one. For anything
    holding data, restore the data separately — see [Data restore](#data-restore). For a destroyed
    RDS instance, check for the final snapshot (`skip_final_snapshot` is off; prod also carries
    `deletion_protection`) before assuming the data is gone.

---

## Data restore

Not covered here — restoring a datastore is a different operation from rolling back a deployment, and
mixing the two runbooks makes both harder to follow under pressure.

See **[Backup & disaster recovery](backup-and-restore.md)** for the restore paths:

| Datastore | Restore path |
|---|---|
| CloudNativePG (Postgres) | [Recovery `Cluster` from the barman S3 store](backup-and-restore.md#restore-cloudnativepg-postgres) — PITR within the 30-day retention window |
| RDS MySQL (`capture_admin_portal`) | [Restore-from-snapshot / PITR](backup-and-restore.md#restore-rds-mysql); to move a snapshot to S3 see the [RDS snapshot export runbook](../runbooks/rds-snapshot-export.md) |
| MongoDB Atlas (capture events, watchlist log) | [Atlas-managed backups](backup-and-restore.md#mongodb-atlas-the-primary-capture-datastore) — external to this repo |
| S3 image buckets | Restore the prior object version (bucket versioning) |
| SOPS/Age keys | [SOPS/Age keys](backup-and-restore.md#sopsage-keys) |

---

## Cluster recovery

If Flux cannot be recovered in place — the `flux-system` namespace is gone, the controllers cannot be
reinstalled, or the cluster has been rebuilt — re-bootstrap it. The full procedure, including the
Calico chicken-and-egg ordering and re-creating the SOPS Age secret, is in
[**Flux bootstrap procedure**](../runbooks/flux-bootstrap.md).

Bootstrap paths: `kubernetes/overlays/prod-cpt-aws` and `kubernetes/overlays/staging-cpt-aws`.

!!! note "Single-region by design; there is no region-loss runbook"
    All three AWS accounts (`network`, `prod`, `staging`) deploy into **`af-south-1` only**, and no
    Terraform in this tree provisions a secondary region or an AWS Backup vault. Loss of
    `af-south-1` is an accepted limitation of the current posture, not a scenario with a documented
    recovery path. Recovery would be a rebuild from the Terraform tree plus a data restore, at
    whatever pace that takes.

---

## Verify it worked

Run these after any rollback, in this order. Every command is read-only.

```bash
# 1. Flux is reconciling and nothing is stuck or unexpectedly suspended
flux get kustomizations
flux get sources git
flux get helmreleases -A

# 2. Image automation is in the state you intended
flux get image repository
flux get image policy      # LATEST IMAGE must be the tag you want deployed
flux get image update      # SUSPENDED only where you deliberately suspended it

# 3. The workload actually rolled
kubectl rollout status deployment/admin-backend -n ingest --timeout=5m
kubectl get pods -n ingest -o wide
kubectl get events -n ingest --sort-by=.lastTimestamp | tail -20

# 4. The running image is the one you expect
kubectl get deploy admin-backend -n ingest \
  -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'

# 5. For an infrastructure rollback
AWS_PROFILE=prod terragrunt plan -lock=false     # from the leaf dir; expect no changes
```

Checklist before you close the incident:

- [ ] `flux get kustomizations` shows every root and child `Ready`.
- [ ] No `ImageUpdateAutomation` is left suspended, **or** each remaining suspension is recorded with
      an owner and a follow-up.
- [ ] No `HelmRelease` is left suspended without a recorded reason.
- [ ] The running image tag matches the intended tag, and the `ImagePolicy` selects that same tag —
      if the policy still selects the bad tag, the rollback is not finished.
- [ ] For prod: the corrected state is in a **tag**, not just on `main`.
- [ ] Rollback and its resolution posted to `#networking-alerts`; PagerDuty incident resolved.

---

## Open items

Gaps in this procedure that need an owner. Recorded here so they are visible during an incident
rather than discovered during one.

!!! warning "Confirm out-of-band before relying on these"
    - **State-file versioning is unverified.** No Terraform in this tree creates the state buckets
      (`example-<env>-<account-id>-af-south-1`) or the `terraform-locks` DynamoDB tables — they are
      a bootstrap prerequisite, referenced by `root.hcl` but not managed by it. Whether S3 object
      versioning is enabled on those buckets therefore **cannot be determined from this repo**. If it
      is off, a corrupted state object has no prior version to recover. Confirm with the platform
      owner and record the answer in [Terraform state & backends](terraform-state.md).
    - **No rollback has been rehearsed.** The image-automation sequence above is derived from the
      manifests, not from a drill. Schedule a staging rehearsal of the suspend → revert → reconcile →
      roll-forward sequence and correct this page from what it teaches.
    - **No documented rollback time budget.** There is no agreed target for how long a prod
      application rollback should take, nor a measured figure for how long one does take.
    - **`camera-console` has no health gate.** Its prod `Kustomization` sets neither `wait` nor
      `healthChecks`, so a bad release will not surface as `NotReady`. Decide whether to add one.
    - **Prod cluster-root rollback depends on the release workflow.** Rolling prod back requires a
      new tag from `.github/workflows/release.yml`. If that workflow is broken, the only lever is
      `flux suspend kustomization flux-system`, which freezes the whole cluster. There is no tested
      alternative path.
    - **Escalation is all-hands.** The PagerDuty escalation policy pages every engineer
      simultaneously with no rotation, so there is no defined rollback decision-maker at 03:00. See
      [Alerting & on-call](alerting-and-on-call.md).

---

## See also

- [GitOps with Flux](gitops-flux.md) — the reconciliation model, app wiring, and image-automation triad
- [Backup & disaster recovery](backup-and-restore.md) — datastore restore procedures
- [Terraform state & backends](terraform-state.md) — `force-unlock`, `state mv`/`rm`/`import`
- [Terraform drift register](terraform-drift.md) — per-leaf drift snapshot; read before any apply
- [Alerting & on-call](alerting-and-on-call.md) — channels, PagerDuty, silences
- [Flux bootstrap procedure](../runbooks/flux-bootstrap.md) — cluster re-bootstrap
- [Environments](environments.md) — cluster names, accounts, regions
