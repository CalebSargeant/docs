# Terraform reference for the AKS cluster

The modules and Terragrunt stacks that built the cluster, its VNet, its routes and its peerings,
reproduced in full with identifiers replaced. A root `root.hcl` (not shown) generated the
`azurerm` provider block with `subscription_id` taken from an environment file, and an `azurerm`
state backend per environment.

## Layout

```text
terraform/azure
├── root.hcl                      # backend + generated provider (azurerm ~> 4.50)
├── _modules/
│   ├── aks/                      # resource group, Log Analytics, cluster, subnet role assignments
│   ├── aks-routes/               # extra routes in the AKS-managed kubenet route table
│   ├── vnet/                     # VNet, subnets, optional route tables, inline peerings
│   ├── vnet-peering/             # both legs of one peering
│   └── afwpolicy-rule-collection/ # rule collection group on an existing firewall policy
└── <env>/westeurope/
    ├── aks-vnet/                 # vnet module
    ├── aks/                      # aks module, depends on the VNet existing
    ├── aks-routes/               # aks-routes module, dependency on aks
    ├── aks-peering-hub/          # vnet-peering module, dependency on aks-vnet
    ├── aks-peering-{dev,tst,sdev}/
    └── afwpolicy-rule-collection/ # VPN clients → Kafka load balancers
```

Apply order: `aks-vnet`, then `aks` and the peerings, then `aks-routes`.

## `aks` module

The module creates its own resource group and Log Analytics workspace, looks up the subnets of
an existing VNet, builds the cluster, and grants the cluster's system-assigned identity
**Network Contributor** on the node, pod and internal-LB subnets. That grant is what lets AKS
attach NICs and create internal load balancer frontends in a VNet it does not own.

```hcl
resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.common_tags
}

data "azurerm_subnet" "aks" {
  name                 = var.aks_subnet_name
  resource_group_name  = var.vnet_resource_group
  virtual_network_name = var.vnet_name
}

data "azurerm_subnet" "pods" {
  name                 = var.pod_subnet_name
  resource_group_name  = var.vnet_resource_group
  virtual_network_name = var.vnet_name
}

data "azurerm_subnet" "internal_lb" {
  count                = var.internal_lb_subnet_name != null ? 1 : 0
  name                 = var.internal_lb_subnet_name
  resource_group_name  = var.vnet_resource_group
  virtual_network_name = var.vnet_name
}

resource "azurerm_log_analytics_workspace" "aks" {
  name                = "${var.cluster_name}-logs"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.common_tags
}

resource "azurerm_kubernetes_cluster" "this" {
  name                = var.cluster_name
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  dns_prefix          = var.cluster_name
  kubernetes_version  = var.kubernetes_version

  private_cluster_enabled             = var.private_cluster_enabled
  private_dns_zone_id                 = var.private_dns_zone_id
  private_cluster_public_fqdn_enabled = var.private_cluster_public_fqdn_enabled

  default_node_pool {
    name                        = "system"
    node_count                  = var.node_count
    vm_size                     = var.vm_size
    os_disk_size_gb             = var.os_disk_size_gb
    vnet_subnet_id              = data.azurerm_subnet.aks.id
    pod_subnet_id               = var.network_plugin == "azure" && var.network_plugin_mode != "overlay" ? data.azurerm_subnet.pods.id : null
    zones                       = var.availability_zones
    type                        = "VirtualMachineScaleSets"
    temporary_name_for_rotation = "systemtemp"
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin      = var.network_plugin
    network_plugin_mode = var.network_plugin_mode # "overlay" for Azure CNI Overlay
    network_data_plane  = var.network_data_plane  # "cilium" for the eBPF dataplane
    network_policy      = var.network_plugin == "kubenet" ? "calico" : (var.network_data_plane == "cilium" ? "cilium" : "azure")
    pod_cidr            = var.network_plugin == "kubenet" || var.network_plugin_mode == "overlay" ? "10.244.0.0/16" : null
    service_cidr        = var.service_cidr
    dns_service_ip      = var.dns_service_ip
    load_balancer_sku   = "standard"
    outbound_type       = var.outbound_type
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.aks.id
  }

  tags = var.common_tags

  lifecycle {
    # The node count belongs to the autoscaler / manual scaling, not to the plan.
    ignore_changes = [default_node_pool[0].node_count]
  }
}

resource "azurerm_role_assignment" "aks_network_contributor" {
  scope                = data.azurerm_subnet.aks.id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_kubernetes_cluster.this.identity[0].principal_id
}

resource "azurerm_role_assignment" "pods_network_contributor" {
  scope                = data.azurerm_subnet.pods.id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_kubernetes_cluster.this.identity[0].principal_id
}

resource "azurerm_role_assignment" "internal_lb_network_contributor" {
  count                = var.internal_lb_subnet_name != null ? 1 : 0
  scope                = data.azurerm_subnet.internal_lb[0].id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_kubernetes_cluster.this.identity[0].principal_id
}
```

