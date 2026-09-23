# Environments (prod / staging / dev)

the platform allocates a **separate AWS account per environment**, all inside `af-south-1` (Cape Town).
This page is the single side-by-side reference for how `prod`, `staging` and `dev` actually differ —
account, VPC CIDR, EKS cluster, GitOps layout, observability, and which Terraform leaves exist —
grounded in `terraform/aws/root.hcl`,
the two Flux bootstrap roots under `kubernetes/overlays/`, and the per-env `region.hcl` files.

The short version: **prod is fully built and fully migrated**; **staging is fully built and, now that
the last inline capture remnant has been removed, its GitOps matches prod** — it differs only in running a
deliberately slimmed footprint (mono-replica observability, smaller data tiers) plus a few
staging-only stacks; and **`dev` is a reserved account allocation with nothing deployed to it**.

!!! info "Scope"
    Columns are the three workload environments. Two further entries exist in the `environments` map
    — `network` (account `210987654321`, the central firewall/transit/DNS account) and `shared`
    (account `123456789012`, map-only) — but they are not workload environments and are out of scope
    here. See [Terragrunt foundation](terraform-overview.md) for the `network` account and the full
    account map.

---

## Comparison matrix

Every cell below is derived from a file in this repo; the "Source" column names it. A blank / "none"
cell means the thing genuinely does not exist for that environment, not that it was omitted.

