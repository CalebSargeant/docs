# DNS & certificates

How name resolution and TLS are wired across the platform: which Route53 zones exist, where they live, who is allowed to write records into them, and which ACM certificate terminates each edge. DNS spans **three independent control planes** — AWS Route53 (`aws.example.net`), Cloudflare (`example.com`), and Azure DNS (`az.example.net`) — and TLS spans **two ACM regions** (`af-south-1` for ALB, `us-east-1` for CloudFront). This page consolidates all of them.

!!! note "The one fact that explains everything"
    Every `*.cpt.aws.example.net` Route53 zone — public **and** private, for **every** environment — is created and owned by the **network** account (`210987654321`), because they are all provisioned from a single VPC module applied only from the network-account leaf. Workloads in the prod/staging accounts therefore reach *across accounts* to read or write DNS. That cross-account hop is the source of most of the plumbing (and the one known gap) below.

---

## Route53 zone inventory

All Route53 zones are created by `_modules/vpc/_route53.tf`, which is applied **only** from the network-account leaf `terraform/aws/network/af-south-1/vpc`. The module `for_each`es over `var.environments` (`network`, `shared`, `prod`, `staging`, `dev`) and uses the region's `city_code` (`cpt` for `af-south-1`, from `terraform/aws/root.hcl`). Zone **names** follow a fixed scheme; the network env is special-cased to drop the env label.

| Zone | Type | Account | Managed by | VPC-associated |
|------|------|---------|-----------|----------------|
| `aws.example.net` | Public (parent) | network `210987654321` | Terraform (`aws_route53_zone.parent`) | — |
| `cpt.aws.example.net` | Public | network `210987654321` | Terraform (`aws_route53_zone.public["network"]`) | — |
| `shared.cpt.aws.example.net` | Public | network `210987654321` | Terraform (`public["shared"]`) | — |
| `prod.cpt.aws.example.net` | Public | network `210987654321` | Terraform zone; **records via external-dns (prod-eks)** | — |
| `staging.cpt.aws.example.net` | Public | network `210987654321` | Terraform zone; **records via external-dns (staging-eks)** | — |
| `dev.cpt.aws.example.net` | Public | network `210987654321` | Terraform (`public["dev"]`) | — |
| `internal.cpt.aws.example.net` | Private | network `210987654321` | Terraform (`aws_route53_zone.private["network"]`) | mono-vpc |
| `internal.shared.cpt.aws.example.net` | Private | network `210987654321` | Terraform (`private["shared"]`) | mono-vpc |
| `internal.prod.cpt.aws.example.net` | Private | network `210987654321` | Terraform zone; **records via external-dns (prod-eks)** | mono-vpc |
| `internal.staging.cpt.aws.example.net` | Private | network `210987654321` | Terraform (`private["staging"]`) | mono-vpc |
| `internal.dev.cpt.aws.example.net` | Private | network `210987654321` | Terraform (`private["dev"]`) | mono-vpc |

!!! info "Zone lifecycle vs. record lifecycle"
    Terraform owns the **zones themselves** (and the NS delegation records between them — see below). It does **not** own the day-to-day A/CNAME/TXT records inside `prod.cpt.aws.example.net`, `staging.cpt.aws.example.net`, and `internal.prod.cpt.aws.example.net` — those are written by **external-dns** from Ingress/Service objects. Every private zone is associated to the shared `mono-vpc` (`vpc { vpc_id = aws_vpc.this.id }`).

!!! note "Azure and Cloudflare zones are not in Route53"
    `az.example.net` (and `jhb.az.example.net`, `prod.jhb.az.example.net`, `internal.prod.jhb.az.example.net`) are **Azure DNS** zones created by `terraform/azure/_modules/dns/main.tf` (`domain = "az.example.net"` in `terraform/azure/root.hcl`) — a separate cloud, separate control plane. `example.com` and `staging.example.com` are hosted on **Cloudflare** and are managed there (records by `external-dns-cloudflare`, cert validation done by hand in the Cloudflare dashboard). Neither zone's registration is defined in this repo.