The inputs worth knowing, with their module defaults:

| Input | Default | Notes |
|-------|---------|-------|
| `network_plugin` | `azure` | `kubenet` in this deployment |
| `network_plugin_mode` | `null` | `overlay` for Azure CNI Overlay |
| `network_data_plane` | `azure` | `cilium` switches the policy engine to Cilium too |
| `outbound_type` | `loadBalancer` | `userDefinedRouting` sends egress through a firewall UDR instead |
| `private_cluster_enabled` | `true` | Overridden to `false` here |
| `private_dns_zone_id` | `System` | Only meaningful for a private cluster |
| `vm_size` | `Standard_D2s_v3` | |
| `node_count` | `2` | |
| `os_disk_size_gb` | `128` | |
| `internal_lb_subnet_name` | `null` | When set, the identity is granted Network Contributor on it |

Outputs: `cluster_id`, `cluster_name`, `node_resource_group` (consumed by `aks-routes`),
`kube_config` (sensitive) and `kubelet_identity`.

### The cluster stack

```hcl
include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../../../_modules/aks"
}

inputs = {
  resource_group_name = "rg-aks-nonprod"
  cluster_name        = "aks-nonprod"
  kubernetes_version  = "1.32"
  node_count          = 2
  vm_size             = "Standard_D4s_v6"
  os_disk_size_gb     = 128
  availability_zones  = ["1", "2"]

  # Bring-your-own VNet
  vnet_name               = "vnet-aks"
  vnet_resource_group     = "rg-aks-network"
  aks_subnet_name         = "snet-aks-nodes"
  pod_subnet_name         = "snet-aks-pods"
  internal_lb_subnet_name = "snet-aks-internal-lb"
  external_lb_subnet_name = "snet-aks-external-lb"

  private_cluster_enabled             = false
  private_dns_zone_id                 = null
  private_cluster_public_fqdn_enabled = false

  network_plugin      = "kubenet"
  network_plugin_mode = null
  network_data_plane  = "azure"
  service_cidr        = "192.168.0.0/16"
  dns_service_ip      = "192.168.0.10"
  outbound_type       = "loadBalancer"
}
```

## `aks-routes` module

Manages routes inside the route table AKS creates for kubenet. The table is looked up rather
than created, because AKS owns it and recreates it with the node resource group.

```hcl
data "azurerm_route_table" "aks" {
  name                = var.aks_route_table_name
  resource_group_name = var.aks_resource_group_name
}

# Default route to the internet rather than the hub firewall, so public load balancers and
# API-server access keep working.
resource "azurerm_route" "default_to_internet" {
  name                = "default"
  resource_group_name = var.aks_resource_group_name
  route_table_name    = var.aks_route_table_name
  address_prefix      = "0.0.0.0/0"
  next_hop_type       = "Internet"
}

# Keep the on-prem VPN client range going through the hub firewall.
resource "azurerm_route" "onprem" {
  name                   = "onprem"
  resource_group_name    = var.aks_resource_group_name
  route_table_name       = var.aks_route_table_name
  address_prefix         = "172.16.42.0/24"
  next_hop_type          = "VirtualAppliance"
  next_hop_in_ip_address = "10.40.1.4"
}
```

The module also carried commented-out experiments, kept as a record of what was tried: a default
route via the firewall (`VirtualAppliance` → `10.40.1.4`), `VnetLocal` routes for each
application spoke, and `/32` routes with next hop `Internet` for each public load balancer
address (`192.0.2.10` to `192.0.2.13`). At least one of those `/32` routes had been applied at
some point: it was still in the stack's state, outside the configuration, when the cluster was
deleted.

Its stack takes the node resource group from the cluster and hardcodes the table name:

```hcl
dependency "aks" {
  config_path = "../aks"
  mock_outputs = {
    node_resource_group = "MC_rg-aks-nonprod_aks-nonprod_westeurope"
  }
}

inputs = {
  aks_resource_group_name = dependency.aks.outputs.node_resource_group
  # Generated by AKS and not exposed as an output. Format: aks-agentpool-<random-id>-routetable
  aks_route_table_name = "aks-agentpool-12345678-routetable"
}
```

## `vnet` module

A general-purpose VNet: subnets with optional delegation and service endpoints, optional route
tables and routes, subnet-to-route-table associations that accept either a key of a table
declared here or the full ID of an external one, and optional inline peerings.

```hcl
resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.common_tags
}

resource "azurerm_virtual_network" "this" {
  name                = var.vnet_name
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  address_space       = var.address_space
  dns_servers         = var.dns_servers
  tags                = var.common_tags
}

resource "azurerm_subnet" "subnets" {
  for_each = var.subnets

  name                 = each.value.name
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [each.value.address_prefix]

  dynamic "delegation" {
    for_each = each.value.delegation != null ? [each.value.delegation] : []
    content {
      name = delegation.value.name
      service_delegation {
        name    = delegation.value.service_name
        actions = delegation.value.actions
      }
    }
  }

  service_endpoints                             = each.value.service_endpoints
  private_endpoint_network_policies             = each.value.private_endpoint_network_policies
  private_link_service_network_policies_enabled = each.value.private_link_service_network_policies_enabled
}

resource "azurerm_route_table" "this" {
  for_each = var.route_tables

  name                          = each.value.name
  location                      = var.location
  resource_group_name           = azurerm_resource_group.this.name
  bgp_route_propagation_enabled = !each.value.disable_bgp_route_propagation
  tags                          = var.common_tags
}

resource "azurerm_route" "this" {
  for_each = merge([
    for rt_key, rt in var.route_tables : {
      for route_key, route in rt.routes :
      "${rt_key}__${route_key}" => merge(route, { route_table_name = rt.name, route_name = route_key })
    }
  ]...)

  name                   = each.value.route_name
  resource_group_name    = azurerm_resource_group.this.name
  route_table_name       = each.value.route_table_name
  address_prefix         = each.value.address_prefix
  next_hop_type          = each.value.next_hop_type
  next_hop_in_ip_address = each.value.next_hop_in_ip_address

  depends_on = [azurerm_route_table.this]
}

resource "azurerm_subnet_route_table_association" "subnets" {
  for_each = { for k, v in var.subnets : k => v if v.route_table_id != null }

  subnet_id = azurerm_subnet.subnets[each.key].id
  # Accept a key of a table declared above, or the full ID of an external table.
  route_table_id = can(azurerm_route_table.this[each.value.route_table_id].id) ? azurerm_route_table.this[each.value.route_table_id].id : each.value.route_table_id

  depends_on = [azurerm_route_table.this]
}

resource "azurerm_virtual_network_peering" "this" {
  for_each = var.vnet_peerings

  name                      = each.key
  resource_group_name       = azurerm_resource_group.this.name
  virtual_network_name      = azurerm_virtual_network.this.name
  remote_virtual_network_id = each.value.remote_vnet_id

  allow_virtual_network_access = each.value.allow_virtual_network_access
  allow_forwarded_traffic      = each.value.allow_forwarded_traffic
  allow_gateway_transit        = each.value.allow_gateway_transit
  use_remote_gateways          = each.value.use_remote_gateways
}
```

### The AKS VNet stack