| Dimension | prod | staging | dev | Source |
|-----------|------|---------|-----|--------|
| **AWS account ID** | `777788889999` | `444455556666` | `111122223333` | `terraform/aws/root.hcl` (`environments.*.account_id`) |
| **Region(s)** | `af-south-1` (live) + `eu-central-1` (map-only, no live dir) | `af-south-1` | `af-south-1` | `terraform/aws/root.hcl`; live dirs under `terraform/aws/<env>/af-south-1/` |
| **VPC CIDR** (af-south-1) | `10.161.64.0/19` | `10.161.96.0/19` | `10.161.128.0/19` | `terraform/aws/root.hcl` (`environments.*.regions.af-south-1.cidr`) |
| **`az_count`** | `2` | `2` | `1` | `terraform/aws/root.hcl` |
| **Subnet tiers** | `app`, `data` | `app`, `data` | `app`, `data` | `terraform/aws/root.hcl` |
| **Terraform state bucket** | `example-prod-777788889999-af-south-1` | `example-staging-444455556666-af-south-1` | — (no live dir → no state) | `root.hcl` `remote_state.bucket` = `${company}-${env}-${account}-${region}` |
| **SOPS secrets file** | `sops/prod.enc.yaml` | `sops/staging.enc.yaml` | — (no `sops/dev.enc.yaml`) | `sops/` directory |
| **EKS cluster name** | `prod-eks` | `staging-eks` | — (no `eks` leaf) | `terraform/aws/_modules/eks/main.tf` (`name = "${var.environment}-eks"`) |
| **EKS `cluster_version`** | `1.32` (config) — **deployed cluster is 1.33**, see warning below | `1.35` | — | `terraform/aws/{prod,staging}/af-south-1/region.hcl` |
| **EKS node instance type** | `m5.2xlarge` | `c5a.xlarge` | — | `terraform/aws/{prod,staging}/af-south-1/region.hcl` |
| **Flux bootstrap root** | `kubernetes/overlays/prod-cpt-aws` | `kubernetes/overlays/staging-cpt-aws` | — (no overlay) | `kubernetes/overlays/` |
| **Flux git ref tracked** | `semver: ">=1.0.0"` (version tags `vX.Y.Z`) | `branch: main` | — | `overlays/*/flux-system/gotk-sync.yaml` (see [GitOps with Flux](gitops-flux.md)) |
| **App image policy** | stable `vX.Y.Z` | release candidates `vX.Y.Z-rc.N` | — | [GitOps with Flux](gitops-flux.md#flux-image-automation) |
| **GitOps app delivery** | **app-repo** (Flux CRs only; manifests in each app's repo) | **app-repo** (Flux CRs only; the old inline capture tree was removed) | — | `overlays/{prod,staging}-cpt-aws/kustomization.yaml` |
| **Observability** | Full stack, HA-intended (Thanos-query ×2, Loki RF 2, Alertmanager + PagerDuty routing, camera probes, cloudwatch/mysql/postgres exporters) | Slimmed **mono-replica** mirror (Loki RF 1, no Alertmanager routing, subset of exporters) | — | [Observability](kubernetes-observability.md) |
| **Migration status** | **Fully migrated** to `apps/` + `infrastructure/` app-repo GitOps | **Migrated** — app-repo wiring present; the legacy inline capture tree has been removed | **Not provisioned** | `overlays/{prod,staging}-cpt-aws/` (dir listing + `kustomization.yaml`) |
| **Terraform leaves present** (af-south-1) | 13 | 12 | **0** | `terraform/aws/<env>/af-south-1/` |

!!! note "Only `af-south-1` is live anywhere"
    Every environment's live Terraform directory is under `af-south-1`. `prod` declares an
    `eu-central-1` block in the `environments` map (`10.119.1.0/24`, `az_count 1`), but there is **no
    `prod/eu-central-1/` live directory** — it is a reserved allocation only. See
    [Terragrunt foundation → Region metadata](terraform-overview.md).

---

## Terraform leaves per environment

The set of live component directories (each a `terragrunt.hcl`) differs between prod and staging;
`dev` has none. Directory listings from `terraform/aws/<env>/af-south-1/`:

| Component | prod | staging | dev |
|-----------|:----:|:-------:|:---:|
| `acm-certificates` | ✅ | ✅ | |
| `api-cdn` (→ `cloudfront-api`) | ✅ | ✅ | |
| `cache` (ElastiCache) | ✅ | ✅ | |
| `cross-account-grafana` | ✅ | ✅ | |
| `eks` | ✅ | ✅ | |
| `observability` (Loki/Thanos S3 + IRSA) | ✅ | ✅ | |
| `rds` (MySQL) | ✅ | ✅ | |
| `s3` (incl. shared CloudFront WAF) | ✅ | ✅ | |
| `config-mikrotik` | ✅ | | |
| `load-balancers` | ✅ | | |
| `postgres` | ✅ | | |
| `router-fleet-prod-iam` | ✅ | | |
| `vpn-metrics-prod-iam` | ✅ | | |
| `cnpg-backups` (Barman S3 + IRSA) | | ✅ | |
| `external-dns` | | ✅ | |
| `images-cdn` (→ `cloudfront-images`) | | ✅ | |
| `openreplay` | | ✅ | |
| **Total leaves** | **13** | **12** | **0** |

!!! note "Why the leaf sets diverge"
    The differences reflect where each capability was built. `external-dns` and `cnpg-backups` are
    live in **staging** (IRSA + cross-account Route53 for staging, Barman backups for the shared
    staging CNPG) but not yet as prod leaves; `postgres`, `load-balancers` and the `*-prod-iam`
    fleet/VPN IAM leaves are **prod-only**. `openreplay` and `images-cdn` are staging-only. The full
    inventory (including the `network` account) is in
    [Terragrunt foundation → Live component inventory](terraform-overview.md#live-component-inventory-af-south-1).

---

## prod

The reference environment: account `777788889999`, VPC `10.161.64.0/19` across two AZs
(`terraform/aws/root.hcl`), EKS cluster **`prod-eks`** with `m5.2xlarge` nodes
(`terraform/aws/prod/af-south-1/region.hcl`).

!!! warning "Do not apply the prod `eks` leaf until `cluster_version` is corrected"
    `region.hcl` pins `cluster_version = "1.32"`, but the deployed cluster is running **1.33**.
    Applying the committed configuration would attempt a version **downgrade**, which EKS does not
    support, and the same plan **replaces the cluster**. Raise `cluster_version` to at least `1.33`
    before this leaf is actionable. Full plan detail — 30 creates, 4 replacements including
    `aws_eks_cluster.this` — is in the [Terraform drift register](terraform-drift.md).

- **GitOps is fully migrated.** The Flux root
  `kubernetes/overlays/prod-cpt-aws/kustomization.yaml`
  wires `infrastructure/controllers` + `infrastructure/configs` and then apps **only through
  `../../apps/*`** (Flux `GitRepository` / `Kustomization` / image-automation CRs) — the real
  Deployments live in each app's own repo. There is no inline capture manifest tree. `prod` also uniquely
  wires the `github-runner` infra service (staging leaves its `github-runner`
  line commented out); `observability` and `netshoot` run in both prod and staging.
- **Rollback is a re-tag.** The root tracks `semver: ">=1.0.0"` (version tags `vX.Y.Z`), and the app
  ImagePolicies track stable `vX.Y.Z` — production advances on tagged releases; rollback is moving
  the tag. See [GitOps with Flux](gitops-flux.md).
- **Observability is the full stack.** kube-prometheus-stack with a Thanos long-term store, Loki at
  replication factor 2, the full Alertmanager → Slack/PagerDuty routing, the camera/router blackbox
  probes, and the cloudwatch/mysql/postgres exporters — none of which staging carries in full. See
  [Observability](kubernetes-observability.md).
- **Data tiers are the larger ones.** RDS `db.m5.xlarge` with an 8 GB InnoDB buffer pool on `gp3`,
  `deletion_protection` on (`terraform/aws/prod/env.hcl`; see
  [Backup & disaster recovery](backup-and-restore.md)).

!!! warning "Prod Prometheus is currently single-replica by incident, not by design"
    The base kube-prometheus-stack declares `replicas: 2`, but the prod overlay pins Prometheus to
    **1** after the 2026-06-10 incident (AZ-locked EBS volume on the operator-flagged sensitive node).
    Prod's observability is the *HA-intended* stack (Thanos-query ×2, Loki RF 2, full alerting) but
    the Prometheus pod itself is not currently running HA. Details and the restore condition are in
    [Observability](kubernetes-observability.md#resource-sizing-resourcesyaml-patchtransformer).

---

## staging

Account `444455556666`, VPC `10.161.96.0/19` across two AZs (`terraform/aws/root.hcl`), EKS cluster
**`staging-eks`**. Staging is a **complete environment** — 12 Terraform leaves, its own Flux root,
observability, and shared data services (CNPG + Valkey) that prod does not run in-cluster. Its GitOps
is **migrated** (the last inline capture remnant has been removed), and it runs a deliberately smaller
footprint.

- **App wiring matches prod; the old inline capture tree has been removed.** The staging root
  `kubernetes/overlays/staging-cpt-aws/kustomization.yaml`
  wires apps through `../../apps/*` exactly like prod. The inline
  `kubernetes/overlays/staging-cpt-aws/apps/edge-capture/` tree — a legacy remnant of the
  pre-migration model that the root never referenced — was deleted (commit `8567811c`, "chore: remove
  orphaned inline staging capture manifests"), so `staging-cpt-aws/apps/` now holds only
  `aws-load-balancer-controller`.
- **Staging tracks `main` and release candidates.** The root uses `branch: main` (the dedicated
  `staging` branch was retired) and app ImagePolicies select `vX.Y.Z-rc.N`, so staging runs the
  release-candidate builds of the same images prod runs stable.
- **Observability is a slimmed mono-replica mirror.** Loki at RF 1, no Alertmanager routing config,
  no cloudwatch-exporter, and `mysql-exporter` / `postgres-exporter` not yet wired — Prometheus is
  single-replica because the small nodes cannot fit a second replica. See
  [Observability](kubernetes-observability.md#which-components-run-where).
- **Smaller data tiers.** RDS `db.t4g.micro` on `standard` storage (`terraform/aws/staging/env.hcl`).
- **Extra staging-only stacks.** `external-dns`, `cnpg-backups`, `images-cdn` and `openreplay`
  Terraform leaves, plus the in-cluster AppSec tooling (DefectDojo / Dependency-Track / SonarQube) and
  shared CNPG/Valkey wired only from the staging Flux root.

!!! warning "EKS version skew: staging leads prod"
    `cluster_version` is **`1.35` on staging** but **`1.32` on prod**
    (`terraform/aws/{staging,prod}/af-south-1/region.hcl`). Staging is the upgrade canary and runs
    three minor Kubernetes versions ahead — expected, but worth remembering when reasoning about
    prod/staging parity.

---

## dev

`dev` is **a reserved account allocation, not a running environment.** The `environments` map in
`terraform/aws/root.hcl` declares it — account `111122223333`, VPC `10.161.128.0/19`, `az_count 1`,
subnets `app`/`data` — and nothing else in the repo builds on it:

- **No Terraform live directory** — there is no `terraform/aws/dev/`, so no state bucket, no VPC, no
  EKS cluster, no data services are provisioned.
- **No EKS cluster** — the `${var.environment}-eks` naming would yield `dev-eks`, but no `eks` leaf
  instantiates it.
- **No Flux bootstrap root** — only `prod-cpt-aws` and `staging-cpt-aws` exist under
  `kubernetes/overlays/`; there is no `dev-cpt-aws`, so no GitOps runs against `dev`.
- **No SOPS secrets file** — `sops/` contains `prod.enc.yaml` and `staging.enc.yaml` but **no
  `dev.enc.yaml`**, reinforcing that no `dev` unit has ever needed secrets.

In other words, the only concrete facts about `dev` are the account ID and the CIDR/AZ allocation
reserved for it. Treat the CIDR (`10.161.128.0/19`) as claimed IP space so it is not reused, and the
account as provisioned-but-empty.

!!! warning "Operator input needed — intended purpose of the `dev` allocation"
    The repo records **that** `dev` (account `111122223333`, `10.161.128.0/19`) is allocated but not
    **why** or **what it is for** (a future full environment, ephemeral/sandbox use, or a stale
    reservation). If `dev` is meant to become a real environment, its intended topology, EKS version,
    and app set are not derivable from Git and must be defined by the operator before it is stood up.

---

## How these values are wired

All of the per-environment values above flow from a single place — the `environments` map and the
generation logic in `terraform/aws/root.hcl` — down into each leaf via Terragrunt's
`env.hcl` / `region.hcl` layering. The account guardrail (`allowed_account_ids`), the per-env state
bucket, the cross-account `network` provider, and the `az_count` lookup are all documented in
[Terragrunt foundation](terraform-overview.md). The Kubernetes side — bootstrap roots, ordering,
image automation and the SOPS layers — is documented in [GitOps with Flux](gitops-flux.md).
