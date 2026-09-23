# Terraform: Azure (South Africa North)

The `terraform/azure` subsystem is a Terragrunt-managed Azure footprint that provides a secure, MikroTik-routed network in the **South Africa North** region (Johannesburg). It is the Azure counterpart to the platform's AWS estate: it provisions a resource group, a segmented virtual network, network security groups, a pair of MikroTik CHR (Cloud Hosted Router) VMs that do all real routing/NAT/VPN, cost-effective DNS "load balancing" for `az.example.net`, user-defined route tables, a storage account for VHDs, and an Azure Virtual Desktop (AVD) stack for network-management tooling (Winbox, Edge).

Source tree: `terraform/azure`.

!!! note "Relationship to the AWS side"
    Although this is Azure infrastructure, its Terraform **state lives in AWS S3** (`af-south-1`, bucket `example-azure-prod-southafricanorth`, DynamoDB lock table `terraform-locks`, prod account `777788889999`). This is deliberate — using an existing S3 backend avoids the chicken-and-egg problem of needing an Azure storage account before the Azure subscription is bootstrapped. See `root.hcl`. The MikroTik CHR routing/VPN pattern here mirrors the CHR-based edge used elsewhere in the platform (AWS↔OCI dual-tunnel, on-prem MikroTik fleet).

## Layout

```
terraform/azure
├── root.hcl                     # Terragrunt root: backend (AWS S3), azurerm provider, global inputs
├── README.md                    # Human-authored architecture/runbook notes
├── diagram.png                  # Architecture diagram (binary asset)
├── _modules/                    # Reusable Terraform modules (one dir per component)
│   ├── rg/                      # Resource group
│   ├── vnet/                    # Virtual network + per-AZ subnets
│   ├── nsg/                     # Network security groups + subnet associations
│   ├── vm/                      # MikroTik CHR VMs (2 × AZ) + NICs + PIPs
│   │   └── .mikrotik.rsc        # Reference RouterOS config (NOT applied by Terraform)
│   ├── dns/                     # Hierarchical Azure DNS zones + records
│   ├── rt/                      # Route tables (UDR via MikroTik) + associations
│   ├── sa/                      # Storage account (VHD container)
│   └── avd/                     # Azure Virtual Desktop host pool / app group / workspace
└── prod/
    ├── env.hcl                  # Environment (prod) locals: subscription, tags
    └── southafricanorth/
        ├── region.hcl           # Region locals: san / South Africa North / JHB
        ├── rg/terragrunt.hcl
        ├── vnet/terragrunt.hcl
        ├── nsg/terragrunt.hcl
        ├── vm/terragrunt.hcl
        ├── dns/terragrunt.hcl
        ├── rt/terragrunt.hcl
        ├── sa/terragrunt.hcl
        └── avd/terragrunt.hcl
```

Each live stack directory under `prod/southafricanorth/<component>/` is a thin Terragrunt wrapper whose `terraform.source` resolves to the matching `_modules/<component>` by directory basename:

```hcl
terraform {
  source = "${get_path_to_repo_root()}/terraform/azure/_modules//${basename(get_terragrunt_dir())}"
}
```

## Global configuration (`root.hcl` / `env.hcl` / `region.hcl`)

The Terragrunt include chain merges three layers of config into every stack's `inputs`.

| Setting | Value | Source |
|---|---|---|
| Terraform version | `>= 1.9.1` | `root.hcl` `local.terraform_version` |
| azurerm provider | `hashicorp/azurerm` `3.116.0` | `root.hcl` `local.azurerm_version` |
| Company / prefix | `platform` | `root.hcl` |
| Domain | `az.example.net` | `root.hcl` |
| Subscription (prod) | `00000000-1111-2222-3333-444444444444` | `env.hcl` / `root.hcl` |
| Region | `southafricanorth` → "South Africa North" | `region.hcl` |
| Short region | `san` | `region.hcl` |
| City / country code | `jhb` / `za` | `root.hcl` `regions` |
| Timezone | `Africa/Johannesburg` | `root.hcl` `regions` |
| Availability zones | `["1", "2"]` | `root.hcl` `environments.prod...` |
| VNet CIDR | `10.162.0.0/19` | `root.hcl` `resource_groups.prod.vnet` |
| Backend | AWS S3 `af-south-1`, encrypt, DynamoDB `terraform-locks` | `root.hcl` `remote_state` |
| State bucket | `example-azure-prod-southafricanorth` | `root.hcl` (`company-azure-env-region`) |
| State key | `<path_relative_to_include>/terraform.tfstate` | `root.hcl` |

