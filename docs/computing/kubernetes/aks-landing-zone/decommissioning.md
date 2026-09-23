# Decommissioning an AKS cluster managed by Terraform

What was left behind when the cluster on these pages was deleted by hand rather than destroyed
through its Terraform, how each leftover surfaced, and the order to take a cluster like this apart
in. The cluster had already been removed as a GitOps target some time before; the Azure resources
went later, outside the pipeline.

## What deleting the cluster by hand leaves behind

Deleting an AKS cluster removes the cluster and its node resource group (`MC_...`): the node
scale set, the kubenet route table, the load balancers and the public IPs AKS created. It does
**not** touch anything the cluster merely used or that other stacks created around it.

| Leftover | How it surfaced |
|----------|-----------------|
| The cluster in Terraform state | A refreshed plan of the cluster stack: `has been deleted`, then `will be created` |
| Routes stack pointing at the deleted route table | `data.azurerm_route_table` fails with `was not found`; its state still held routes, one of them no longer in the configuration |
| VNet subnet associated with that route table by ID | The VNet stack still named the table, so the next apply would try to re-associate the subnet with a table that no longer exists |
| Network Contributor role assignments on the subnets | Still present, with a principal that no longer resolves (empty `principalName`) |
| The VNet and its peerings, both legs | Still live, including the leg on the hub VNet |
| The cluster's released egress IP in allowlists | Still allowed in a Key Vault firewall and in another cluster's `loadBalancerSourceRanges` |
| Private DNS records for the internal load balancers | Still resolving to addresses nothing answers on |
| A firewall rule collection and a connection-tester app | Existed only to reach the cluster |
| `socat` forwarders on a bastion VM | Unmanaged, pointing at dead addresses |
| Kubernetes overlays per environment | Referenced by no cluster root after the GitOps target was removed |

## The plan that said "update in-place"

The pipeline planned pull requests with `-refresh=false`, which is fast and avoids touching every
provider on every change. It also compares the configuration against **state**, not against
Azure. With the cluster gone, the pull-request plan for the cluster stack still showed a harmless
in-place update. A refreshed plan told the truth:

```text
# azurerm_kubernetes_cluster.this has been deleted
# azurerm_kubernetes_cluster.this will be created
# azurerm_role_assignment.aks_network_contributor must be replaced
# azurerm_role_assignment.internal_lb_network_contributor[0] must be replaced
# azurerm_role_assignment.pods_network_contributor must be replaced
Plan: 4 to add, 0 to change, 3 to destroy.
```

The pipeline refreshed on the runs that apply (approvals, merges and the scheduled drift run),
so the first approved change anywhere in the estate would have rebuilt the cluster. Two things
kept that from happening: another stack was failing to plan, and the pipeline refuses to apply
anything while any stack fails.

!!! tip "Check with a refreshed plan before you trust a quiet one"
    A read-only, refreshed plan does not need the state lock:
    `terragrunt plan -lock=false`. Run it for any stack whose resources might have been changed
    by hand, and read the `has been deleted outside of Terraform` lines first.

## A lock older than the problem

The routes stack could not even be planned at first: its state blob held an infinite lease from
an `apply` interrupted on a laptop ten months earlier, with an older Terraform version. Read the
lock before breaking it; with the `azurerm` backend it is blob metadata:

```bash
az storage blob show --account-name <state-account> -c tfstate \
  -n <env>/westeurope/aks-routes/terraform.tfstate \
  --query '{lease:properties.lease, meta:metadata}'
# lease: {state: leased, status: locked, duration: infinite}
# Terraformlockid: {"ID":"<lock-id>","Operation":"OperationTypeApply","Who":"<user>@<host>","Created":"..."}
```

If the `Created` time and the holder make it plainly stale, release it with Terraform's own
command rather than by breaking the lease, so the metadata is cleared too:

```bash
terraform force-unlock -force <lock-id>
```

## The egress IP outlives the cluster

A cluster with `outbound_type = loadBalancer` egresses through a public IP in its node resource
group. Deleting the cluster releases that address back to Azure, where it can be allocated to
another tenant. Every allowlist that trusted it, a Key Vault firewall and a Kafka
`loadBalancerSourceRanges` on another cluster here, now trusts a stranger. Remove the address
everywhere it was allowed at the same time the cluster goes.

## Taking it apart in order

1. **Stop deploying to it.** Remove the cluster's GitOps root, and decide what happens to the
   per-environment overlays that only it consumed.
2. **Inventory everything outside the cluster's resource group** that names the cluster, its
   subnets, its node resource group or its addresses: route stacks, subnet associations, role
   assignments, peerings, DNS records, firewall rules, allowlists, bastion forwarders, test apps
   and monitoring workspaces.
3. **Destroy through Terraform, in reverse dependency order:** the routes stack, then the
   cluster (which removes its role assignments), then the DNS records, firewall rule and tester
   app, then the peerings (both legs), then the VNet. If the cluster is already gone, remove it
   from state (`terraform state rm`) or let a refreshed destroy clean up what is left.
4. **Remove the egress IP from every allowlist.**
5. **Clean up what no tool manages:** the bastion units, and anything else set up by hand.
6. **Delete the stack directories and any modules they alone used,** and archive the state files
   rather than leaving them where a future `run --all` could find them.
7. **Run a refreshed plan across the whole estate** to prove nothing still expects the cluster.

## Finding orphans after the fact

```bash
# Is the cluster really gone?
az aks list --subscription <subscription-id> -o table

# Role assignments whose principal no longer exists
az role assignment list --all --subscription <subscription-id> \
  --query "[?principalName==''].{role:roleDefinitionName, scope:scope}" -o table

# Is anything still attached to the old node subnet?
az network vnet subnet show -g rg-aks-network --vnet-name vnet-aks -n snet-aks-nodes \
  --query '{routeTable:routeTable.id, ipConfigurations:length(ipConfigurations || `[]`)}'
```
