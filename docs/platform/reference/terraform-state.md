# Terraform state & backends

Every Terragrunt unit in this repo keeps its state in **S3**, locked by a shared **DynamoDB**
table, with the backend and provider boilerplate generated at runtime by a single root config.
Nothing is configured per-leaf — the bucket, state key, lock table and providers are all derived
from where a unit sits in the tree. This page is the state-management reference: how a leaf path
maps to a state object, the bucket-per-account + lock-table convention, what the root injects into
every unit, the state operations that are safe to run, and the two backend gotchas.

For the wider Terragrunt foundation (env/region layering, module sourcing, the full component
inventory) see [Terragrunt foundation](terraform-overview.md). This page is the state-and-backend
slice of that same machinery.

The two authorities are
`terraform/aws/root.hcl`
and
`terraform/azure/root.hcl`.
Each carries a `remote_state` block (state backend) plus one or more `generate` blocks (provider
files). Everything below is derived from those two files.

## Backend & state-key layout

The backend is defined once, in the `remote_state` block of each `root.hcl`, and inherited by every
leaf that `include`s it. For AWS (`terraform/aws/root.hcl`):

```hcl
remote_state {
  backend = "s3"

  config = {
    bucket         = "${local.company}-${local.environment}-${local.account_id}-${local.region}"
    key            = "${replace(path_relative_to_include(), "\\", "/")}/terraform.tfstate"
    region         = local.region
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }

  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
}
```

The `generate` stanza writes the resolved config into a `backend.tf` in the unit's Terragrunt
working directory at runtime (`if_exists = "overwrite_terragrunt"` — only files Terragrunt itself
generated are replaced). There is **no hand-written `backend.tf` anywhere in the tree**; deleting the
`.terragrunt-cache` and re-running regenerates it.

### How a leaf path becomes a state object

The state **key** is the unit's path *relative to the directory that holds `root.hcl`*, with
`/terraform.tfstate` appended. `path_relative_to_include()` returns exactly that relative path, and
`root.hcl` lives at the top of each provider tree (`terraform/aws/` and `terraform/azure/`). So the
directory structure *is* the state namespace — one state object per leaf, no collisions, nothing to
configure.

| Leaf directory (`terraform/aws/…`) | `path_relative_to_include()` | S3 state key |
|---|---|---|
| `prod/af-south-1/eks` | `prod/af-south-1/eks` | `prod/af-south-1/eks/terraform.tfstate` |
| `prod/af-south-1/rds` | `prod/af-south-1/rds` | `prod/af-south-1/rds/terraform.tfstate` |
| `staging/af-south-1/eks` | `staging/af-south-1/eks` | `staging/af-south-1/eks/terraform.tfstate` |
| `network/af-south-1/vpc` | `network/af-south-1/vpc` | `network/af-south-1/vpc/terraform.tfstate` |

