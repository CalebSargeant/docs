# CI/CD & Tooling

The automation and quality-gate layer for `platform-infra`: GitHub Actions workflows,
the Release Workflows + semantic-release versioning flow, the Security Gate workflow, pre-commit
hooks, the Terragrunt deployment pipeline, and the repo's linter/config toolchain. Almost
everything here is driven from `.github/`
plus a handful of root-level config files.

## Layout

| Path | Role |
|------|------|
| `.github/workflows/release.yml` | Release Workflows branch-based release / versioning |
| `.github/workflows/security.yml` | Security Gate — MegaLinter scan with net-new gating |
| `.github/workflows/terragrunt-plan-cost-deploy.yaml` | Terragrunt plan / cost / apply pipeline |
| `.github/workflows/deploy-docs.yml` | Build + deploy this docs site to a Cloudflare Worker |
| `.github/workflows/generate-wireguard-tunnel.yml` | On-demand WireGuard tunnel config generator (opens a PR) |
| `.github/workflows/invite-avd-user.yaml` | Invite an external user to Azure Virtual Desktop |
| `.github/CODEOWNERS` | Global code ownership / review routing |
| `.github/dependabot.yml` | Dependabot config (GitHub Actions SHAs) |
| `.github/pull-request-workflow.json` | GitHub→Slack user mapper (orphaned — see Legacy) |
| `.pre-commit-config.yaml` | Local pre-commit / pre-push hook set |
| `.mega-linter.yml` | MegaLinter linter allowlist consumed by Security Gate |
| `pyproject.toml` | `python-semantic-release` config (versioning) |
| `sonar-project.properties` | SonarQube/SonarCloud project key |
| `scripts/build-docs.sh` | Reproducible docs build (used by CI and local preview) |
| `scripts/invite-avd-user.sh` | AVD invite + role assignment implementation |

!!! note "Action pinning"
    Managed workflows pin every `uses:` to a full commit SHA with the resolved tag in a
    trailing comment (e.g. `actions/checkout@9c091bb… # v7.0.0`). Dependabot bumps those
    SHAs weekly. The pre-commit hooks are the one exception (a floating `v1` tag — see
    Legacy).

---

## Release & versioning (Release Workflows + semantic-release)

Releases run through `release.yml`,
which wraps **Release Workflows** (`example-org/release-workflows@…v2.3.0`), the org's branch-based release
action. Versioning itself is **`python-semantic-release`**, configured under
`[tool.semantic_release]` in `pyproject.toml` — Release Workflows auto-detects the
`semantic-release-python` tool from that stanza, so it is not pinned in the workflow.

