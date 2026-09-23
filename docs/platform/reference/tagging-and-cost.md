# Tagging & cost conventions

Resource tags in this repo are **assembled in Terragrunt, not hard-coded per resource**. A small set of
governance tags is layered `root → env → region` and injected into every module as the `var.tags`
map; each module then merges its own descriptive keys (`Name`, `Purpose`, `Component`, …) on top. This
page documents that schema, which resource classes get which tags, the Kubernetes subnet-discovery
tags on EKS subnets, and — honestly — the near-total absence of any cost-allocation tooling in the
repo.

!!! info "Scope"
    Everything here is derived from the Terraform/Terragrunt tree (`terraform/aws`, `terraform/azure`).
    Tags applied to Kubernetes *objects* (Flux labels, `app.kubernetes.io/*`, the SOPS
    `app.kubernetes.io/sops=enabled` label) are a different concern and are not covered here.

## How tags are assembled (the three-layer merge)

Both provider trees follow the same pattern: the `tags` map is defined in **three layers** and
re-merged in each live unit's `terragrunt.hcl`. The base map flows in through `include.*.inputs.tags`,
and the leaf produces the final map with an explicit `merge()`:

```hcl
# e.g. terraform/aws/prod/af-south-1/eks/terragrunt.hcl
tags = merge(
  include.region.inputs.tags,   # Region
  include.env.inputs.tags,      # Environment
  include.root.inputs.tags,     # Comment (AWS) / Comment+Environment+Project (Azure)
)
```

