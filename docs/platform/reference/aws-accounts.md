# AWS accounts & access model

the platform runs on a **multi-account AWS Organization**. Every account maps to an environment role, each environment gets its own Terraform state bucket, and a small number of **cross-account IAM roles** stitch the accounts together (Terraform into the network account, Grafana into every account for CloudWatch, DNS into the network account). This page is the account inventory, the access/trust model, the state/lock convention, and how to authenticate.

The numeric account IDs and the environment→account map are the ones Terragrunt actually uses — `terraform/aws/root.hcl` `inputs.environments{}` and `locals.network_account_id`. The SSO profile names come from the operator's `~/.aws/config` (not stored in this repo); every numeric ID below has been cross-checked against `root.hcl`.

## Account inventory

| Account | Account ID | Purpose | SSO profile | Permission set / role |
|---------|------------|---------|-------------|-----------------------|
| **network** | `210987654321` | Central network/edge hub — VPC transit, Fortigate/MikroTik, VPN, the `TerraformNetworkAdmin` role, and the `*.cpt.aws.example.net` DNS zones | `network` | `AdministratorAccess` |
| **shared** | `123456789012` | Shared services account — hosts the shared **Grafana** (`shared-grafana-role`) that reads CloudWatch across accounts | `shared` | `AdministratorAccess` |
| **prod** | `777788889999` | Production capture platform (EKS, RDS, CloudFront, S3, observability) | `prod` | `AdministratorAccess` |
| **staging** | `444455556666` | Staging capture platform (EKS, RDS, CDNs, OpenReplay, CNPG) | `staging` | `AdministratorAccess` (plus `staging-readonly` → `ReadOnlyAccess`) |
| **dev** | `111122223333` | Reserved dev account — allocated in the env map (account ID + CIDR) but has **no** `terraform/aws/dev/` live directory | `dev` | `AdministratorAccess` |

!!! note "These five accounts are the repo's environments"
    All five accounts are the environment keys in `root.hcl`'s `environments{}` map (with `network` also pinned as `local.network_account_id`).

!!! note "shared & dev are map-only (nothing deployed)"
    `shared` and `dev` appear in `root.hcl`'s `environments{}` map (account IDs + CIDRs) but have **no** `terraform/aws/<env>/` live directory, so no Terragrunt-managed resources exist in them. `shared` is nonetheless a live participant in the access model: it is the home of the Grafana role that reads CloudWatch in the other accounts (see below). Treat `dev` as a reserved allocation. See [Terragrunt foundation → Environment → account ID](terraform-overview.md#environment-account-id) for the same observation.

## Authenticating

All accounts are reached through **AWS IAM Identity Center (SSO)**, start URL `https://example-corp.awsapps.com/start/#`, SSO region `af-south-1`. Log in per profile:

```bash
aws sso login --profile prod          # network / shared / staging / dev likewise
aws sts get-caller-identity --profile prod   # confirm the account ID matches the table

# read-only staging (safe for inspection, no mutations)
aws sso login --profile staging-readonly
```

