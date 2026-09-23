# Onboarding & access

This page is the ordered runbook for getting a new engineer productive on `platform-infra` — the
multi-cloud IaC + GitOps repo for the capture platform (af-south-1). Work through the
sections top to bottom: request the accounts that a human must grant, configure AWS SSO, pull a
kubeconfig, install the toolchain, wire up the commit hooks, then collect the secrets you need.

!!! info "Scope"
    This repo holds **no application source and builds no container images** — those live in each
    app's own repo and in the sibling repo `platform-utils`. Everything here is Terragrunt (AWS +
    Azure), FluxCD wiring, Ansible bootstrap, and in-cluster platform infrastructure. Onboarding
    below is for that non-application infrastructure. Prerequisites and day-to-day commands are also
    documented in `docs/setup.md`;
    this page is the access-request superset.

!!! warning "Human-approval steps are marked, not invented"
    Several steps require another person to grant access (AWS SSO, GitHub org, 1Password vaults, the
    Age private key). This repo does **not** record who those approvers are, so those steps are
    flagged as **Operator input needed**. Ask your onboarding buddy / team lead — do not assume.

## At a glance

| # | Access item | How it is granted | Grounded in |
|---|-------------|-------------------|-------------|
| 1 | AWS SSO (5 accounts) | A human assigns you permission sets in the identity store | Operator-supplied SSO map; account IDs in `terraform/aws/root.hcl` |
| 2 | `kubectl` to `prod-eks` / `staging-eks` | `aws eks update-kubeconfig` **+** your SSO role added to the cluster's `map_users` | `terraform/aws/{prod,staging}/af-south-1/eks/terragrunt.hcl` |
| 3 | Local toolchain | `brew` / `pip` install | `docs/setup.md`, `root.hcl` version pins |
| 4 | GitHub repo + commit hooks | GitHub org membership **+** `pre-commit install` | `.pre-commit-config.yaml` |
| 5 | Client VPN / network context | Read the boundary doc | `docs/handover/client-vpn.md` |
| 6 | Secrets (1Password, `PAGERDUTY_TOKEN`, SOPS Age key) | Vault invite **+** operator-held Age key transfer | `docs/reference/secrets-sops.md` |

---

## 1. AWS SSO access

All AWS access is via **AWS IAM Identity Center (SSO)**. There are no long-lived IAM users for
engineers — you authenticate through the SSO start URL and assume a permission set per account.

!!! warning "Operator input needed — who grants SSO"
    Assigning your user to these accounts/permission sets happens in the AWS Identity Center admin
    console (or the upstream IdP). **This repo does not record who administers that.** Request access
    from your onboarding buddy / whoever owns Identity Center; this page cannot name the approver.

### Accounts and profiles

The start URL is `https://example-corp.awsapps.com/start/#` and the SSO region is `af-south-1`. Suggested
profile names and their accounts:

| Profile | Account ID | Permission set | Repo confirmation |
|---------|-----------|----------------|-------------------|
| `network` | `210987654321` | `AdministratorAccess` | ✅ `local.network_account_id` in `root.hcl` |
| `shared` | `123456789012` | `AdministratorAccess` | ✅ `environments.shared.account_id` in `root.hcl` |
| `prod` | `777788889999` | `AdministratorAccess` | ✅ `environments.prod.account_id` in `root.hcl` |
| `staging` | `444455556666` | `AdministratorAccess` | ✅ `environments.staging.account_id` in `root.hcl` |
| `staging-readonly` | `444455556666` | `ReadOnlyAccess` | ✅ same account, read-only role |
| `dev` | `111122223333` | `AdministratorAccess` | ✅ `environments.dev.account_id` in `root.hcl` |

!!! note "Which account IDs are repo-derived"
    Every ID above is cross-checked against the `environments` map and
    `local.network_account_id` in
    `terraform/aws/root.hcl`
    (see also the account table in the repo `README.md`).

### Configure `~/.aws/config`

Use an `sso-session` block so all profiles share one login:

```ini
[sso-session platform]
sso_start_url = https://example-corp.awsapps.com/start/#
sso_region = af-south-1
sso_registration_scopes = sso:account:access

[profile network]
sso_session = platform
sso_account_id = 210987654321
sso_role_name = AdministratorAccess
region = af-south-1

[profile prod]
sso_session = platform
sso_account_id = 777788889999
sso_role_name = AdministratorAccess
region = af-south-1

[profile staging]
sso_session = platform
sso_account_id = 444455556666
sso_role_name = AdministratorAccess
region = af-south-1

[profile staging-readonly]
sso_session = platform
sso_account_id = 444455556666
sso_role_name = ReadOnlyAccess
region = af-south-1

# ...repeat for shared (123456789012) and dev (111122223333)
```

