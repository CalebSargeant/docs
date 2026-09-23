# AKS networking in a hub-and-spoke landing zone

How the `aks-nonprod` cluster was wired into an Azure hub-and-spoke landing zone: the cluster's
network profile, the subnet layout of its VNet, the AKS-managed route table and the routes laid
on top of it, and the routing trade-off that falls out of running AKS behind an ExpressRoute
hub. Everything here comes from the Terraform/Terragrunt in `terraform/azure/<env>/westeurope/`;
see the [Terraform reference](terraform.md) for the code itself.

## Cluster configuration

From the `aks` module and `aks/terragrunt.hcl`:

| Setting | Value |
|---------|-------|
| Cluster name | `aks-nonprod` |
| Resource group | `rg-aks-nonprod` |
| Kubernetes version | `1.32` |
| Network plugin | `kubenet` |
| Network dataplane | `azure` |
| Network policy | `calico` (set by the module whenever `network_plugin = kubenet`) |
| Outbound type | `loadBalancer` (standard Azure egress) |
| Pod CIDR | `10.244.0.0/16` (module default for kubenet) |
| Service CIDR | `192.168.0.0/16` |
| DNS service IP | `192.168.0.10` |
| Nodes | 2 × `Standard_D4s_v6`, zones `1` and `2` |
| Identity | System-assigned managed identity |
| Private cluster | disabled (`private_cluster_enabled = false`) |
| Monitoring | Container insights into a per-cluster Log Analytics workspace (30-day retention) |

!!! note "kubenet, not Azure CNI"
    The cluster ran **kubenet**: pods get addresses from the cluster's own `pod_cidr`
    (`10.244.0.0/16`), not from a VNet subnet. The module only attaches a `pod_subnet_id` when
    `network_plugin = "azure"` and the plugin mode is not overlay, so the `snet-aks-pods` subnet
    existed in the VNet but was **not** consumed under kubenet. The service CIDR
    (`192.168.0.0/16`) and DNS service IP (`192.168.0.10`) are virtual: they exist only inside
    the cluster and must simply not overlap any VNet range the cluster needs to reach.

## VNet and subnets

The AKS VNet `vnet-aks` (`10.40.80.0/21`, in `rg-aks-network`) is created by a generic `vnet`
module from `aks-vnet/terragrunt.hcl`. `dns_servers` is left empty so the VNet uses Azure's
default DNS: pointing it at the hub firewall's DNS proxy broke name resolution once egress went
out through the cluster's own load balancer rather than through the firewall.

| Subnet | CIDR | Purpose | Notes |
|--------|------|---------|-------|
| `snet-aks-pods` | `10.40.80.0/22` | Pod subnet (Azure CNI) | Delegated to `Microsoft.ContainerService/managedClusters`; **unused** under kubenet |
| `snet-aks-nodes` | `10.40.84.0/24` | Worker nodes | `Microsoft.Storage` service endpoint; associated with the AKS-managed route table |
| `snet-aks-internal-lb` | `10.40.85.0/24` | Internal load balancers | No route table: an Azure LB frontend needs direct routing |
| `snet-aks-external-lb` | `10.40.86.0/24` | Public load balancer frontends | |

!!! warning "Keep one source of truth for the subnet plan"
    A Markdown allocation note sat beside the VNet stack and described an older `/23`-based
    split (nodes `10.40.80.0/23`, pods `10.40.82.0/23`, service CIDR `10.240.0.0/16`, DNS
    `10.40.1.4`). The Terragrunt inputs were authoritative and the note had silently gone
    stale. Generate the table from the code, or do not keep one.

Only `snet-aks-nodes` carries a route table, and it is the **AKS-managed** one in the node
resource group. The VNet stack declares no route tables of its own (`route_tables = {}`); it
associates the node subnet with the AKS table by full resource ID:

```text
/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/MC_rg-aks-nonprod_aks-nonprod_westeurope/
  providers/Microsoft.Network/routeTables/aks-agentpool-12345678-routetable
```

## Routes in the AKS-managed route table

Under kubenet, AKS creates and owns the node route table and writes one route per node for its
pod CIDR slice. A separate `aks-routes` module reaches into that table by name and manages
exactly two extra routes:

| Route | Prefix | Next hop | Why |
|-------|--------|----------|-----|
| `default` | `0.0.0.0/0` | `Internet` | Keep AKS egress on standard Azure routing so public load balancers and API-server access keep working, rather than sending it to the hub firewall |
| `onprem` | `172.16.42.0/24` | `VirtualAppliance` → `10.40.1.4` | Keep the route to the on-prem VPN client range going through the hub firewall |

The node resource group name comes from the `aks` stack's `node_resource_group` output through a
Terragrunt `dependency`. The route table name is **not** an AKS output, so it is hardcoded; if
AKS ever regenerates the table with a new random suffix, that input has to be updated by hand.

!!! danger "Do not point the node-subnet default route at the firewall"
    The module kept a commented-out `VirtualAppliance` → `10.40.1.4` default route (and per-spoke
    `VnetLocal` routes) for reference only. A user-defined default route through the firewall on
    the node (or pod) subnet broke Kubernetes Service-CIDR routing: pods could no longer reach
    the API server. kubenet plus an `Internet` default route was the combination that worked.