Terragrunt runs then use the matching profile for the environment you are in (e.g. `AWS_PROFILE=prod` inside `terraform/aws/prod/af-south-1/…`). The generated default `aws` provider carries `allowed_account_ids = ["<env account>"]`, so a run pointed at the wrong account **hard-fails** rather than mutating it — see [Terragrunt foundation → Generated files](terraform-overview.md#generated-files).

!!! info "Cross-account is automatic once you are authenticated"
    You authenticate to **one** account (the environment you are operating on). The cross-account hops below (`TerraformNetworkAdmin`, Grafana, external-dns) are performed by `sts:AssumeRole` from that identity — you do not log in separately to the network account for a normal prod/staging run.

## Cross-account access model

Three distinct cross-account paths exist. All of them centre on the **network account (`210987654321`)** or the **shared account (`123456789012`)**.

### 1. `TerraformNetworkAdmin` — Terraform into the network account

`root.hcl` generates a `network_provider.tf` into **every** AWS unit: an `aws` provider aliased `network` that assume-roles into the network account:

```hcl
provider "aws" {
  alias  = "network"
  region = "af-south-1"                                  # local.region

  assume_role {
    role_arn     = "arn:aws:iam::210987654321:role/TerraformNetworkAdmin"
    session_name = "TerraformNetworkAccess"
  }
}
```

This lets a prod/staging unit create or read resources that live centrally in the network account — DNS records, shared network primitives — without leaving its own account's default provider. The role itself is defined by the **network VPC unit** in `_modules/vpc/_iam.tf`:

- **Name:** `TerraformNetworkAdmin`, attached policy `arn:aws:iam::aws:policy/AdministratorAccess`.
- **Trusted principals (who may assume it):** the account roots of **prod (`777788889999`)**, **staging (`444455556666`)**, and **shared (`123456789012`)**. The network account trusts those three accounts to run Terraform against its resources; sessions are stamped `TerraformNetworkAccess` for CloudTrail attribution.

!!! note "The `network` provider is generated everywhere, used selectively"
    Because `network_provider.tf` is emitted into every unit, the `aws.network` alias is always available even in units that never reference it. Units that actually use it (e.g. `external-dns`, `load-balancers`) pass `provider = aws.network` on the resources that must land in the network account.

### 2. Cross-account Grafana — CloudWatch read from the shared account

The shared account's Grafana reads CloudWatch/Logs metrics from the other accounts via a per-account trust role deployed by `_modules/cross-account-grafana`. The `cross-account-grafana` live unit exists in **network, prod, and staging** (`terraform/aws/{network,prod,staging}/af-south-1/cross-account-grafana`).

Each deployment creates an IAM role `cross-account-grafana-access` in the target account that:

- **Trusts** `arn:aws:iam::123456789012:role/shared-grafana-role` (the Grafana role in the **shared** account) to `sts:AssumeRole`.
- Requires a matching **`sts:ExternalId`** — set to `grafana-cross-account-access` by the live units (`variables.tf` default and the leaf `inputs`).
- Grants **read-only** observability access via `cross-account-grafana-policy`: CloudWatch (`GetMetricData`/`GetMetricStatistics`/`ListMetrics`/`DescribeAlarms…`, plus `PutMetricData`), CloudWatch Logs (`DescribeLogGroups`/`GetLogEvents`/`StartQuery`…), EC2 describe, `tag:GetResources`, `iam:ListAccountAliases`, and `ce:GetCostAndUsage`.

So the direction is: **Grafana (shared `123456789012`) → assumes → `cross-account-grafana-access` in network/prod/staging** to pull metrics and logs.

### 3. DNS — `*.cpt.aws.example.net` zones live in the network account

The public hosted zones under `cpt.aws.example.net` are held in the **network account (`210987654321`)**, not in the workload accounts. `_modules/external-dns/main.tf` states this directly: the staging EKS OIDC provider is in the staging account, but the `staging.cpt.aws.example.net` hosted zone is in the network account, so external-dns runs a same-account IRSA role and then `--aws-assume-role`s a Route53 role in the network account. The Terraform-side writes to that zone go through the same `aws.network` provider (i.e. `TerraformNetworkAdmin`).

!!! note "Consequence for DNS changes"
    Any Route53 change to a `cpt.aws.example.net` (sub)zone is a **network-account** operation regardless of which environment owns the workload. In-cluster, external-dns reaches the zone by assuming a role across accounts; in Terraform, the record resources are provisioned with `provider = aws.network`.

## Terraform state & locking

State is **per-environment (per-account)**, in S3, in each environment's own account and region. `root.hcl`'s `remote_state` block names the bucket from company + environment + account + region:

```hcl
bucket         = "${company}-${environment}-${account_id}-${region}"   # example-prod-777788889999-af-south-1
key            = "${replace(path_relative_to_include(), "\\", "/")}/terraform.tfstate"
region         = local.region        # the unit's own region
encrypt        = true
dynamodb_table = "terraform-locks"
```

| Environment | Account ID | State bucket | Live dir? |
|-------------|------------|--------------|-----------|
| network | `210987654321` | `example-network-210987654321-af-south-1` | ✅ |
| shared | `123456789012` | `example-shared-123456789012-af-south-1` | ❌ map-only (bucket not created) |
| prod | `777788889999` | `example-prod-777788889999-af-south-1` | ✅ |
| staging | `444455556666` | `example-staging-444455556666-af-south-1` | ✅ |
| dev | `111122223333` | `example-dev-111122223333-af-south-1` | ❌ map-only (bucket not created) |

Key facts:

- **Bucket-per-account.** Each account's state is isolated in a bucket in that same account — no shared central state bucket for the AWS tree. (The **Azure** tree is the deliberate exception: its state is an S3 bucket in the AWS **prod** account — see [Azure](terraform-azure.md).)
- **State key** is the unit's path relative to the `root.hcl` include, e.g. `prod/af-south-1/eks/terraform.tfstate`. The `replace(…, "\\", "/")` normalises Windows backslashes so a run from Windows targets the same object as Linux/macOS — see [Terragrunt foundation → S3 remote state](terraform-overview.md#s3-remote-state-the-backslash-normalisation).
- **Locking** is a single DynamoDB table named **`terraform-locks`** in each account (same name everywhere; distinct table per account, since each account has its own state).
- **Encryption** is on (`encrypt = true`); the region is the unit's own region.

!!! note "us-east-1 provider alias (global/edge resources)"
    `root.hcl` also generates an `aws` provider aliased `us-east-1` (`aws_us_east_1_provider.tf`). It is not a separate account — it is the **same environment account, pinned to `us-east-1`** — needed because global resources (ACM certs for CloudFront, CloudFront WAFv2 web ACLs) must live in `us-east-1` regardless of the unit's home region (`af-south-1`).

## Organization structure & guardrails

!!! warning "Operator input needed — org-level controls are not in this repo"
    This repo describes the **accounts and the cross-account IAM roles**, but not the AWS Organizations control plane. The following are **not derivable from Git** and must be supplied/confirmed by an operator:

    - The **Organization / OU structure** and which OU each account sits in.
    - **Service Control Policies (SCPs)**, permission boundaries, and any org-wide guardrails.
    - The **AWS IAM Identity Center (SSO)** configuration — permission set definitions, group/user assignments, session duration — beyond the profile→account→role mapping above (which came from the operator's local `~/.aws/config`, not the repo).
    - Whether the `shared` (`123456789012`) and `dev` (`111122223333`) accounts hold any **non-Terraform / click-ops** resources, since neither has a live Terragrunt directory here.

## See also

- [Terragrunt foundation](terraform-overview.md) — `root.hcl`, generated providers, env/region layering, the full live-component inventory.
- [AWS — network & edge](terraform-aws-network-edge.md) — what actually lives in the network account (VPC transit, VPN, routers).
- [AWS — platform & data](terraform-aws-platform-data.md) — the prod/staging workload components.
- [Secrets (SOPS + Age)](secrets-sops.md) — how per-environment secrets are decrypted at plan/apply time.
