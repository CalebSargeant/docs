# Architecture

Three toolchains cooperate: **Terragrunt** provisions cloud resources, **FluxCD** deploys Kubernetes workloads, and **Ansible** bootstraps clusters. Secrets are **SOPS + Age**, committed encrypted and decrypted by Flux.

## Environments

| Cluster | Cloud | Region | Purpose |
|---------|-------|--------|---------|
| `staging-cpt-aws` | AWS | af-south-1 | Pre-production |
| `prod-cpt-aws` | AWS | af-south-1 | Production capture workloads |

!!! note "`shared` is an AWS account, not a cluster"
    There are exactly two Kubernetes clusters, matching the two overlays under
    `kubernetes/overlays/`. The `shared` account holds shared services and is not a cluster.
    See [Environments](reference/environments.md) and [AWS accounts](reference/aws-accounts.md).

AWS accounts (SSO profiles): `dev` `111122223333`, `staging` `444455556666`, `prod` `777788889999`, `shared` `123456789012`, `network` `210987654321`. The env→account map is the single source of truth in `terraform/aws/root.hcl`.

## Kubernetes (`kubernetes/`)

```
kubernetes/
├── apps/<app>/{base,overlays/prod,overlays/staging}   # Flux CRs ONLY
├── infrastructure/{controllers,configs,services}      # in-cluster platform
└── overlays/{prod,staging}-cpt-aws                     # Flux bootstrap roots
```

- **`apps/`** hold Flux custom resources only — `GitRepository`, `Kustomization`, and `ImagePolicy`/`ImageUpdateAutomation`. The real Deployments live in each app's **own** repo; the `flux-kustomization.yaml` points at `./k8s/overlays/<env>` in that repo. Apps: `backend` (admin-backend), `public-api`, `camera-console`, `driver`, `status`, `utils`.
- **`apps/utils/`** is the exception — its CronJobs/exporters/reconcilers (capture-exporter, mikrotik-wireguard-exporter, router-lifetime-reconciler, …) DO run from manifests in this repo.
- **`infrastructure/`** is the platform layer: `controllers` (cert-manager, cloudflared, external-dns, external-secrets, minio-operator), `services` (observability, cloudnative-pg, postgres, valkey, minio, sonarqube, defectdojo, dependency-track, github-runner, openreplay…), and `configs` (ghcr-image-pull, github-app).
- **`overlays/{prod,staging}-cpt-aws`** are the `flux bootstrap --path` targets.

!!! note "prod and staging share the same layout, but not the same service set"
    Both clusters are now fully migrated to the `apps/` + `infrastructure/` layout — the legacy inline
    capture manifests under `overlays/staging-cpt-aws/apps/edge-capture/` were removed in
    commit `8567811c`. The clusters still differ in **which services are wired** and in what each
    cluster root tracks; see [Prod vs staging differences](reference/gitops-flux.md#prod-vs-staging-differences).

SOPS decryption is injected via a patch onto every `Kustomization` labelled `app.kubernetes.io/sops=enabled` — an unlabelled Kustomization will apply secrets as ciphertext.

## Terraform (`terraform/`)

```
terraform/
├── aws/
│   ├── _modules/                       # 30 reusable modules
│   ├── root.hcl                        # Terragrunt root: backend + provider gen
│   └── {network,prod,staging}/af-south-1/<component>/terragrunt.hcl
└── azure/
    ├── _modules/                       # avd, dns, nsg, rg, rt, sa, vm, vnet
    └── prod/southafricanorth/<component>/
```

`root.hcl` generates `backend.tf`/`provider.tf` (these are git-ignored), configures S3 remote state (per-env bucket + DynamoDB `terraform-locks`), pins provider versions (TF 1.9.1, aws 6.36.0, routeros, fortios, pagerduty), and assumes `TerraformNetworkAdmin` in the network account for cross-account resources. Run Terragrunt from inside a leaf component directory.

## CI/CD

- **`release.yml`** — Release Workflows. PRs run versioning only (no bake file → no image build); pushes to `staging` cut `rc` prereleases and pushes to `main` cut prod releases, via semantic-release from Conventional Commit messages.
- **`security.yml`** — security-gate (MegaLinter), gating on **net-new** findings in the PR diff only. Scoped in `.mega-linter.yml`.
- Local equivalent of the gate: `pre-commit run --all-files`.

See **`PROJECT_INDEX.json`** for the machine-readable module map and dependency highlights.