### Triggers and modes

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [staging, main]
    paths-ignore: ['**/*.md', docs/**, mkdocs.yml, LICENSE, .gitignore]
  workflow_dispatch:
```

| Event | Release Workflows step | `mode` | Result |
|-------|---------------|--------|--------|
| Pull request (not closed) | PR image build | `ci` | Builds a `pr-<N>` image (only if a `docker-bake.hcl` exists) |
| Push to `staging` | Release | `release` | `rc` prerelease for the `staging` environment |
| Push to `main` | Release | `release` | Stable `prod` version + git tag |
| `workflow_dispatch` | Release | `release` | Manual release run |

The release step configures the **BBD deployment model** and maps branches to environments:

```yaml
with:
  mode: release
  deployment-model: bbd
  branch-map: '{"staging": "staging", "main": "prod"}'
  environments: '["staging", "prod"]'
  prerelease-identifiers: '{"staging": "rc"}'
```

Release Workflows (v2.3.0+) auto-detects the image name from `docker-bake.hcl`; this repo currently
has **no bake file**, so the release job runs versioning only (no image build). See Legacy
for the historical bake config.

### Version bump rules (Conventional Commits)

`pyproject.toml` drives the bump from commit types:

```toml
[tool.semantic_release]
version = "1.65.9"
tag_format = "v{version}"
major_on_zero = true

[tool.semantic_release.commit_parser_options]
allowed_tags = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"]
minor_tags  = ["feat"]
patch_tags  = ["fix", "perf", "chore"]
```

| Commit type | Bump |
|-------------|------|
| `feat:` | **minor** |
| `fix:` / `perf:` / `chore:` | **patch** |
| `BREAKING CHANGE` / `!` | major (`major_on_zero = true`) |
| `docs`, `style`, `refactor`, `test`, `build`, `ci`, `revert` | no release |

!!! note "Why `chore` bumps a patch"
    `chore` is deliberately a patch trigger (unusual for semantic-release). The repo relies
    on a fresh version/tag to make **Flux reconcile** — e.g. when a regenerated Blackbox
    camera scrapeconfig is committed as a `chore`, the version bump is what pushes the
    change out. This is why the `CHANGELOG.md` is dominated by
    `chore: Regenerate camera scrapeconfigs` entries.

Other `[tool.semantic_release]` settings: tags are `v{version}`; `version_toml` writes the
bump back into `pyproject.toml`; `build_command` is empty (no artifact build);
`upload_to_vcs_release = false`; the push token comes from `GH_TOKEN`; the commit author
defaults to `github-actions[bot]`. `CHANGELOG.md` is generated at repo root (the configured
`template_dir = "templates"` does not exist — semantic-release falls back to its built-in
template; see Legacy).

### Runner selection

The release job honours the shared self-hosted runner toggle (see
[Self-hosted runners](#self-hosted-runners-selfhosted_github_runner)):

```yaml
runs-on: ${{ vars.SELFHOSTED_GITHUB_RUNNER || 'ubuntu-latest' }}
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

Permissions: `contents: write`, `id-token: write`, `packages: write`, `pull-requests: write`.

---

## Security Gate security gate

`security.yml`
is the org **Security Gate** gate, consumed as the marketplace action
`example-org/security-gate@…v2.7.0`. It runs MegaLinter over the whole repo and gates the PR on
**net-new findings** only (findings introduced by the PR diff), producing a required
`security-gate` status check.

```yaml
on:
  pull_request:
jobs:
  security-gate:
    if: ${{ github.actor != 'dependabot[bot]' }}
    runs-on: ${{ vars.SELFHOSTED_GITHUB_RUNNER || 'ubuntu-latest' }}
    steps:
      - uses: example-org/security-gate@…  # v2.7.0
```

Key design points, taken from the workflow's own comments:

- **`pull_request` only — no `push` trigger.** The required check is produced on the PR, so
  merging to the default branch does not re-scan already-gated code. This also stops every
  Release Workflows release commit (version bumps/tags on `main` + `staging`) from kicking off a
  fresh ~15-minute MegaLinter run — the single biggest Actions-minute saving in the repo.
- **Trade-off:** the default-branch baseline SARIF is no longer refreshed on the GitHub
  Security tab (which needs GHAS on private repos anyway). PR-time gating is retained.
- **Dependabot PRs are skipped** (`github.actor != 'dependabot[bot]'`). This org's
  Dependabot only bumps pinned Action SHAs, which effectively never introduce a net-new
  SARIF finding, so a full scan would be wasted minutes. A *skipped* required check still
  satisfies the ruleset, so Dependabot auto-merge is unaffected.
- **OIDC** (`id-token: write`) requests a short-lived Security Gate App token for PR comments;
  it falls back to the workflow `GITHUB_TOKEN` if the App is not installed.
- DefectDojo and Dependency-Track are intentionally **not** wired for this org.

Permissions: `contents: read`, `pull-requests: write`, `security-events: write`,
`actions: read`, `id-token: write`. Concurrency cancels in-progress runs for the same ref.

### MegaLinter linter set (`.mega-linter.yml`)

The default MegaLinter "all" flavor enables ~30 linters (spell-checkers, copy/paste
detection, an external-URL link checker, language linters for languages absent here). On a
repo of ~356 Kubernetes, ~130 Terraform and ~49 Ansible files that pushed scans to
~15 minutes. `.mega-linter.yml`
scopes it to a lean, high-signal **security + IaC** allowlist (expected ~3–5 min):

| Linter key | Covers |
|------------|--------|
| `REPOSITORY_SECRETLINT` | Secret detection |
| `REPOSITORY_GITLEAKS` | Secret / credential leaks |
| `REPOSITORY_TRIVY` | Vulns / SCA / misconfig (TF + K8s + Docker) |
| `REPOSITORY_CHECKOV` | IaC misconfiguration |
| `TERRAFORM_TFLINT` | Terraform lint |
| `DOCKERFILE_HADOLINT` | Dockerfile lint |
| `ACTION_ACTIONLINT` | GitHub Actions workflow lint |
| `BASH_SHELLCHECK` | Shell scripts |

Other settings:

```yaml
APPLY_FIXES: none
SHOW_ELAPSED_TIME: true
FILTER_REGEX_EXCLUDE: '(\.terraform/|\.git/|sops/|\.enc\.|\.excalidraw$)'
```

!!! warning "Security Gate overrides some MegaLinter keys"
    Security Gate forces `VALIDATE_ALL_CODEBASE`, `DISABLE_ERRORS`, and the SARIF reporter via
    environment variables. These override anything set for those keys in `.mega-linter.yml`
    — leave them to Security Gate. To add a linter, append its key under `ENABLE_LINTERS`.

---

## Pre-commit hooks

`.pre-commit-config.yaml`
installs both `pre-commit` and `pre-push` hook types. It runs the same scanner set Security Gate
runs in CI, so most findings surface locally before a push.

```yaml
default_install_hook_types: [pre-commit, pre-push]
repos:
  - repo: https://github.com/example-org/security-gate
    rev: v1
    hooks:
      - id: shellcheck
      - id: actionlint
      - id: hadolint
      - id: eslint
      - id: kustomize
      - id: trivy
      - id: trufflehog
      - id: semgrep
      - id: pip-audit
      - id: npm-audit
      - id: govulncheck
      - id: checkov
```

| Source repo | Hooks |
|-------------|-------|
| `example-org/security-gate` @ `v1` | `shellcheck`, `actionlint`, `hadolint`, `eslint`, `kustomize`, `trivy`, `trufflehog`, `semgrep`, `pip-audit`, `npm-audit`, `govulncheck`, `checkov` |

Install locally with:

```bash
pre-commit install --install-hooks
# hook types (pre-commit + pre-push) come from the config's default_install_hook_types
```

!!! note
    The Security Gate pre-commit repo is pinned to a floating `v1` tag, unlike the SHA-pinned
    Actions. `pre-commit autoupdate` will not move a moving tag to a SHA; the hooks track
    whatever `v1` currently resolves to.

---

## Terragrunt plan / cost / apply pipeline

`terragrunt-plan-cost-deploy.yaml`
(workflow name **Infrastructure Deployment**) is a thin caller around the org's reusable
workflow `example-org/shared-workflows/.github/workflows/terragrunt-plan-cost-apply.yaml@main`.

```yaml
on:
  workflow_dispatch:
  push:
    branches: [main, master]
    paths: ['terraform/aws/staging/**', 'terraform/aws/prod/**']
  pull_request:
    branches: [main, master]
    paths: ['terraform/aws/staging/**', 'terraform/aws/prod/**']
```

### Jobs

- **`detect_changes`** — runs on `[self-hosted, linux]`, uses
  `dorny/paths-filter` to set `staging` / `prod` outputs from which `terraform/aws/**`
  subtree changed.
- **`staging`** — gated on `staging_changes == 'true'`, calls the reusable workflow:

```yaml
uses: example-org/shared-workflows/.github/workflows/terragrunt-plan-cost-apply.yaml@main
with:
  environment: staging
  aws_region: af-south-1
  working_dir: terraform/aws/staging
  runner: staging
secrets:
  AWS_ROLE_TO_ASSUME: ${{ secrets.AWS_ROLE_TO_ASSUME }}
  SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
#  INFRACOST_API_KEY: ${{ secrets.INFRACOST_API_KEY }}
```

- **`prod`** — **entirely commented out** in the file. There is currently no automated prod
  Terragrunt apply through this workflow.

The reusable workflow's internals (plan → Infracost → apply) live in
`shared-workflows` and are out of scope here.

!!! warning "Cost and prod steps are disabled"
    `INFRACOST_API_KEY` is commented out in the staging call, so the cost-estimation step is
    inert, and the whole `prod` job is commented out. Only **staging** Terragrunt changes
    are wired for automation; prod is manual. The `af-south-1` region and the `terraform/aws`
    subtree (`_modules`, `network`, `prod`, `staging`) are the relevant paths.

---

## Self-hosted runners (`SELFHOSTED_GITHUB_RUNNER`)

The managed workflows (`release.yml`, `security.yml`, `deploy-docs.yml`) select their runner
from a repo-level Actions **variable**:

```yaml
runs-on: ${{ vars.SELFHOSTED_GITHUB_RUNNER || 'ubuntu-latest' }}
```

- Set `SELFHOSTED_GITHUB_RUNNER` to a self-hosted runner **label** to route these workflows
  to the cluster pool (free minutes + a warm MegaLinter image). For `platform-infra` the
  intended label is `prod-cpt-aws`.
- Leave it **unset/blank** to stay on GitHub-hosted `ubuntu-latest`. Blanking the variable is
  also the instant escape hatch if the self-hosted runners fail.

!!! note
    The older, hand-written workflows (`terragrunt-plan-cost-deploy.yaml`,
    `generate-wireguard-tunnel.yml`, `invite-avd-user.yaml`) do **not** use this toggle —
    they hard-code `runs-on: [self-hosted, linux]` and always require a self-hosted runner.

---

## Docs deploy (`deploy-docs.yml`)

`deploy-docs.yml`
builds this MkDocs Material site and publishes it to a Cloudflare Worker serving static
assets, gated by **Cloudflare Access** (Zero Trust) at `docs.example.com`.

| Event | Behaviour |
|-------|-----------|
| `push` to `main` | Build **and** `wrangler deploy` (live) |
| `pull_request` | Build check only (`mkdocs build --strict`) — **no** preview URL is published (a public preview would expose Access-gated docs) |
| `workflow_dispatch` on `main` | Manual re-publish / rollback |

Both jobs run on the shared runner toggle. Path filters limit runs to `docs/**`,
`mkdocs.yml`, `_headers`, `wrangler.toml`, `scripts/build-docs.sh`, `docs/requirements.txt`,
and the workflow file itself.

- **`build`** — Python 3.12, runs `./scripts/build-docs.sh`.
- **`deploy`** — needs `build`; guarded by
  `github.event_name == 'push' || (workflow_dispatch && ref == refs/heads/main)`; uses the
  `production` environment; Node 24 (Wrangler 4.x needs Node ≥ 22); deploys via
  `cloudflare/wrangler-action@…v4.0.0` with `wranglerVersion: "4.114.0"` and
  `command: deploy`.

Secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must exist, and the Cloudflare
Access application for the hostname must be created **before** the first deploy so the site
is never briefly public.

### `scripts/build-docs.sh`

`scripts/build-docs.sh`
is what CI runs, so local runs are faithful:

```bash
python -m pip install --quiet --disable-pip-version-check -r docs/requirements.txt
mkdocs build --strict
cp _headers site/_headers          # stage edge headers alongside the built site
```

`docs/requirements.txt` pins `mkdocs-material>=9.5,<10`. The `_headers` file (security
headers + CSP + long cache for `/assets/*`) and `wrangler.toml` (assets-only Worker,
`workers_dev=false`, `preview_urls=false`, custom domain) live at repo root. A faithful
local preview is `./scripts/build-docs.sh && npx wrangler dev`.

!!! note "Strict build"
    `mkdocs build --strict` fails on broken internal links and warnings. When adding a docs
    page, do **not** create relative links to pages that may not exist yet — link to the
    GitHub source instead.

---

## On-demand / operational workflows

### Generate WireGuard tunnel

`generate-wireguard-tunnel.yml`
generates MikroTik WireGuard site-to-site tunnel configs and opens a PR with the `.rsc`
files. Triggered by `workflow_dispatch` (inputs: `site1_name`, `site1_endpoints`,
`site1_subnets`, `topology` = `1-to-2` | `2-to-2`, `force_recreate`) or by
`repository_dispatch` type `generate-tunnel` (n8n webhook). Runs on `[self-hosted, linux]`.

Flow: set inputs from the event → validate (topology must match endpoint count) → run
`scripts/wireguard/generate_flexible_tunnels_v2.py` → build a step summary → open a PR via
`peter-evans/create-pull-request@…v6.1.0` on branch `tunnel/<site>-hub-<topology>`. Site 2
is hard-coded to `hub` in the script; AWS endpoints
`chr1/chr2.prod.cpt.aws.example.net`, AWS subnets `10.161.64.0/24` + `10.161.65.0/24`, tunnel UDP
port `51897`.

!!! danger "This workflow is currently broken / orphaned"
    The `scripts/wireguard/` directory and its Python scripts
    (`generate_flexible_tunnels_v2.py`, `show_tunnel_state.py`, `tunnel_state.json`,
    `generated/`) **do not exist** in the repo. The `Generate tunnel configuration` step
    does `cd scripts/wireguard` and would fail immediately. See Legacy.

### Invite AVD user

`invite-avd-user.yaml`
(`workflow_dispatch`, input `firstname`, `[self-hosted, linux]`) logs into Azure with
`AZURE_CREDENTIALS`, installs `jq`, and runs
`scripts/invite-avd-user.sh`.

The script (via `az rest` against Microsoft Graph + `az role assignment`):

1. Invites `<firstname>@example.com` as a guest, then patches the UPN to
   `<firstname>@az.example.net`.
2. Assigns **Virtual Machine Administrator Login** at resource-group scope (`rg-prod-san`).
3. Assigns **Desktop Virtualization User** at application-group scope (`vdag-prod-san`).
4. Assigns the user to the **Azure Virtual Desktop Apps** enterprise application.
5. Sends a welcome email via Gmail SMTP.

Hard-coded identifiers in the script: subscription `00000000-…`, RG `rg-prod-san`,
app group `vdag-prod-san`, enterprise app object ID `11112222-…`, app role
`33334444-…`, tenant `55556666-…`.

!!! warning "Welcome-email step needs a secret the workflow does not pass"
    The email step reads `GMAIL_APP_PASSWORD` from the environment, but
    `invite-avd-user.yaml` does **not** set it. The email step will fail (non-fatal — the
    script logs the failure and continues; the invite + role assignments still succeed).
    The Gmail relay user (`platform-lead@example.com`) is hard-coded.

---

## Governance & dependency config

### CODEOWNERS

`.github/CODEOWNERS`
routes every path to a single team:

```text
* @example-org/release-approvers
```

Combined with branch protection, this requires a review from `release-approvers` on all
changes.

### Dependabot

`.github/dependabot.yml`
watches only the **`github-actions`** ecosystem (root directory), weekly, and groups all
updates into two PRs:

```yaml
groups:
  actions-version:  { applies-to: version-updates,  patterns: ["*"] }
  actions-security: { applies-to: security-updates, patterns: ["*"] }
```

This is what keeps the SHA-pinned `uses:` lines current; Security Gate deliberately skips these
PRs (see above).

### SonarQube

`sonar-project.properties`
contains only the project key:

```properties
sonar.projectKey=example-org_platform-infra_XXXXXXXXXXXXXXXXXXXX
```

There is no Sonar scan workflow committed in `.github/workflows/`; the file exists for an
external/organization-level Sonar integration to pick up.

---

## How it wires together

```text
PR opened ──► release.yml  (Release Workflows mode: ci — pr-<N> image if a bake file exists)
        └──► security.yml  (Security Gate/MegaLinter, net-new gating → required `security-gate` check)
        └──► deploy-docs.yml (mkdocs --strict, on docs paths)
        └──► terragrunt (staging plan/cost, on terraform/aws/** paths)

merge to staging ──► release.yml (Release Workflows release → rc prerelease, env=staging)
merge to main    ──► release.yml (Release Workflows release → stable, env=prod, git tag v{version})
                └──► deploy-docs.yml (wrangler deploy to Cloudflare)
```

`release-approvers` (CODEOWNERS) must approve; the `security-gate` check must pass; Dependabot
keeps Action SHAs current; the `SELFHOSTED_GITHUB_RUNNER` variable decides whether managed
jobs run on the `prod-cpt-aws` cluster pool or GitHub-hosted runners.

---

## Legacy / cleanup notes

!!! warning "Findings surfaced while documenting"
    - **`generate-wireguard-tunnel.yml` is orphaned/broken.** The entire
      `scripts/wireguard/` tree it depends on (`generate_flexible_tunnels_v2.py`,
      `show_tunnel_state.py`, `tunnel_state.json`, `generated/`) is absent from the repo, so
      the workflow fails at the `cd scripts/wireguard` step. Either the scripts were removed
      or never committed.
    - **`pyproject.toml` references a missing `templates/` directory**
      (`[tool.semantic_release.changelog] template_dir = "templates"`). No `templates/` dir
      exists; semantic-release silently falls back to its built-in changelog template.
    - **`.github/pull-request-workflow.json` is orphaned.** It maps GitHub usernames
      (`engineer-a`, `engineer-b`, `engineer-c`, `engineer-d`) to Slack IDs for
      a Slack PR-events workflow, but that workflow (`slack-pr-events.yaml`) has been deleted
      — no committed workflow references this file.
    - **Terragrunt prod + Infracost are disabled.** The `prod` job and the
      `INFRACOST_API_KEY` secret are commented out in
      `terragrunt-plan-cost-deploy.yaml`; only staging is automated, and cost estimation is
      inert.
    - **Legacy `master` branch trigger.** The Terragrunt workflow triggers on
      `[main, master]`; the repo's default branch is `main` and `master` does not exist.
    - **Floating pre-commit tag.** `example-org/security-gate` in `.pre-commit-config.yaml` is
      pinned to `v1`, inconsistent with the SHA-pinning used everywhere in the workflows.
    - **Stale checkout pins in hand-written workflows.** `generate-wireguard-tunnel.yml` and
      `invite-avd-user.yaml` pin `actions/checkout@…v4.3.1`, while the managed workflows use
      `v7.0.0` — these older workflows are outside the managed/Dependabot-updated set.
    - **`invite-avd-user.yaml` cannot send its welcome email** — the script needs
      `GMAIL_APP_PASSWORD` but the workflow never provides it (non-fatal, but the step always
      fails).
    - **Docker Bake removed.** `docker-bake.hcl` no longer exists (deleted per git history,
      e.g. `c30a4f41 fix: delete files no longer needed`), so `release.yml` runs versioning
      only. the Release Workflows image-build path is dormant until a bake file returns.