The provider block is generated (`provider.tf`, `if_exists = overwrite`) with `features {}`, the prod `subscription_id`, and `skip_provider_registration = true`:

```hcl
provider "azurerm" {
  features {}
  subscription_id = "00000000-1111-2222-3333-444444444444"
  skip_provider_registration = true
}
```

Global tags applied everywhere (merged region → env → root): `Comment=Managed by Terraform`, `Environment=Production`, `Project=the platform`, `CostCenter=Infrastructure`, `Region=South Africa North`, `Location=JHB`.

!!! warning "Commented-out `oldprod` block"
    `root.hcl` carries a large commented-out `oldprod` environment (lines ~31–62) labelled *"To be deleted after migrating the old sonic IP and Mikrotik VM to the new prod subscription"*. It references the old subscription/resource-group GUIDs and a `10.162.0.0/16` layout. It is dead configuration retained as a migration reminder.

## Network design

The `/19` VNet is carved into four functional `/22` subnet *types*, and the `vnet` module then splits **each type into two `/24` subnets** (one per AZ) using `cidrsubnet(base, 2, az_index)`.

| Type | Base `/22` | AZ1 `/24` | AZ2 `/24` | Purpose | Routing |
|---|---|---|---|---|---|
| `outside` | `10.162.0.0/22` | `10.162.0.0/24` | `10.162.1.0/24` | DMZ — external-facing CHR interface (has PIP) | Default Azure routing |
| `inside` | `10.162.8.0/22` | `10.162.8.0/24` | `10.162.9.0/24` | Internal CHR interface | UDR via MikroTik (see note) |
| `app` | `10.162.12.0/22` | `10.162.12.0/24` | `10.162.13.0/24` | Application workloads | UDR via MikroTik |
| `data` | `10.162.16.0/22` | `10.162.16.0/24` | `10.162.17.0/24` | Databases / data storage | UDR via MikroTik |

Subnets are named `snet-<type>-prod-san-az<n>`.

### Traffic flow (from README)

- **Inbound**: DNS resolves `az.example.net` to a CHR public IP → traffic hits the CHR on its `outside` interface (PIP) → CHR inspects/forwards to app subnet → app subnet's UDR points return traffic back at the CHR.
- **Outbound**: app/data traffic follows the `0.0.0.0/0` UDR to the CHR → CHR masquerades (NAT) via its PIP.
- **On-prem VPN**: WireGuard is terminated on the CHRs; Azure↔on-prem routing is handled entirely inside RouterOS, so no Azure route-table entries exist for on-prem networks.

## Modules

### `rg` — Resource Group

`_modules/rg`. A single `azurerm_resource_group` named `rg-<environment>-<short_region>` (→ `rg-prod-san`).

| | |
|---|---|
| Resources | `azurerm_resource_group.this` |
| Key inputs | `environment`, `short_region`, `location`, `tags` |
| Outputs | `resource_group_name`, `resource_group_id`, `location` |

### `vnet` — Virtual Network + subnets

`_modules/vnet`. Creates the VNet `vnet-prod-san` and a `for_each` fan-out of subnets (type × AZ) via a `flatten` + `cidrsubnet` local.

| | |
|---|---|
| Resources | `azurerm_virtual_network.this`, `azurerm_subnet.this` (8 subnets) |
| Key inputs | `vnet` (CIDR), `subnets` (map of type→base CIDR), `environment`, `short_region`, `location` |
| Notable outputs | `vnet_id`, `subnet_ids`/`subnet_names` (per-AZ maps), plus explicit `<type>_subnet_ids` `{az1, az2}` maps consumed by nsg/rt/vm/avd |

The subnet map keys are `<type>_az<n>` (e.g. `outside_az1`), and grouped outputs like `outside_subnet_ids = { az1 = ..., az2 = ... }` are what downstream modules wire against.

