# AKS in a hub-and-spoke landing zone

A genericised reference for a non-production AKS cluster that ran inside an enterprise Azure
landing zone: kubenet networking in its own spoke VNet, peered into a hub that carried
ExpressRoute and an Azure Firewall, with Kafka exposed to the neighbouring application spokes
and to VPN clients. Everything was provisioned with Terraform through Terragrunt. The cluster
was later retired, and the last page records what that teardown taught.

!!! info "What these pages are"
    A scrubbed port of the internal documentation and infrastructure code for a real cluster.
    Names, subscription IDs, domains and addresses are placeholders. The design, the code and
    the reasoning behind each decision are intact, including the parts that did not work.

## The shape of it

```text
                          on-prem / VPN clients (172.16.42.0/24)
                                        │ ExpressRoute
┌───────────────────────────────────────▼────────────────────────────────────┐
│ vnet-hub  10.40.0.0/18   ExpressRoute gateway · Azure Firewall 10.40.1.4   │
└──────┬──────────────────────┬────────────────────┬─────────────────────────┘
       │ peering              │ peering            │ peering (landing zone)
┌──────▼──────────────┐ ┌─────▼────────────┐ ┌─────▼────────────┐
│ vnet-aks            │ │ vnet-app-dev     │ │ vnet-app-tst ... │
│ 10.40.80.0/21       │◄┤ 10.40.64.0/21    │ │ 10.40.72.0/21    │
│ AKS (kubenet)       │ │ app workloads    │ │ app workloads    │
│ internal + public LB│ └──────────────────┘ └──────────────────┘
└─────────────────────┘   the AKS VNet is also peered straight to each app spoke
```

The landing zone (hub, firewall, gateway and the application spokes) was owned by a separate
platform team. The AKS team owned only the cluster, its VNet, the peerings into the hub and the
spokes, a handful of routes, and the services that made Kafka reachable.

## Where to start

- **[Networking](networking.md)**: the cluster's network profile, the subnet layout, the
  AKS-managed route table, and the ExpressRoute egress trade-off that shaped everything else.
- **[VNet peering](vnet-peering.md)**: a module that creates both legs of a peering in one
  apply, the four peerings built with it, and a duplicate-definition trap.
- **[Terraform reference](terraform.md)**: the modules and the Terragrunt stacks, in full.
- **[Service exposure](service-exposure.md)**: internal and public load balancers, Kafka's
  listeners, a private DNS zone for the internal load balancers, a firewall rule for VPN
  clients, a bastion TCP forwarder and a connection-tester app.
- **[Decommissioning](decommissioning.md)**: what a cluster deleted outside Terraform leaves
  behind, and the order to take it apart in.

!!! note "Placeholders used throughout"
    `10.40.0.0/16` stands in for the landing zone's private address space; block sizes and the
    relationships between them are the originals. `172.16.42.0/24` is the on-prem VPN client
    range. Subscription IDs are all zeros, the public domain is `example.com`, the private DNS
    zone is `example.internal`, and every public address comes from the RFC 5737 documentation
    ranges. Resource names follow a `rg-` / `vnet-` / `snet-` convention rather than the
    originals. Region names, Kubernetes versions, VM sizes and Azure's own defaults (the
    `10.244.0.0/16` kubenet pod CIDR and the `10.224.0.0/16` default AKS VNet) are real.
