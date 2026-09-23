# Secret stores

An orientation map of **every place secret material for the platform is kept** — one row per store, so
you know where to look before you go looking. This page is deliberately shallow: it does not repeat
how the underlying tools work (upstream documentation is linked at the bottom) and it does not
duplicate the per-secret inventories, which live in
[Secrets (SOPS + Age)](secrets-sops.md). What it adds is the *inventory*, the **key custody**
position, and the **blast radius** of rotating the one key that unlocks the committed plane.

!!! info "Scope"
    Six stores are in use. Two of them (SOPS/Age and AWS Secrets Manager via External Secrets) hold
    the bulk of the material; the other four are narrow and specific. Nothing on this page reproduces
    a key, a token, or a decrypted value.

## The stores at a glance

| Store | What lives there | Who administers it | How it is accessed | Documented in detail |
|---|---|---|---|---|
| **SOPS + Age** (ciphertext committed to Git) | Five `sops/*.enc.yaml` bundles plus a handful of in-tree encrypted Kubernetes `Secret` manifests | Holder of the Age private identity — **not yet recorded, owner to confirm** | `sops -d` locally with `SOPS_AGE_KEY_FILE`; Flux and Ansible decrypt with the same identity | [Secrets (SOPS + Age) §1–§3](secrets-sops.md) |
| **AWS Secrets Manager** (`af-south-1`), read by the **External Secrets Operator** | Most runtime app/service credentials — DB, Cloudflare, Grafana, PagerDuty, OIDC, router fleet | Per AWS account; whoever holds the account's admin permission set | Console/CLI with the account's SSO profile; in-cluster via ESO Pod Identity | [Secrets (SOPS + Age) §6](secrets-sops.md#6-external-secrets-operator-eso) |
| **In-cluster Age identity** — the `sops-age` and `sops-keys` Kubernetes `Secret`s | One copy each of the Age **private** identity, under `identity.agekey` in `flux-system` | Whoever runs the Ansible bootstrap / has `system:masters` on the cluster | `kubectl` inside the cluster VPC | [Secrets (SOPS + Age) §4–§5](secrets-sops.md#4-how-flux-decrypts-sops) |
| **GitHub Actions secrets** (org + repo level) | CI-only credentials: Cloudflare, AWS OIDC role, Azure, Infracost, Sentry, release app, and a copy of the Age key | GitHub org owners — **not yet recorded, owner to confirm** | Write-only through the GitHub UI/API; readable only by a workflow run | [CI/CD & tooling](cicd-and-tooling.md), [CI/CD & Slack notifications](../handover/cicd-and-notifications.md) |
| **1Password — `the platform` vault** | Operator-held credentials that have no other home, e.g. `op://platform/PagerDuty/API Key` | Vault administrator — **not yet recorded, owner to confirm** | `op read` / the 1Password app, once invited to the vault | [Onboarding & access §6](../onboarding.md) |
| **AWS IAM Identity Center** (human identities) | Not a secret store, but the credential plane every AWS-backed store above depends on | Identity Center administrator — **not yet recorded, owner to confirm** | `aws sso login` against `https://example-corp.awsapps.com/start/#` | [AWS accounts & access](aws-accounts.md) |

!!! note "The 'who administers' column is the open item on this page"
    Four of the six rows have no recorded administrator. That is an accounting gap, not a technical
    one — the access itself works. Filling those four cells in is the useful next edit to this page,
    and the same gap is already flagged from the joining side in
    [Onboarding & access](../onboarding.md) and in the org-guardrails note in
    [AWS accounts & access](aws-accounts.md#organization-structure-guardrails).

---

## 1. SOPS + Age — the committed plane

`.sops.yaml` at the repo
root carries exactly **one creation rule with one Age recipient** and **no `path_regex`**:

```yaml
creation_rules:
  - age: "age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5"
```

The practical consequence is worth stating plainly: **one key decrypts everything in the tree** —
every bundle, every in-tree encrypted manifest, in every environment. There is no per-account or
per-environment separation.

### The five bundles

`sops/` holds five encrypted
YAML bundles. They are consumed by **Ansible**, not by Flux — the `sops-load` role pairs
`root.enc.yaml` with `<env>.enc.yaml`, which is why the environment bundles are named exactly after
the environments. Ten Terragrunt leaves also read `<env>.enc.yaml` directly at plan time (see
[Rotation blast radius](#rotation-blast-radius)).

| Bundle | Scope | Approximate shape | `sops` version that wrote it |
|---|---|---|---|
| `root.enc.yaml` | Global / account-agnostic app + automation secrets | 27 keys — `github_token`, `cloudflare_api_key`, `ansible_sudo_pass`, the `backend_import_*` / `auto_import_*` sets, Sentry, Mapbox, super-admin | `3.9.2` |
| `prod.enc.yaml` | Prod environment | 5 keys — EC2 and database passwords | `3.10.2` |
| `staging.enc.yaml` | Staging environment (the largest bundle) | 25 keys — CHR/WireGuard keys, Mongo, Azure and AWS credentials, database passwords | `3.11.0` |
| `network.enc.yaml` | Network / edge devices | 3 keys — `fortigate_password`, `mikrotik_password`, `management_wg_key` | `3.10.2` |
| `shared.enc.yaml` | Shared across environments | 3 keys — EC2 and database credentials | `3.10.2` |

The per-key breakdown is in
[Secrets (SOPS + Age) §2](secrets-sops.md); it is not repeated here.

!!! note "The bundles were sealed by three different `sops` versions"
    `root.enc.yaml` was written by `3.9.2`, `staging.enc.yaml` by `3.11.0`, and the other three by
    `3.10.2` — each file records the version in its own `sops:` metadata block. All five still
    decrypt with a current CLI; the spread simply reflects when each was last touched. It is worth
    knowing before a bulk `sops updatekeys`, which will normalise every bundle onto whichever
    version you run.

### In-tree encrypted Kubernetes `Secret`s

A small number of real Kubernetes `Secret` manifests are committed as ciphertext and decrypted by
Flux in-cluster — the GHCR image-pull credential and the GitHub App credentials that Flux needs
*before* External Secrets exists, plus two staging capture secrets that are currently commented out of
their kustomization. See
[Secrets (SOPS + Age) §3](secrets-sops.md).

---

## 2. AWS Secrets Manager via External Secrets

Everything that changes at runtime lives in **AWS Secrets Manager** in `af-south-1` and is pulled
into the clusters by the External Secrets Operator. No secret material is committed for this plane —
only `ExternalSecret` objects naming a store, a key and a property.

Two `ClusterSecretStore`s are defined: `aws-secrets-manager` (the ESO controller's own EKS Pod
Identity role in the local account) and `aws-secrets-manager-network` (cross-account into the
network account for the router-fleet credentials).

The 25-row `ExternalSecret` inventory — every k8s Secret, its namespace, its store, and the AWS
Secrets Manager key/property behind it — is maintained in
[Secrets (SOPS + Age) §6](secrets-sops.md#6-external-secrets-operator-eso). Use that table rather
than re-deriving it.

!!! warning "The IAM behind this store is not in Terraform"
    The `ExternalSecretsRole` policies, the Pod Identity associations, and the cross-account
    `sts:AssumeRole` grant are applied out of band, not by this repo, and one prod-side grant is
    recorded as still outstanding. Before assuming an `ExternalSecret` failure is a store problem,
    check the IAM notes in
    [Secrets (SOPS + Age) §6](secrets-sops.md#6-external-secrets-operator-eso) and the
    `more-terraform-tech-debt.md` file it links to.

---

## 3. The in-cluster Age identity — two secret names

Flux decrypts SOPS ciphertext using the Age private identity stored in a Kubernetes `Secret` under
the data key `identity.agekey`. This repo wires that up in **two places, under two different secret
names**, and both are load-bearing:

| Secret name | Referenced by | Decrypts |
|---|---|---|
| `sops-age` | The generated top-level Kustomization in `kubernetes/overlays/prod-cpt-aws/flux-system/gotk-sync.yaml` (one per cluster overlay, marked `DO NOT EDIT`) | The in-tree `flux-system` config secrets — GHCR pull creds and the GitHub App |
| `sops-keys` | The label-selector patch in each cluster overlay's `kustomization.yaml`, and both Ansible bootstrap roles | SOPS secrets living in the **application** repos, reconciled by Kustomizations labelled `app.kubernetes.io/sops=enabled` |

!!! warning "Both names must exist in-cluster, and only one of them is created by this repo"
    The Ansible bootstrap roles create `sops-keys`. Nothing in this repo creates `sops-age` — that
    name comes from the `flux bootstrap` default convention and must already be present for the
    `flux-system` config secrets to decrypt. After a fresh bootstrap, if those secrets fail to
    decrypt, check for a missing `sops-age` first. The full analysis is in
    [Secrets (SOPS + Age) §4](secrets-sops.md#4-how-flux-decrypts-sops).

---

## 4. GitHub Actions secrets

CI credentials are held as GitHub Actions secrets at two levels. Confirmed present:

| Level | Secret | Used by |
|---|---|---|
| Org (`example-org`) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `deploy-docs.yml` — publishes this site to a Cloudflare Worker behind Cloudflare Access |
| Org | `SEMANTIC_RELEASE_APP_ID`, `SEMANTIC_RELEASE_APP_PRIVATE_KEY` | The org release tooling (Release Workflows / semantic-release) invoked by `release.yml` |
| Org | `SENTRY_AUTH_TOKEN` | Sentry release integration in the org workflows |
| Repo (`platform-infra`) | `SOPS_AGE_KEY` | `terragrunt-plan-cost-deploy.yaml` — passed to the reusable Terragrunt workflow so `sops_decrypt_file` resolves at plan time |
| Repo | `AWS_ROLE_TO_ASSUME` | Same workflow — OIDC role assumption for the staging Terragrunt run |
| Repo | `AZURE_CREDENTIALS` | `invite-avd-user.yaml` — Azure login for the AVD invite script |
| Repo | `INFRACOST_API_KEY` | The cost-estimation step of the Terragrunt workflow — **currently commented out**, so the secret is stored but inert |
| Repo | `MONGODB_URI`, `SLACK_BOT_TOKEN` | Not referenced by any workflow in `.github/` today. Both names appear as *runtime* env vars elsewhere (utility images, the KRR CronJob) but CI does not inject them — see the note in [CI/CD & Slack notifications](../handover/cicd-and-notifications.md) |

!!! warning "`SOPS_AGE_KEY` is a third copy of the Age private key — and it is not an escrow"
    GitHub Actions secrets are **write-only**: once stored, the value can be overwritten but never
    read back through the UI or the API. Only a workflow run can see it. So although
    `SOPS_AGE_KEY` holds the same Age private identity as the operator's `~/.sops.agekey` and the
    in-cluster `sops-keys` / `sops-age` Secrets, it **cannot be used to recover the key** if the
    other copies are lost. Treat it as a third *consumer*, never as a backup. A real escrow — a copy
    that a second person can retrieve — is the open item in [Key custody](#key-custody) below.

---

## 5. 1Password — the `the platform` vault

The `the platform` vault is where operator-held credentials with no other home are kept. The one
reference committed to this repo is the PagerDuty API key:

```bash
export PAGERDUTY_TOKEN="$(op read 'op://platform/PagerDuty/API Key')"
```

It is read by the `pagerduty` Terragrunt leaf's provider, which is applied manually because the
network account is not in CI. See
[Alerting & on-call](alerting-and-on-call.md) and
[Onboarding & access §6](../onboarding.md).

!!! note "Vault contents beyond the PagerDuty key are not recorded here"
    Only items this repo actually references can be listed with confidence. A vault inventory —
    what else is in `the platform`, and who else holds access — is worth capturing, and is an open item
    for the vault administrator to confirm.

---

## 6. AWS IAM Identity Center

Human access to every AWS account is through IAM Identity Center (SSO); there are no long-lived IAM
users for engineers. Because AWS Secrets Manager sits behind that same identity plane, SSO
effectively gates one of the two major secret stores.

The account inventory, the SSO start URL, and the cross-account role model are in
[AWS accounts & access](aws-accounts.md). That page **deliberately does not enumerate permission-set
assignments** — the Identity Center configuration (permission set definitions, group and user
assignments, session duration) is not derivable from Git and is recorded there as operator input
needed. This page takes the same position rather than guessing.

---

## Key custody

Everything in the committed plane — all five bundles and every in-tree `data`/`stringData` block —
is encrypted to the **single Age recipient**
`age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5`. Decryption, locally and
in-cluster, requires the matching **private** identity.

Where copies of that private identity are known to exist:

| Copy | Location | Retrievable by a second person? |
|---|---|---|
| Operator workstation | `~/.sops.agekey`, exported via `SOPS_AGE_KEY_FILE` | No — local file on one machine |
| Cluster (prod and staging) | `sops-keys` / `sops-age` Secrets in `flux-system` | Yes, with `system:masters` and in-VPC `kubectl` — but only while a cluster is healthy |
| CI | `SOPS_AGE_KEY` repo secret | **No** — GitHub Actions secrets are write-only |
| Escrow / backup | *Not yet recorded* | — |

!!! note "Open action — record the escrow location"
    The Age identity is currently **single-recipient and single-custody**. The escrow location is
    the one field missing from the table above, and only the current key holder can supply it. The
    action is: place a copy somewhere a second person can retrieve it — the `the platform` 1Password
    vault is the natural candidate — and then replace the placeholder below with the real reference.

    ```text
    Age private identity escrow: <to be confirmed by the current key holder>
      e.g. op://platform/SOPS Age key/private key
    Second holder:               <to be confirmed>
    Last verified:               <date>
    ```

    Until that is filled in, treat the in-cluster `sops-keys` Secret as the only copy a second
    person can reach, and only while a cluster is up. The same action is tracked from the joining
    side in [Onboarding & access §6](../onboarding.md) and in
    [Secrets (SOPS + Age) §10](secrets-sops.md#10-age-private-key-custody-and-rotation).

---

## Rotation blast radius

Because one key covers the whole tree, rotating the Age identity is a coordinated change across four
surfaces, not a single edit. The step-by-step procedure is in
[Secrets (SOPS + Age) §10](secrets-sops.md#10-age-private-key-custody-and-rotation); what follows is
the checklist of *what must move together*.

- [ ] **The five bundles** — re-encrypt `sops/*.enc.yaml` to the new recipient.
- [ ] **The in-tree Kubernetes `Secret`s** — the `flux-system` GHCR and GitHub App manifests, and any
      SOPS secrets in the application repos reconciled by labelled Kustomizations.
- [ ] **Both in-cluster secret names, on both clusters** — `sops-age` *and* `sops-keys` in
      `flux-system` on prod and staging. Updating only one leaves half the reconciliation broken.
- [ ] **The CI secret** — `SOPS_AGE_KEY` on `platform-infra`.
- [ ] **`.sops.yaml`** — add the new recipient, re-encrypt, verify, then drop the old one.
- [ ] **Any escrow copy** — once [Key custody](#key-custody) is filled in, that copy is a rotation
      target too.

!!! warning "A partial rotation breaks `terragrunt plan`, not just Flux"
    Ten live Terragrunt leaves call `sops_decrypt_file("sops/<env>.enc.yaml")` in their `locals`,
    which means decryption happens at **plan** time — before any apply, and for anyone running
    `terragrunt plan` locally as well as in CI:

    | Environment | Leaves under `terraform/aws/<env>/af-south-1/` |
    |---|---|
    | `prod` | `cache`, `eks`, `rds`, `config-mikrotik` |
    | `staging` | `cache`, `eks`, `rds` |
    | `network` | `config-fortigate`, `config-mikrotik`, `eip-failover-lambda` |

    (An eleventh call, in `prod/af-south-1/load-balancers`, is commented out.)

    If the bundles are re-encrypted but a consumer still holds the old identity, that consumer stops
    planning immediately — with a `sops` decryption error rather than an obvious key-rotation
    message. **Safe sequence:** add the new recipient *alongside* the old one, re-encrypt, roll the
    new key out to every consumer above, confirm both Flux reconciliation and a `terragrunt plan` in
    each of the three environments, and only then remove the old recipient and re-encrypt again.

---

## Upstream documentation

This page describes what is in place here. For how the tools themselves work, go to the source:

- **SOPS** — [getsops.io](https://getsops.io/) ([GitHub](https://github.com/getsops/sops))
- **Age** — [github.com/FiloSottile/age](https://github.com/FiloSottile/age)
- **External Secrets Operator** — [external-secrets.io](https://external-secrets.io/)
- **AWS Secrets Manager** — [docs.aws.amazon.com/secretsmanager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- **GitHub Actions secrets** — [docs.github.com — using secrets in Actions](https://docs.github.com/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- **AWS IAM Identity Center** — [docs.aws.amazon.com/singlesignon](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html)

## See also

- [Secrets (SOPS + Age)](secrets-sops.md) — the deep dive: bundle contents, the Flux decryption
  wiring, the Ansible seeding roles, and the full `ExternalSecret` inventory.
- [AWS accounts & access](aws-accounts.md) — the account inventory and the SSO/cross-account model
  every AWS-backed store depends on.
- [CI/CD & tooling](cicd-and-tooling.md) — the workflows that consume the Actions secrets above.
- [Onboarding & access](../onboarding.md) — how a joiner is granted access to each store.
- [Offboarding & revocation](../handover/offboarding.md) — how access is withdrawn, and when a
  departure makes an Age key rotation necessary.