### `nsg` — Network Security Groups

`_modules/nsg`. Four NSGs (`nsg-<type>-prod-san`) plus per-AZ subnet associations (`for_each` over the subnet-ID maps).

| NSG | Rules (as coded) |
|---|---|
| `outside` | `AllowHTTPSInbound` TCP 443 from `admin_networks`; `AllowTrustedSSHInbound` TCP 22/8291/3389 from `admin_networks`; `AllowWireGuardInbound` UDP 51820–51899 from `*`; `AllowBGPInbound` UDP 179 from `*` |
| `inside` | **No rules** — all rules commented out (default Azure NSG behaviour only) |
| `app` | `AllowTrustedInbound` any protocol/port from `admin_networks` |
| `data` | `Allow-Database-From-App` TCP 1433/3306/5432/6379 from `app` subnet; `Allow-Admin-Access` any from `admin_networks`; `Deny-All-Inbound` (priority 4000) |

Live `admin_networks` (prod) = `["198.51.100.35/32"]` (the platform engineer Home). The module default (used only if not overridden) is the full RFC1918 set.

| | |
|---|---|
| Key inputs | `subnets` (object outside/inside/app/data), the four `<type>_subnet_ids` maps, `admin_networks`, `resource_group_name` |
| Outputs | `outside_nsg_id`, `inside_nsg_id`, `app_nsg_id`, `data_nsg_id` |

!!! warning "Comment/code mismatches in `nsg/main.tf`"
    - The `outside` `AllowHTTPSInbound` rule is commented *"Allow HTTP/HTTPS from Internet"* but its `source_address_prefixes` is `var.admin_networks`, not the internet. Same for the `app` rule (commented *"from outside subnet (via load balancer)"* but sourced from `admin_networks`).
    - `AllowBGPInbound` uses `protocol = "Udp"` on port 179; BGP is a TCP protocol. Verify before relying on this rule.
    - The `inside` NSG is created with **all** security rules commented out.

### `vm` — MikroTik CHR VMs

`_modules/vm`. Deploys **one MikroTik CHR per AZ** (two total) as `azurerm_linux_virtual_machine`, each with an outside (primary) and inside (secondary) NIC and — by default — a zonal static Standard public IP on the outside NIC.

The module reads the subnet CIDRs back via `data.azurerm_subnet` (parsing IDs by `split("/", ...)`) and computes fixed addresses:

- `outside_ip = cidrhost(outside_subnet, 4)` → **az1 `10.162.0.4`**, **az2 `10.162.1.4`**
- `inside_ip  = cidrhost(inside_subnet, 4)`  → **az1 `10.162.8.4`**, **az2 `10.162.9.4`**

| Resource | Name pattern | Notes |
|---|---|---|
| `azurerm_public_ip.mikrotik_outside` | `pip-chr-outside-prod-san-<az>` | `Static` / `Standard` SKU, zonal; only created when `existing_public_ip_ids == null` |
| `azurerm_network_interface.mikrotik_outside` | `nic-chr-outside-prod-san-<az>` | `ip_forwarding_enabled = true`, static private IP, primary, PIP attached |
| `azurerm_network_interface.mikrotik_inside` | `nic-chr-inside-prod-san-<az>` | `ip_forwarding_enabled = true`, static private IP |
| `azurerm_linux_virtual_machine.mikrotik` | `vm-chr-prod-san-<az>` | zonal, SSH-key only (password auth disabled), boot diagnostics on |

VM specifics:

- **Size**: variable `vm_size`, default `Standard_B1ls`.
- **Admin user**: `azureuser`, SSH public key supplied inline from the live stack.
- **OS disk**: `osdisk-chr-prod-san-<az>`, `Standard_LRS`, `disk_size_gb = 1`, `caching = ReadWrite`, optional `disk_encryption_set_id`.
- **Image**: live stack pins `custom_image_id` to `.../images/chr-7.14.3.vhd` (MikroTik CHR RouterOS 7.14.3). If `custom_image_id` is null, a `source_image_reference` fallback uses the marketplace `MikroTik / routeros / routeros-7 / latest`.

