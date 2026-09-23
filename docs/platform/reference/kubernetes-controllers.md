# Kubernetes Controllers & Configs

This page documents the cluster-wide **controllers** and **configs** that every platform EKS cluster (`prod-eks`, `staging-eks`) needs before any application GitOps wiring can reconcile. These are the shared operators (secrets sync, DNS, ingress tunnel, object-store operator, certificate issuance) and the shared config objects (image-pull secret, GitHub App credentials, priority classes, Flux resource tuning) that everything else builds on.

They live under two Kustomize directories:

- `kubernetes/infrastructure/controllers/` — operators, deployed as Flux `HelmRelease`es, a raw `DaemonSet`, and `ClusterSecretStore`/`ClusterIssuer` custom resources.
- `kubernetes/infrastructure/configs/` — cluster config objects: SOPS-encrypted credential secrets, an image-pull `ServiceAccount` patch, `PriorityClass`es, and Flux controller resource-limit patches.

## How it plugs into the platform

Both directories are pulled in near the top of each cluster overlay, ahead of the app wiring, so the shared prerequisites (namespaces, secret stores, priority classes) exist first:

```yaml
# kubernetes/overlays/prod-cpt-aws/kustomization.yaml (and staging-cpt-aws)
resources:
  - flux-system
  ### Infra (apply before app GitOps wiring — secrets, priority classes, shared namespaces)
  - ../../infrastructure/controllers
  - ../../infrastructure/configs
  ### Apps ...
```

The overlays are the Flux entrypoint (`kubernetes/overlays/prod-cpt-aws` and `kubernetes/overlays/staging-cpt-aws`). See:

- `overlays/prod-cpt-aws/kustomization.yaml`
- `overlays/staging-cpt-aws/kustomization.yaml`

The aggregate `controllers/kustomization.yaml` enables only four of the five controllers:

```yaml
resources:
  - cloudflared
  - external-secrets
# Cert-Manager is not compatible with AWS Certificate Manager & Application Load Balancer, so disabled for now
#  - cert-manager
  - external-dns
  - minio-operator
```