## Hub-spoke peering and the egress trade-off

The AKS VNet peers into the hub (`vnet-hub`) and into three application spokes. The peering
definitions and their flags are on [VNet peering](vnet-peering.md). The one networking decision
that drives everything on this page is the hub peering's `use_remote_gateways` flag.

### Problem 1: AKS internet egress

With `use_remote_gateways = true` on the AKS→hub leg, **all** AKS traffic, `0.0.0.0/0`
included, is forced through the hub's ExpressRoute gateway. On-prem drops internet-bound
traffic, so the nodes lose the connectivity they need (image pulls, Azure APIs, the control
plane, Azure Monitor) and go `NotReady`.

**Resolution:** the standalone hub peering stack sets
`use_remote_gateways_source_to_destination = false`, so AKS keeps direct internet egress through
its `loadBalancer` outbound type while peering still reaches hub resources.

!!! warning "Two conflicting hub-peering definitions"
    `aks-to-hub` was declared **twice**: inline in `aks-vnet/terragrunt.hcl`
    (`use_remote_gateways = true`) **and** as the standalone `aks-peering-hub` stack
    (`use_remote_gateways_source_to_destination = false`). The `false` value is the one that
    keeps internet egress working; the inline `true` contradicts it, and whichever stack applied
    last won. See [VNet peering](vnet-peering.md).

### Problem 2: on-prem cannot reach the AKS VNet

The other side of `use_remote_gateways = false` is that the ExpressRoute gateway does **not**
advertise the AKS VNet (`10.40.80.0/21`) to on-prem over BGP. So from the on-prem VPN range
(`172.16.42.0/24`):

- ✅ on-prem → hub VNet (`10.40.0.0/18`) works
- ✅ AKS has internet egress, and internal load balancers work from inside the cluster
- ❌ on-prem → AKS VNet (`10.40.80.0/21`) fails, because no route is learned

That is the catch-22: `use_remote_gateways = true` advertises AKS to on-prem but breaks internet
egress; `false` keeps internet egress but hides AKS from on-prem.

!!! note "Resolving Problem 2 needs an on-prem or hub change, not an AKS change"
    Because AKS must keep `use_remote_gateways = false`, the route to `10.40.80.0/21` has to be
    added **outside** the cluster: either a static route on the on-prem routers pointing at the
    ExpressRoute connection, or an Azure Route Server in the hub that injects the route over BGP
    without forcing AKS onto the remote gateway. In practice, clients that could not reach the
    load balancers directly went through a bastion forwarder instead; see
    [Service exposure](service-exposure.md#bastion-tcp-forwarder).

### Why VNet-peering routes win

A UDR on the hub gateway subnet (`udr-to-aks: 10.40.80.0/21 → 10.40.1.4`) does **not** force
inter-VNet traffic through the firewall. Traffic between peered VNets goes directly across the
Azure fabric, and peering routes take precedence over the firewall UDR. That is why adding
firewall network rules or node NSG rules did not fix on-prem → AKS reachability: the traffic
never reached the firewall or the NSG.

!!! tip "Load balancer IPs do not answer ping"
    Azure load balancer frontend IPs are virtual and only respond to traffic that matches a
    configured load-balancing rule. Test reachability with the real service port
    (`nc -zv <lb-ip> 9092`), never with ICMP.

## Address allocation

The landing zone carved one `/16` into the hub and a row of `/21` spokes. Only the AKS VNet was
provisioned by the AKS team; the rest was consumed as peering destinations.

| CIDR block | Network | Owner |
|------------|---------|-------|
| `10.40.0.0/18` | `vnet-hub` | Landing zone |
| `10.40.64.0/21` | `vnet-app-dev` | Landing zone |
| `10.40.72.0/21` | `vnet-app-tst` | Landing zone |
| `10.40.80.0/21` | `vnet-aks` | AKS team |
| `10.40.88.0/21` | `vnet-shared` | Landing zone |
| `10.40.96.0/21` | `vnet-app-sdev` | Landing zone |
| `10.40.104.0/21` to `10.40.120.0/21` | (free) | |
| `10.40.128.0/18` | `vnet-dns-resolver` | Landing zone |
| `10.40.192.0/21` | `vnet-apim` | Landing zone |
| `10.40.200.0/21` to `10.40.248.0/21` | (free) | |

## Verification

```bash
# Nodes Ready?
kubectl get nodes

# Internet egress from a pod
kubectl run test-internet --image=curlimages/curl:latest --restart=Never --command -- \
  sh -c "curl -s -o /dev/null -w '%{http_code}' https://www.example.com; echo"
kubectl logs test-internet
kubectl delete pod test-internet

# Hub peering state
az network vnet peering show \
  --resource-group rg-aks-network \
  --vnet-name vnet-aks \
  --name aks-to-hub

# Is the AKS VNet advertised to on-prem over BGP? (expect empty while use_remote_gateways=false)
az network vnet-gateway list-advertised-routes \
  --resource-group rg-connectivity \
  --name vgw-hub \
  --peer 10.40.0.6 \
  --query "value[?contains(network, '10.40.80')]"
```