| | |
|---|---|
| Key inputs | `availability_zones`, `outside_subnet_ids`, `inside_subnet_ids`, `ssh_public_key`, `custom_image_id`, `vm_size`, `existing_public_ip_ids`, `disk_encryption_set_id` |
| Outputs | `mikrotik_vm_ids`, `mikrotik_vm_names`, `mikrotik_public_ips`, `mikrotik_private_ips` (outside), `mikrotik_inside_ips` |

`mikrotik_public_ips` feeds the `dns` module; `mikrotik_inside_ips` feeds the `rt` module (next-hop virtual appliance).

!!! note "`.mikrotik.rsc` is a reference config, not IaC"
    `_modules/vm/.mikrotik.rsc` is a committed RouterOS export documenting the intended in-guest config: it renames `ether1→outside`/`ether2→inside`, sets DHCP clients, DNS `1.1.1.1`, TRUSTED/RFC1918 address-lists (including operator IPs `198.51.100.35` and `192.0.2.38`), a stateful firewall accepting WireGuard/L2TP/IKE/IPsec, `masquerade` srcnat out `outside`, and dst-nat rules (RDP→`10.162.13.4`, SSH `2222`→`10.162.12.6:22`). Terraform does **not** apply this file; MikroTik configuration is performed out-of-band (see README post-deploy steps).

### `dns` — Hierarchical Azure DNS

`_modules/dns`. Builds a delegated zone hierarchy and the round-robin "poor-man's load balancer" records. There is **no Azure Load Balancer** — round-robin A records with low TTL distribute traffic to the two CHRs (README claims ~$18/month saving).

| Zone | Name | Type |
|---|---|---|
| Root | `az.example.net` | `azurerm_dns_zone.root` |
| City | `jhb.az.example.net` | `azurerm_dns_zone.city` |
| Environment | `prod.jhb.az.example.net` | `azurerm_dns_zone.environment` |
| Internal (private) | `internal.prod.jhb.az.example.net` | `azurerm_private_dns_zone.internal` |

| Record | Zone | Type / TTL | Value |
|---|---|---|---|
| `chr1`, `chr2` | environment | A / 300 | per-CHR public IP (name derived from `az1`/`az2`) |
| `@` | root | A / 60 | all CHR public IPs (round-robin) |
| `api` | root | A / 60 | all CHR public IPs |
| `vpn` | root | A / 300 | all CHR public IPs |
| `www` | root | CNAME / 300 | `az.example.net` |
| `avd` | root | CNAME / 300 | `az.example.net` |
| `jhb` (delegation) | root | NS / 300 | city zone name servers |
| `prod` (delegation) | city | NS / 300 | environment zone name servers |

| | |
|---|---|
| Key inputs | `domain`, `environment`, `city_code`, `mikrotik_public_ips`, `resource_group_name` |
| Outputs | zone IDs/names, `root_name_servers` / `city_name_servers` / `environment_name_servers`, `main_domain_records`, `mikrotik_subdomains` |

!!! note "Domain delegation is a manual step"
    `az.example.net` must be delegated at the registrar to the Azure `root` zone name servers. Get them from `cd dns && terragrunt output root_name_servers`.

### `rt` — Route Tables (UDR)

`_modules/rt`. One route table per AZ (`rt-prod-san-<az>`), each with:

- `default-via-mikrotik-<az>`: `0.0.0.0/0` → `next_hop_type = VirtualAppliance`, `next_hop_in_ip_address =` the AZ's CHR **inside** IP (`10.162.8.4` / `10.162.9.4`).
- `local-via-vnet-<az>`: `10.162.0.0/19` → `VnetLocal`.

Route tables are associated with the **inside, app, and data** subnets per AZ.

| | |
|---|---|
| Key inputs | `mikrotik_inside_ips` (map, validated ≥2), `inside_subnet_ids`, `app_subnet_ids`, `data_subnet_ids`, `resource_group_name` |
| Outputs | `route_table_ids`, `route_table_names` (per-AZ maps) |