Azure keys work the same way, rooted at `terraform/azure/` (see [Azure state](#azure-state-lives-in-the-aws-prod-account)):

| Leaf directory (`terraform/azure/…`) | S3 state key |
|---|---|
| `prod/southafricanorth/vnet` | `prod/southafricanorth/vnet/terraform.tfstate` |
| `prod/southafricanorth/dns` | `prod/southafricanorth/dns/terraform.tfstate` |

!!! note "The key is path-derived — moving a directory moves its state"
    Because the key is `path_relative_to_include()`, **renaming or relocating a leaf directory
    changes its state key**. Terragrunt will then look for state at the new key, find none, and treat
    the unit as un-provisioned. To relocate a unit deliberately, move the S3 object to the new key
    (or `terraform state` migrate) rather than just moving the directory.

## Bucket-per-account + DynamoDB lock table

State is **not** pooled in one bucket. Each AWS environment gets its own state bucket, named from
four resolved locals:

```hcl
bucket = "${local.company}-${local.environment}-${local.account_id}-${local.region}"
```

| Local | Source | Example (prod) |
|---|---|---|
| `company` | hard-coded `"platform"` in `root.hcl` locals | `platform` |
| `environment` | `local.environment_vars.inputs.environment` (from the parent `env.hcl` dir) | `prod` |
| `account_id` | `local.environment_vars.inputs.account_id` (the env's AWS account) | `777788889999` |
| `region` | `local.region_vars.inputs.region` (from `region.hcl`) | `af-south-1` |

Resolved, that gives one state bucket per environment, each living **in that environment's own AWS
account**:

| Environment | Account ID | State bucket |
|---|---|---|
| network | `210987654321` | `example-network-210987654321-af-south-1` |
| prod | `777788889999` | `example-prod-777788889999-af-south-1` |
| staging | `444455556666` | `example-staging-444455556666-af-south-1` |

!!! note "Bucket name embeds the account ID"
    Putting `account_id` in the bucket name makes the mapping self-documenting and globally unique,
    and means a run pointed at the wrong account also targets a bucket that account cannot write —
    a second guardrail alongside the provider's `allowed_account_ids` (see
    [Provider generation](#provider-generation-what-the-root-injects)). The `shared` (`123456789012`)
    and `dev` (`111122223333`) accounts are declared in the `root.hcl` `environments` map but have no
    live directories, so no state bucket is created for them.

Locking uses a DynamoDB table named literally **`terraform-locks`** (`dynamodb_table =
"terraform-locks"`), and state is server-side encrypted (`encrypt = true`). The lock table name is
the same string for every environment; each account holds its own `terraform-locks` table (except
Azure — see below). A lock row is written for the duration of any state-mutating operation and
released on completion.

!!! warning "Operator input needed"
    `root.hcl` references the bucket and `terraform-locks` table by name but does **not** create
    them — an S3 backend is a bootstrap prerequisite, not a managed resource. The provisioning of
    each environment's state bucket (versioning, encryption, public-access-block) and its
    `terraform-locks` table is not derivable from the files in this tree. Confirm with the platform
    owner where these are defined before treating them as reproducible.

## Provider generation — what the root injects

Beyond the backend, `root.hcl` generates the provider boilerplate into **every** leaf's working
directory, so no unit declares providers itself. For AWS, four files are written:

| Generated file | `generate` block | `if_exists` | What it contains |
|---|---|---|---|
| `backend.tf` | `remote_state` | `overwrite_terragrunt` | The S3 backend above (bucket / key / region / lock table / encrypt) |
| `provider.tf` | `generate "provider"` | `overwrite` | `terraform{}` `required_version` + `required_providers` pins, and the default `aws` provider |
| `network_provider.tf` | `generate "network_provider"` | `overwrite_terragrunt` | An `aws` provider aliased `network` that assume-roles into the network account |
| `aws_us_east_1_provider.tf` | `generate "aws_us_east_1"` | `overwrite_terragrunt` | An `aws` provider aliased `us-east-1` for global/edge resources |

The default provider is pinned to the unit's region and **fenced to a single account** via
`allowed_account_ids`, so Terraform refuses to run against the wrong account:

```hcl
provider "aws" {
  region              = "af-south-1"       # local.region
  allowed_account_ids = ["777788889999"]   # local.account_id (env-specific)
}
```

The `network` alias assume-roles into the central network account so any unit can touch shared
network resources (DNS, peering) without leaving its own default provider:

```hcl
provider "aws" {
  alias  = "network"
  region = "af-south-1"                     # local.region

  assume_role {
    role_arn     = "arn:aws:iam::210987654321:role/TerraformNetworkAdmin"
    session_name = "TerraformNetworkAccess"
  }
}
```

Because these files are regenerated on every run, they are **build artifacts, not source** — do not
edit the `*.tf` files inside a `.terragrunt-cache`; change `root.hcl` instead.

### Version pins injected into every leaf

`provider.tf` bakes in the versions held in each `root.hcl` `locals` block. These are the pins that
govern state format and provider behaviour, so they belong to the backend story:

| Pin (AWS `root.hcl`) | Value | Rendered as |
|---|---|---|
| `terraform_version` | `1.9.1` | `required_version = ">= 1.9.1"` |
| `aws_version` | `6.36.0` | `hashicorp/aws` pin |
| `routeros_version` | `1.83.1` | `terraform-routeros/routeros` pin |
| `fortios_version` | `1.22.0` | `fortinetdev/fortios` pin |
| `pagerduty_version` | `3.33.1` | `PagerDuty/pagerduty` pin |
| `sops_version` | `1.1.1` | **commented out** — the `carlpett/sops` generate block is disabled |

Azure (`terraform/azure/root.hcl`) pins only two:

| Pin (Azure `root.hcl`) | Value | Rendered as |
|---|---|---|
| `terraform_version` | `1.9.1` | `required_version = ">= 1.9.1"` |
| `azurerm_version` | `3.116.0` | `hashicorp/azurerm` pin |

!!! note "`required_version` is a floor, not a lock"
    Both trees render `required_version = ">= 1.9.1"` — a minimum, not an exact pin. The provider
    versions (`aws`, `azurerm`, …) are exact pins. Bump these in `root.hcl` only; a unit-level
    override would be overwritten on the next generate.

## State operations that are safe to document

All commands run **inside a leaf directory** (the one holding `terragrunt.hcl`), never at the tree
root — Terragrunt resolves the backend, downloads the module, then invokes Terraform. Substitute
`terragrunt` with `terraform` if you are operating on an already-initialised working directory
directly.

### Plan / apply per leaf

```bash
cd terraform/aws/prod/af-south-1/eks
terragrunt plan          # generate backend+providers, download module, plan
terragrunt apply         # acquires a terraform-locks row for the write
```

`run-all` from an env or region level fans out across leaves and respects the `dependencies` graph;
prefer per-leaf runs when you want a tight blast radius.

### Read-only inspection with `-lock=false`

For read-only inspection you can skip the DynamoDB lock so a concurrent apply is never blocked:

```bash
terragrunt plan  -lock=false     # read-only diff, no lock row
terragrunt show                  # render the last plan / current state
terragrunt state list            # enumerate addresses in state
terragrunt output                # read outputs
```

!!! warning "`-lock=false` is for reads only"
    Only pass `-lock=false` to read-only commands (`plan`, `show`, `state list`, `output`). **Never**
    disable the lock on `apply`, `destroy`, or a `state mv`/`rm`/`import` — two unlocked writers can
    corrupt the state object. If a lock is genuinely stale, clear it with `force-unlock` (below), do
    not bypass locking.

### Surgical state edits — `mv` / `rm` / `import`

These edit the state object without changing real infrastructure. They take the lock; run them one
leaf at a time.

```bash
# Rename/relocate a resource address (e.g. after a refactor) — no cloud change:
terragrunt state mv 'aws_instance.old' 'aws_instance.new'

# Drop a resource from state so Terraform forgets it (resource keeps existing in the cloud):
terragrunt state rm 'aws_instance.example'

# Adopt an existing cloud resource into this leaf's state:
terragrunt import 'aws_instance.example' i-0123456789abcdef0
```

!!! note "These change the ledger, not the cloud"
    `state mv`/`rm`/`import` only rewrite what Terraform *thinks* it manages. `rm` does **not** delete
    the resource; `import` does **not** create one. Always run `plan` afterwards to confirm the diff
    is what you expect before any `apply`. Because the state key is path-derived, `state mv` is also
    the tool for reconciling addresses when a module is restructured.

### Clearing a stale lock — `force-unlock`

If a run is killed mid-apply, the `terraform-locks` row can be left behind and the next run reports
the state as locked. Read the lock ID from that error and release it:

```bash
terragrunt force-unlock <LOCK_ID>
```

!!! warning "Only unlock a lock you are certain is dead"
    `force-unlock` removes the DynamoDB lock unconditionally. Confirm no other apply is actually
    running first — releasing a live lock reintroduces the concurrent-writer corruption the lock
    exists to prevent.

## Gotchas

### The Windows backslash state fork

The AWS state key wraps `path_relative_to_include()` in a `replace()`:

```hcl
key = "${replace(path_relative_to_include(), "\\", "/")}/terraform.tfstate"
```

`root.hcl` documents why in a comment: `path_relative_to_include()` returns **OS-native path
separators**. On Windows that yields backslashes, so without the `replace()` the S3 key would become
`network\af-south-1\vpc/terraform.tfstate` — a *different object* than the canonical
`network/af-south-1/vpc/terraform.tfstate` the Linux/macOS pipeline writes. The result is a **silent
state fork**: a Windows operator and the CI runner would read and write two separate state files for
the same unit, each unaware of the other's changes. The `replace(…, "\\", "/")` normalises
separators to forward slashes so a run from any OS targets the same object. It is a no-op on
Linux/macOS (no backslashes to replace).

!!! warning "Azure has no backslash guard"
    The **Azure** `root.hcl` uses a bare `key = "${path_relative_to_include()}/terraform.tfstate"`
    with **no** `replace()`. An Azure Terragrunt run from a Windows workstation would fork state
    exactly as described above. Until the guard is added there, run the Azure tree only from
    Linux/macOS (or CI).

### Azure state lives in the AWS prod account

The Azure tree does not use an Azure Storage Account backend — it uses **S3, deliberately hosted in
AWS**, to sidestep the chicken-and-egg of bootstrapping Azure storage. `azure/root.hcl` says so
in-file: *"Use AWS for state backend (avoiding chicken-and-egg with Azure storage)"*.

```hcl
locals {
  aws_region     = "af-south-1"
  aws_account_id = "777788889999" # Using prod account from AWS config
}

remote_state {
  backend = "s3"
  config = {
    bucket         = "${local.company}-azure-${local.environment}-${local.region}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = local.aws_region
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

So Azure state resolves to bucket **`example-azure-prod-southafricanorth`**, but that bucket and
its `terraform-locks` table live in the **AWS prod account `777788889999`**, region **`af-south-1`** —
even though the resources being managed are in Azure subscription
`00000000-1111-2222-3333-444444444444`, region `southafricanorth`.

!!! note "Backend region ≠ managed-resource region"
    Note the two regions in the bucket name vs. the backend `region`: the name embeds the *Azure*
    region (`southafricanorth`, from `local.region`) while the state physically sits in the *AWS*
    region (`af-south-1`, from `local.aws_region`). Whoever runs the Azure tree therefore needs AWS
    credentials for the prod account (`777788889999`) to reach state, in addition to Azure
    credentials for the managed resources. A pure-Azure identity cannot init the backend.

!!! info "Related pages"
    - [Terragrunt foundation](terraform-overview.md) — env/region layering, module sourcing, full component inventory
    - [Azure](terraform-azure.md) — the Azure resource tree that this state backs
    - [Secrets (SOPS + Age)](secrets-sops.md) — the `sops_decrypt_file` inputs merged alongside state config
