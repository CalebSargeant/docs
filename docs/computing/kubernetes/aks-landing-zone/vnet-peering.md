# VNet peering for the AKS VNet

The AKS VNet (`vnet-aks`, `10.40.80.0/21`) was peered into the landing zone's hub and into three
application spokes. Every peering was Terraform, never a portal click: each is its own Terragrunt
stack calling one shared `vnet-peering` module.

## The `vnet-peering` module

`_modules/vnet-peering` creates **both legs** of a peering in one apply. It looks up the source
and destination VNets with `data "azurerm_virtual_network"` (so both must already exist) and then
declares two `azurerm_virtual_network_peering` resources:

- `source_to_destination`, created in the **source** resource group, on the source VNet.
- `destination_to_source`, created in the **destination** resource group, on the destination VNet.

Each leg has its own `allow_forwarded_traffic_*`, `allow_gateway_transit_*` and
`use_remote_gateways_*` toggles. The defaults are `allow_virtual_network_access = true` and
`false` for the forwarded-traffic, gateway-transit and remote-gateway flags. The module code is
on the [Terraform reference](terraform.md#vnet-peering-module).

!!! note "Both legs means write access on both sides"
    Creating the destination leg needs `Microsoft.Network/virtualNetworks/virtualNetworkPeerings/write`
    on the hub and spoke VNets, which a landing-zone team usually owns. Agree that grant up front,
    or split the module so the other team applies their own leg.

## The four peerings

All four stacks live under `terraform/azure/<env>/westeurope/` and take their source VNet from
the `aks-vnet` stack through a Terragrunt `dependency`, so the source is always `vnet-aks` in
`rg-aks-network`.

| Stack | Destination VNet | Destination RG | source→dest name | dest→source name |
|-------|------------------|----------------|------------------|------------------|
| `aks-peering-hub` | `vnet-hub` | `rg-connectivity` | `aks-to-hub` | `hub-to-aks` |
| `aks-peering-dev` | `vnet-app-dev` | `rg-app-spokes` | `aks-to-app-dev` | `app-dev-to-aks` |
| `aks-peering-tst` | `vnet-app-tst` | `rg-app-spokes` | `aks-to-app-tst` | `app-tst-to-aks` |
| `aks-peering-sdev` | `vnet-app-sdev` | `rg-app-spokes` | `aks-to-app-sdev` | `app-sdev-to-aks` |

### Hub peering flags

The hub peering carries forwarded traffic in both directions and lets the hub act as the
gateway-transit point, but does **not** make AKS use the hub's remote gateway. From
`aks-peering-hub/terragrunt.hcl`:

```hcl
inputs = {
  source_vnet_name                = dependency.aks_vnet.outputs.vnet_name           # vnet-aks
  source_resource_group_name      = dependency.aks_vnet.outputs.resource_group_name # rg-aks-network
  destination_vnet_name           = "vnet-hub"
  destination_resource_group_name = "rg-connectivity"

  peering_name_source_to_destination = "aks-to-hub"
  peering_name_destination_to_source = "hub-to-aks"

  allow_virtual_network_access                  = true
  allow_forwarded_traffic_source_to_destination = true
  allow_forwarded_traffic_destination_to_source = true
  use_remote_gateways_source_to_destination     = false # breaks AKS egress to the internet if true
  allow_gateway_transit_destination_to_source   = true
}
```

!!! warning "`use_remote_gateways` on the AKS leg must stay `false`"
    Setting `use_remote_gateways_source_to_destination = true` routes **all** AKS egress,
    `0.0.0.0/0` included, through the hub's ExpressRoute gateway, which breaks internet access
    and turns the nodes `NotReady`. The trade-off (on-prem then cannot reach the AKS VNet over
    ExpressRoute) and the root cause are on [Networking](networking.md#hub-spoke-peering-and-the-egress-trade-off).

### Application spoke peerings

The three spoke peerings are plain VNet-to-VNet: only `allow_virtual_network_access = true` is
set, so the forwarded-traffic, gateway-transit and remote-gateway flags keep their module
defaults of `false`. From `aks-peering-dev/terragrunt.hcl`:

```hcl
inputs = {
  source_vnet_name                = dependency.aks_vnet.outputs.vnet_name
  source_resource_group_name      = dependency.aks_vnet.outputs.resource_group_name
  destination_vnet_name           = "vnet-app-dev"
  destination_resource_group_name = "rg-app-spokes"

  peering_name_source_to_destination = "aks-to-app-dev"
  peering_name_destination_to_source = "app-dev-to-aks"

  allow_virtual_network_access = true
}
```

`aks-peering-tst` and `aks-peering-sdev` are identical apart from the destination VNet and the
two peering names.

!!! danger "The same peering was also declared inline on the VNet"
    `aks-vnet/terragrunt.hcl` declared an inline `vnet_peerings.aks-to-hub` through the `vnet`
    module **as well as** the standalone `aks-peering-hub` stack. Both defined a peering named
    `aks-to-hub` on the same VNet, with opposite `use_remote_gateways` values: `true` inline,
    `false` standalone. Two stacks managing one Azure object take turns overwriting it, and each
    plan shows the other's change as drift. Pick one owner per peering. The standalone stack is
    the better one, because it creates the hub-side leg as well.

## Apply

Each peering is its own stack. Apply the source VNet first, then the peerings:

```bash
cd terraform/azure/<env>/westeurope/aks-peering-hub
terragrunt plan
terragrunt apply
```

Because the source VNet comes in through a Terragrunt `dependency` on `aks-vnet`, a
`terragrunt run --all apply` from the region directory orders the VNet before its peerings.