!!! warning "README vs. code: inside subnets are routed via the CHR"
    The README states outside/inside subnets *"use default Azure routing since MikroTiks have PIPs"* and only app/data get UDRs. The `rt` module (and its `terragrunt.hcl`) **also associate the `inside` subnets** with the AZ route tables, so inside traffic egresses via the CHR's own inside interface. Confirm this is intended before troubleshooting asymmetric routing.

### `sa` — Storage Account (VHDs)

`_modules/sa`. A general-purpose storage account plus a private `vhds` container, used to host the CHR VHD image during VM creation.

Live values: account name `examplepublic`, `Standard` / `LRS` / `StorageV2`, `infrastructure_encryption_enabled = true`, `min_tls_version = TLS1_2`, `allow_nested_items_to_be_public = false`, `public_network_access_enabled = true` (README: needed for VHD access during VM creation), container `vhds` (`private`).

| | |
|---|---|
| Resources | `azurerm_storage_account.main`, `azurerm_storage_container.vhds`, `azurerm_storage_container.additional` (`for_each`, default empty) |
| Key inputs | `storage_account_name` (regex-validated), `account_tier`/`account_replication_type`/`account_kind`, `vhd_container_name`, `container_access_type`, `min_tls_version`, `public_network_access_enabled` |
| Outputs | account id/name, `primary_blob_endpoint`, `primary_access_key` (sensitive), `primary_connection_string` (sensitive), `vhd_container_name`/`vhd_container_url`, `boot_diagnostics_uri` |

!!! warning "`enable_https_traffic_only` is defined but never applied"
    Both `sa/variables.tf` and the live `sa/terragrunt.hcl` set `enable_https_traffic_only = true`, but `sa/main.tf` never references it — the `azurerm_storage_account` resource does not set `https_traffic_only_enabled`/`enable_https_traffic_only`. The input is inert; HTTPS-only relies on the provider/account default rather than this variable.

### `avd` — Azure Virtual Desktop

`_modules/avd`. Provisions the AVD control-plane objects only; session-host VMs are **not** managed by Terraform.

| Resource | Name | Config |
|---|---|---|
| `azurerm_virtual_desktop_host_pool.this` | `vdpool-prod-san` | `Pooled`, `maximum_sessions_allowed = 50`, `load_balancer_type = BreadthFirst`, `validate_environment = true`, custom RDP props `audiocapturemode:i:1;audiomode:i:0;targetisaadjoined:i:1;` |
| `azurerm_virtual_desktop_application_group.this` | `vdag-prod-san` | `type = RemoteApp` (for Winbox + Edge/IE mode) |
| `azurerm_virtual_desktop_workspace.this` | `vdws-prod-san` | friendly name "the platform Workspace" |
| `..._workspace_application_group_association.this` | — | binds the app group to the workspace |

Live inputs (`avd/terragrunt.hcl`): `session_host_count = 2`, `vm_size = Standard_B2s`, `admin_username = avdadmin`, `availability_zones` from root config, `app_subnet_ids` from the vnet dependency. These feed variables that are largely consumed only by the commented-out session-host block.

!!! danger "Committed plaintext AVD admin password"
    `prod/southafricanorth/avd/terragrunt.hcl` hard-codes `admin_password = "P@ssw0rd123!"` with a `# TODO: Use Azure Key Vault or generate randomly`. Even though the session-host VMs that would consume it are commented out, the weak credential is committed to the repo. It should be removed/rotated and sourced from Key Vault or a generated secret.

!!! note "Session hosts, apps, and DSC registration are manual"
    In `avd/main.tf`, the entire `azurerm_windows_virtual_machine.session_hosts` block, its NICs, the `Microsoft.Powershell/DSC` registration extension, and `azurerm_virtual_desktop_host_pool_registration_info` are commented out. Applications (Winbox, Edge with IE mode) are installed/published manually via the Azure portal. `avd/main.tf` also contains a stray commented-out JSON deployment-error string (a leftover `VMExtensionProvisioningError` paste) around line 28.

| | |
|---|---|
| Outputs | `host_pool_id`/`_name`, `workspace_id`/`_name`, `application_group_id`/`_name`, `avd_web_client_url` (`https://rdweb.wvd.microsoft.com/arm/webclient/index.html`) |

## Dependency graph & deploy order