---

## Delegation chains

### Route53 (`aws.example.net`)

Delegation *within* Route53 is Terraform-managed. `aws_route53_record.subdomain_delegation` adds one `NS` record in the parent `aws.example.net` zone for **each** public subdomain zone, pointing at that child zone's AWS-assigned name servers:

```hcl
resource "aws_route53_record" "subdomain_delegation" {
  for_each = aws_route53_zone.public
  zone_id  = aws_route53_zone.parent.id
  name     = replace(each.value.name, ".${var.domain}", "")  # e.g. "prod.cpt"
  type     = "NS"
  ttl      = "300"
  records  = each.value.name_servers
}
```

That yields these delegations inside `aws.example.net` (TTL 300):

| Parent zone | `NS` record | Delegated child zone |
|-------------|-------------|----------------------|
| `aws.example.net` | `cpt` | `cpt.aws.example.net` |
| `aws.example.net` | `shared.cpt` | `shared.cpt.aws.example.net` |
| `aws.example.net` | `prod.cpt` | `prod.cpt.aws.example.net` |
| `aws.example.net` | `staging.cpt` | `staging.cpt.aws.example.net` |
| `aws.example.net` | `dev.cpt` | `dev.cpt.aws.example.net` |

The private `internal.*` zones are split-horizon (resolved only inside the VPC) and are **not** delegated from the public parent.

### Azure DNS (`az.example.net`)

The Azure module builds its own two-hop `NS` chain in `_modules/dns/main.tf`:

```text
az.example.net ──NS(jhb)──▶ jhb.az.example.net ──NS(prod)──▶ prod.jhb.az.example.net
                                                 internal.prod.jhb.az.example.net (private)
```

The apex `az.example.net` zone also carries round-robin A records (`@`, `api`, `vpn`) across the CHR public IPs and `www`/`avd` CNAMEs.

!!! warning "Operator input needed — registrar / apex delegation"
    The repo delegates parent→child **inside** each provider, but the top-level handoff — the registrar's NS records that point `aws.example.net` at Route53, `example.com` at Cloudflare, and `az.example.net` at Azure DNS — is **not** in this repository. Who registers/holds the apex for each domain, and which name servers are configured at the registrar, must be confirmed out of band.

---

## external-dns per environment

external-dns turns Kubernetes `Ingress`/`Service` (and `DNSEndpoint` CRD) objects into DNS records. It is deployed as **two Flux HelmReleases** in `kubernetes/infrastructure/controllers/external-dns/helmrelease.yaml`, plus a staging overlay patch. All instances use `policy: upsert-only` (never deletes records), `registry: txt` with `txtPrefix: externaldns-`, and are pinned to the EKS-optimised `eks/external-dns` image.

| Instance | Provider | `txtOwnerId` | `domainFilters` | Identity |
|----------|----------|--------------|-----------------|----------|
| `external-dns` (base → prod-eks) | `aws` (`af-south-1`) | `prod-eks` | `internal.prod.cpt.aws.example.net`, `prod.cpt.aws.example.net`, `staging.cpt.aws.example.net` | SA role `777788889999:role/prod-external-dns-role` |
| `external-dns` (staging overlay → staging-eks) | `aws` | `staging-eks` | `staging.cpt.aws.example.net` (public only) | SA role `444455556666:role/staging-external-dns-role`, **assumeRole** `210987654321:role/staging-external-dns-route53` |
| `external-dns-cloudflare` (prod-eks) | `cloudflare` | `prod-cloudflare` | `example.com`, `staging.example.com` | `CF_API_TOKEN` from secret `cloudflare-dns-api-token` |

The `txtOwnerId` per instance is what keeps prod-eks and staging-eks from fighting over ownership TXT records in the same zones.

### Cross-account IRSA (staging) — the role chain