This exact re-merge appears in **34 of the 36 AWS leaves**. The two that don't are
`eip-failover-lambda` (a bare `tags = {}` block, noted [below](#exceptions-resources-that-miss-the-base-tags))
and `pagerduty` (a PagerDuty-provider leaf that manages no AWS resources, so it carries no resource
tags). Because `merge()` is last-wins and `include.root.inputs.tags` is passed **last**, root-level
keys override any same-named key from `env`/`region`.

| Layer | AWS file | Azure file | Keys contributed |
|-------|----------|------------|------------------|
| **root** | `terraform/aws/root.hcl` | `terraform/azure/root.hcl` | AWS: `Comment`. Azure: `Comment`, `Environment`, `Project` |
| **env** | `terraform/aws/<env>/env.hcl` | `terraform/azure/prod/env.hcl` | AWS: `Environment`. Azure: `Environment`, `CostCenter` |
| **region** | `terraform/aws/<env>/<region>/region.hcl` | `terraform/azure/prod/<region>/region.hcl` | AWS: `Region`. Azure: `Region`, `Location` |
| **module** | `terraform/aws/_modules/<name>/*.tf` | `terraform/azure/_modules/<name>/*.tf` | `Name`, `Purpose`, `Component`, `Customer`, `Type`, subnet keys… (per-resource) |

!!! note "The AWS `env.hcl`/`region.hcl` tag values are *derived from the directory name*"
    `terraform/aws/prod/env.hcl` sets `Environment = "${basename(get_parent_terragrunt_dir("env.hcl"))}"`
    and each `region.hcl` sets `Region = "${basename(get_parent_terragrunt_dir("region.hcl"))}"`. So the
    tag values are literally the env directory (`prod`, `staging`, `network`) and region directory
    (`af-south-1`) names — they cannot drift from the tree layout.

## The base tag schema

The tags every correctly-wired resource carries, before any module additions:

=== "AWS"

    | Key | Value | Set in | Meaning |
    |-----|-------|--------|---------|
    | `Comment` | `Managed by Terraform` | `terraform/aws/root.hcl` (`tags` block) | Marks the resource as IaC-managed; discourages console edits |
    | `Environment` | `prod` / `staging` / `network` | `terraform/aws/<env>/env.hcl` | Which environment/account owns the resource (dir basename) |
    | `Region` | `af-south-1` | `terraform/aws/<env>/<region>/region.hcl` | Home region (dir basename) |

    Resolved AWS base set on a prod resource:
    `{ Comment = "Managed by Terraform", Environment = "prod", Region = "af-south-1" }`.

=== "Azure"

    | Key | Value | Set in | Meaning |
    |-----|-------|--------|---------|
    | `Comment` | `Managed by Terraform` | `terraform/azure/root.hcl` | IaC-managed marker |
    | `Environment` | `Production` | `terraform/azure/root.hcl` **and** `terraform/azure/prod/env.hcl` | Environment (both layers set it; root wins, same value) |
    | `Project` | `the platform` | `terraform/azure/root.hcl` | Project/product owner |
    | `CostCenter` | `Infrastructure` | `terraform/azure/prod/env.hcl` | **The only cost-allocation-style tag in the whole repo** (see [Cost posture](#cost-allocation-posture)) |
    | `Region` | `South Africa North` | `terraform/azure/prod/<region>/region.hcl` | Human region name |
    | `Location` | `JHB` | `terraform/azure/prod/<region>/region.hcl` | City code |

    Resolved Azure base set:
    `{ Comment, Environment = "Production", Project = "the platform", CostCenter = "Infrastructure", Region = "South Africa North", Location = "JHB" }`.

!!! note "AWS has no `CostCenter`, `Project`, or `Owner` tag"
    The AWS base schema is deliberately thin — just `Comment` + `Environment` + `Region`. There is no
    `CostCenter`, `Project`, `Owner`, `Team`, or `ManagedBy` key anywhere in the AWS tree. The Azure
    tree is the only one carrying `Project` and `CostCenter`.

## Module-added tags

Every module receives the assembled base map as `var.tags` and then merges its own keys per resource.
Two idioms are used:

- **Inline merge** — `tags = merge(var.tags, { Name = "…", Purpose = "…" })` (most modules, e.g.
  `terraform/aws/_modules/s3/main.tf`, `_modules/cnpg-backups/main.tf`, `_modules/openreplay/main.tf`).
- **A `module_tags` local** — the module computes `local.module_tags = merge(var.tags, { Component = "…" })`
  once and reuses it, e.g. `terraform/aws/_modules/vpn-alerting/main.tf`
  (`Component = "vpn-alerting"`) and `_modules/tunnel-trampoline/main.tf`
  (`Component = "tunnel-trampoline"`).

Observed module-added keys (all grounded in `terraform/aws/_modules`):

| Key | Example value | Set by (module) | Purpose |
|-----|---------------|-----------------|---------|
| `Name` | `Capture Reads Storage`, `${env}-node-${n}` | nearly every resource | Human/console-friendly resource name |
| `Purpose` | `CloudNativePG shared-postgres base backups + WAL archive` | `s3`, `cnpg-backups`, `openreplay`, `s3-backups`, `s3/iam.tf` | Free-text description of what the resource is for |
| `Component` | `vpn-alerting`, `tunnel-trampoline`, `metrics-ui` | `vpn-alerting`, `tunnel-trampoline`, `s3/metrics_cloudfront.tf` | Logical sub-system a resource belongs to |
| `Customer` | the peer name (`each.key`) | `vpn` (customer gateways + connections) | Which VPN peer/customer a gateway belongs to |
| `Type` | `MongoDB-PrivateLink` | `mongodb-private-link` | Resource-type discriminator |
| `SubnetType` / `AZ` | `app` / `af-south-1a` | `vpc/_subnet.tf` | Subnet tier + availability zone |
| `Subnet` | `app` | `eks/_subnet-tags.tf` | Subnet tier tag re-applied to existing subnets |
| `SubnetGroup` | `database` | `eks/_subnet-tags.tf` (data subnets) | Marks data-tier subnets for DB subnet groups |
| `kubernetes.io/*`, `eks:cluster-name` | see [below](#kubernetes-subnet-discovery-tags) | `eks` | EKS/ELB auto-discovery |

!!! note "Why static scanners only ever see `Name`"
    `terraform/aws/_modules/vpn-alerting/main.tf` documents this directly: the governance tags
    (`Comment`/`Environment`/`Region`) are injected via `var.tags` **at apply time** by the Terragrunt
    leaf, so a static KICS scan of the module in isolation only sees the literal `Name` key. The KICS
    "Resource Not Using Tags" finding (`e38a8e0a…`) is suppressed in that module for exactly this
    reason — it is a false positive against the Terragrunt injection model.

## Which resource classes get which tags

| Resource class | Base tags (`Comment`/`Environment`/`Region`) | Module tags |
|----------------|:---:|-------------|
| Anything created inside a module that threads `var.tags` (S3, RDS, ElastiCache, IAM roles, KMS, SNS, Lambda, VPC, subnets, EKS, VPN…) | ✅ via the leaf merge | ✅ `Name` + optional `Purpose`/`Component`/etc. |
| EKS **app** subnets (existing subnets re-tagged) | ✅ (`Environment`, `Subnet`) | ✅ `kubernetes.io/*` |
| EKS **data** subnets | ✅ (`Environment`, `Subnet`) | ✅ `SubnetGroup = database` |
| Resources under a bare `tags = { … }` block | ⚠️ **partial / none** — see exceptions | ⚠️ only what the block hard-codes |

### Exceptions: resources that miss the base tags

A few resources set a **bare `tags = {}` block that does not merge `var.tags`**, so they silently drop
the base governance tags. These are the honest inconsistencies in the schema:

| Location | Tags actually set | Missing vs base schema |
|----------|-------------------|------------------------|
| `terraform/aws/_modules/s3/cloudfront.tf` (frontend distribution + its WAF web ACL) | `Environment`, `Region` (from `var.environment`/`var.region`) | `Comment`, plus `Name` |
| `terraform/aws/_modules/s3/iam.tf` (3 roles/users) | `Name`, `Environment` (one adds `Purpose`) | `Comment`, `Region` |
| `terraform/aws/network/af-south-1/eip-failover-lambda/terragrunt.hcl` | `Environment = "prod"`, `Component = "networking"`, `Purpose = "chr-eip-failover"` | `Comment`, `Region`; also **hard-codes `Environment=prod` while living in the `network` account** |

!!! warning "These bare blocks are the drift risk"
    Because these blocks build the tag map from `var.environment`/`var.region` (or hard-coded strings)
    instead of merging `var.tags`, they omit `Comment` and are the resources most likely to fail a
    "must be Terraform-managed" tag audit. `eip-failover-lambda` additionally tags itself
    `Environment=prod` despite being a `network`-account (`210987654321`) unit. Prefer
    `merge(var.tags, { … })` for any new resource.

## Kubernetes subnet-discovery tags

The EKS module tags **existing VPC subnets** (not subnets it creates) so that Kubernetes and the AWS
Load Balancer Controller can auto-discover where to place cluster resources. All of these live in
`terraform/aws/_modules/eks/_subnet-tags.tf`
(applied via `aws_ec2_tag` to matched subnets) and `_modules/eks/_nodes.tf` (on the nodes):

| Tag | Value | Applied to | Why it exists |
|-----|-------|-----------|---------------|
| `kubernetes.io/cluster/<env>-eks` | `shared` | app subnets (`_subnet-tags.tf`) | Marks the subnet as usable by the `<env>-eks` cluster. `shared` = the subnet may host resources for other consumers too (not exclusively owned by the cluster) |
| `kubernetes.io/role/internal-elb` | `1` | app subnets (`_subnet-tags.tf`) | Tells the AWS Load Balancer Controller / in-tree cloud provider these subnets are valid targets for **internal** load balancers |
| `kubernetes.io/cluster/<env>-eks` | `owned` | worker nodes (`_nodes.tf`) | On the node itself, `owned` marks the instance as belonging exclusively to this cluster |
| `eks:cluster-name` | `<env>-eks` | worker nodes (`_nodes.tf`) | Associates the node with its EKS cluster |
| `SubnetGroup` | `database` | data subnets (`_subnet-tags.tf`) | Groups the data-tier subnets so RDS/ElastiCache subnet groups can select them |

!!! note "`shared` vs `owned` is deliberate"
    The subnet tag is `shared` (the VPC subnets are shared infrastructure that predate the cluster),
    while the node tag is `owned` (an instance belongs to exactly one cluster). This is the standard
    AWS convention and is what lets `kubernetes.io/role/internal-elb` subnets be reused across
    workloads without the cluster claiming exclusive ownership of the subnet. The cluster name is
    interpolated from `var.environment`, so prod tags read `kubernetes.io/cluster/prod-eks` and staging
    `kubernetes.io/cluster/staging-eks`.

## Cost-allocation posture

!!! warning "There is essentially no cost tooling in this repo — read this section carefully"
    A repo-wide search for `aws_budgets`/`budgets_budget`, `cost_category`, Cost & Usage Report
    (`cur_report`/`cost_and_usage`), Cost Explorer anomaly detection (`ce_anomaly`/`costexplorer`), and
    the common Kubernetes cost tools (`kubecost`/`opencost`/`infracost`) returns **zero matches** in
    `terraform/` and `kubernetes/`. None of them are provisioned.

What actually exists, cost-wise:

- **Azure `CostCenter = "Infrastructure"`** (`terraform/azure/prod/env.hcl`) — a single static value on
  all Azure prod resources. This is the *only* cost-allocation-style tag in the entire repo.
- **`Environment` and `Region`** tags on (most) AWS resources — usable as cost-allocation *dimensions*
  in the billing console **if activated**, but see the warning below.

There is **no** AWS `CostCenter`/`Team`/`Owner` tag, no AWS Budgets, no budget alarms, no Cost
Category, no CUR/Athena cost pipeline, and no in-cluster cost monitoring. Cost visibility today rests
entirely on whatever is configured manually in the AWS/Azure billing consoles.

!!! warning "Operator input needed — billing-console settings are not in Git"
    The following cannot be derived from the repo because they are AWS/Azure **billing-console**
    settings (account-level, outside Terraform state). An operator must confirm them:

    - **Are `Environment` / `Region` (AWS) and `CostCenter` / `Project` / `Environment` (Azure)
      activated as _cost-allocation tags_** in the AWS Billing console / Azure Cost Management? Applying
      a tag does nothing for reporting until it is activated, and that activation lives in the console,
      not in this repo.
    - **Is there an AWS Budget / budget alert, Cost Anomaly Detection monitor, or Cost & Usage Report**
      configured out-of-band? None is defined in Terraform.
    - **How is spend attributed across the `network` / `prod` / `staging` accounts** (consolidated
      billing / AWS Organizations), and is there an owner for cost review?
    - **Whether the Azure `CostCenter=Infrastructure` value is meant to be subdivided** (it is a single
      flat value across all Azure prod resources).

    If any of these should be codified, they can be added: AWS Budgets and Cost Anomaly monitors are
    Terraform-expressible (`aws_budgets_budget`, `aws_ce_anomaly_monitor`) and would fit a new
    `_modules/` component; cost-allocation-tag *activation* would still need a documented console step.

## Conventions for new resources

- **Never write a bare `tags = {}` block.** Always `tags = merge(var.tags, { Name = "…", … })` so the
  base governance tags flow through.
- **Always set `Name`.** It is the one key module-level static scanners can see, and it drives console
  readability.
- **Add `Purpose`** for storage/backup/IAM resources whose intent isn't obvious from the name (the
  established pattern in `s3`, `cnpg-backups`, `openreplay`).
- **Use `Component`** (ideally via a `module_tags` local) for multi-resource sub-systems, matching
  `vpn-alerting` / `tunnel-trampoline`.
- **Don't hard-code `Environment`/`Region`** in a leaf — let the `env.hcl`/`region.hcl` layers supply
  them so the values stay tied to the directory tree.