Terragrunt encodes inter-stack dependencies (each with `mock_outputs` for plan-time). Deploy order (also in the README):

```text
rg ──┬─> vnet ──┬─> nsg
     │          ├─> vm ──┬─> dns
     │          │        └─> rt
     │          ├─> rt
     │          └─> avd
     ├─> sa
     ├─> nsg
     ├─> vm
     ├─> dns
     └─> rt
```

| Stack | Depends on | Wires (dependency outputs → module inputs) |
|---|---|---|
| `rg` | — | — |
| `vnet` | (implicit rg) | `vnet`, `subnets` from `root.hcl` |
| `sa` | `rg` | `resource_group_name` |
| `nsg` | `rg`, `vnet` | rg name; `outside/inside/app/data_subnet_ids`; `admin_networks` |
| `vm` | `rg`, `vnet` | rg name; `outside/inside_subnet_ids`; `ssh_public_key`; `custom_image_id` |
| `dns` | `rg`, `vm` | rg name; `mikrotik_public_ips`; `city_code` |
| `rt` | `rg`, `vnet`, `vm` | rg name; `inside/app/data_subnet_ids`; `mikrotik_inside_ips` |
| `avd` | `rg`, `vnet` | rg name; `app_subnet_ids`; AZs |

Recommended per-stack commands (from the README):

```bash
cd terraform/azure/prod/southafricanorth
terragrunt run-all apply --terragrunt-include-dir rg
terragrunt run-all apply --terragrunt-include-dir vnet
terragrunt run-all apply --terragrunt-include-dir nsg
terragrunt run-all apply --terragrunt-include-dir vm
terragrunt run-all apply --terragrunt-include-dir dns
terragrunt run-all apply --terragrunt-include-dir rt
terragrunt run-all apply --terragrunt-include-dir avd
# (sa is a standalone stack: cd sa && terragrunt apply)
```

## Operational notes

- **Auth**: Azure CLI must be authenticated to subscription `00000000-...`; the AWS CLI must be configured for the S3/DynamoDB backend (prod account `777788889999`, `af-south-1`).
- **Prerequisites** (README): Terraform ≥ 1.9.1, Terragrunt, an SSH key for the CHRs, and registrar delegation of `az.example.net` to Azure.
- **CHR access**: `ssh azureuser@chr1.prod.jhb.az.example.net` (Winbox on 8291). Post-deploy, WireGuard, firewall, load balancing between the two CHRs, and on-prem routing are configured inside RouterOS.
- **Troubleshooting** (README): `az network dns zone show --name az.example.net --resource-group rg-prod-san`; `az network nic show-effective-route-table ...`; verify NS delegation, watch for routing loops from misapplied UDRs, and check NSG rules.

## Per-environment differences

There is currently **one** environment and **one** region: `prod` / `southafricanorth`. The Terragrunt structure (`environments` map in `root.hcl`, `env.hcl`, `region.hcl`) is generalised for multiple envs/regions, but no `staging` or additional region stack exists in `terraform/azure`. The dormant `oldprod` block in `root.hcl` is commented out (see above) and not deployable.

## Legacy / cleanup flags

- **`avd/terragrunt.hcl`** — committed weak plaintext `admin_password = "P@ssw0rd123!"` (TODO to move to Key Vault).
- **`avd/main.tf`** — entire session-host/NIC/DSC-extension/registration-info block commented out (manual provisioning); stray commented-out JSON deployment-error string near line 28.
- **`nsg/main.tf`** — `inside` NSG has all rules commented out; comment/code mismatches on the `outside`/`app` "from Internet"/"from outside" rules; BGP rule uses UDP instead of TCP.
- **`sa`** — `enable_https_traffic_only` variable defined and passed but never referenced in `sa/main.tf`.
- **`rt`** — README says inside subnets use default routing, but the module associates a UDR route table with inside subnets.
- **`root.hcl`** — large commented-out `oldprod` migration block retained as a reminder.
- **`_modules/vm/.mikrotik.rsc`** — out-of-band RouterOS reference config (dotfile) committed inside a Terraform module directory; contains operator source IPs. Not consumed by Terraform.
- **`diagram.png`** — 154 KB binary architecture asset committed alongside the code.