The staging cluster's OIDC provider lives in the **staging** account (`444455556666`), but `staging.cpt.aws.example.net` lives in the **network** account (`210987654321`). Federating directly across accounts fails with `InvalidIdentityToken`, so `_modules/external-dns` builds a two-role chain (leaf: `staging/af-south-1/external-dns`, `cluster_name = staging-eks`, `hosted_zone_name = staging.cpt.aws.example.net`):

```text
external-dns SA (ns/name external-dns)
   │  IRSA (sts:AssumeRoleWithWebIdentity via staging cluster OIDC)
   ▼
staging-external-dns-role            (staging acct 444455556666)
   │  sts:AssumeRole  (external-dns runs with --aws-assume-role)
   ▼
staging-external-dns-route53         (network acct 210987654321, via aws.network)
   │  route53:ChangeResourceRecordSets / ListResourceRecordSets
   ▼
staging.cpt.aws.example.net  (hosted zone in the network account)
```

The network-account role's write scope is limited to the single `staging.cpt.aws.example.net` hosted-zone ARN; `ListHostedZones` / `ListHostedZonesByName` / `GetChange` are granted on `*`. The staging overlay patch sets `aws.zoneType: public`, so even though the `staging.cpt.aws.example.net` domain filter would also match the private `internal.staging.cpt.aws.example.net` zone, only the public zone is touched (and the role is not permitted on the private one anyway).

!!! warning "Operator input needed — prod external-dns has no cross-account role in IaC"
    The base HelmRelease points prod-eks's external-dns at `777788889999:role/prod-external-dns-role` (the **prod** account) with **no** `aws.assumeRoleArn`, yet the zones it manages (`prod.cpt.aws.example.net`, `internal.prod.cpt.aws.example.net`) live in the **network** account. There is **no `prod` external-dns Terraform leaf** in this repo — only the staging one — so `prod-external-dns-role` and its network-account Route53 grant are **not provisioned by IaC here** (the manifest even comments *"User will need to replace this with the actual role ARN if it exists"*). Confirm how prod external-dns is actually authorised to write the network-account zones, or port the `_modules/external-dns` role chain to a prod leaf.

---

## Certificate inventory

Two distinct ACM footprints, because CloudFront can only use certificates in `us-east-1` while ALB uses regional (`af-south-1`) certificates.

### Regional ACM — `af-south-1` (ALB / wildcard)

`_modules/acm-certificates` issues a regional, DNS-validated wildcard cert per environment. Validation records are written **cross-account** into the matching network-account Route53 zone via the `aws.network` provider. Both leaves tag the cert `Purpose = "ALB TLS for wildcard domains"`.

| Environment | Domain | SAN | Region | Validation zone | Used by |
|-------------|--------|-----|--------|-----------------|---------|
| prod (leaf) | `*.prod.cpt.aws.example.net` | `prod.cpt.aws.example.net` | `af-south-1` | `prod.cpt.aws.example.net` | ALB Ingress (shared ALB) |
| staging (leaf) | `*.staging.cpt.aws.example.net` | `staging.cpt.aws.example.net` | `af-south-1` | `staging.cpt.aws.example.net` | ALB Ingress (shared ALB) |

!!! note "The `load-balancers` module also carries an ALB cert path"
    `_modules/load-balancers` contains an `aws_acm_certificate.alb` + Route53-validation block gated by `create_certificate`, retained for the (currently commented-out) ALB. The live public entry point in that module is the **NLB** (TCP passthrough, no ACM); the wildcard certs above are the ones that terminate TLS at the Ingress ALB.

### Global ACM — `us-east-1` (CloudFront)

The CloudFront edges front `example.com` hostnames whose DNS lives on **Cloudflare**, so Terraform cannot auto-create the validation records. Certs are therefore issued in one of two ways: **hardcoded pre-issued ARNs** (api-cdn and the metrics UI, validated by hand in Cloudflare — the "two-phase mint"), or **minted in-module** (the S3 frontend and the images CDN).