```hcl
inputs = {
  resource_group_name = "rg-aks-network"
  vnet_name           = "vnet-aks"
  address_space       = ["10.40.80.0/21"]
  dns_servers         = [] # Azure default DNS: firewall DNS broke with loadBalancer egress

  # No route tables: AKS manages its own for kubenet.
  route_tables = {}

  # Conflicts with the standalone aks-peering-hub stack; see the VNet peering page.
  vnet_peerings = {
    aks-to-hub = {
      remote_vnet_id               = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-connectivity/providers/Microsoft.Network/virtualNetworks/vnet-hub"
      allow_virtual_network_access = true
      allow_forwarded_traffic      = true
      allow_gateway_transit        = false
      use_remote_gateways          = true
    }
  }

  subnets = {
    pods = {
      name                              = "snet-aks-pods"
      address_prefix                    = "10.40.80.0/22"
      service_endpoints                 = []
      private_endpoint_network_policies = "Disabled"
      # No route table on the pod subnet: one there breaks Service-CIDR access.
      delegation = {
        name         = "aks-delegation"
        service_name = "Microsoft.ContainerService/managedClusters"
        actions      = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
      }
    }
    aks = {
      name                              = "snet-aks-nodes"
      address_prefix                    = "10.40.84.0/24"
      service_endpoints                 = ["Microsoft.Storage"]
      private_endpoint_network_policies = "Disabled"
      # The AKS-managed route table in the node resource group.
      route_table_id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/MC_rg-aks-nonprod_aks-nonprod_westeurope/providers/Microsoft.Network/routeTables/aks-agentpool-12345678-routetable"
    }
    internal_lb = {
      name                              = "snet-aks-internal-lb"
      address_prefix                    = "10.40.85.0/24"
      service_endpoints                 = []
      private_endpoint_network_policies = "Disabled"
    }
    external_lb = {
      name                              = "snet-aks-external-lb"
      address_prefix                    = "10.40.86.0/24"
      service_endpoints                 = []
      private_endpoint_network_policies = "Disabled"
    }
  }
}
```

!!! warning "A VNet that points at a table inside the cluster's resource group"
    The node subnet's `route_table_id` names a route table that lives in the cluster's node
    resource group, which Azure deletes along with the cluster. The VNet stack therefore depends
    on the cluster existing, even though it is applied first. See
    [Decommissioning](decommissioning.md).

## `vnet-peering` module

```hcl
data "azurerm_virtual_network" "source" {
  name                = var.source_vnet_name
  resource_group_name = var.source_resource_group_name
}

data "azurerm_virtual_network" "destination" {
  name                = var.destination_vnet_name
  resource_group_name = var.destination_resource_group_name
}

resource "azurerm_virtual_network_peering" "source_to_destination" {
  name                      = var.peering_name_source_to_destination
  resource_group_name       = var.source_resource_group_name
  virtual_network_name      = data.azurerm_virtual_network.source.name
  remote_virtual_network_id = data.azurerm_virtual_network.destination.id

  allow_virtual_network_access = var.allow_virtual_network_access
  allow_forwarded_traffic      = var.allow_forwarded_traffic_source_to_destination
  allow_gateway_transit        = var.allow_gateway_transit_source_to_destination
  use_remote_gateways          = var.use_remote_gateways_source_to_destination
}

resource "azurerm_virtual_network_peering" "destination_to_source" {
  name                      = var.peering_name_destination_to_source
  resource_group_name       = var.destination_resource_group_name
  virtual_network_name      = data.azurerm_virtual_network.destination.name
  remote_virtual_network_id = data.azurerm_virtual_network.source.id

  allow_virtual_network_access = var.allow_virtual_network_access
  allow_forwarded_traffic      = var.allow_forwarded_traffic_destination_to_source
  allow_gateway_transit        = var.allow_gateway_transit_destination_to_source
  use_remote_gateways          = var.use_remote_gateways_destination_to_source
}
```

The stacks that call it are on [VNet peering](vnet-peering.md).

## Firewall rule collection for VPN clients

A rule collection group on the hub's existing firewall policy, meant to let the on-prem VPN
client range reach the Kafka load balancers:

```hcl
inputs = {
  resource_group_name        = "rg-connectivity"
  firewall_policy_name       = "afwp-hub"
  rule_collection_group_name = "vpn-to-aks-kafka"
  priority                   = 210

  network_rule_collections = [
    {
      name     = "allow-vpn-to-aks-kafka"
      priority = 100
      action   = "Allow"
      rules = [
        {
          name                  = "vpn-to-aks-kafka"
          protocols             = ["TCP"]
          source_addresses      = ["172.16.42.0/24"]
          destination_addresses = ["10.224.0.0/24"]
          destination_ports     = ["9092-9094"]
        }
      ]
    }
  ]

  application_rule_collections = []
  nat_rule_collections         = []
}
```

!!! warning "Check the destination against where the load balancers really are"
    `10.224.0.0/24` is in Azure's **default** AKS VNet range, the addresses the Kafka load
    balancers had while the cluster ran on the AKS-managed network (the bastion forwarder
    targets the same range). It is not the bring-your-own VNet the Terraform describes
    (`10.40.80.0/21`). The stack was never applied, and on-prem traffic to the AKS VNet would
    not have reached the firewall anyway (see
    [Why VNet-peering routes win](networking.md#why-vnet-peering-routes-win)).
