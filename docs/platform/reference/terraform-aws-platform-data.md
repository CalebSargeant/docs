# AWS Terraform modules — platform & data

Reference for the reusable Terraform/OpenTofu modules under
`terraform/aws/_modules`
that build the platform's compute, data, storage, observability, alerting and cross-account
IAM. These are the building blocks consumed by the per-environment Terragrunt leaves in
`terraform/aws/{prod,staging,network}/af-south-1/…`. This page covers 15 of them: `eks`,
`rds`, `postgres`, `cache`, `s3`, `s3-backups`, `sqs`, `cnpg-backups`, `observability`,
`openreplay`, `pagerduty`, `workspaces`, `cross-account-grafana`, `router-fleet-network-iam`
and `router-fleet-prod-iam`.

## How these modules are wired

Every leaf is a Terragrunt unit whose module source is derived from its own directory name:

```hcl
terraform {
  source = "${get_path_to_repo_root()}/terraform/aws/_modules//${basename(get_terragrunt_dir())}"
}
```

So `prod/af-south-1/eks` sources `_modules/eks`, `staging/af-south-1/observability` sources
`_modules/observability`, and so on. Inputs are layered by merging (in order)
`root.hcl` → `region.hcl` → `env.hcl` → SOPS secrets → leaf-specific overrides.

Global constants live in
`terraform/aws/root.hcl`:

| Setting | Value |
| --- | --- |
| Terraform/OpenTofu version | `>= 1.9.1` |
| `hashicorp/aws` provider | pinned `6.36.0` |
| `PagerDuty/pagerduty` provider | `3.33.1` |
| `terraform-routeros/routeros` | `1.83.1` |
| `fortinetdev/fortios` | `1.22.0` |
| Base DNS domain | `aws.example.net` |
| State backend | S3 `example-<env>-<account>-<region>`, DynamoDB lock table `terraform-locks` |

Account IDs (from `root.hcl` / `env.hcl`):

| Environment | Account ID | VPC CIDR (af-south-1) | Subnet types |
| --- | --- | --- | --- |
| network | `210987654321` | `10.161.0.0/19` | outside, management, inside |
| shared | `123456789012` | `10.161.32.0/19` | app, data |
| prod | `777788889999` | `10.161.64.0/19` | app, data |
| staging | `444455556666` | `10.161.96.0/19` | app, data |
| dev | `111122223333` | `10.161.128.0/19` | app, data |

`root.hcl` also generates three provider blocks that these modules rely on:

- **default** `aws` — region + `allowed_account_ids` guard for the leaf's own account.
- **`aws.network`** — assumes `arn:aws:iam::210987654321:role/TerraformNetworkAdmin` in the
  network account. Used by `rds`, `postgres` and `cache` to write internal Route 53 records
  into the network-account private zones.
- **`aws.us-east-1`** — for CloudFront-scoped ACM certs, WAF and response-headers policies in
  the `s3` module.

!!! note "af-south-1 only"
    Although the region maps include `eu-central-1`, every module documented here is currently
    deployed only in `af-south-1` (city code `cpt`, country `za`).

---

## eks — self-managed EKS cluster, add-ons and IRSA

`_modules/eks`
provisions the Kubernetes control plane, its worker nodes, core add-ons, the OIDC provider that
underpins IRSA across the platform, and subnet tagging. Deployed for both **prod** and
**staging** (`prod/af-south-1/eks`, `staging/af-south-1/eks`).

### Cluster

Defined in `main.tf`:

- `aws_eks_cluster.this` named `${environment}-eks`, Kubernetes version `var.cluster_version`
  (default `1.32`, set to `1.32` in `region.hcl`).
- Endpoint access: **private only** (`endpoint_private_access = true`,
  `endpoint_public_access = false`).
- `access_config.authentication_mode = "API_AND_CONFIG_MAP"` with
  `bootstrap_cluster_creator_admin_permissions = true`; `upgrade_policy.support_type = "STANDARD"`.