| Edge (leaf/module) | Viewer domain | Region | Certificate | Origin |
|--------------------|---------------|--------|-------------|--------|
| api-cdn prod (leaf) | `metrics-api.example.com` | `us-east-1` | `…:777788889999:certificate/dddddddd-1111-2222-3333-dddddddddddd` (pinned) | `metrics-api.prod.cpt.aws.example.net` (ALB Ingress) |
| api-cdn staging (leaf) | `metrics-staging-api.example.com` | `us-east-1` | `…:444455556666:certificate/99999999-1111-2222-3333-999999999999` (pinned) | `metrics-api.staging.cpt.aws.example.net` (ALB Ingress) |
| metrics UI prod (`_modules/s3/metrics_cloudfront.tf`) | `metrics.example.com` | `us-east-1` | `…:777788889999:certificate/eeeeeeee-1111-2222-3333-eeeeeeeeeeee` (pinned) | `metrics` S3 bucket |
| metrics UI staging (s3 leaf) | `metrics-staging.example.com` | `us-east-1` | `…:444455556666:certificate/ffffffff-1111-2222-3333-ffffffffffff` (pinned) | `metrics` S3 bucket |
| S3 frontend (`_modules/s3/cloudfront.tf`) | `secure.example.com` (prod) / `staging.example.com` (staging) | `us-east-1` | `aws_acm_certificate.frontend` (minted in-module for `<subdomain>.example.com`) | `example-frontend-<env>-<cc>` S3 website |
| images-cdn staging (`_modules/cloudfront-images`) | `images.staging.example.com` | `us-east-1` | `aws_acm_certificate.cert` (minted in-module when `domain_name` set) | `example-<env>-<cc>` images S3 (OAC) |

The S3 frontend distribution only attaches its `<subdomain>.example.com` alias **in prod** (`aliases = var.environment == "prod" ? [...] : []`); `subdomain` is `secure` in prod and `staging` in staging (`terraform/aws/{prod,staging}/env.hcl`).

!!! info "Superseded wildcards"
    Both api-cdn leaves note that their pinned per-domain certs **replace a FAILED `*.example.com` wildcard** that was previously hardcoded (prod `…/c3adab70`, staging `…/b24af5bb`). Those wildcards never validated (Cloudflare-hosted zone, no auto-validation) and were abandoned in favour of the per-domain certs above — do not resurrect them.

!!! warning "Two-phase mint for Cloudflare-hosted viewer domains"
    Because the viewer zone is on Cloudflare, `_modules/cloudfront-api` will not auto-validate a minted cert; a `precondition` forces you to pass a pre-issued `acm_certificate_arn` (the pinned ARNs above) unless you opt in with `allow_acm_certificate_mint = true` and manually add the validation records in Cloudflare. The regional wildcard certs (`af-south-1`) have no such issue — their validation zone is in Route53.

---

## Operator input needed

!!! warning "Facts not derivable from this repository"
    - **Registrar / apex ownership.** The registrar-level NS delegation for `aws.example.net`, `example.com`, and `az.example.net` (who owns each registration and points it at Route53 / Cloudflare / Azure DNS) is not in the repo.
    - **Cloudflare account / zone ownership** for `example.com` and `staging.example.com` — the zones themselves are managed in Cloudflare, outside this repo's Terraform. Only the `CF_API_TOKEN` (external secret `cloudflare-dns-api-token`) is referenced here.
    - **prod external-dns cross-account authorisation** — `prod-external-dns-role` is referenced by the base HelmRelease but not provisioned by any Terraform leaf here, and no `assumeRoleArn` into the network account is configured (see the warning under [external-dns](#external-dns-per-environment)).
    - **Azure `az.example.net` apply state** — whether the Azure DNS module is currently applied, and the MikroTik public IPs feeding its round-robin records, are not determinable from static config.
