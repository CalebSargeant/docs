# Secrets (SOPS + Age & External Secrets)

How `platform-infra` handles secret material. Two distinct planes coexist: **SOPS + Age**
encrypts secrets that are committed into Git as ciphertext (decrypted by Flux at apply time,
or by Ansible at bootstrap), while the **External Secrets Operator (ESO)** pulls runtime
secrets out of AWS Secrets Manager into Kubernetes `Secret` objects. In the intended architecture,
no secret material is committed or logged in plaintext -- though known legacy exceptions exist (see
[Legacy / tech-debt flags](#11-legacy-tech-debt-flags) and the Ansible and data-services pages).

## The two planes at a glance

| Plane | Encryptor / source | Consumer | What it protects |
| --- | --- | --- | --- |
| **SOPS + Age** | `sops` CLI, single Age recipient | Flux `kustomize-controller` (in-cluster) and Ansible (`community.sops`, at bootstrap) | Ciphertext committed to this repo: `sops/*.enc.yaml`, `ghcr-image-pull`, `github-app` |
| **External Secrets Operator** | AWS Secrets Manager (region `af-south-1`) | ESO controller → materialises k8s `Secret`s | Most runtime app/service credentials (DB, Cloudflare, Grafana, PagerDuty, OIDC, router fleet, …) |

The trend in the repo is **away from committed SOPS ciphertext and towards ESO/AWS Secrets
Manager**. SOPS remains for the chicken-and-egg cases (the `github_token` needed to bootstrap
Flux, the GHCR image-pull credential and GitHub App that Flux itself needs before ESO is
running) plus a handful of legacy/staging secrets.

---

## 1. The Age key and `.sops.yaml`

All SOPS encryption in the repo targets a **single Age recipient (public key)**, declared in
`.sops.yaml` at
the repo root:

```yaml
creation_rules:
  - age: "age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5"
```

Key facts:

- There is **one creation rule with no `path_regex`**, so every file `sops` encrypts in this
  repo is encrypted to that same recipient. Every `sops:` block across the tree lists the same
  `recipient: age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5`.
- The **private identity** is never in Git. It lives on the operator's workstation as
  `.sops.agekey` (path configured per environment in the Ansible vars — `age_key_path`,
  which resolves to the control node's `$HOME` via `lookup('env', 'HOME')`), and is exported for local `sops -d` via
  `export SOPS_AGE_KEY_FILE=<path>/.sops.agekey`.
- To encrypt a new value against the cluster key:

```bash
# Encrypt a k8s Secret in place, restricting encryption to data/stringData values:
sops --encrypt \
  --age age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5 \
  --encrypted-regex '^(data|stringData)$' -i my-secret.yaml

# Decrypt to inspect:
sops -d my-secret.yaml
```

!!! warning "One key protects everything — custody is tracked separately"
    The whole platform decrypts with this one Age identity; there is no per-account or
    per-environment key separation, and no committed rotation tooling. Losing the private
    `.sops.agekey` means nothing committed as SOPS ciphertext can be decrypted or re-sealed, a
    cluster cannot be re-bootstrapped, and several Terragrunt leaves cannot plan.

    **Who holds the key, where it is escrowed, and what rotating it touches** are recorded in
    [Secret stores](secret-stores.md) — start there rather than here.

---

## 2. `sops/*.enc.yaml` — the committed secret bundles

The `sops/` directory
holds five encrypted YAML bundles. **These are consumed by Ansible, not by Flux** (see §5) —
they are loaded at bootstrap/playbook time via `community.sops` and never applied as
Kubernetes objects. They are plain key→value maps (top-level keys stay readable; only the
values are `ENC[AES256_GCM,...]`). All five encrypt to the single Age recipient. They were written
by differing `sops` versions — `root.enc.yaml` with **v3.9.2**, `staging.enc.yaml` with **v3.11.0**,
and `network`/`prod`/`shared` with **v3.10.2** — which is expected, since each file records the
version that last rewrote it.

!!! warning "Do not attempt to decrypt these here"
    The tables below describe **structure and intent only** — the plaintext values are not
    reproduced. Key *names* are visible in the ciphertext because no `encrypted_regex` narrows
    them; treat the names as a map of what each bundle carries.

| File | Scope | Top-level keys (purpose) |
| --- | --- | --- |
| `root.enc.yaml` | Global / account-agnostic app + automation secrets | `cloudflare_api_key`, `ansible_sudo_pass`, `github_token`, `outlook_password`, `gmail_password`, `backend_import_*` (host/path/port/username/password/list_name), `auto_import_*` (same set), `api_secret`, `api_key`, `super_admin_login`, `super_admin_password`, `sentry_dns`, `sentry_env`, `crypto_js_aes_secret`, `agm_core_api_key`, `map_box_token`, `backend_api_key` |
| `prod.enc.yaml` | Prod environment | `ec2_password`, `public_key`, `db_password`, `db_readonly_password`, `db_lpradmin_password` |
| `staging.enc.yaml` | Staging environment (largest bundle) | `v1_chr_public_key`, `client_g_public_key`, `obs_chr_public_key`, `v1_chr_password`, `v1_db_password`, `obs_chr_password`, `db_password`, `obs_db_password`, `mongo_db`, `v1_mongo_url`, `mongo_url`, `v1_admin_password`, `mongo_password`, `mongo_login`, `file_storage_root_folder`, `azure_connection_string`, `aws_access_key_id`, `aws_secret_access_key`, `aws_region`, `s3_bucket`, `obs_chr_private_key`, `obs_chr_jump_public_key`, `obs_chr_wg_private_key`, `ec2_password`, `public_key`, `db_readonly_password` |
| `network.enc.yaml` | Network / edge devices | `fortigate_password`, `mikrotik_password`, `management_wg_key` |
| `shared.enc.yaml` | Shared across environments | `ec2_password`, `public_key`, `db_password` |

The `sops-load` Ansible role (see §5) resolves the pair `root.enc.yaml` + `<env>.enc.yaml`,
which is why environment bundles are named exactly `prod` / `staging` / etc.

---

## 3. In-tree encrypted Kubernetes `Secret`s (the Flux SOPS plane)

A few real Kubernetes `Secret` manifests are committed as SOPS ciphertext and decrypted **by
Flux inside the cluster** at apply time. These use `encrypted_regex: ^(data|stringData)$`
(only the secret values are encrypted; the manifest shape stays reviewable) and were sealed
with `sops` **v3.11.0**.

| Manifest | k8s Secret | Namespace | Purpose | Decrypted by |
| --- | --- | --- | --- | --- |
| `configs/ghcr-image-pull/secret.yaml` | `ghcr-credentials` (`.dockerconfigjson`) | `flux-system` | GHCR pull creds so Flux controllers can pull images before ESO exists | Top-level `flux-system` Kustomization (`sops-age`) |
| `configs/github-app/github-app-secret.yaml` | `github-app` (`githubAppID`, `githubAppInstallationID`, `githubAppPrivateKey`) | `flux-system` | GitHub App credentials for Flux image-update commits | Top-level `flux-system` Kustomization (`sops-age`) |

The two `flux-system` config secrets are pulled in as resources by
`configs/kustomization.yaml`
(`resources: [github-app, ghcr-image-pull, priority-classes.yaml]`) and are therefore
reconciled directly by the top-level `flux-system` Kustomization.

!!! note "The former staging capture secrets have been removed"
    Two SOPS-encrypted manifests (`backend-secrets`, `driver-secrets` in the staging `ingest`
    namespace) previously sat under `overlays/staging-cpt-aws/apps/edge-capture/`,
    already commented out of their kustomization. That whole tree was removed in commit `8567811c`;
    staging now sources these secrets the same way prod does. Because the ciphertext remains in Git
    history, treat those credentials as due for rotation if they were ever live — track it via
    [Secret stores](secret-stores.md).

---

## 4. How Flux decrypts SOPS

Flux SOPS decryption is wired in **two places**, each referencing a different Kubernetes
`Secret` that holds the Age private identity under the data key `identity.agekey`.

### 4a. Top-level Kustomization → `sops-age`

The Flux-generated
`gotk-sync.yaml`
(one per cluster overlay, `# DO NOT EDIT`) declares decryption on the root `flux-system`
Kustomization:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: flux-system
  namespace: flux-system
spec:
  path: ./kubernetes/overlays/<cluster>-cpt-aws
  prune: true
  decryption:
    provider: sops
    secretRef:
      name: sops-age            # <-- decrypts in-tree ciphertext (ghcr, github-app)
```

This is what decrypts the `flux-system` config secrets in §3.

### 4b. Per-app Kustomizations → `sops-keys` (label-selector patch)

Each cluster overlay's `kustomization.yaml`
(prod,
staging)
applies a strategic patch to **every Flux `Kustomization` carrying the label
`app.kubernetes.io/sops: enabled`**:

```yaml
patches:
  - patch: |
      apiVersion: kustomize.toolkit.fluxcd.io/v1beta2
      kind: Kustomization
      metadata:
        name: all
      spec:
        decryption:
          provider: sops
          secretRef:
            name: sops-keys       # <-- decrypts secrets living in the APP repos
    target:
      kind: Kustomization
      labelSelector: app.kubernetes.io/sops=enabled
```

The labelled Kustomizations are the per-app `flux-kustomization.yaml` objects (e.g.
`apps/driver/overlays/prod/flux-kustomization.yaml`,
`backend`, `status`, and the `utils/*` cronjobs). Each points at a **separate application
GitRepository** (`sourceRef.kind: GitRepository`, `path: ./k8s/overlays/<env>`), so this patch
enables Flux to decrypt SOPS secrets that live in *those* app repos as it reconciles them.
Labelled examples:

```
apps/driver/overlays/{prod,staging}/flux-kustomization.yaml
apps/backend/overlays/{prod,staging}/flux-kustomization.yaml
apps/status/overlays/{prod,staging}/flux-kustomization.yaml
apps/utils/overlays/{prod,staging}/{harddisk-hoover,watchlist-log-items,camera-probe-propagator,
                                    sonic-stragglers-report,distance-cache-cleanup,
                                    camera-image-size-report}/flux-kustomization.yaml
```

!!! danger "`sops-age` vs `sops-keys` — a genuine naming split"
    The two decryption wirings reference **different secret names**: the generated top-level
    Kustomization uses `sops-age`, while the label-selector patch (and both Ansible bootstrap
    roles, §5) use `sops-keys`. The Ansible roles only ever create `sops-keys`. Both are
    expected to carry the same Age identity under `identity.agekey`, but nothing in this repo
    creates a `sops-age` secret — that name comes from the default `flux bootstrap` decryption
    convention and must exist in-cluster for the `flux-system` config secrets (§3) to decrypt.
    If those secrets fail to decrypt after a fresh bootstrap, this mismatch is the first thing
    to check.

---

## 5. Ansible seeding of the Age key & SOPS bundles

Two roles plus the improved bootstrap role handle the Age identity and the encrypted bundles.

### `k3s-sops-age-secret` (k3s / obs cluster)

Role source.
Base64-encodes the local `<age_key_path>/.sops.agekey`, templates a `Secret` and applies it:

```yaml
- name: Base64 encode age key
  shell: cat {{ age_key_path }}/.sops.agekey | base64
  register: base64_key

- name: Create Kubernetes Secret manifest      # -> /tmp/sops-age-secret.yaml
  copy:
    content: |
      apiVersion: v1
      kind: Secret
      metadata:
        name: sops-keys
        namespace: flux-system
      type: Opaque
      data:
        identity.agekey: "{{ base64_key.stdout }}"

- name: Apply Kubernetes Secret
  command: kubectl apply -f /tmp/sops-age-secret.yaml
```

Invoked by
`k3s_bootstrap.yaml`
after `k3s-fluxcd-bootstrap`.

!!! note "Legacy commentary in this role"
    The top of the role is a long comment block documenting the historical GPG/PGP workflow
    and old `clusters/firefly/…` paths that no longer exist, plus several commented-out tasks.
    Only the two Age tasks above are live.

### `sops-load` (bundle decryption helper)

Role source.
Decrypts the committed bundles into Ansible facts for other playbooks:

```yaml
- name: Load root SOPS data
  set_fact:
    decrypted_root: "{{ lookup('file', '../sops/root.enc.yaml') | community.sops.decrypt | from_yaml }}"

- name: Load environment SOPS data
  set_fact:
    decrypted_env: "{{ lookup('file', '../sops/{{ env }}.enc.yaml') | community.sops.decrypt | from_yaml }}"
```

### `k8s-fluxcd-bootstrap-improved` (EKS prod & staging)

Role source.
Used by
`k8s_bootstrap_prod_cpt.yaml`
and
`k8s_bootstrap_staging_cpt.yaml`.
This role ties the whole chicken-and-egg together:

1. `community.sops.decrypt` on `root.enc.yaml` to get `decrypted_root.github_token`.
2. Runs `flux bootstrap github …` with `GITHUB_TOKEN: "{{ decrypted_root.github_token }}"`.
3. After Flux is up, creates the Age secret directly:

```yaml
- name: Create SOPS age key secret
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: Secret
      metadata:
        name: sops-keys
        namespace: flux-system
      type: Opaque
      data:
        identity.agekey: "{{ lookup('file', age_key_path + '/.sops.agekey') | b64encode }}"
```

Per-environment vars set `age_key_path` and `cluster_name`
(`prod_k8s.yaml`,
`staging_k8s.yaml`);
all resolve `age_key_path` to the control node's `$HOME` (via `lookup('env', 'HOME')`).

---

## 6. External Secrets Operator (ESO)

For everything that changes at runtime (and to avoid committing ciphertext at all), the repo
uses the External Secrets Operator against **AWS Secrets Manager** in `af-south-1`.

### Controller

`external-secrets/helmrelease.yaml`

- Chart `external-secrets` version `0.11.*`, images pinned to `v0.11.0`
  (`ghcr.io/external-secrets/external-secrets`), namespace `external-secrets`.
- `installCRDs: true`, webhook + cert-controller enabled, tight resource requests/limits.

### Stores

`clustersecretstore.yaml`
defines **two `ClusterSecretStore`s**:

| Store | Provider | Auth | Used for |
| --- | --- | --- | --- |
| `aws-secrets-manager` | AWS Secrets Manager, `af-south-1` | ESO controller's own EKS **Pod Identity** role in the local account | Almost every ExternalSecret |
| `aws-secrets-manager-network` | AWS Secrets Manager, `af-south-1`, assumes `arn:aws:iam::210987654321:role/router-fleet-secret-reader` | Cross-account role assumption from the prod ESO controller | Only the `router-fleet-credentials` ExternalSecret (router MikroTik creds under `routers/*` in the network account) |

Authentication is **EKS Pod Identity** (`pods.eks.amazonaws.com`), via a role named
`ExternalSecretsRole` per account:

- Staging account `444455556666`
- Prod account `777788889999`
- Network account `210987654321` (holds the `router-fleet-secret-reader` reader role)

!!! warning "IAM for ESO is out-of-band (not IaC)"
    The `ExternalSecretsRole` policies, Pod Identity associations, and the cross-account
    `sts:AssumeRole` grant are **not** expressed in this repo. They are documented as manual
    `aws` CLI steps in
    `more-terraform-tech-debt.md`.
    The prod-side `sts:AssumeRole` permission for the router-fleet reader is called out there
    as **STILL REQUIRED** — apply with prod credentials before the `router-fleet-credentials`
    ExternalSecret can sync.

### ExternalSecret pattern

Every ExternalSecret references a store and maps AWS Secrets Manager entries into a k8s
`Secret` with `creationPolicy: Owner`:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cloudflare-dns-api-token
  namespace: cert-manager
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: cloudflare-dns-api-token
    creationPolicy: Owner
  data:
    - secretKey: dns-api-token          # key inside the produced k8s Secret
      remoteRef:
        key: cloudflare                 # AWS Secrets Manager secret NAME
        property: dns-api-token         # JSON property inside that SM secret
```

Variations in use:

- **`refreshInterval: 1h`** on many (the appsec services, etc.); others omit it
  and take the ESO default.
- **`template.type`** to shape the output — e.g. GHCR credentials render
  `type: kubernetes.io/dockerconfigjson` and use `decodingStrategy: Base64`.
- **`dataFrom.extract`** to copy *every* key from a SM secret (OpenReplay's
  `openreplay-sm-values` extracts all of `staging-openreplay-app-secrets`).
- **static `username`** alongside a fetched password for DB-owner secrets.

### ExternalSecret inventory

| ExternalSecret (k8s Secret) | Namespace | Store | AWS SM `key` → `property` | Source file |
| --- | --- | --- | --- | --- |
| `ghcr-credentials` | `ingest`, `camera-console`, `status`, `misc`, `utils` | `aws-secrets-manager` | `github` → `image-pull` (Base64, dockerconfigjson) | `apps/{backend,camera-console,status,utils}/base/externalsecret.yaml` |
| `cloudflare-dns-api-token` | `cert-manager`, `external-dns` | `aws-secrets-manager` | `cloudflare` → `dns-api-token` | `controllers/{cert-manager,external-dns}/externalsecret.yaml` |
| `cloudflared-token` | `core` | `aws-secrets-manager` | `cloudflare` → `cloudflared-token` | `controllers/cloudflared/externalsecret.yaml` |
| `github-app-secret` | `github-runner` | `aws-secrets-manager` | `github` → `platform-bot-private-key.pem` | `services/github-runner/base/externalsecret.yaml` |
| `google-oidc-secret` | `security`, `minio-ingest`, `observability`, `openreplay-app` | `aws-secrets-manager` | `google` → `oidc-client-id`, `oidc-client-secret` | appsec-foundation, minio, observability, openreplay |
| `defectdojo` | `security` | `aws-secrets-manager` | `appsec/defectdojo` → `secret-key`, `credential-aes-256-key`, `admin-password` | `services/defectdojo/base/externalsecret-app.yaml` |
| `defectdojo-postgresql-specific` | `security` | `aws-secrets-manager` | `appsec/defectdojo` → `db-password` | `services/defectdojo/base/externalsecret-db.yaml` |
| `dependency-track-secret-key` | `security` | `aws-secrets-manager` | `appsec/dependency-track` → `secret-key` | `services/dependency-track/base/externalsecret-app.yaml` |
| `dependency-track-db` | `security` | `aws-secrets-manager` | `appsec/dependency-track` → `db-password` (+ static `username`) | `services/dependency-track/base/externalsecret-db.yaml` |
| `sonarqube-monitoring` | `security` | `aws-secrets-manager` | `appsec/sonarqube` → `monitoring-passcode` | `services/sonarqube/base/externalsecret-app.yaml` |
| `sonarqube-db` | `security` | `aws-secrets-manager` | `appsec/sonarqube` → `db-password` (+ static `username`) | `services/sonarqube/base/externalsecret-db.yaml` |
| `github-issue-targets` | `security` | `aws-secrets-manager` | `appsec/security-integrations` → `github-targets` | `services/security-integrations/base/externalsecret-github-targets.yaml` |
| `security-integrations` | `security` | `aws-secrets-manager` | `appsec/security-integrations` → `dependency-track-api-key`, `sonarqube-token` | `services/security-integrations/base/externalsecret-sync.yaml` |
| `slack-credentials` | `observability` | `aws-secrets-manager` | `slack-credentials` → `slack-bot-token` | `services/observability/base/krr/externalsecret.yaml` |
| `pagerduty-credentials` | `observability` | `aws-secrets-manager` | `pagerduty-credentials` → `routing-key` | `.../overlays/prod/kube-prometheus-stack/externalsecret-pagerduty.yaml` (prod only) |
| `grafana-credentials` | `observability` | `aws-secrets-manager` | `grafana` → `username`, `password` | `.../observability/overlays/{prod,staging}/kube-prometheus-stack/externalsecret.yaml` |
| `grafana-postgres-credentials` | `observability` | `aws-secrets-manager` | prod: `postgres` → `grafana_username`/`grafana_password`; staging: `grafana` → `db-password` (+ static `username`) | same as above |
| `mongo-uri` | `observability` | `aws-secrets-manager` | `mongo` → `MONGO_URI_READ_ONLY` | `.../observability/overlays/{prod,staging}/mongodb-exporter/externalsecret.yaml` |
| `mysql-credentials` | `observability` | `aws-secrets-manager` | `prod-db-readonly-credentials` → `username`, `password` | `.../observability/overlays/prod/mysql-exporter/externalsecret.yaml` (prod only) |
| `postgres-credentials` | `observability` | `aws-secrets-manager` | `postgres` → `readonly_username`, `readonly_password` | `.../observability/overlays/prod/postgres-exporter/externalsecret.yaml` (prod only) |
| `openreplay-sm-values` | `openreplay-app` | `aws-secrets-manager` | `dataFrom.extract` all of `staging-openreplay-app-secrets` | `services/openreplay/overlays/staging/externalsecret.yaml` (staging only) |
| `*-db-owner` (`grafana`, `sonarqube`, `defectdojo`, `dependencytrack`, `openreplay`) | `database` | `aws-secrets-manager` | per-app SM key → `db-password` / `postgresql-password` (+ static `username`) | `services/postgres/overlays/staging/externalsecret-*.yaml` (staging only) |
| `router-fleet-credentials` | `observability` | `aws-secrets-manager-network` | `routers/*` in network acct `210987654321` | shipped by the `router-fleet-resolver` app overlay (platform-utils repo) |

---

## 7. End-to-end flows (committed ciphertext → running pod)

**Flow A — Flux SOPS (in-tree ciphertext).**

```
sops --encrypt (Age)  →  git commit *.enc / secret.yaml
   →  Flux source-controller pulls the repo
   →  kustomize-controller decrypts with the Age identity in
      `sops-age` (top-level) or `sops-keys` (labelled Kustomizations)
   →  plaintext Secret applied to the cluster  →  pod mounts it
```

Covers: `ghcr-credentials` and `github-app` (flux-system), and any SOPS secrets inside the
per-app repos reconciled by `app.kubernetes.io/sops=enabled` Kustomizations.

**Flow B — External Secrets Operator (AWS Secrets Manager).**

```
Operator writes the value into AWS Secrets Manager (af-south-1)
   →  commit an ExternalSecret (NO secret material) referencing key/property
   →  ESO controller (EKS Pod Identity role, optionally assuming the network role)
      reads the SM secret on its refresh interval
   →  ESO creates/updates the target k8s Secret (creationPolicy: Owner)
   →  pod mounts it
```

Covers the majority of runtime credentials (the inventory in §6).

**Flow C — Ansible SOPS (bootstrap-time).**

```
Operator runs a bootstrap playbook on their workstation
   →  community.sops decrypts sops/root.enc.yaml (+ <env>.enc.yaml) with the local Age key
   →  github_token used to `flux bootstrap github`
   →  role seeds the `sops-keys` Secret (identity.agekey) so Flow A can run
```

---

## 8. Per-environment differences

| Aspect | Prod (`prod-cpt-aws`) | Staging (`staging-cpt-aws`) |
| --- | --- | --- |
| Flux Git ref | semver tags `>=1.0.0` | tracks `main` (dedicated `staging` branch decommissioned) |
| ESO account | `777788889999` | `444455556666` |
| Cross-account router store | **In use** — `aws-secrets-manager-network` → network acct `210987654321`; prod-side `sts:AssumeRole` still required | Not used |
| Prod-only ExternalSecrets | `pagerduty-credentials`, `mysql-credentials`, `postgres-credentials` (exporters) | — |
| Staging-only ExternalSecrets | — | OpenReplay (`openreplay-sm-values`), the shared-Postgres `*-db-owner` secrets, staging appsec DBs |
| In-tree SOPS k8s Secrets | `ghcr-credentials`, `github-app` (flux-system) | same two, **plus** the (orphaned) capture `backend-secrets` / `driver-secrets` under the staging apps overlay |
| Age key path (Ansible) | `$HOME` (`lookup('env','HOME')`) | `$HOME` (`lookup('env','HOME')`) |

The single Age recipient and both `ClusterSecretStore` definitions are shared across
environments — the difference is which account the ESO Pod Identity role resolves in and which
ExternalSecrets each overlay pulls in.

---

## 9. Operational notes & gotchas

!!! note "Adding a new SOPS-encrypted k8s Secret"
    Write the `Secret` manifest, then
    `sops --encrypt --age <recipient> --encrypted-regex '^(data|stringData)$' -i secret.yaml`.
    Add it to a kustomization that is reconciled by a Kustomization with SOPS decryption
    enabled (`sops-age` for the flux-system overlay, or a Kustomization labelled
    `app.kubernetes.io/sops=enabled` for app repos).

!!! note "Adding a new ESO-backed secret (preferred)"
    1. Put the value in AWS Secrets Manager in the right account (`af-south-1`).
    2. Commit an ExternalSecret referencing `key` (SM secret name) and `property` (JSON key) —
       **no secret material in Git**.
    3. Ensure the `ExternalSecretsRole` policy allows `GetSecretValue`/`DescribeSecret` on the
       secret ARN (this IAM is manual — see `more-terraform-tech-debt.md`).

!!! warning "`security-gate` / trufflehog / checkov gate committed secrets"
    Pre-commit (`.pre-commit-config.yaml`)
    runs `trufflehog`, `trivy`, `checkov`, `semgrep` etc. ExternalSecret files sometimes trip
    `CKV_SECRET_6` on the *property/key name* even though they hold no secret value; the repo
    convention is an inline `# checkov:skip=CKV_SECRET_6: property/key name only` annotation
    (see the PagerDuty ExternalSecret for the pattern).

!!! warning "Verifying a stuck cross-account ExternalSecret"
    ```bash
    kubectl -n observability get externalsecret router-fleet-credentials
    kubectl -n observability get secret router-fleet-credentials   # created by ESO on success
    ```
    If it never becomes `Ready`, confirm the prod `ExternalSecretsRole` has the
    `sts:AssumeRole` grant on `arn:aws:iam::210987654321:role/router-fleet-secret-reader`.

---

## 10. Age private key: custody and rotation

Everything in `sops/*.enc.yaml` and every committed `stringData`/`data` block is encrypted to a **single Age recipient** (public key `age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5`). Decryption — by Flux in-cluster and by engineers locally — needs the matching **Age private key**.

**Custody.** The private key is operator-held and is **not** stored in this repo. It was generated with `age-keygen` and kept in a local file (`~/.sops.agekey` / `age.agekey`), exposed to `sops` via `SOPS_AGE_KEY_FILE`. In-cluster, the Ansible bootstrap roles (k3s-sops-age-secret and k8s-fluxcd-bootstrap-improved) seed that same private key into the `sops-keys` Secret in `flux-system`, which Flux's kustomize-controller uses to decrypt.

!!! danger "Handover action — transfer the Age private key"
    Whoever takes this over must obtain the Age **private** key from the current holder and store it securely (password manager / secrets vault). Without it, no SOPS secret can be decrypted or edited and a cluster cannot be re-bootstrapped. It is currently **single-custody** — confirm and record its backup location.

**Rotation** (manual — there is no committed tooling for it yet):

1. Generate a new identity — `age-keygen -o new.agekey` — and note the new `age1…` recipient.
2. Add the new recipient to `.sops.yaml` alongside the old one, then re-encrypt everything: `sops updatekeys sops/*.enc.yaml` and each committed secret.
3. Re-seed the cluster `sops-keys` Secret with the new private key (re-run the bootstrap role / patch the Secret) and reconcile Flux.
4. Once everything decrypts with the new key, drop the old recipient from `.sops.yaml`, `sops updatekeys` again, and retire the old key.

---

## 11. Legacy / tech-debt flags

!!! note "`.old.enc.tar.gz` — removed"
    A 4.4 MB committed, git-tracked encrypted tarball formerly sat at the repo root. It was
    **deleted from the working tree in a cleanup PR** (it still exists in git history). If it
    ever held live secrets, rotate them.

Other items worth tracking:

- **`sops-age` vs `sops-keys` naming split** (see §4) — the generated top-level Kustomization
  references a `sops-age` secret that nothing in this repo creates; the Ansible roles and the
  label patch use `sops-keys`.
- **Orphaned capture SOPS secrets** — `admin-backend/secret.yaml` and `capture-driver/secret.yaml`
  are committed ciphertext but commented out of their kustomization (§3).
- **ESO IAM is not IaC** — roles, Pod Identity associations and the cross-account grant live
  only as CLI snippets in `more-terraform-tech-debt.md`; one grant is still unapplied in prod.
- **Duplicate/generation-split bootstrap roles** — `k8s-fluxcd-bootstrap` vs
  `k8s-fluxcd-bootstrap-improved` (and the k3s `k3s-fluxcd-bootstrap`) all seed the Age secret;
  only the `-improved` role is wired into the current EKS bootstrap playbooks.
- **Dead commentary** in `k3s-sops-age-secret/tasks/main.yml` — a large block of superseded
  GPG/PGP instructions and references to non-existent `clusters/firefly/` paths.
- **Single Age identity, no rotation tooling** — one key decrypts everything; there is no
  committed procedure for rotating it or the many secrets sealed to it.