### Log in

```bash
aws sso login --sso-session platform     # opens the browser SSO flow once for all profiles
aws sts get-caller-identity --profile staging   # verify you assumed the right account

# The repo's setup.md also references an interactive profile selector:
awsp                                       # (helper; not shipped by this repo)
```

!!! note "`awsp` is a convenience, not a repo tool"
    `docs/setup.md`
    and the `README.md` both call `awsp` as an interactive profile selector. It is a personal
    shell helper, not part of this repo — plain `--profile <name>` (or `export AWS_PROFILE=<name>`)
    works everywhere.

---

## 2. Kubernetes access (kubeconfig)

Two EKS clusters run in `af-south-1`. The cluster **name** is derived in the EKS module as
`"${var.environment}-eks"`
(`terraform/aws/_modules/eks/main.tf`),
so:

| Cluster name | Environment | AWS profile | Flux bootstrap overlay |
|--------------|-------------|-------------|------------------------|
| `prod-eks` | prod (`777788889999`) | `prod` | `kubernetes/overlays/prod-cpt-aws` |
| `staging-eks` | staging (`444455556666`) | `staging` | `kubernetes/overlays/staging-cpt-aws` |

Pull each kubeconfig with the profile that matches the account:

```bash
aws eks update-kubeconfig --region af-south-1 --name prod-eks    --profile prod
aws eks update-kubeconfig --region af-south-1 --name staging-eks --profile staging
```

!!! note "Repo's documented variant"
    `docs/setup.md`
    writes to a per-cluster file and switches with `kubectx`
    (`--kubeconfig ~/.kube/staging.yaml` then `kubectx staging`). Either style works; the
    `--profile` form above writes into your default `~/.kube/config`.

!!! warning "kubeconfig alone is not cluster access"
    `update-kubeconfig` only writes local config. Authorization into the cluster is granted by the
    EKS module's `map_users`
    (`terraform/aws/prod/af-south-1/eks/terragrunt.hcl`,
    and the staging equivalent). As committed, each leaf maps a **single** admin SSO role
    (`AWSReservedSSO_AdministratorAccess_*`, username `site-a.example.net`, groups
    `system:masters`). To get `kubectl` access you must add **your** SSO role ARN to that `map_users`
    list and `terragrunt apply` the `eks` leaf.

    **Operator input needed:** confirm who applies EKS changes / owns the `map_users` edit before you
    add yourself — this page cannot name that person.

!!! warning "The cluster API endpoint is private-only"
    Both clusters set `endpoint_public_access = false` / `endpoint_private_access = true`
    (`terraform/aws/_modules/eks/main.tf`),
    so even with a kubeconfig **and** a `map_users` entry, `kubectl` reaches the API server only from
    **inside the cluster VPC** — there is no public endpoint. See §5 for the network-reachability
    caveat.

!!! note "EKS version skew (prod vs staging)"
    Per
    [`docs/reference/terraform-overview.md`](reference/terraform-overview.md), staging runs
    Kubernetes `1.35` and prod runs `1.32` (from the respective `region.hcl`). A single `kubectl`
    cannot sit inside the +/-1 minor skew window of both at once — keep that in mind, or install a
    version manager, if you switch between clusters.

---

## 3. Install the toolchain

Install the CLIs (macOS / Homebrew, matching
`docs/setup.md`):

```bash
# Kubernetes
brew install kubectl kubectx kustomize helm flux
# IaC
brew install terraform terragrunt
# Automation + cloud
brew install ansible awscli
# Secrets
brew install age sops
# Hooks
brew install pre-commit
# Docs preview
pip install mkdocs-material
```

### Versions that matter

The repo pins **provider and tool versions centrally** in the `locals` block of
`terraform/aws/root.hcl`.
You do not install providers by hand — Terragrunt fetches them from the generated `provider.tf` — but
the pinned floor of the Terraform/OpenTofu CLI does matter:

| What | Pin | Where |
|------|-----|-------|
| Terraform CLI (floor) | `>= 1.9.1` | `terraform_version` → generated `required_version` |
| `hashicorp/aws` provider | `6.36.0` | `aws_version` |
| `terraform-routeros/routeros` provider | `1.83.1` | `routeros_version` |
| `fortinetdev/fortios` provider | `1.22.0` | `fortios_version` |
| `PagerDuty/pagerduty` provider | `3.33.1` | `pagerduty_version` |

