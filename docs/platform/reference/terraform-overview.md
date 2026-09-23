# Terraform & Terragrunt Foundation

The `terraform/` tree is the Infrastructure-as-Code foundation for the whole platform. It is a
[Terragrunt](https://terragrunt.gruntwork.io/)-driven monorepo split into two provider trees —
`terraform/aws`
and `terraform/azure` —
where a single root config generates all backend/provider boilerplate and every live environment
directory is a thin wrapper that points a plain Terraform module at the right account, region and
inputs. This page documents that foundation: `root.hcl`, the `env.hcl`/`region.hcl` layering, remote
state, pinned versions, the account/CIDR maps, cross-account access, and the full inventory of live
component directories.

## Directory layout

The AWS tree follows a strict three-level convention: `<env>/<region>/<component>`.

```
terraform/
├── aws/
│   ├── root.hcl                      # single source of truth: backend + providers + maps
│   ├── _modules/                     # plain Terraform modules (the "what")
│   │   ├── vpc/  eks/  rds/  cache/  s3/ ...
│   ├── network/
│   │   ├── env.hcl                   # account_id 210987654321 + shared inputs
│   │   └── af-south-1/
│   │       ├── region.hcl            # region-scoped inputs (AMIs, instance types)
│   │       └── <component>/terragrunt.hcl   # live unit -> _modules/<component>
│   ├── prod/
│   │   ├── env.hcl                   # account_id 777788889999
│   │   └── af-south-1/…
│   └── staging/
│       ├── env.hcl                   # account_id 444455556666
│       └── af-south-1/…
├── azure/
│   ├── root.hcl                      # separate root (azurerm provider, AWS-hosted state)
│   ├── _modules/  (avd dns nsg rg rt sa vm vnet)
│   └── prod/southafricanorth/<component>/terragrunt.hcl
├── diagram.excalidraw                # (non-IaC assets, committed alongside the tree)
├── modules.png
└── traffic-flow.md
```

Two module trees exist: `terraform/aws/_modules`
(the reusable "what") and the live env directories (the "where/how"). The convention is that a live
component directory named `foo` sources `_modules//foo` — the directory basename *is* the module
name (see [How a live env dir consumes a module](#how-a-live-env-dir-consumes-a-module) for the two
naming exceptions).

!!! note "Env/region hierarchy"
    `find_in_parent_folders()` is what makes the layering work. A leaf `terragrunt.hcl` walks up the
    tree to find `region.hcl` (nearest), then `env.hcl`, then `root.hcl`. Config is layered
    root → env → region → leaf, with each level able to override the one above it.

## `root.hcl` — the generation engine

`terraform/aws/root.hcl`
is included by every AWS leaf and does three jobs: it (1) pins provider/tool versions, (2) configures
S3 remote state, and (3) generates four `.tf` files into each unit's working directory at runtime.

### Pinned versions

Defined in the `locals` block of `root.hcl`:

| Local | Value | Consumed by |
|-------|-------|-------------|
| `terraform_version` | `1.9.1` | `required_version = ">= 1.9.1"` in generated `provider.tf` |
| `aws_version` | `6.36.0` | `hashicorp/aws` provider pin |
| `routeros_version` | `1.83.1` | `terraform-routeros/routeros` provider pin |
| `fortios_version` | `1.22.0` | `fortinetdev/fortios` provider pin |
| `pagerduty_version` | `3.33.1` | `PagerDuty/pagerduty` provider pin |
| `sops_version` | `1.1.1` | **commented out** (`# sops_version`) — the `carlpett/sops` provider generate block is disabled |

!!! note "OpenTofu locally, stock Terraform in CI"
    The two paths do not use the same binary:

    - **Local / manual runs** use **OpenTofu** (`tofu`). The provider caches on disk resolve from
      `registry.opentofu.org` (e.g.
      `.terraform/providers/registry.opentofu.org/hashicorp/aws/6.36.0`), and the
      [drift register](terraform-drift.md) records OpenTofu 1.12.1.
    - **CI** uses `gruntwork-io/terragrunt-action`, whose `tf_version` this repo does not pin, so it
      resolves stock Terraform at `latest`.

    The generated block uses `terraform { … }` syntax and a `required_version` referencing
    "terraform" in both cases. Pinning the CI versions explicitly is an open item.

### Generated files

`root.hcl` emits four files into each unit's Terragrunt working directory. The `if_exists` mode
matters: `overwrite_terragrunt` only replaces files Terragrunt itself generated, while `overwrite`
replaces any file at that path.

| Generated file | Block | `if_exists` | Contents |
|----------------|-------|-------------|----------|
| `backend.tf` | `remote_state` | `overwrite_terragrunt` | S3 backend config (bucket/key/lock table) |
| `provider.tf` | `generate "provider"` | `overwrite` | `terraform{}` required_providers + default `aws` provider |
| `network_provider.tf` | `generate "network_provider"` | `overwrite_terragrunt` | `aws` provider aliased `network` (assume-role into the network account) |
| `aws_us_east_1_provider.tf` | `generate "aws_us_east_1"` | `overwrite_terragrunt` | `aws` provider aliased `us-east-1` (for global/edge resources like ACM + CloudFront WAF) |

The default provider is scoped to a single account via `allowed_account_ids`, a guardrail that makes
Terraform refuse to run against the wrong account:

```hcl
provider "aws" {
  region              = "af-south-1"           # local.region
  allowed_account_ids = ["777788889999"]       # local.account_id (env-specific)
}
```

The `us-east-1` aliased provider exists because global AWS resources (ACM certs for CloudFront, the
CloudFront WAFv2 web ACLs referenced by `non_za_allowlist_ipset_arn`) must live in `us-east-1`
regardless of the unit's home region.

!!! note "Disabled / commented generation"
    `root.hcl` still carries a commented-out `generate "locals"` block (a Fortigate map keyed
    `fg1`/`fg2`) and a commented `sops` provider + `provider "sops" {}` stanza at the end of the
    file. These are inert but retained in-tree.

### S3 remote state & the backslash normalisation

State lives in a **per-environment S3 bucket**, named from the company, environment, account and
region:

```
bucket = "${company}-${environment}-${account_id}-${region}"
```

| Environment | State bucket |
|-------------|--------------|
| network | `example-network-210987654321-af-south-1` |
| prod | `example-prod-777788889999-af-south-1` |
| staging | `example-staging-444455556666-af-south-1` |

State is `encrypt = true`, locking is via a DynamoDB table named **`terraform-locks`**, and the
`region` is the unit's own region. The state **key** is the unit's path relative to the `root.hcl`
include, with a Windows-safety `replace()`:

```hcl
key = "${replace(path_relative_to_include(), "\\", "/")}/terraform.tfstate"
```

!!! warning "Why the `replace()` is load-bearing"
    `path_relative_to_include()` returns OS-native separators. On Windows it yields backslashes, so
    the S3 key would become `network\af-south-1\vpc/terraform.tfstate` — a **different object** than
    the canonical `network/af-south-1/vpc/terraform.tfstate` the Linux/macOS pipeline writes. That
    silently forks state. The `replace(…, "\\", "/")` normalises separators so a run from Windows
    targets the same state object. It is a no-op on Linux/macOS. (This guard exists in the AWS
    `root.hcl` but **not** in the Azure `root.hcl`, which uses a bare `path_relative_to_include()`.)

## Account, region, CIDR & subnet maps

`root.hcl`'s `inputs` block carries the platform-wide static maps exposed to every unit as
`include.root.inputs`.

### Top-level root inputs

| Key | Value |
|-----|-------|
| `company` | `platform` |
| `domain` | `aws.example.net` |
| `edge_account_id` | `""` (empty) |
| `sops_path` | `<repo>/sops` |
| `ansible_path` | `<repo>/ansible` |
| `tags` | `{ Comment = "Managed by Terraform" }` |
| `network_account_id` (local) | `210987654321` |

### Environment → account ID

| Environment | Account ID | Live dir present? |
|-------------|------------|-------------------|
| network | `210987654321` | ✅ `terraform/aws/network` |
| shared | `123456789012` | ❌ map-only (no live dir) |
| prod | `777788889999` | ✅ `terraform/aws/prod` |
| staging | `444455556666` | ✅ `terraform/aws/staging` |
| dev | `111122223333` | ❌ map-only (no live dir) |

!!! note "Map entries without live directories"
    `shared` and `dev` are defined in the `environments` map (account IDs + CIDRs) but have **no**
    corresponding `terraform/aws/<env>/` directory, so nothing is currently deployed for them. Treat
    them as reserved allocations rather than active environments.

### Region → CIDR → subnets

Each environment declares one or more regions with an AZ count, a VPC CIDR and a list of subnet
tiers. Note the subnet **tiers differ by environment role**: the `network` account uses
`outside`/`management`/`inside` (a firewall/transit topology); workload accounts use `app`/`data`.

| Env | Region | `az_count` | CIDR | Subnets |
|-----|--------|-----------|------|---------|
| network | af-south-1 | 2 | `10.161.0.0/19` | outside, management, inside |
| network | testing123 | 2 | `10.161.160.0/19` | outside, management, inside |
| network | eu-central-1 | 1 | `10.119.0.0/24` | outside, management, inside |
| shared | af-south-1 | 2 | `10.161.32.0/19` | app, data |
| prod | af-south-1 | 2 | `10.161.64.0/19` | app, data |
| prod | eu-central-1 | 1 | `10.119.1.0/24` | app, data |
| staging | af-south-1 | 2 | `10.161.96.0/19` | app, data |
| dev | af-south-1 | 1 | `10.161.128.0/19` | app, data |

!!! note "`testing123` region key"
    The `network` environment map contains a region entry literally keyed `testing123` (CIDR
    `10.161.160.0/19`). It is not a real AWS region and has no live directory — a placeholder /
    scratch allocation left in the map.

### Region metadata

The `regions` map holds per-region descriptive metadata (separate from the per-env CIDR map above):

| Region | `az_letters` | `city_code` | `country_code` | `timezone` |
|--------|--------------|-------------|----------------|------------|
| af-south-1 | a, b, c | `cpt` | `za` | Africa/Johannesburg |
| eu-central-1 | a, b, c | `fra` | `de` | Europe/Berlin |

Only `af-south-1` has live directories in every environment; no `eu-central-1` live directory exists
despite the map entries.

## `env.hcl` and `region.hcl` layering

For AWS, `env.hcl` and `region.hcl` files contain a bare `inputs = { … }` map (no `locals` block).
They are surfaced to leaves via `include.env.inputs` / `include.region.inputs`.

### `env.hcl` per environment

| File | Key facts |
|------|-----------|
| `network/env.hcl` | `account_id 210987654321`; `trusted_subnets` (two engineers' VPN egress IPs), `rfc1918`, `trusted_hostnames` (`vpn.site-b.example.net`, `vpn.engineer.example.net`), `trusted_inside_subnets`, and `security_group_rules` (allow-all ingress/egress presets). `environment` derived from the parent dir basename. |
| `prod/env.hcl` | `account_id 777788889999`; `private_ip_number 10`; `country_code za`; `subdomain secure`; `non_za_allowlist_ipset_arn` (WAFv2 IPSet in `us-east-1`); cache (`cache.t3.micro` × 2); RDS `db.m5.xlarge`, `innodb_buffer_pool_size_gb = 8`, db `capture_admin_portal` (mysql 8.0, gp3, 40→100 GB). |
| `staging/env.hcl` | `account_id 444455556666`; `private_ip_number 20`; `subdomain staging`; its own `non_za_allowlist_ipset_arn`; RDS `db.t4g.micro` (standard storage); plus a large "Version 1" block (portal/driver EC2 instance types, Ubuntu AMI, nvm/node versions, `admin-backend`/`admin-frontend` repos on the `staging` branch, `frontend_hostname staging.example.com`, `mongo_db lprStaging`, `certbot_email`). |

!!! note "prod vs staging sizing (from `env.hcl`)"
    The biggest env-level differences are database/compute tiers: prod runs RDS `db.m5.xlarge` with
    an 8 GB InnoDB buffer pool on `gp3` storage; staging runs `db.t4g.micro` on `standard` storage.
    `private_ip_number` differs (prod `10`, staging `20`) to keep static host numbering distinct.
    prod's `env.hcl` also carries commented-out alternative `db_instance_class` values
    (`db.m6g.large`, `db.m5.large`) documenting past sizing.

### `region.hcl` per environment (af-south-1)

| File | Key facts |
|------|-----------|
| `network/af-south-1/region.hcl` | `vpc_cidr 10.161.0.0/16`; `az_letters ["a","b"]`; Fortigate AMI `ami-03f053fef63ce27cd` (x86 BYOL) + `t3.small`; MikroTik CHR AMI `ami-047eaed586771076a` + `t3.nano`; Fortigate/MikroTik SSH public keys. Several alternative AMIs/instance types are commented out. |
| `prod/af-south-1/region.hcl` | EKS `cluster_version 1.32`; node AMI `ami-0cf00a97588a6d5c9` (Ubuntu); node `instance_type m5.2xlarge`; MikroTik `t3.nano` / `ami-047eaed586771076a`. |
| `staging/af-south-1/region.hcl` | EKS `cluster_version 1.35`; node AMI `ami-0cf00a97588a6d5c9`; node `instance_type c5a.xlarge`; MikroTik `t3.nano` / `ami-047eaed586771076a`. |

!!! warning "EKS version skew: staging is ahead of prod"
    `cluster_version` is **`1.35` on staging** but **`1.32` on prod**. Staging leads prod by three
    minor Kubernetes versions — expected if staging is the upgrade-canary, but worth noting when
    reasoning about parity.

!!! note "`vpc_cidr` in region.hcl vs the root map"
    `network/af-south-1/region.hcl` sets `vpc_cidr = "10.161.0.0/16"`, which is broader than the
    `10.161.0.0/19` the `root.hcl` `environments.network.af-south-1.cidr` map declares for the same
    scope. Both values are present in-tree; the `/16` is the region-level override actually consumed
    where `vpc_cidr` is referenced. `network/af-south-1/region.hcl` also narrows `az_letters` to
    `["a","b"]` (root's region metadata lists `["a","b","c"]`).

## How a live env dir consumes a module

Every live unit is a `terragrunt.hcl` that follows the same shape. It `include`s the three parent
configs with `expose = true`, points `terraform.source` at a module under `_modules`, and merges
root/region/env inputs (plus SOPS secrets and any unit-specific overrides). Example — the prod EKS
unit (`prod/af-south-1/eks/terragrunt.hcl`):

```hcl
include "root"   { path = find_in_parent_folders("root.hcl");   expose = true }
include "env"    { path = find_in_parent_folders("env.hcl");    expose = true }
include "region" { path = find_in_parent_folders("region.hcl"); expose = true }

terraform {
  source = "${get_path_to_repo_root()}/terraform/aws/_modules//${basename(get_terragrunt_dir())}"
}

# Establish dependency ordering without accessing outputs
dependencies {
  paths = ["../../../network/${include.region.inputs.region}/vpc"]
}

locals {
  secret_vars = yamldecode(sops_decrypt_file(
    "${get_path_to_repo_root()}/sops/${include.env.inputs.environment}.enc.yaml"))
}

inputs = merge(
  include.root.inputs, include.region.inputs, include.env.inputs, local.secret_vars,
  {
    tags     = merge(include.region.inputs.tags, include.env.inputs.tags, include.root.inputs.tags)
    az_count = include.root.inputs.environments[include.env.inputs.environment].regions[include.region.inputs.region].az_count
    # unit-specific overrides (map_users, enable_aws_lb_controller, …)
  }
)
```

Key mechanics visible here:

- **`source = "…/_modules//${basename(get_terragrunt_dir())}"`** — the module is selected by the
  directory name. So `prod/af-south-1/eks` → `_modules/eks`. The `//` marks the module root for
  Terragrunt's download/copy step.
- **Inputs precedence** is `root` → `region` → `env` → SOPS secrets → inline overrides (later args to
  `merge()` win), with `tags` re-merged so region/env/root tags accumulate.
- **Secrets** come from `sops_decrypt_file("${repo}/sops/${environment}.enc.yaml")` decoded with
  `yamldecode`, so each unit pulls the env-specific encrypted secrets file.
- **Ordering** uses `dependencies { paths = [...] }` (ordering only, no output wiring) or
  `dependency "x" { config_path = … }` (with `mock_outputs`) when a unit needs another unit's
  outputs. EKS declares an ordering dependency on the network VPC.

### The two source-naming exceptions

Almost every unit uses the `basename` form. Two components deliberately deviate because the
directory name differs from the module name:

| Live dir | `source` module | Reason |
|----------|-----------------|--------|
| `<env>/af-south-1/api-cdn` | `_modules//cloudfront-api` | edge for the platform API (injects `x-platform-api-key`) |
| `staging/af-south-1/images-cdn` | `_modules//cloudfront-images` | image CDN edge |

The `api-cdn` unit also shows the cross-unit output pattern: it takes a `dependency "s3"` with
`mock_outputs` (allowed for `validate`/`plan`/`destroy`) to reuse the single shared CloudFront WAF
web ACL published by the `s3` stack, rather than creating a per-edge ACL.

## Cross-account access (the `network` provider)

The generated `network_provider.tf` gives every unit an `aws` provider aliased `network` that
assume-roles into the network account:

```hcl
provider "aws" {
  alias  = "network"
  region = "af-south-1"                # local.region

  assume_role {
    role_arn     = "arn:aws:iam::210987654321:role/TerraformNetworkAdmin"
    session_name = "TerraformNetworkAccess"
  }
}
```

This is how prod/staging units create or read resources that live in the central **network account
`210987654321`** (DNS zones, transit/VPC peering, shared network primitives) without leaving their
own account's default provider. The role `TerraformNetworkAdmin` must be assumable by the caller's
identity; the session is stamped `TerraformNetworkAccess` for audit. Because this provider is
generated into *every* unit, it is available even in units that don't use it.

## Live component inventory (af-south-1)

The full set of live component directories, per environment. A ✅ means the directory exists with a
`terragrunt.hcl`; the module column notes the `_modules` target when it differs from the directory
name.

| Component | network | prod | staging | Module notes |
|-----------|:---:|:---:|:---:|--------------|
| `vpc` | ✅ | | | `_modules/vpc` |
| `config-fortigate` | ✅ | | | **broken — see legacy note** |
| `config-mikrotik` | ✅ | ✅ | | `_modules/config-mikrotik` |
| `cross-account-grafana` | ✅ | ✅ | ✅ | |
| `eip-failover-lambda` | ✅ | | | |
| `pagerduty` | ✅ | | | |
| `router-fleet-network-iam` | ✅ | | | |
| `router-fleet-prod-iam` | | ✅ | | |
| `tunnel-trampoline` | ✅ | | | |
| `vpn` | ✅ | | | |
| `vpn-alerting` | ✅ | | | |
| `vpn-metrics-network-iam` | ✅ | | | |
| `vpn-metrics-prod-iam` | | ✅ | | |
| `acm-certificates` | | ✅ | ✅ | |
| `api-cdn` | | ✅ | ✅ | → `cloudfront-api` |
| `images-cdn` | | | ✅ | → `cloudfront-images` |
| `cache` | | ✅ | ✅ | ElastiCache |
| `eks` | | ✅ | ✅ | |
| `external-dns` | | | ✅ | |
| `load-balancers` | | ✅ | | |
| `observability` | | ✅ | ✅ | Loki/Thanos S3 + IRSA |
| `postgres` | | ✅ | | CNPG-adjacent |
| `cnpg-backups` | | | ✅ | Barman S3 + IRSA |
| `rds` | | ✅ | ✅ | |
| `s3` | | ✅ | ✅ | includes shared CloudFront WAF |
| `openreplay` | | | ✅ | |

!!! warning "`config-fortigate` looks orphaned/broken"
    `network/af-south-1/config-fortigate/terragrunt.hcl`
    sources `_modules//config-fortigate` (via the `basename` form), but **no `_modules/config-fortigate`
    directory exists**. It also declares `dependency "hub" { config_path = "../hub" }`, and **no
    `network/af-south-1/hub` directory exists** either. As committed, this unit cannot resolve its
    module or its dependency — it is dead/mid-refactor. Contrast with `config-mikrotik`, which has a
    real `_modules/config-mikrotik`.

Concretely, the live directories are:

- **network/af-south-1:** `config-fortigate`, `config-mikrotik`, `cross-account-grafana`,
  `eip-failover-lambda`, `pagerduty`, `router-fleet-network-iam`, `tunnel-trampoline`, `vpc`,
  `vpn`, `vpn-alerting`, `vpn-metrics-network-iam`
- **prod/af-south-1:** `acm-certificates`, `api-cdn`, `cache`, `config-mikrotik`,
  `cross-account-grafana`, `eks`, `load-balancers`, `observability`, `postgres`, `rds`,
  `router-fleet-prod-iam`, `s3`, `vpn-metrics-prod-iam`
- **staging/af-south-1:** `acm-certificates`, `api-cdn`, `cache`, `cnpg-backups`,
  `cross-account-grafana`, `eks`, `external-dns`, `images-cdn`, `observability`, `openreplay`,
  `rds`, `s3`

### `_modules` present but not instantiated

The following modules exist under
`terraform/aws/_modules`
but have **no live env directory** and are not referenced as sub-modules by other modules:
`mongodb-private-link`, `s3-backups`, `workspaces`, `grafana-postgres`. `sqs` is not a standalone
live unit but is referenced from `_modules/tunnel-trampoline/main.tf`. Treat the first four as
built-but-not-deployed (staged or legacy) until a live unit adopts them.

## The Azure tree

`terraform/azure`
is a smaller, structurally similar but **separately rooted** tree
(`azure/root.hcl`).
Key differences from the AWS foundation:

| Aspect | AWS root | Azure root |
|--------|----------|------------|
| Domain | `aws.example.net` | `az.example.net` |
| Provider | `hashicorp/aws 6.36.0` (+ routeros/fortios/pagerduty) | `hashicorp/azurerm 3.116.0` only |
| `terraform_version` | `1.9.1` | `1.9.1` |
| State backend | S3 in the unit's own account | **S3, but always in AWS** — bucket `example-azure-<env>-<region>`, `region af-south-1`, account `777788889999` (prod) |
| State key | `replace(path_relative_to_include(), "\\", "/")` | bare `path_relative_to_include()` (**no** backslash normalisation) |
| Lock table | `terraform-locks` | `terraform-locks` |
| `env.hcl`/`region.hcl` style | `inputs = {}` only | `locals {}` **and** `inputs {}` |
| Extra generated providers | `network_provider.tf`, `aws_us_east_1_provider.tf` | none (only `backend.tf` + `provider.tf`) |

Azure environment map: a single `prod` environment (subscription `00000000-1111-2222-3333-444444444444`)
in region `southafricanorth` (VNet `10.162.0.0/19`, subnets `outside`/`inside`/`app`/`data`). Live
units live under `azure/prod/southafricanorth/`: `avd`, `dns`, `nsg`, `rg`, `rt`, `sa`, `vm`, `vnet`
(each sourcing the matching `azure/_modules/<name>`). The Azure state uses an AWS S3 backend
deliberately to avoid the chicken-and-egg of bootstrapping an Azure storage account (noted in-file:
"Use AWS for state backend (avoiding chicken-and-egg with Azure storage)").

!!! note "Commented `oldprod` migration block"
    `azure/root.hcl` retains a large commented-out `oldprod` environment block describing a
    source→target resource-group VM migration ("To be deleted after migrating the old sonic IP and
    Mikrotik VM to the new prod subscription"). It is inert but documents an in-flight/parked
    migration.

## Operational notes

- **Run from a leaf, not the root.** `terragrunt` commands are issued inside a component directory
  (e.g. `terraform/aws/prod/af-south-1/eks`). Terragrunt generates the four `.tf` files, downloads
  the `_modules` source, and applies. `run-all` from an env/region level respects `dependencies`.
- **Account guardrail.** The generated default provider's `allowed_account_ids` will hard-fail a run
  pointed at the wrong account — a mismatch is a config error, not something to override.
- **Secrets.** Units that need secrets decode `sops/<environment>.enc.yaml` via `sops_decrypt_file`
  at plan/apply time; the SOPS tooling must be available in the runner.
- **New component checklist.** Create `terraform/aws/<env>/<region>/<name>/terragrunt.hcl` with the
  three `include`s + `terraform.source`; if the directory name matches the module use the
  `basename(get_terragrunt_dir())` form, otherwise hardcode `_modules//<module>`. State
  bucket/key/lock are derived automatically — nothing to configure.
- **Cross-account resources** go through the `provider = aws.network` alias, which is present in
  every unit.
```
