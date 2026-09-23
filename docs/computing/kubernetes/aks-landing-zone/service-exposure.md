# Exposing AKS services to a hub-and-spoke network

How workloads on the cluster were reached from outside it: internal and public load balancers,
the Kafka listener model that decides whether a client can actually talk to a broker, a private
DNS zone for the internal load balancers, a bastion TCP forwarder for clients with no route in,
and a small App Service used to test reachability from an application spoke.

## Internal and public load balancers

Services of `type: LoadBalancer` get an Azure load balancer frontend. Annotations decide whether
it is internal and where its address comes from. The cluster's identity needs Network
Contributor on any subnet named here (see the [`aks` module](terraform.md#aks-module)).

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-internal-lb
  namespace: default
  annotations:
    # Private frontend instead of a public IP
    service.beta.kubernetes.io/azure-load-balancer-internal: "true"
    # Take the frontend address from this subnet rather than the node subnet
    service.beta.kubernetes.io/azure-load-balancer-internal-subnet: "snet-aks-internal-lb"
    # Optional: pin a static address from that subnet (10.40.85.0/24)
    # service.beta.kubernetes.io/azure-load-balancer-ipv4: "10.40.85.10"
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
    - port: 80
      targetPort: 80
      protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-external-lb
  namespace: default
  annotations:
    # Public frontend: omit the internal annotation. Name the public IP resource,
    # and choose the resource group it is created in (defaults to the node RG).
    service.beta.kubernetes.io/azure-pip-name: "pip-nginx-external"
    service.beta.kubernetes.io/azure-load-balancer-resource-group: "rg-aks-nonprod"
    # Optional: reuse an existing public IP instead
    # service.beta.kubernetes.io/azure-load-balancer-ipv4: "<public-ip-address>"
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
    - port: 80
      targetPort: 80
      protocol: TCP
```

!!! note "Without a subnet annotation, internal frontends land in the node subnet"
    An internal load balancer that does not name a subnet takes its frontend address from the
    node subnet. That is where the Kafka internal frontends ended up (`10.40.84.x`), even though
    the VNet had a dedicated `snet-aks-internal-lb`. Either annotate every internal service or
    drop the dedicated subnet; half and half confuses every allocation table.

## Kafka on the cluster

Kafka ran as a KRaft-mode StatefulSet (no ZooKeeper) from a Kustomize base, with one overlay per
environment namespace (`dev-kafka`, `sdev-kafka`, `test-kafka`). Each overlay only set the
namespace and patched the controller quorum voter address to match it:

```yaml
namespace: dev-kafka

resources:
  - ../../base
  - namespace.yaml

patches:
  - target:
      kind: StatefulSet
      name: kafka
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/env/4/value
        value: "1@kafka-0.kafka-headless.dev-kafka.svc.cluster.local:9094"
```

The base exposed three services:

| Service | Type | Ports | Purpose |
|---------|------|-------|---------|
| `kafka-headless` | `ClusterIP: None` | 9092 broker, 9093 client TLS, 9094 controller | Stable pod DNS for in-cluster clients and the controller quorum |
| `kafka-external` | `LoadBalancer`, public | 9092, 9093 | Public bootstrap, allowlisted by source range, published in DNS by external-dns |
| `kafka-internal` | `LoadBalancer` | 9092 → 9095, 9093 → 9096 | The broker's internal listeners for clients in the peered network |

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kafka-external
  namespace: dev-kafka
  annotations:
    external-dns.alpha.kubernetes.io/hostname: kafka.dev.example.com
spec:
  type: LoadBalancer
  # Preserve the client source address so loadBalancerSourceRanges can see it
  externalTrafficPolicy: Local
  loadBalancerSourceRanges:
    - 203.0.113.10/32 # office
    - 198.51.100.11/32 # engineer
    - 198.51.100.12/32 # engineer
    - 203.0.113.25/32 # hub firewall egress
    - 203.0.113.50/32 # this cluster's own egress
  selector:
    app: kafka
  ports:
    - name: broker
      port: 9092
      targetPort: 9092
    - name: controller-tls
      port: 9093
      targetPort: 9093
```

!!! warning "An internal service needs the internal annotation on AKS"
    `type: LoadBalancer` with no `azure-load-balancer-internal` annotation gets a **public**
    frontend on AKS. A service called `kafka-internal` is only internal if the annotation says
    so, and it has no `loadBalancerSourceRanges` to fall back on. Check with
    `kubectl get svc -n dev-kafka kafka-internal -o wide`: an internal frontend shows a private
    `EXTERNAL-IP`.

### Advertised listeners decide whether a client works

A Kafka client does two things: it connects to a **bootstrap** address, then it reconnects to
whatever addresses the broker returns in its `advertised.listeners` metadata. External access
breaks when the broker advertises addresses the client cannot resolve or route to, typically
internal `*.svc.cluster.local` names. The symptom is a TCP connection that succeeds followed by
a protocol that fails:

```bash
# TCP reaches the load balancer
nc -vznt kafka.dev.example.com 9092
# Connection ... succeeded!

# But the Kafka protocol fails
kcat -b kafka.dev.example.com:9092 -L
# % ERROR: Failed to acquire metadata: Local: Broker transport failure
```

The fix is a listener per path, each advertising a name that is reachable from where its
clients sit: an `EXTERNAL` listener advertising `kafka.dev.example.com` on 9092/9093 for the
public load balancer, and internal listeners (9095/9096 behind `kafka-internal`) for the peered
network.

### Diagnosis checklist

```bash
# 1. Is the external listener present and advertising a public host?
kubectl exec -n dev-kafka kafka-0 -- \
  grep -E '^listeners=|^advertised.listeners=' /mnt/shared/config/server.properties

# 2. Does the load balancer have an address and live endpoints?
kubectl get svc kafka-external -n dev-kafka
kubectl get endpoints kafka-external -n dev-kafka

# 3. Does the public name resolve to that address? (external-dns)
dig +short kafka.dev.example.com

# 4. Is your source address in loadBalancerSourceRanges?
kubectl get svc kafka-external -n dev-kafka -o jsonpath='{.spec.loadBalancerSourceRanges}'

# 5. End-to-end metadata probe
kcat -b kafka.dev.example.com:9092 -L
```

| Observation | Likely cause |
|-------------|--------------|
| TCP connects, metadata fails, debug shows `*.svc.cluster.local` | The external entry in `advertised.listeners` is missing or wrong |
| Connection refused or timeout at TCP | Source address not in `loadBalancerSourceRanges`, or the load balancer has no address |
| TLS handshake errors on 9093 | Plaintext client pointed at the TLS port, or the other way round |
| Works in-cluster, fails externally | The client is resolving the internal advertised name; bootstrap through the public host instead |

## Private DNS for the internal load balancers

Clients in the application spokes reached the internal frontends by name through a private DNS
zone, `example.internal`, linked to the spokes that needed it (not to the AKS VNet, whose pods
use cluster DNS). Auto-registration was off; the records were plain A records.

```hcl
resource "azurerm_private_dns_zone" "this" {
  name                = var.zone_name
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "this" {
  for_each = var.vnet_links # link name => VNet ID

  name                  = each.key
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.this.name
  virtual_network_id    = each.value
  registration_enabled  = var.registration_enabled
  tags                  = var.tags
}

resource "azurerm_private_dns_a_record" "kafka" {
  for_each = var.kafka_internal_records # record name => IP

  name                = each.key
  zone_name           = azurerm_private_dns_zone.this.name
  resource_group_name = var.resource_group_name
  ttl                 = var.ttl
  records             = [each.value]
  tags                = var.tags
}
```

```hcl
inputs = {
  zone_name = "example.internal"

  vnet_links = {
    "link-app-dev"  = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-app-spokes/providers/Microsoft.Network/virtualNetworks/vnet-app-dev"
    "link-app-sdev" = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-app-spokes/providers/Microsoft.Network/virtualNetworks/vnet-app-sdev"
    "link-app-tst"  = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-app-spokes/providers/Microsoft.Network/virtualNetworks/vnet-app-tst"
  }
  registration_enabled = false

  kafka_internal_records = {
    "kafka.dev"  = "10.40.84.7"
    "kafka.sdev" = "10.40.84.4"
    "kafka.tst"  = "10.40.84.6"
  }
  ttl = 3600
}
```

!!! note "Take link names as input"
    The first version of the module derived each link's name from the VNet ID
    (`link-${basename(vnet_id)}`). The links had been created by hand with different names, and
    a link cannot be renamed in place, so adopting them into state meant changing the module to
    take the names explicitly. Taking names as input costs nothing and makes imports possible.

## Bastion TCP forwarder

Clients without a routable, allowlisted source address (see
[Problem 2](networking.md#problem-2-on-prem-cannot-reach-the-aks-vnet)) went through a bastion VM
in the landing zone that forwarded one port per environment to that environment's internal
Kafka frontend:

| Service | Bastion port | Target |
|---------|--------------|--------|
| `kafka-dev-proxy` | 9092 | `10.224.0.120:9092` |
| `kafka-test-proxy` | 9093 | `10.224.0.121:9092` |
| `kafka-sdev-proxy` | 9094 | `10.224.0.122:9092` |

The targets are addresses from the period when the cluster ran on the AKS-managed default
network (`10.224.0.0/16`). The forwarder was plain `socat` under systemd, installed with
`az vm run-command` so nobody needed an SSH session on the bastion:

```bash
az vm run-command invoke \
  -n vm-bastion \
  -g rg-devops \
  --command-id RunShellScript \
  --scripts \
    "sudo apt update && sudo apt install -y socat" \
    "sudo tee /etc/systemd/system/kafka-dev-proxy.service <<EOF
[Unit]
Description=Kafka Dev Port Forward
After=network.target

[Service]
Type=simple
User=nobody
ExecStart=/usr/bin/socat TCP-LISTEN:9092,fork,reuseaddr TCP:10.224.0.120:9092
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF" \
    "sudo systemctl daemon-reload" \
    "sudo systemctl enable --now kafka-dev-proxy.service"
```

The test and sdev units were identical apart from the listen port and target. Each unit runs as
`User=nobody` with `Restart=always` and a five-second back-off, so a broker restart or a bastion
reboot brings the proxy back on its own.

```bash
# Status of the proxies
az vm run-command invoke -n vm-bastion -g rg-devops --command-id RunShellScript \
  --scripts "sudo systemctl status kafka-dev-proxy.service kafka-test-proxy.service kafka-sdev-proxy.service --no-pager"

# From a client that can reach the bastion
nc -vznt <BASTION_IP> 9092
```

!!! warning "Not managed by anything"
    The units existed only on the VM. Neither Terraform nor GitOps knew about them, so a rebuilt
    bastion lost them silently, and nothing flagged them when the cluster went away.

!!! tip "TCP only: listeners still matter"
    `socat` forwards raw TCP; it does not rewrite Kafka's advertised listeners. A client that
    bootstraps through the bastion is then redirected to whatever the broker advertises, and that
    address must be reachable from the client too.

## Connection tester in an application spoke

To prove what an application in a spoke could actually reach, a small Linux App Service (Python,
gunicorn, a B2 plan) ran with regional VNet integration into a subnet of the application spoke
delegated to `Microsoft.Web/serverFarms`. Three settings are what make such a tester behave like
a real workload in the spoke:

- `virtual_network_subnet_id` set to the delegated spoke subnet, and `vnet_route_all_enabled =
  true`, so all outbound traffic, not just RFC 1918, took the spoke's routes.
- `WEBSITE_DNS_SERVER = 168.63.129.16`, so it resolved names through Azure DNS and therefore
  through the private zones linked to the spoke.
- `ip_restriction` entries allowing only the office and engineers' addresses to the app itself.