!!! note "OpenTofu, not stock Terraform"
    Although `setup.md` installs `terraform` and the generated blocks use `terraform { … }` syntax,
    the pipeline actually executes with **OpenTofu** (`tofu`) — the on-disk provider caches resolve
    from `registry.opentofu.org` (documented in
    [`docs/reference/terraform-overview.md`](reference/terraform-overview.md)). Installing OpenTofu
    (`brew install opentofu`) alongside or instead of Terraform matches the pipeline; both honour the
    `>= 1.9.1` floor.

!!! note "SOPS + Age are required for Terragrunt too"
    Leaves such as `eks` call `sops_decrypt_file(".../sops/<env>.enc.yaml")` at plan/apply time
    (`terraform/aws/*/af-south-1/eks/terragrunt.hcl`),
    so `sops` + `age` and the Age **private** key (section 6) must be present before you can `plan` a
    unit that decodes secrets — not only for Kubernetes work.

Confirm the essentials resolve:

```bash
aws --version && kubectl version --client && flux --version
terragrunt --version && tofu --version   # or: terraform --version
sops --version && age --version && pre-commit --version
```

---

## 4. Repo access + commit hooks (security-gate)

!!! warning "Operator input needed — GitHub org membership"
    The repo lives at `github.com/example-org/platform-infra`. Being added to the
    `example-org` GitHub org is a human-granted step. **This repo does not record who
    administers the GitHub org** — request it from your onboarding buddy.

Clone and install the hooks:

```bash
git clone https://github.com/example-org/platform-infra.git
cd platform-infra
pre-commit install            # installs BOTH pre-commit and pre-push hooks
pre-commit run --all-files    # run the full security-gate hook set once (slow first time)
```

The hook set is defined in
`.pre-commit-config.yaml`:
it pulls the **security-gate**
bundle (`example-org/security-gate`): `shellcheck`, `actionlint`, `hadolint`, `eslint`, `kustomize`,
`trivy`, `trufflehog`, `semgrep`, `pip-audit`, `npm-audit`, `govulncheck`, `checkov`. These mirror the
CI **`security-gate`** status check, which gates on **net-new** findings in the PR diff only
([`docs/reference/cicd-and-tooling.md`](reference/cicd-and-tooling.md)).

### Commit and branch conventions

- **Conventional Commits drive releases.** Versioning is automated (semantic-release / Release Workflows):
  `feat:` → minor, `fix:`/`perf:`/`chore:` → patch. Do **not** hand-edit the version in
  `pyproject.toml` or `CHANGELOG.md`
  (`docs/setup.md`).
- **Branch names** follow Conventional-Commit style — `<type>/<description>` (e.g.
  `feat/staging-security-tooling`, as seen in recent history). Allowed types: `feat`, `fix`, `docs`,
  `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Bypass hooks with `git commit --no-verify` **only in emergencies** — CI re-runs the gate anyway.

---

## 5. Client VPN / network access

Client sites (field MikroTik routers) reach the platform VPC over **AWS Site-to-Site VPN**. If your
work touches the client-network boundary, read the handover boundary doc rather than reinventing it:

- [`docs/handover/client-vpn.md`](handover/client-vpn.md) — the responsibility boundary, the AWS-side
  `vpn` module (`terraform/aws/_modules/vpn`,
  live leaf `terraform/aws/network/af-south-1/vpn`), and the generated MikroTik `.rsc` handover file.
- [`docs/runbooks/vpn-mikrotik-ipsec.md`](runbooks/vpn-mikrotik-ipsec.md) — aligning MikroTik IPsec
  lifetimes/DPD to the AWS side.
- [`docs/allow-list-platform.md`](runbooks/camera-site-allow-list.md) — the RouterOS firewall address-lists /
  filter rules that let the platform reach the cameras and routers.

!!! warning "EKS API endpoint is private-only — `kubectl` needs in-VPC reachability"
    General client-side networking is deliberately out of scope (the handover doc explains why). AWS
    control-plane access is via SSO, so `terragrunt plan`/`apply` need **no** VPN. But the EKS cluster
    API endpoint is configured **private-only** (`endpoint_private_access = true`,
    `endpoint_public_access = false` in
    `terraform/aws/_modules/eks/main.tf`) —
    there is **no** public API endpoint, so `kubectl` / `flux` reach the cluster only from **inside**
    the cluster VPC.

    **Operator input needed:** this repo does not document *how* an engineer reaches the private EKS
    endpoint (VPN, bastion, VPC-attached network, …). Confirm the access path with your onboarding
    buddy before assuming `kubectl` will connect.

---

## 6. Secrets & 1Password

Platform tooling references the **`Platform`** 1Password vault (e.g. the PagerDuty API key at
`op://platform/PagerDuty/API Key`). A few operator-held secrets — notably the SOPS Age private key —
are not in any shared vault; see the Age-key note below.