!!! warning "cert-manager is disabled in the aggregate"
    `cert-manager` is commented out of `controllers/kustomization.yaml`. TLS on the platform is terminated by AWS ACM on the Application Load Balancers, so cert-manager is not part of the reconciled tree. Its manifests still exist in-repo (see [cert-manager](#cert-manager-disabled) below) but are effectively orphaned.

The aggregate `configs/kustomization.yaml` pulls in `github-app`, `ghcr-image-pull`, and `priority-classes.yaml`, and additionally **patches the Flux controllers' resource requests/limits** (see [Flux controller resource patches](#flux-controller-resource-patches)).

---

## Controllers

### external-secrets (External Secrets Operator / ESO)

The foundational controller: it syncs secrets from **AWS Secrets Manager** into Kubernetes `Secret`s, and almost every other controller and app on the platform consumes a `Secret` that ESO materialises. Deployed as a Flux `HelmRelease`.

| Item | Value |
| --- | --- |
| Chart | `external-secrets` from `https://charts.external-secrets.io` |
| Chart version | `0.11.*` (pinned minor) |
| Image | `ghcr.io/external-secrets/external-secrets:v0.11.0` (controller, webhook, certController all pinned) |
| Namespace | `external-secrets` |
| `installCRDs` | `true` |
| Resources | requests `cpu 10m / mem 100Mi`, limit `mem 100Mi` (same for webhook + certController) |
| Remediation | install/upgrade retries `3` |
| API | `helm.toolkit.fluxcd.io/v2` (GA) |

Source files: `helmrelease.yaml`, `helmrepository.yaml`, `namespace.yaml`.

#### ClusterSecretStores

Two cluster-scoped stores are defined in `clustersecretstore.yaml`. Every `ExternalSecret` on the platform references one of them by name.

| Name | Provider | Region | Role | Purpose |
| --- | --- | --- | --- | --- |
| `aws-secrets-manager` | AWS SecretsManager | `af-south-1` | (default — the cluster's ESO Pod Identity role in the local account) | The everyday store. Used by cloudflared, cert-manager, external-dns and app `ExternalSecret`s. |
| `aws-secrets-manager-network` | AWS SecretsManager | `af-south-1` | assumes `arn:aws:iam::210987654321:role/router-fleet-secret-reader` | Cross-account read of the **network** account's `routers/<endpoint>` MikroTik API credentials. Consumed by the `router-fleet-credentials` ExternalSecret (platform-utils). |

ESO's controller identity is the AWS Pod Identity role `ExternalSecretsRole` in each cluster account (`777788889999` prod, `444455556666` staging). Its IAM policy grants `secretsmanager:GetSecretValue` / `DescribeSecret` on that account's secrets. Pod Identity associations and the policies are created **out of band** (not in this repo) — the exact CLI is captured in `more-terraform-tech-debt.md`.

!!! danger "Manual prod IAM step still outstanding (cross-account router-fleet)"
    The `aws-secrets-manager-network` store assumes `router-fleet-secret-reader` in the network account. That reader role **was** provisioned (2026-07-07). The reciprocal permission — allowing prod's `ExternalSecretsRole` to `sts:AssumeRole` on it — is documented as **STILL REQUIRED** and must be applied with prod credentials. Until it is, the `router-fleet-credentials` ExternalSecret will not sync and `wait: true` on the utils `router-fleet-resolver` flux-kustomization must stay off. Full runbook: `more-terraform-tech-debt.md`.

!!! note "IAM here is Terraform tech-debt, not IaC"
    `more-terraform-tech-debt.md` is a runbook of raw `aws iam …` / `aws eks create-pod-identity-association` / `aws secretsmanager create-secret` commands for both staging (`444455556666`) and prod (`777788889999`). It is not applied by Flux — it documents manual AWS steps that have not been expressed as Terraform. Treat it as a prerequisites checklist, not reconciled state.

### cloudflared (Cloudflare Tunnel)

Runs the Cloudflare Tunnel connector so inbound traffic to Cloudflare-fronted hostnames reaches in-cluster services. Deployed as a **raw `DaemonSet`** (not Helm) in the `core` namespace.

| Item | Value |
| --- | --- |
| Kind | `DaemonSet` `cloudflared` |
| Namespace | `core` (created by `namespace.yaml`) |
| Image | `cloudflare/cloudflared:2026.1.1` |
| Args | `tunnel --no-autoupdate --protocol quic run --token $(TUNNEL_TOKEN)` |
| Token | env `TUNNEL_TOKEN` from `secretKeyRef` `cloudflared-token` / key `token` |
| Resources | requests `mem 64Mi / cpu 50m`, limits `mem 256Mi / cpu 200m` |

The tunnel token is not stored in-repo. An `ExternalSecret` materialises it from Secrets Manager:

```yaml
# controllers/cloudflared/externalsecret.yaml
kind: ExternalSecret
metadata:
  name: cloudflared-token
  namespace: core
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: cloudflared-token          # DaemonSet reads this Secret
    creationPolicy: Owner
  data:
    - secretKey: token
      remoteRef:
        key: cloudflare               # SM secret
        property: cloudflared-token   # JSON property
```

So the wiring is: **ESO reads `cloudflare` / `cloudflared-token` from Secrets Manager → creates the `cloudflared-token` Secret → the DaemonSet consumes it as `TUNNEL_TOKEN`.** This is the canonical "controller depends on external-secrets" pattern on the platform.

Source files: `daemonset.yaml`, `externalsecret.yaml`, `kustomization.yaml`.

### external-dns

Manages DNS records for `Ingress` / `Service` (and `DNSEndpoint` CRD) resources across both AWS Route53 and Cloudflare. Deployed as **two** Flux `HelmRelease`es from the same Bitnami chart — one AWS provider, one Cloudflare provider — in the `external-dns` namespace.

| Item | Value |
| --- | --- |
| Chart | `external-dns` from `https://charts.bitnami.com/bitnami` |
| Chart version | `8.5.*` |
| Image | `877085696533.dkr.ecr.af-south-1.amazonaws.com/eks/external-dns:v0.20.0-eksbuild.3` (EKS-optimized, ECR) |
| API | `helm.toolkit.fluxcd.io/v2beta2` |
| Resources (both) | requests `cpu 10m / mem 64Mi`, limit `mem 128Mi` |

Source files: `helmrelease.yaml`, `helmrepository.yaml`, `externalsecret.yaml`, `namespace.yaml`.

#### HelmRelease `external-dns` (AWS / Route53)

| Setting | Value |
| --- | --- |
| `provider` | `aws` (region `af-south-1`) |
| `domainFilters` | `internal.prod.cpt.aws.example.net`, `prod.cpt.aws.example.net`, `staging.cpt.aws.example.net` |
| `sources` | `ingress`, `service`, `crd` (`DNSEndpoint`, `externaldns.k8s.io/v1alpha1`) |
| `policy` | `upsert-only` (never deletes records — safety) |
| `registry` | `txt`, `txtOwnerId: prod-eks`, `txtPrefix: externaldns-` |
| ServiceAccount | `external-dns`, IRSA annotation `arn:aws:iam::777788889999:role/prod-external-dns-role` |
| Liveness | custom `httpGet /healthz` on `http` (kept to avoid strategic-merge patch conflict with a prior Deployment) |

#### HelmRelease `external-dns-cloudflare` (Cloudflare)

| Setting | Value |
| --- | --- |
| `provider` | `cloudflare` |
| `domainFilters` | `example.com`, `staging.example.com` |
| `sources` | `ingress` |
| `policy` | `upsert-only`, `registry: txt`, `txtOwnerId: prod-cloudflare`, `txtPrefix: externaldns-` |
| ServiceAccount | `external-dns-cloudflare` (no IRSA) |
| Auth | env `CF_API_TOKEN` from `secretKeyRef` `cloudflare-dns-api-token` / key `dns-api-token` |

The Cloudflare API token comes from ESO (`cloudflare` / `dns-api-token` in Secrets Manager) — the same remote key that cert-manager's DNS-01 solver would use.

!!! note "The base HelmRelease carries PROD values"
    The Route53 HelmRelease is written with prod domains, prod `txtOwnerId: prod-eks`, and the prod IRSA role ARN baked in. Staging overrides these with a patch (see [Per-environment differences](#per-environment-differences)). Line 63 also carries a leftover scaffolding comment ("User will need to replace this with the actual role ARN if it exists").

### minio-operator

The MinIO Operator, which manages MinIO `Tenant` custom resources. Deployed as a Flux `HelmRelease` in the `minio-operator` namespace.

| Item | Value |
| --- | --- |
| Chart | `operator` from `https://operator.min.io` |
| Chart version | `7.1.*` |
| Namespace | `minio-operator` |
| Replicas | `2` (HA; chart spreads across nodes by default) |
| CRDs | `CreateReplace` on install and upgrade |
| Resources | requests `cpu 100m / mem 128Mi`, limit `mem 256Mi` |
| Remediation | install/upgrade retries `3` |

Source files: `helmrelease.yaml`, `helmrepository.yaml`, `namespace.yaml`.

!!! note "Operator only — no Tenant yet"
    Only the *operator* is reconciled here. The MinIO *service*/tenant (`infrastructure/services/minio/...`) is commented out of both cluster overlays with the note "we are not ready for this yet". The operator therefore currently runs with no `Tenant` to manage.

### cert-manager (DISABLED)

!!! warning "Not reconciled — commented out of the controllers aggregate"
    cert-manager is **not** deployed via `controllers/kustomization.yaml` (see the top of this page). The reason given in-repo: it "is not compatible with AWS Certificate Manager & Application Load Balancer". Certificates are handled by AWS ACM on the ALBs. The manifests below still exist but are only referenced by the orphaned staging `common/` overlay (see [Legacy](#legacy-cleanup-notes)).

The directory (`controllers/cert-manager/`) contains, for reference:

| File | Contents |
| --- | --- |
| `kustomization.yaml` | Lists `externalsecret.yaml` + `clusterissuer.yaml`. Comment notes "The cert-manager resource itself gets/got created by the EKS addon" (the operator is an EKS add-on, not Helm here). |
| `clusterissuer.yaml` | `ClusterIssuer` `letsencrypt-dns` — ACME prod (`acme-v02.api.letsencrypt.org`), email `systems@example.com`, DNS-01 via Cloudflare for zones `example.com` + `staging.example.com`, token from Secret `cloudflare-dns-api-token` / key `dns-api-token`. |
| `externalsecret.yaml` | `ExternalSecret` `cloudflare-dns-api-token` in `cert-manager` ns — sources `cloudflare` / `dns-api-token` from Secrets Manager via `aws-secrets-manager`. |

---

## Configs

### github-app

The GitHub App credentials that Flux uses to authenticate to GitHub for **both** reading app source repos (`GitRepository`) and **writing image-bump commits back** (`ImageUpdateAutomation`). Delivered as a single **SOPS-encrypted** `Secret`.

| Item | Value |
| --- | --- |
| Secret | `github-app` in `flux-system` |
| Type | `Opaque` |
| Keys | `githubAppID`, `githubAppInstallationID`, `githubAppPrivateKey` (all SOPS/AES256-GCM encrypted; `encrypted_regex: ^(data\|stringData)$`) |
| Encryption | SOPS **age**, recipient `age1exampleexampleexampleexampleexampleexampleexampleexamq3n8h5` |

Source: `github-app-secret.yaml`, `kustomization.yaml`.

**How it is consumed.** Every app `GitRepository` sets `provider: github` and `secretRef.name: github-app`, e.g. `apps/utils/base/gitrepository.yaml`:

```yaml
kind: GitRepository
metadata:
  name: platform-utils
  namespace: flux-system
spec:
  provider: github
  ref:
    branch: main
  secretRef:
    name: github-app        # <- the github-app Secret
  url: https://github.com/example-org/platform-utils
```

The same GitHub App identity backs Flux **image automation**: `ImageUpdateAutomation` resources reference a `GitRepository` (which carries the `github-app` secretRef) and push commits authored as **`platform-bot`** back to `main` when a new image is detected. Consumers include `platform-utils`, `camera-console`, `driver`, `public-api`, `backend`, and `status`.

!!! danger "SOPS decryption must be wired for this to reconcile"
    The `github-app` (and `ghcr-image-pull`) Secrets are only decryptable because the cluster overlays patch the Flux `Kustomization` named `all` with a SOPS decryption `secretRef: sops-keys` (targeting Kustomizations labelled `app.kubernetes.io/sops=enabled`). The private age key lives in the `sops-keys` Secret in-cluster, not in this repo.

### ghcr-image-pull

Provides the image-pull credentials for pulling private images from GitHub Container Registry (`ghcr.io`), attached to the default ServiceAccount of `flux-system`.

| File | What it provides |
| --- | --- |
| `secret.yaml` | SOPS-encrypted `Secret` `ghcr-credentials` (`flux-system`), type `kubernetes.io/dockerconfigjson`, `.dockerconfigjson` encrypted (age, same recipient as `github-app`). |
| `serviceaccount.yaml` | Patches ServiceAccount `default` in `flux-system` to add `imagePullSecrets: [ghcr-credentials]`. |
| `kustomization.yaml` | Lists `secret.yaml` + `serviceaccount.yaml`. |

!!! note "Also referenced directly by capture staging"
    `ghcr-image-pull` is pulled into the aggregate configs, and is *also* referenced directly by the (orphaned) staging `edge-capture` overlay — see [Legacy](#legacy-cleanup-notes).

### priority-classes

Cluster-wide scheduling priorities for the Edge-Capture (capture) system. Single file `priority-classes.yaml`.

| PriorityClass | Value | preemptionPolicy | Intended workloads |
| --- | --- | --- | --- |
| `ingest-critical` | `1000` | (default) | Admin interfaces and camera drivers |
| `ingest-high` | `500` | (default) | Data processing and monitoring workers |
| `ingest-medium` | `100` | (default) | Alerts and notifications |
| `ingest-low` | `10` | (default) | Restartable workers |
| `ingest-besteffort` | `-10` | `Never` (won't preempt others) | Testing, debugging, optional services |

All are `globalDefault: false`. Also referenced directly by the capture staging overlay.

### Flux controller resource patches

Beyond the three resource lists, `configs/kustomization.yaml` uses `patches` to **override the resource requests/limits of the Flux controllers themselves** (the `gotk-components` Deployments). This right-sizes Flux for the cluster:

| Deployment | CPU request | Memory request | Memory limit |
| --- | --- | --- | --- |
| `helm-controller` | 10m | 100Mi | 100Mi |
| `image-automation-controller` | 20m | 100Mi | 100Mi |
| `image-reflector-controller` | 10m | 512Mi | 512Mi |
| `kustomize-controller` | 55m | 350Mi | 350Mi |
| `notification-controller` | 10m | 100Mi | 100Mi |
| `source-controller` | 30m | 200Mi | 200Mi |

Each patch does a JSON-patch `replace` on `/spec/template/spec/containers/0/resources` (no CPU limit is set — memory-limited only).

---

## Per-environment differences

Nearly all of these manifests are **environment-agnostic base** and are applied identically to prod and staging. The one place that diverges is external-dns, patched by the staging overlay (`patches/external-dns-staging.yaml`):

| Setting | Prod (base) | Staging (patched) |
| --- | --- | --- |
| Route53 `domainFilters` | `internal.prod.cpt.aws.example.net`, `prod.cpt.aws.example.net`, `staging.cpt.aws.example.net` | `staging.cpt.aws.example.net` |
| `txtOwnerId` | `prod-eks` | `staging-eks` |
| IRSA role (SA annotation) | `arn:aws:iam::777788889999:role/prod-external-dns-role` | `arn:aws:iam::444455556666:role/staging-external-dns-role` |
| Cross-account Route53 | (none — same-account) | `aws.assumeRoleArn: arn:aws:iam::210987654321:role/staging-external-dns-route53`, `zoneType: public` |

ESO is also account-scoped implicitly: the `ExternalSecretsRole` / secret-store policies point at `777788889999` (prod) vs `444455556666` (staging), configured out of band per `more-terraform-tech-debt.md`.

```yaml
# overlays/staging-cpt-aws/kustomization.yaml
patches:
  # Staging external-dns: same-account IRSA role + cross-account Route53 role,
  # staging owner id, and staging-only domain filter (base carries prod values).
  - path: patches/external-dns-staging.yaml
```

!!! note "Staging overlay adds more shared services"
    The staging overlay additionally reconciles CloudNativePG, shared Postgres/Valkey, OpenReplay and the AppSec stack (DefectDojo / Dependency-Track / SonarQube). Those are outside the controllers/configs scope but are why the staging `kustomization.yaml` is much longer than prod's.

---

## Operational notes

- **Order matters.** `controllers` + `configs` are listed before app resources in the overlays so namespaces, secret stores and priority classes exist before anything references them. ESO in particular must be healthy before cloudflared, external-dns-cloudflare, cert-manager (if enabled), and every app `ExternalSecret` can resolve.
- **Secrets never live in-repo in plaintext.** `github-app` and `ghcr-credentials` are SOPS/age encrypted; all runtime credentials (Cloudflare tunnel token, Cloudflare DNS API token, router-fleet creds) are pulled from AWS Secrets Manager by ESO at runtime.
- **`upsert-only` DNS.** external-dns will create/update but never delete Route53 or Cloudflare records — deletions must be done manually. TXT registry records use prefix `externaldns-` and owner ids `prod-eks` / `prod-cloudflare` / `staging-eks`.
- **Image bumps flow through the GitHub App.** Automated `chore: update … image` commits authored by `platform-bot` on `main` are the GitHub App writing back via the `github-app` secret.
- **API version drift.** external-secrets and minio-operator use `helm.toolkit.fluxcd.io/v2` (GA); external-dns uses `v2beta2`. ESO's ExternalSecret/ClusterSecretStore CRs are on `external-secrets.io/v1beta1`.

---

## Legacy / cleanup notes

!!! warning "Orphaned & disabled items in scope"

- **cert-manager is dead in the reconciled tree.** Commented out of `controllers/kustomization.yaml`. Its only remaining reference is the staging `common/kustomization.yaml`, which is **itself not wired into** the staging root `kustomization.yaml` — so the cert-manager `ClusterIssuer` + `ExternalSecret` are not applied anywhere. Candidate for removal or a documented "kept for reference" note.
- **`more-terraform-tech-debt.md` in the kustomize tree.** A runbook `.md` living inside `controllers/external-secrets/` (not listed in its `kustomization.yaml`, so harmless to kustomize). It records manual AWS IAM that is not IaC, and flags a **still-required prod IAM step** for the cross-account router-fleet reader. Tech-debt to convert to Terraform.
- **Leftover scaffolding comment** in `external-dns/helmrelease.yaml` line 63: "User will need to replace this with the actual role ARN if it exists" — stale template text next to a now-real role ARN.
- **minio-operator with no tenant.** The operator is reconciled but the MinIO service/tenant is commented out of both overlays ("we are not ready for this yet"). The operator runs idle until a `Tenant` is introduced.
- **Orphaned staging overlays consuming these configs.** `staging-cpt-aws/common/` (references cert-manager) and `staging-cpt-aws/apps/edge-capture/` (references `priority-classes.yaml` + `ghcr-image-pull`, and carries large commented-out blocks) are not referenced by the staging root `kustomization.yaml` — they appear to be stale, un-wired overlays.