- Runs in the environment's **app** subnets (`local.matched_app_subnet_ids`).
- A single cluster security group `${environment}-sg` allowing all intra-node traffic and all
  egress. Ingress is `0.0.0.0/0` all-protocol with `lifecycle { ignore_changes = [ingress] }`.

### Subnet discovery and tagging

`locals.tf`
does **not** take subnet IDs as inputs. Instead it recomputes each subnet's expected CIDR from
the environment/region maps (`cidrsubnet(cidr, 5, …)` — a /19 VPC split into /24s, reserving 3
AZ slots per subnet type) and matches those against the live subnets returned by
`data.aws_subnet.all_subnets`
(`data.tf`).
This yields `matched_app_subnets` and `matched_data_subnets`.

`_subnet-tags.tf`
then applies `Name`, `Environment`, `Subnet` tags to all matched subnets, plus the Kubernetes
discovery tags on app subnets (`kubernetes.io/cluster/<env>-eks = shared`,
`kubernetes.io/role/internal-elb = 1`) and `SubnetGroup = database` on data subnets.

### Worker nodes (self-managed EC2)

`_nodes.tf`
runs **one `aws_instance.eks_node` per app subnet (per AZ)** — not an EKS managed node group:

- AMI is **hard-coded** to `ami-06524d8dc46da1bbf` (comment: "Current running AMI to match
  existing instances"), overriding `var.ami`.
- `instance_type = var.instance_type` (prod `m5.2xlarge`), `key_name` from `aws_key_pair.this`
  (`var.public_key`), `iam_instance_profile = aws_iam_instance_profile.node`.
- Fixed private IP: `cidrhost(<subnet cidr>, 10)`; no public IP; 50 GB encrypted gp3 root volume.
- `user_data` sets the `ec2-user` password (`var.ec2_password`) and joins the cluster via
  `/etc/eks/bootstrap.sh` with `--max-pods=110`.

Node discovery for outputs uses `data.aws_instances.nodes` filtered on
`tag:eks:cluster-name` + running state.

### IAM and IRSA

`_iam.tf`:

| Resource | Purpose |
| --- | --- |
| `aws_iam_role.this` (`eks-cluster`) | Cluster role, `AmazonEKSClusterPolicy` attached |
| `aws_iam_role.node_group` (`${env}-eks-node-group`) | Node role: WorkerNode, CNI, ECR-ReadOnly, EBS CSI policies |
| `aws_eks_access_entry.node_group` | `EC2_LINUX` access entry for the node role |
| `aws_iam_openid_connect_provider.eks` | **OIDC provider for IRSA** (thumbprint `9e99a48a…7280`, client `sts.amazonaws.com`) |
| `aws_iam_role.ebs_csi` (`${env}-eks-ebs-csi-driver`) | IRSA role for `kube-system:ebs-csi-controller-sa` |

The OIDC provider is the linchpin the `observability`, `openreplay`, `cnpg-backups` and `s3`
(public-api) modules consume via the `oidc_provider_arn` / `oidc_issuer_url` outputs.

`_alb_controller_irsa.tf`
conditionally (`var.enable_aws_lb_controller`, **enabled in both prod and staging leaves**)
creates `AmazonEKSLoadBalancerControllerRole` for the
`kube-system:aws-load-balancer-controller` service account and attaches the pre-existing
`var.aws_lb_controller_policy_name` (`AWSLoadBalancerControllerIAMPolicy`) policy by ARN.

### Add-ons

`_eks-addons.tf`
manages EKS add-ons (all with `resolve_conflicts_on_update = "OVERWRITE"`):

| Add-on | Notes |
| --- | --- |
| `kube-proxy` | — |
| `vpc-cni` | `ignore_changes = [pod_identity_association]` |
| `external-dns` | — |
| `aws-ebs-csi-driver` | Uses `aws_iam_role.ebs_csi` IRSA role; required for PVCs |
| `metrics-server` | HPA / resource metrics |
| `adot` | AWS Distro for OpenTelemetry (Tempo tracing); `ignore_changes = [pod_identity_association]` |
| `kube-state-metrics` | Kubernetes object-state metrics |

The file also creates `aws_iam_role.prometheus_node_exporter` (trusts
`amazon-cloudwatch:cloudwatch-agent`) with `CloudWatchAgentServerPolicy`. CoreDNS, the CloudWatch
observability add-on and the pod-identity agent are present but **commented out**.

### Key variables / outputs

Notable inputs: `environment`, `cluster_version` (default `1.32`), `instance_type`,
`ec2_password`, `public_key`, `ami`, `az_count`, `environments`/`regions` maps,
`enable_aws_lb_controller`. Outputs include `cluster_name`, `vpc_id`, `security_group_id`,
`data_subnets`, `node_group_role_name`/`_arn`, `oidc_provider_arn`, `oidc_issuer_url`,
`node_private_ips`, `node_instance_ids`.

!!! warning "Legacy files in this module"
    `_iam_readonly.tf`, `_route53.tf`, `_config-fortigate.tf` and `_mikrotik.tf` are **entirely
    commented out**. Several variables (`ami_type`, `map_roles`, `map_users`, `fortigates`,
    `vpc_id`, readonly principals) are commented in `variables.tf`. The prod/staging leaves pass
    a `map_users` input that the module silently ignores (no matching variable). See
    [Legacy notes](#legacy-and-operational-notes).

---

## rds — application MySQL with proxy

`_modules/rds`
is the capture admin-portal application database (MySQL 8.0). Deployed to **prod** and **staging**
(`db_name = capture_admin_portal`, `db_username = captureadmin`).

Key resources in `main.tf`:

- `aws_db_subnet_group.this` over the EKS **data** subnets (`var.data_subnets`).
- `aws_db_instance.this`: `multi_az = true`, `apply_immediately = true`, autoscaling storage
  (`allocated`→`max_allocated`), automated backups (`backup_retention_period` default 7,
  window `03:00-04:00`, maintenance `sun:04:00-sun:05:00`), `deletion_protection` (default true),
  `performance_insights_enabled` (default true), and a timestamped `final_snapshot_identifier`.
- **Secrets Manager**: `${env}-db-credentials` and `${env}-db-readonly-credentials` (username +
  password JSON).
- **RDS Proxy** (`var.enable_rds_proxy`, default true): `aws_db_proxy.this`, default target
  group (connection-pool config), target, dedicated security group (ingress **tcp/3306**),
  and an IAM role granting `secretsmanager:GetSecretValue`/`DescribeSecret` + scoped `kms:Decrypt`.
  Proxy IAM auth defaults to `DISABLED`.
- `aws_db_parameter_group.this` (`var.db_parameter_group_family`, e.g. `mysql8.0`) with tuned
  InnoDB parameters (timezone `Africa/Harare`, `innodb_io_capacity` 2000/4000, slow-query log,
  IO/purge/read/write threads, `innodb_buffer_pool_instances = 8`, and an optional
  `innodb_buffer_pool_size` from `var.innodb_buffer_pool_size_gb`).
- **Route 53** (via `aws.network`): `db.<internal-zone>` CNAME to the instance address, and a
  `db-proxy.<internal-zone>` CNAME when the proxy is enabled. The private zone name is
  `internal.<env>.<city>.aws.example.net`.

### Prod vs staging (from `env.hcl`)

| Setting | prod | staging |
| --- | --- | --- |
| `db_instance_class` | `db.m5.xlarge` | `db.t4g.micro` |
| `innodb_buffer_pool_size_gb` | `8` | not set |
| `db_storage_type` | `gp3` | `standard` |
| `db_allocated_storage` | `40` | `20` |

Credentials (`db_password`, `db_readonly_password`, etc.) come from the SOPS-encrypted
`sops/<env>.enc.yaml`.

!!! note "Encryption default is off"
    `storage_encrypted` defaults to **false** — the variable comment states this is "to match
    existing unencrypted database". The proxy security group and `engine_family` derivation
    assume MySQL (ingress tcp/3306).

---

## postgres — shared Grafana/observability Postgres

`_modules/postgres`
is a **separate, single-instance Postgres** used as the shared observability/Grafana backing
store. Deployed to **prod only** (`prod/af-south-1/postgres`).

- Engine `postgres` `17.4`, `db.t4g.micro`, gp3, 20 GB (no autoscale headroom;
  allocated == max), `multi_az = false`, `deletion_protection = true`,
  `storage_encrypted = true` (default), `performance_insights_enabled = false`.
- Master credentials are read from an existing **Secrets Manager** secret (`var.postgres_secret_name`,
  default `postgres`) by key. The prod leaf points the keys at `super_username` / `super_password`
  (module defaults are `grafana_username` / `grafana_password`).
- Own security group allowing tcp/5432 **only from the EKS cluster security group**
  (`var.security_group_id`).
- Subnet group over the EKS **data** subnets; `postgres.<internal-zone>` CNAME via `aws.network`.

Outputs: `db_instance_id`, `db_instance_address`, `db_instance_port`, `db_route53_fqdn`.

---

## cache — ElastiCache (Valkey) replication group

`_modules/cache`
provisions a Redis-compatible **Valkey** cluster. Deployed to **prod** and **staging**
(`main.tf`):

- `aws_elasticache_replication_group.this` id `${env}-cache`, engine `valkey`,
  parameter group `default.valkey8`, port 6379, `automatic_failover_enabled`,
  `multi_az_enabled`, `at_rest_encryption_enabled`, all `apply_immediately`.
- Node type `var.cache_node_type` (`cache.t3.micro` in both envs), `var.cache_num_nodes`
  (`2` in both envs). AZs are **hard-coded** to `["af-south-1a", "af-south-1b"]`.
- Subnet group over the EKS **data** subnets; security group `var.security_group_id`.
- `cache.<internal-zone>` CNAME to the primary endpoint via `aws.network`.

!!! note
    `tags` / `var.common_tags` are commented out in the resource, so ElastiCache resources here
    are untagged despite the module accepting a `tags` input.

---

## s3 — capture/frontend/backup buckets, GitHub OIDC, CloudFront + WAF

`_modules/s3`
is the largest storage module. Deployed to **prod** and **staging**. It owns buckets, their IAM,
and the CloudFront/WAF edges for the admin frontend and the metrics BI dashboard.

### Buckets (`main.tf`)

| Bucket | Name pattern | Notes |
| --- | --- | --- |
| Capture reads | `example-<env>-<country>` | Versioned, AES256, intelligent-tiering after 30d, expire after 550d; TLS-only + app-role bucket policy |
| Frontend | `example-frontend-<env>-<country>` | Static website hosting (see CloudFront below) |
| DB backups | `example-<env>-backups` | Versioned, AES256; IA→Glacier→Deep-Archive lifecycle on `database_archives/`, 7-day `temp/` cleanup; SSO admin/readonly + archival-user policies |
| Metrics BI | `example-<env>-metrics` | Source for the BI dashboard CloudFront edge |

### IAM (`iam.tf`)

- `capture-events-app-role` (+ instance profile) and an `s3-service-account` IAM user for capture uploads.
- **GitHub Actions OIDC** provider (`token.actions.githubusercontent.com`) plus three roles keyed
  on `sub`:
  - `github-actions-admin-role` — repo `platform-infra` env `<env>`; **`Action="*"`, `Resource="*"`** (full admin).
  - `github-actions-frontend-role` — repo `admin-frontend` env `cpt-<env>`; S3 to the frontend bucket.
  - `github-actions-metrics-role` — repo `example-metrics` env `cpt-<env>`; S3 to metrics bucket + `cloudfront:CreateInvalidation`.
- Backup access groups/policies (`backup-readers-<env>`, `backup-admins-<env>`) and a
  `db-archival-service-<env>` IAM user.

### public-api IRSA (`public_api_irsa.tf`)

When `var.public_api_eks_oidc` is supplied (the leaf wires it from the EKS `oidc_provider_arn`
/ `oidc_issuer_url` outputs), creates `public-api-<env>-<country>` trusting
`dashboard:public-api` with `s3:ListBucket` on the captures bucket (an S3 HeadBucket health probe).

### CloudFront + WAF (`cloudfront.tf`)

For the **admin frontend**: a us-east-1 ACM cert for `<subdomain>.example.com`, an S3
website origin distribution (aliased only in prod), a shared `CLOUDFRONT`-scope WAF web ACL
(`waf-<env>-<region>-frontend`: non-ZA allowlist IP set + geo-ZA), cache policy, and a
response-headers policy emitting CSP/HSTS/frame-options at the edge. The CSP is built from
`var.api_origin`.

### Metrics BI dashboard edge (`metrics_cloudfront.tf`)

Gated on `var.metrics_ui_acm_certificate_arn` being non-empty. Serves the private
`example-<env>-metrics` bucket via CloudFront **Origin Access Control** (locked bucket,
public-access-block on), reuses the shared frontend WAF, adds a viewer-request CloudFront
Function (`metrics-<env>-spa-index-rewrite`) to resolve directory paths to `index.html` for the
Next.js static export, and its own response-headers policy. Viewer domain:
`metrics.example.com` (prod) / `metrics-<env>.example.com` (staging).

### Prod vs staging leaf inputs

| Input | prod | staging |
| --- | --- | --- |
| `api_origin` | `https://metrics-api.example.com` | `https://metrics-staging-api.example.com` |
| `metrics_ui_acm_certificate_arn` | prod us-east-1 cert | staging us-east-1 cert |
| `subdomain` (env.hcl) | `secure` | `staging` |

Outputs include `frontend_web_acl_arn` (shared with the api-cdn stack), `metrics_ui_distribution_id`
/ `_domain` (for cache invalidation / Cloudflare CNAME), `public_api_irsa_role_arn`, and the
capture/backup bucket names/ARNs.

!!! warning
    `github-actions-admin-role` grants unconditional `"*":"*"`. The `aws_iam_access_key` for the
    `s3-service-account` is commented out ("access key was deleted from live environment"), and
    the corresponding outputs are commented too.

---

## s3-backups — Azure VM disk archival bucket

`_modules/s3-backups`
backs up Azure VM disks to S3 for long-term/cold storage (the companion `backup-azure-vms.sh`
script snapshots stopped Azure VMs and uploads compressed VHDs). See the module
README.

- Bucket `example-vm-backups-<env>-<country>`: versioned, AES256, full public-access-block,
  intelligent-tiering (30d) → Glacier (90d) → Deep-Archive (365d), TLS-only bucket policy.
- IAM: `vm-backup-role-<env>-<country>` (EC2 assume) and `vm-backup-user-<env>-<country>` IAM
  user, both scoped to the bucket. Access keys are intentionally **not** created in Terraform
  (commented out; created manually per the README).

Outputs: bucket name/ARN/region, backup role ARN, backup user ARN/name.

!!! note "Not currently deployed via a leaf in this repo tree"
    The README references a `shared/af-south-1/s3-backups` Terragrunt unit; no such leaf exists
    under `prod`/`staging`/`network` in the current tree.

---

## sqs — application queue with DLQ

`_modules/sqs`
creates a main queue + dead-letter queue and an IAM policy for EKS nodes.

- `${env}-sqs` and `${env}-sqs-dlq`, both KMS-encrypted (`alias/aws/sqs` by default).
- Redrive policy routes to the DLQ after `var.max_receive_count` (default 3). Defaults:
  14-day retention, 20s long-poll receive wait, 30s visibility timeout, 256 KiB max message.
- `${env}-sqs-access` IAM policy (send/receive/delete/get on both queues), attached to
  `var.eks_node_group_role_name` when provided.

Outputs expose queue URLs/ARNs/names, a combined `connection_info` object and `sqs_policy_arn`.

---

## cnpg-backups — CloudNativePG barman S3 backups + IRSA

`_modules/cnpg-backups`
provides object storage + IRSA for the shared in-cluster **CloudNativePG** Postgres cluster's
barman-cloud base backups and WAL archive. Deployed to **staging** (`staging/af-south-1/cnpg-backups`).

- Bucket `${env}-cnpg-backups-<account-id>`: public-access-block, versioning, AES256. Lifecycle
  **only** expires noncurrent versions (30d) and aborts incomplete multipart uploads (3d) — it
  deliberately never expires current objects because barman manages backup retention itself.
- IRSA role `${env}-cnpg-backups-role` trusting **one exact** service account,
  `system:serviceaccount:<cluster_namespace>:<cluster_service_account>` (defaults
  `database` / `postgres`), via `StringEquals` on the OIDC `sub`. Policy grants barman the
  bucket + object S3 actions (including multipart).
- The OIDC issuer is discovered from `data.aws_eks_cluster "<env>-eks"` (module needs the cluster
  to exist first; the leaf orders it after `../eks`).

Outputs: `bucket_name`, `destination_path` (`s3://<bucket>/`), `role_arn`, and
`service_account_annotations` for the CNPG `serviceAccountTemplate`. Uses inline `checkov:skip`
annotations to satisfy the repo's security gate.

---

## observability — Loki + Thanos S3 buckets and IRSA (AWS side)

`_modules/observability`
is intentionally minimal: it provisions **only the AWS-side object storage and IRSA** consumed by
the in-cluster kube-prometheus-stack / Loki / Thanos. Deployed to **prod** and **staging**.

| Resource | Detail |
| --- | --- |
| `aws_s3_bucket.loki` | `${env}-loki-<account-id>`, versioned, AES256 (long-term log storage) |
| `aws_s3_bucket.thanos` | `${env}-thanos-<account-id>`, versioned, AES256, IA→Glacier→Deep-Archive lifecycle, 7-year (`2555d`) expiration |
| `aws_iam_role.loki` | IRSA for `observability:loki`, S3 rw on the loki bucket |
| `aws_iam_role.thanos` | IRSA for `observability:thanos`, S3 rw on the thanos bucket |

Both roles' trust policies are built from the **live cluster's OIDC issuer** via
`data.aws_eks_cluster "<env>-eks"`. Lifecycle transition days are tunable
(`s3_lifecycle_days_to_ia/glacier/deep_archive`, `s3_lifecycle_expiration_days`).

Outputs: bucket names/ARNs, `loki_role_arn`/`thanos_role_arn`, and
`*_service_account_annotations` for wiring the IRSA role onto the Kubernetes service accounts.

!!! note "`oidc_provider_arn` is required but unused"
    The module declares a **required** `oidc_provider_arn` variable but never references it —
    the trust policies come from the data source. The prod leaf wires it from `dependency.eks`;
    the staging leaf hard-codes the staging OIDC provider ARN "for interface completeness"
    because the staging `eks` unit's node state is drift-abandoned (live staging nodes are an
    out-of-band managed nodegroup).

---

## openreplay — session-replay object storage, IRSA and app secrets

`_modules/openreplay`
backs self-hosted OpenReplay (session replay) with real S3 buckets (instead of the chart's
bundled MinIO), IRSA, and generated application secrets. Deployed to **staging**
(`staging/af-south-1/openreplay`).

- **Four buckets** via `for_each` — `recordings`, `assets`, `sourcemaps`, `spots` — named
  `${env}-openreplay-<class>-<account-id>`. Each: public-access-block, versioning, AES256, and a
  lifecycle that **expires** current objects after the class retention window (recordings/assets/
  spots = `recording_retention_days` = 30; sourcemaps = `sourcemaps_retention_days` = 90),
  expires noncurrent versions after 7d, and aborts incomplete uploads after 3d.
- IRSA role `${env}-openreplay-role` trusting **any** service account in `var.app_namespace`
  (`openreplay-app`) via a `StringLike` `sub` wildcard (OpenReplay spreads S3 access across ~11
  services). Policy grants list/location + object CRUD across all four buckets.
- **Application secrets**: `random_password` generates the Postgres password and seven JWT/assist
  keys, stored in Secrets Manager `${env}-openreplay-app-secrets` (7-day recovery window),
  consumed via External Secrets Operator. `checkov:skip` annotations document the accepted risks.

Outputs: `role_arn`, `bucket_names` map (→ `global.s3.*Bucket` Helm values),
`service_account_annotations`, and `app_secrets_arn`/`app_secrets_name`.

---

## pagerduty — shared "all-hands" alerting

`_modules/pagerduty`
is a general-purpose PagerDuty config (not VPN-specific — VPN is just the first consumer).
Deployed in the **network** account (`network/af-south-1/pagerduty`). Uses the `pagerduty`
provider, whose token comes from the `PAGERDUTY_TOKEN` env var (never committed).

- `pagerduty_team.this` ("the platform Engineering") with all `var.engineer_emails` as members
  (looked up by email via `data.pagerduty_user`, so IDs are never hard-coded).
- `pagerduty_escalation_policy.all_hands` — **pages everyone simultaneously** (no rotation); if
  no ack within `escalation_delay_minutes` (default 10) it re-pages, up to `escalation_num_loops`
  (default 3) times.
- One `pagerduty_service` + `pagerduty_service_integration` (Amazon CloudWatch vendor) per entry
  in `var.services`. The current leaf defines a single service, `aws-vpn-tunnels`.

Outputs: `team_id`, `escalation_policy_id`, `service_ids`, and the **sensitive**
`integration_keys` / `integration_urls` (SNS subscribes to the `…/enqueue` URL; CloudWatch OK
events auto-resolve incidents).

!!! note "Provider block quirk"
    `providers.tf` contains an empty `provider "pagerduty"` block; the `required_providers`
    pin lives in the Terragrunt-generated block (OpenTofu allows only one per module). See the
    module README.

---

## workspaces — Amazon WorkSpaces (module only)

`_modules/workspaces`
is a fully parameterised Amazon WorkSpaces module:

- Optional SimpleAD `aws_directory_service_directory` (`var.create_directory`) or an existing
  directory ID; `aws_workspaces_directory` with self-service permissions, device-access
  properties (web access toggle), and creation properties (internet access, local-admin).
- `aws_workspaces_workspace` with encryption, compute type (default `POWER`), volume sizes
  (user 100 GiB / root 175 GiB defaults), and `AUTO_STOP`/`ALWAYS_ON` running mode.
- Optional `aws_workspaces_ip_group` with dynamic rules.

!!! warning "Orphaned module"
    No Terragrunt leaf under `prod`, `staging` or `network` references `_modules/workspaces` —
    it is not currently instantiated anywhere in this tree.

---

## Cross-account & router-fleet IAM

### cross-account-grafana

`_modules/cross-account-grafana`
creates a `cross-account-grafana-access` role that the **shared-account Grafana** can assume to
read CloudWatch/Logs/EC2/Cost Explorer in the current account. Deployed in **prod**, **staging**
and **network** leaves.

- Trust: `arn:aws:iam::123456789012:role/shared-grafana-role` (shared account, **hard-coded**),
  gated by `sts:ExternalId = var.external_id` (default/leaf value `grafana-cross-account-access`).
- Policy: read-only CloudWatch (+ `PutMetricData`), CloudWatch Logs query, EC2 describe,
  `tag:GetResources`, `iam:ListAccountAliases`, `ce:GetCostAndUsage` — all `Resource = "*"`.

Outputs: `role_arn`, `role_name`. (The `environment` variable is accepted but unused in the module.)

### router-fleet-network-iam (network account)

`_modules/router-fleet-network-iam`
lives in the **network** account (`210987654321`) where the per-router
`routers/<endpoint>` Secrets Manager secrets are stored. It defines two cross-account roles, both
assumed from the **prod** EKS cluster (`777788889999`):

| Role | Assumed by | Permissions |
| --- | --- | --- |
| `router-fleet-secret-reader` | prod `ExternalSecretsRole` | `GetSecretValue`/`DescribeSecret` on `secret:routers/*` + `ListSecrets` (`*`) — External Secrets **syncs** credentials |
| `router-fleet-resolver` | prod `router-fleet-resolver` | `DescribeSecret`/`UpdateSecret` on `secret:routers/*` + `ListSecrets` (`*`), **no `GetSecretValue`** — resolver **reconciles** each secret's Description from inventory |

`ListSecrets` has no resource-level scoping, hence the `Resource = "*"` + `tfsec:ignore`.

### router-fleet-prod-iam (prod account)

`_modules/router-fleet-prod-iam`
is the **prod**-account (`777788889999`) side that lets the prod EKS cluster reach those network
secrets:

- `router-fleet-resolver` — an **EKS Pod Identity** role (trusts `pods.eks.amazonaws.com`) that
  can assume the network `router-fleet-resolver` role (`sts:AssumeRole` + `sts:TagSession` — Pod
  Identity attaches transitive session tags, so role-chaining requires `TagSession`).
- An inline policy on the **existing** `ExternalSecretsRole` granting it assume of the network
  `router-fleet-secret-reader` role.
- `aws_eks_pod_identity_association.resolver` binding `observability:router-fleet-resolver` on
  `prod-eks` to the resolver role.

Both router-fleet modules pin `terraform >= 1.5` / `aws >= 5.0` in their own `versions.tf`.

!!! danger "Out-of-band / state drift"
    Both router-fleet modules' headers state they **codify resources created out-of-band via
    CLI and have not been reconciled with state** (drift handled separately). `ExternalSecretsRole`
    itself is managed out-of-band. Treat plans against these leaves with care.

---

## Legacy and operational notes

The following were flagged while reading the modules. None have been changed by this page.

- **eks — four dead-code files.** `_iam_readonly.tf`, `_route53.tf`, `_config-fortigate.tf` and
  `_mikrotik.tf` are 100% commented out. `_eks-addons.tf` also carries several commented-out
  add-ons (CoreDNS, CloudWatch observability, pod-identity agent).
- **eks — hard-coded node AMI.** `_nodes.tf` pins `ami-06524d8dc46da1bbf`, overriding `var.ami`
  (set from `region.hcl` to an Ubuntu AMI). Nodes are self-managed `aws_instance` per-AZ, not a
  managed node group.
- **eks — ignored `map_users` input.** Both leaves pass `map_users`, but the module's `map_users`
  variable is commented out, so the input is silently dropped. `mikrotik_*` variables are still
  declared but their resources are commented out.
- **eks — wide-open cluster SG ingress** (`0.0.0.0/0`, all protocols) with
  `ignore_changes = [ingress]`.
- **observability — required-but-unused `oidc_provider_arn`** variable; staging hard-codes it and
  notes the staging `eks` node state is drift-abandoned.
- **rds — `storage_encrypted` defaults to false** ("to match existing unencrypted database");
  large commented-out "obs db" block at the bottom of `main.tf`; `zone_id` variable and
  `db_proxy_route53_fqdn` output commented out.
- **s3 — `github-actions-admin-role` grants `"*":"*"`**; the `s3-service-account` access key and
  its outputs are commented out.
- **cache — untagged resources** (tags/`common_tags` commented) and **hard-coded AZs**
  (`af-south-1a`/`1b`).
- **workspaces — orphaned**: no leaf references it.
- **s3-backups — no live leaf** in this tree (README points at a `shared/af-south-1` unit that
  isn't present).
- **router-fleet-network-iam / -prod-iam — out-of-band, unreconciled state** (per module headers);
  their auto-generated `README.md` TF-docs report provider **`6.53.0`**, which disagrees with the
  repo-pinned `6.36.0` in `root.hcl` (stale generated artifact).
- **cross-account-grafana — hard-coded shared-account role ARN** and an unused `environment`
  variable.