!!! warning "Operator input needed — vault invites"
    Being added to the `Platform` 1Password vault is human-granted. **This repo does not record the
    vault administrator** — request access from your onboarding buddy.

### `PAGERDUTY_TOKEN`

The `pagerduty` Terragrunt leaf's provider reads the `PAGERDUTY_TOKEN` environment variable — it is
**never committed**. The value lives in 1Password at `op://platform/PagerDuty/API Key`
([`docs/handover/cicd-and-notifications.md`](handover/cicd-and-notifications.md),
`terraform/aws/_modules/pagerduty/README.md`):

```bash
export PAGERDUTY_TOKEN="$(op read 'op://platform/PagerDuty/API Key')"
# then apply the leaf manually — the network account is NOT in CI:
cd terraform/aws/network/af-south-1/pagerduty && terragrunt apply
```

### SOPS Age private key

All SOPS ciphertext in the repo (`sops/*.enc.yaml` and committed `data`/`stringData` blocks) is
encrypted to a **single Age recipient** — public key
`age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5`, declared in `.sops.yaml`
([`docs/reference/secrets-sops.md`](reference/secrets-sops.md)). Decryption — locally and by Flux
in-cluster — needs the matching **private** key, which is **operator-held and not in Git**. It lives
on the operator's workstation as `.sops.agekey` and is exposed to `sops` via:

```bash
export SOPS_AGE_KEY_FILE="$HOME/.sops.agekey"
sops -d sops/staging.enc.yaml     # verify you can decrypt
```

!!! danger "Operator input needed — obtain the Age private key from its current holder"
    The Age private key is currently **single-custody** (held by the current operator; see the
    handover note in
    [`docs/reference/secrets-sops.md`](reference/secrets-sops.md)). Without it you cannot decrypt any
    SOPS secret, run Terragrunt leaves that decode `sops/<env>.enc.yaml`, or re-bootstrap a cluster.
    **This repo does not and must not contain the private key** — arrange the secure transfer with the
    current holder and record its backup location.

!!! note "Runtime app secrets are elsewhere"
    Most runtime credentials are **not** SOPS — they are pulled from **AWS Secrets Manager**
    (`af-south-1`) by the External Secrets Operator, reachable once you have SSO access to the account.
    See [`docs/reference/secrets-sops.md`](reference/secrets-sops.md) for the full inventory. SOPS is
    only for the bootstrap chicken-and-egg cases and a few legacy/staging secrets.

---

## New-engineer checklist

Work down this list; each item links to its section above.

- [ ] **Accounts requested** (human-approval): AWS SSO permission sets, `example-org`
      GitHub org, `Platform` 1Password vault, Age private-key transfer. *Operator input —
      approvers are not recorded in this repo.*
- [ ] **AWS SSO configured** — `~/.aws/config` `sso-session` + profiles (§1), `aws sso login`,
      `aws sts get-caller-identity --profile staging` succeeds.
- [ ] **kubeconfig pulled** — `aws eks update-kubeconfig … --name staging-eks --profile staging`
      (and `prod-eks` / `prod`); your SSO role added to the cluster `map_users` and applied (§2).
- [ ] **Toolchain installed** — kubectl/kustomize/helm/flux, terragrunt + OpenTofu/Terraform
      (`>= 1.9.1`), ansible, awscli, sops + age, pre-commit, mkdocs-material (§3).
- [ ] **Repo cloned + hooks** — `pre-commit install`; `pre-commit run --all-files` passes; you know
      the banned-trailer / Conventional-Commit rules (§4).
- [ ] **Network context read** — [`docs/handover/client-vpn.md`](handover/client-vpn.md) if your work
      touches the client boundary (§5).
- [ ] **Secrets in hand** — `PAGERDUTY_TOKEN` from 1Password when needed; `SOPS_AGE_KEY_FILE` set and
      `sops -d` works (§6).
- [ ] **Smoke test** — `flux get kustomizations` against a cluster, and `terragrunt plan` in a leaf
      env dir (e.g. `terraform/aws/staging/af-south-1/eks`) both run clean.
