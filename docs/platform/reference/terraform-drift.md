# Terraform / Terragrunt drift register

!!! info "Point-in-time snapshot — 2026-07-29"
    This page records the result of running `terragrunt plan` against **every AWS Terraform leaf
    environment** in this repo on 2026-07-29. It is a factual inventory of what each plan reported —
    what differs between the committed configuration and the deployed/refreshed state. It does **not**
    prescribe remediation. Treat it as a debt register to triage, not a runbook.

    A plan result reflects reality **at the time it ran**; re-run the plan for a leaf before acting on
    any entry here.

## Method & scope

- **Scope:** the 36 AWS leaves under `terraform/aws/{network,prod,staging}/af-south-1/`. The 8 Azure
  leaves under `terraform/azure/` were **excluded** from this pass.
- **Command:** `terragrunt plan -detailed-exitcode -lock=false -refresh=true` in each leaf directory,
  with the leaf's account credentials. Exit code `0` = no changes, `2` = changes present, `1` = plan
  could not complete.
- **Tooling:** Terragrunt 1.0.8, OpenTofu 1.12.1, AWS provider 6.36.0 (per `root.hcl`).
- **Auth:** AWS SSO per account (`network` / `prod` / `staging`); SOPS decryption via the
  operator Age key. Plans were refreshed against live AWS, so “changes” include both out-of-band drift
  and un-applied committed configuration — a plan alone cannot always distinguish the two.
- **Caveat:** the sweep ran with a shared provider plugin-cache and bounded parallelism. One leaf
  (`network/eip-failover-lambda`) hit a plugin-cache file-lock during a concurrent init; it was
  re-run sequentially and its true result (drift) is recorded below.

## Summary

| Account | Clean | Drift | Plan blocked | Not assessed | Total |
|---|---:|---:|---:|---:|---:|
| network | 3 | 4 | 3 | 1 | 11 |
| prod | 3 | 7 | 3 | 0 | 13 |
| staging | 2 | 10 | 0 | 0 | 12 |
| **Total** | **8** | **21** | **6** | **1** | **36** |

_“Plan blocked” = a code/reference defect stops the plan (real debt). “Not assessed” = a missing
plan-time credential (`pagerduty`) — see below. Azure (8 leaves) is out of scope for this pass._

Legend for the change lines below: `+N` create, `~N` update, `-N` destroy (OpenTofu's
`Plan: N to add, M to change, K to destroy`).

## Drift — plans proposing changes

Each heading is one leaf environment, with its plan summary and the nature of the difference. Bullets
are the concrete resource changes the plan reported.

### Network account (210987654321)

#### `vpn`

`terraform/aws/network/af-south-1/vpn` — **Plan: +0 / ~7 / -8** · _in-place attribute change_

- UPDATE aws_vpn_connection.managed_psk["client-e","client-e-site3","client-e-site2","client-d","client-c","client-b","client-a"] (7 resources, identical change) - tunnel1_rekey_margin_time_seconds 1800 -> 540 and tunnel2_rekey_margin_time_seconds 1800 -> 540
- DESTROY aws_vpn_connection.managed_psk["client-g-chr1"] and ["client-g-chr2"] - key not in for_each map
- DESTROY aws_customer_gateway.ignore_ip["client-g-chr1"] and ["client-g-chr2"] - key not in for_each map
- DESTROY aws_secretsmanager_secret.vpn_psk["client-g-chr1"] and ["client-g-chr2"] - key not in for_each map
- DESTROY aws_secretsmanager_secret_version.vpn_psk["client-g-chr1"] and ["client-g-chr2"] - key not in for_each map
- Output changes: customer_gateway_ids, vpn_connection_ids, vpn_psk_secret_arns, and vpn_tunnel_details each drop the client-g-chr1 and client-g-chr2 keys
- Warning (non-blocking): aws_vpn_gateway.this main.tf line 101 vpc_id derived from deprecated data.aws_region.current.name (use region instead)

#### `vpc`

`terraform/aws/network/af-south-1/vpc` — **Plan: +58 / ~6 / -0** · _new resources (config ahead of deployed infra)_

- CREATE aws_subnet.this[dev-app-a, dev-data-a, shared-app-a, shared-app-b, shared-data-a, shared-data-b] - 6 net-new subnets absent from state
- CREATE aws_route_table.subnet_az[dev-app-a, dev-data-a, network-management-a, network-management-b, prod-app-a, prod-app-b, prod-data-a, prod-data-b, shared-app-a, shared-app-b, shared-data-a, shared-data-b, staging-app-a, staging-app-b, staging-data-a, staging-data-b] - 16 net-new route tables
- CREATE aws_instance.mikrotik[0-1] and aws_instance.shared_mikrotik[0-1] - 4 t3.nano EC2 instances, ami-047eaed586771076a, key_name mikrotik-ssh-key, AZs af-south-1a/af-south-1b
- CREATE aws_network_interface.mikrotik_inside[0-1], aws_network_interface.mikrotik_outside[0-1], aws_network_interface.shared_mikrotik_inside[0-1], aws_network_interface.shared_mikrotik_outside[0-1] - 8 net-new ENIs
- CREATE aws_eip.mikrotik_outside[0-1] (Names staging-mikrotik-outside-eip-1/2) and aws_eip.shared_mikrotik_outside[0-1] (Names shared-mikrotik-outside-eip-1/2) - 4 net-new EIPs in af-south-1
- CREATE aws_eip_association.mikrotik_outside[0-1] and aws_eip_association.shared_mikrotik_outside[0-1] - 4 net-new EIP associations
- CREATE aws_route53_zone.private[dev, shared] and aws_route53_zone.public[dev, shared] - 4 net-new hosted zones (e.g. private name internal.dev.cpt.aws.example.net)
- CREATE aws_ram_resource_share.env_subnet_shares[dev, shared] - 2 net-new RAM resource shares
- CREATE aws_ram_principal_association.env_accounts_subnets[dev, shared] - 2 net-new RAM principal associations
- CREATE aws_ram_resource_association.env_subnets[dev-app-a, dev-data-a, shared-app-a, shared-app-b, shared-data-a, shared-data-b] - 6 net-new RAM resource associations
- CREATE aws_route.public[network-management-a, network-management-b] - 2 net-new routes
- UPDATE aws_subnet.this[network-outside-a, network-outside-b, staging-app-a, staging-app-b] - tags and tags_all drop kubernetes.io/cluster/staging-eks="shared" (-> null) and kubernetes.io/role/elb="1" (-> null)
- UPDATE aws_route53_record.subdomain_delegation[dev] - NS records [ns-1156.awsdns-16.org, ns-1878.awsdns-42.co.uk, ns-461.awsdns-57.com, ns-814.awsdns-37.net] -> (known after apply)
- UPDATE aws_route53_record.subdomain_delegation[shared] - NS records [ns-1072.awsdns-06.org, ns-1651.awsdns-14.co.uk, ns-382.awsdns-47.com, ns-752.awsdns-30.net] -> (known after apply)

#### `tunnel-trampoline`

`terraform/aws/network/af-south-1/tunnel-trampoline` — **Plan: +0 / ~1 / -0** · _in-place attribute change_

- UPDATE aws_lambda_function.trampoline (tunnel-trampoline) - source_code_hash MMgInwT/9k3M0fR421ZFI5Tt4mACqKx2zznZdvY4Bbs= -> SPfsbszJ5n6Fhlj513jYE7v3x6MfH1e0zOWahRNWjNg=; environment variables add DOWN_DRY_RUN=false, DOWN_PERSISTENCE_MINUTES=15, REMEDIATE_DOWN=true; last_modified 2026-07-08T10:02:14.000+0000 -> (known after apply)

#### `eip-failover-lambda`

`terraform/aws/network/af-south-1/eip-failover-lambda` — **Plan: +0 / ~1 / -0** · _in-place attribute change_

- UPDATE aws_cloudwatch_log_group.lambda_logs (lambda_logs) - retention_in_days 3 -> 14

### Prod account (777788889999)

#### `eks`

`terraform/aws/prod/af-south-1/eks` — **Plan: +30 / ~4 / -4** · _resource replacement_

- REPLACE aws_eks_cluster.this (prod-eks) - forced by bootstrap_self_managed_addons false -> true; also version 1.33 -> 1.32 (**downgrade — EKS does not support this; config must be updated to ≥1.33 before this plan is actionable**), enabled_cluster_log_types [] -> null
- REPLACE aws_iam_openid_connect_provider.eks - url attribute forces replacement, becomes known after apply (follows cluster replacement)
- REPLACE aws_instance.eks_node["prod-app-a"] and ["prod-app-b"] - instance_type c5a.4xlarge -> m5.2xlarge; user_data forces replacement (embedded cluster CA/apiserver-endpoint become known after apply)
- UPDATE in-place aws_eks_addon.kube_proxy, aws_eks_addon.kube_state_metrics, aws_eks_addon.metrics_server - add resolve_conflicts_on_update = OVERWRITE
- UPDATE in-place aws_iam_role.prometheus_node_exporter - assume_role_policy -> known after apply (OIDC federated principal ARN changes with OIDC provider replacement)
- CREATE 18 aws_ec2_tag on prod-app-a/b and prod-data-a/b subnets - Name (prod-app-1/2, prod-data-1/2), Environment=prod, Subnet=app/data, SubnetGroup=database (data subnets), kubernetes.io/cluster/prod-eks=shared (app subnets), kubernetes.io/role/internal-elb=1 (app subnets)
- CREATE aws_eks_addon.adot, aws_eks_addon.ebs_csi (aws-ebs-csi-driver), aws_eks_addon.external_dns, aws_eks_addon.vpc_cni
- CREATE aws_iam_role.aws_load_balancer_controller[0] (AmazonEKSLoadBalancerControllerRole) and aws_iam_role_policy_attachment.aws_load_balancer_controller[0] (AWSLoadBalancerControllerIAMPolicy)
- CREATE aws_iam_role.ebs_csi (prod-eks-ebs-csi-driver) and aws_iam_role_policy_attachment.ebs_csi (AmazonEBSCSIDriverPolicy)

#### `s3`

`terraform/aws/prod/af-south-1/s3` — **Plan: +7 / ~10 / -0** · _in-place attribute change_

- CREATE aws_cloudfront_response_headers_policy.frontend - new policy "security-headers-prod-af-south-1-frontend" with CSP, content_type_options, frame_options=DENY, referrer_policy=strict-origin-when-cross-origin, HSTS max-age 31536000 include_subdomains+preload
- CREATE aws_iam_group.backup_admins (backup-admins-prod) and aws_iam_group.backup_readers (backup-readers-prod)
- CREATE aws_iam_policy.backup_admin_policy (backup-admin-policy-prod, RW+ListBucket on example-prod-backups) and aws_iam_policy.backup_read_policy (backup-read-policy-prod, read-only)
- CREATE aws_iam_group_policy_attachment.admin_backup_policy and aws_iam_group_policy_attachment.readonly_backup_policy
- UPDATE aws_cloudfront_distribution.frontend - default_cache_behavior gains response_headers_policy_id (known after apply); ordered_cache_behavior for path_pattern "/s3img/*" (target example-prod-media S3, cache_policy 728e8a2b) removed; frontend s3-website origin removed and re-added dropping origin_ssl_protocols/custom_origin_config diff; geo_restriction restriction_type "none" -> "whitelist" with locations += "ZA"
- UPDATE aws_iam_role.github_actions_admin - assume_role_policy sub "repo:client-g-systems/platform-infra:environment:prod" -> "repo:example-org/platform-infra:environment:prod"
- UPDATE aws_iam_user.s3_service_account - force_destroy set false; tag/tags_all key "AKIA…(redacted)"="prod-aws-access-keys" removed
- UPDATE aws_s3_bucket_lifecycle_configuration.captures - rule "delete-old-files" status "Disabled" -> "Enabled"
- UPDATE aws_s3_bucket_policy.backups - existing rds-s3-export-role Allow statement changed to Deny * on aws:SecureTransport=false (s3:* actions); adds Allow statements for db-archival-service-prod+capture-events-app-role, SSO ReadOnly+Admin roles, and SSO Admin PutObject/DeleteObject/PutObjectAcl
- UPDATE aws_s3_bucket_policy.captures - removes "AllowCloudFrontServicePrincipal" statement (cloudfront.amazonaws.com s3:GetObject on example-prod-media/* for distribution EXAMPLEDIST001)
- UPDATE aws_s3_bucket_server_side_encryption_configuration for backups, frontend, metrics[0], captures - rule blocked_encryption_types ["SSE-C"] -> [] and bucket_key_enabled=false dropped (sse_algorithm stays AES256)

#### `observability`

`terraform/aws/prod/af-south-1/observability` — **Plan: +0 / ~2 / -0** · _provider-schema default churn_

- UPDATE aws_s3_bucket_server_side_encryption_configuration.loki and .thanos (identical change) - rule block re-created: blocked_encryption_types ["SSE-C"] -> []; bucket_key_enabled false -> removed (null); apply_server_side_encryption_by_default sse_algorithm AES256 unchanged

#### `rds`

`terraform/aws/prod/af-south-1/rds` — **Plan: +0 / ~2 / -0** · _in-place attribute change_

- UPDATE aws_db_instance.this - max_allocated_storage 300 -> 100; final_snapshot_identifier "prod-db-final-snapshot-2025-08-22-1145" -> (known after apply); enabled_cloudwatch_logs_exports marked changed (current audit,error,slowquery); password_wo (write-only attribute)
- UPDATE aws_security_group.proxy[0] - ingress rule replaced: old cidr_blocks 0.0.0.0/0 protocol -1 from_port 0 to_port 0 -> new cidr_blocks 10.0.0.0/8 protocol tcp from_port 3306 to_port 3306

#### `postgres`

`terraform/aws/prod/af-south-1/postgres` — **Plan: +0 / ~1 / -0** · _in-place attribute change_

- UPDATE aws_db_instance.this (in-place) - engine_version "17.9" -> "17.4"; password_wo shown as (write-only attribute)

#### `cache`

`terraform/aws/prod/af-south-1/cache` — **Plan: +0 / ~1 / -0** · _in-place attribute change_

- UPDATE aws_elasticache_replication_group.this (id prod-cache) - security_group_ids removes "sg-0d63c3d7220f5bd97" (1 other element unchanged/hidden)

#### `acm-certificates`

`terraform/aws/prod/af-south-1/acm-certificates` — **Plan: +0 / ~0 / -0** · _in-place attribute change_

- Out-of-band change on aws_acm_certificate.this (id arn:aws:acm:af-south-1:777788889999:certificate/aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa): status "PENDING_VALIDATION" -> "ISSUED"
- Output certificate_status "PENDING_VALIDATION" -> "ISSUED"; plan notes it saves new output values to state without changing real infrastructure (no Plan: line emitted)

### Staging account (444455556666)

#### `rds`

`terraform/aws/staging/af-south-1/rds` — **Plan: +2 / ~2 / -0** · _referenced resource missing in AWS_

- CREATE aws_db_instance.this - instance detected deleted outside OpenTofu (was id db-3HPUGEIUI6WR3CSQQSR5MPKLBM, identifier terraform-20250610141317126000000001, endpoint terraform-20250610141317126000000001.chyc4kaky287.af-south-1.rds.amazonaws.com:3306); plan recreates mysql 8.0 db.t4g.micro, allocated_storage 5, multi_az true, deletion_protection true, db_name capture_admin_portal
- CREATE aws_db_proxy_target.this[0] - new target for db_proxy_name staging-db, target_group_name default, db_instance_identifier/target_arn known after apply
- UPDATE aws_db_parameter_group.this (staging-db-pg) - adds tags Comment=Managed by Terraform/Environment=staging/Region=af-south-1 and 8 parameter blocks: innodb_io_capacity=2000, innodb_io_capacity_max=4000, long_query_time=2.0, slow_query_log=1, innodb_buffer_pool_instances=8, innodb_purge_threads=4, innodb_read_io_threads=8, innodb_write_io_threads=8
- UPDATE aws_route53_record.this (db.internal.staging.cpt.aws.example.net CNAME) - records changes from [terraform-20250610141317126000000001.chyc4kaky287.af-south-1.rds.amazonaws.com] -> (known after apply)

#### `s3`

`terraform/aws/staging/af-south-1/s3` — **Plan: +8 / ~7 / -0** · _new resources (config ahead of deployed infra)_

- CREATE aws_cloudfront_distribution.metrics[0] - new BI dashboard distribution, alias metrics-staging.example.com, origin example-staging-metrics.s3, ZA geo whitelist, ACM cert ffffffff-1111-2222-3333-ffffffffffff, web_acl_id ...frontend/88888888-1111-2222-3333-888888888888, default_root_object index.html
- CREATE aws_cloudfront_function.metrics_spa_index_rewrite[0] - viewer-request SPA index-rewrite function name metrics-staging-spa-index-rewrite, runtime cloudfront-js-2.0
- CREATE aws_cloudfront_origin_access_control.metrics[0] - OAC name oac-metrics-staging-af-south-1, origin type s3, signing_behavior always, signing_protocol sigv4
- CREATE aws_cloudfront_response_headers_policy.frontend - name security-headers-staging-af-south-1-frontend (CSP, content_type_options, frame_options DENY, referrer_policy, HSTS max-age 31536000 preload)
- CREATE aws_cloudfront_response_headers_policy.metrics[0] - name security-headers-staging-af-south-1-metrics (same CSP/HSTS/frame DENY set)
- CREATE aws_s3_bucket_policy.metrics[0] - bucket example-staging-metrics, policy known after apply
- CREATE aws_s3_bucket_public_access_block.metrics[0] - bucket example-staging-metrics, all four block flags true
- CREATE aws_s3_bucket_server_side_encryption_configuration.metrics[0] - bucket example-staging-metrics, rule sse_algorithm AES256
- UPDATE aws_cloudfront_distribution.frontend - default_root_object index.html -> null; tag/tags_all Name staging-cloudfront -> null; alias staging.example.com removed; geo_restriction location NL removed; ordered_cache_behavior path /s3img/* (target example-staging-media, cache_policy 77777777-...) removed; origin example-staging-media.s3 (origin_access_control_id EXAMPLEOAC001) removed; default_cache_behavior adds response_headers_policy_id (known after apply)
- UPDATE aws_iam_role.github_actions_admin - assume_role_policy StringLike sub repo:client-g-systems/platform-infra:environment:staging -> repo:example-org/platform-infra:environment:staging
- UPDATE aws_iam_user.s3_service_account - tag/tags_all key AKIA…(redacted) = prod-aws-access-keys removed
- UPDATE aws_s3_bucket_policy.captures - removes 3 statements: CloudFront OAC s3:GetObject for distribution EXAMPLEDIST002, AllowArchivesListBucket (s3:ListBucket prefix archives/), AllowArchivesDeleteObject (s3:DeleteObject archives/*)
- UPDATE aws_s3_bucket_server_side_encryption_configuration.backups, .frontend, .captures - rule.blocked_encryption_types ["SSE-C"] -> [] (identical change across 3 buckets)

#### `observability`

`terraform/aws/staging/af-south-1/observability` — **Plan: +13 / ~0 / -0** · _new resources (config ahead of deployed infra)_

- CREATE aws_iam_policy.loki - name "staging-loki-policy", description "IAM policy for Loki object storage"
- CREATE aws_iam_policy.thanos - name "staging-thanos-policy", description "IAM policy for Thanos object storage"
- CREATE aws_iam_role.loki - name "staging-loki-role", IRSA assume_role_policy for sub system:serviceaccount:observability:loki on OIDC provider oidc.eks.af-south-1.amazonaws.com/id/C65C6E32264792F916A6019ECB7B223E, max_session_duration 3600
- CREATE aws_iam_role.thanos - name "staging-thanos-role", IRSA assume_role_policy for sub system:serviceaccount:observability:thanos on same OIDC provider, max_session_duration 3600
- CREATE aws_iam_role_policy_attachment.loki - role staging-loki-role
- CREATE aws_iam_role_policy_attachment.thanos - role staging-thanos-role
- CREATE aws_s3_bucket.loki - bucket "staging-loki-444455556666", region af-south-1, force_destroy false
- CREATE aws_s3_bucket.thanos - bucket "staging-thanos-444455556666", region af-south-1, force_destroy false
- CREATE aws_s3_bucket_lifecycle_configuration.thanos - rule id "thanos_lifecycle" status Enabled, transitions 30d STANDARD_IA / 90d GLACIER / 365d DEEP_ARCHIVE, expiration days 2555
- CREATE aws_s3_bucket_server_side_encryption_configuration.loki - sse_algorithm AES256
- CREATE aws_s3_bucket_server_side_encryption_configuration.thanos - sse_algorithm AES256
- CREATE aws_s3_bucket_versioning.loki - versioning status Enabled
- CREATE aws_s3_bucket_versioning.thanos - versioning status Enabled
- Outputs added: loki_role_arn, loki_s3_bucket_arn, loki_s3_bucket_name=staging-loki-444455556666, loki_service_account_annotations, thanos_role_arn, thanos_s3_bucket_arn, thanos_s3_bucket_name=staging-thanos-444455556666, thanos_service_account_annotations

#### `images-cdn`

`terraform/aws/staging/af-south-1/images-cdn` — **Plan: +3 / ~1 / -0** · _new resources (config ahead of deployed infra)_

- CREATE aws_acm_certificate.cert[0] - certificate (arn ...certificate/cccccccc-1111-2222-3333-cccccccccccc) detected deleted outside OpenTofu; recreated for domain_name images.staging.example.com, validation_method DNS, subject_alternative_names [images.staging.example.com], region us-east-1
- UPDATE aws_cloudfront_cache_policy.images - comment "Capture images are immutable, so TTL to the max!" -> null; default_ttl 31536000 -> 600; max_ttl 31536000 -> 3600; min_ttl 31536000 -> 0
- CREATE aws_cloudfront_distribution.this - new distribution, aliases [images.staging.example.com], origin domain example-staging-media.s3.af-south-1.amazonaws.com, origin_access_control_id EXAMPLEOAC002, cache_policy_id 77777777-1111-2222-3333-777777777777, viewer_protocol_policy redirect-to-https
- CREATE aws_s3_bucket_policy.allow_oac - bucket example-staging-media

#### `acm-certificates`

`terraform/aws/staging/af-south-1/acm-certificates` — **Plan: +4 / ~0 / -0** · _new resources (config ahead of deployed infra)_

- CREATE aws_acm_certificate.this - domain_name "*.staging.cpt.aws.example.net", subject_alternative_names ["*.staging.cpt.aws.example.net","staging.cpt.aws.example.net"], validation_method "DNS", region "af-south-1"
- CREATE aws_acm_certificate_validation.this - certificate_arn/validation_record_fqdns known after apply, region "af-south-1"
- CREATE aws_route53_record.validation["*.staging.cpt.aws.example.net"] - zone_id "Z05747673GX8M42ZKCERI", ttl 60, allow_overwrite true
- CREATE aws_route53_record.validation["staging.cpt.aws.example.net"] - zone_id "Z05747673GX8M42ZKCERI", ttl 60, allow_overwrite true

#### `api-cdn`

`terraform/aws/staging/af-south-1/api-cdn` — **Plan: +1 / ~1 / -0** · _in-place attribute change_

- UPDATE aws_cloudfront_distribution.this (in-place) - aliases ["metrics-staging.example.com"] -> ["metrics-staging-api.example.com"]; comment "platform staging (metrics-staging.example.com)" -> "public-api staging (metrics-staging-api.example.com)"; default_root_object "index.html" -> null (removed); web_acl_id added = arn:aws:wafv2:us-east-1:444455556666:global/webacl/waf-staging-af-south-1-frontend/88888888-1111-2222-3333-888888888888
- UPDATE aws_cloudfront_distribution.this default_cache_behavior - allowed_methods adds DELETE/OPTIONS/PATCH/POST/PUT; cache_policy_id 658327ea-f89d-4fab-a63d-7e88639e58f6 -> 4135ea2d-6df8-44a3-9df3-4b5a84be39ad; origin_request_policy_id added = 66666666-1111-2222-3333-666666666666; target_origin_id "example-staging-metrics.s3.af-south-1.amazonaws.com" -> "metrics-api.staging.cpt.aws.example.net"; function_association replaced (removes function_arn metrics-staging-spa-index-rewrite, adds new arn known-after-apply)
- UPDATE aws_cloudfront_distribution.this - ordered_cache_behavior (path_pattern "/api/*", target_origin_id metrics-api.staging.cpt.aws.example.net) removed; one origin block removed and one origin block added (sensitive contents hidden); viewer_certificate acm_certificate_arn ffffffff-1111-2222-3333-ffffffffffff -> 99999999-1111-2222-3333-999999999999
- CREATE aws_cloudfront_function.add_api_prefix - name metrics-staging-api-add-api-prefix, runtime cloudfront-js-2.0, publish true, prepends /api to /dashboard/* requests

#### `openreplay`

`terraform/aws/staging/af-south-1/openreplay` — **Plan: +0 / ~4 / -0** · _provider-schema default churn_

- UPDATE aws_s3_bucket_server_side_encryption_configuration.this["assets"], ["recordings"], ["sourcemaps"], ["spots"] (4 identical) - rule block rewritten: blocked_encryption_types ["SSE-C"] -> [], bucket_key_enabled false -> null (removed); apply_server_side_encryption_by_default sse_algorithm stays AES256

#### `cnpg-backups`

`terraform/aws/staging/af-south-1/cnpg-backups` — **Plan: +0 / ~1 / -0** · _provider-schema default churn_

- UPDATE aws_s3_bucket_server_side_encryption_configuration.this - rule block rewritten: blocked_encryption_types ["SSE-C"] -> [], bucket_key_enabled false -> null (removed); apply_server_side_encryption_by_default sse_algorithm stays AES256

#### `eks`

`terraform/aws/staging/af-south-1/eks` — **Plan: +0 / ~1 / -0** · _in-place attribute change_

- UPDATE aws_eks_addon.adot (in-place) - tags and tags_all add "Comment"="Managed by Terraform", "Environment"="staging", "Region"="af-south-1"

#### `cache`

`terraform/aws/staging/af-south-1/cache` — **Plan: +0 / ~1 / -0** · _in-place attribute change_

- UPDATE aws_elasticache_replication_group.this (in-place) - node_type "cache.t3.small" -> "cache.t3.micro"

## Plans that cannot run

These leaves are themselves technical debt: `terragrunt plan` aborts, so their configuration cannot be
validated or drift-checked at all. The stated reason is the actual error that stopped the plan.

### Network account (210987654321)

- **`config-fortigate`** (`terraform/aws/network/af-south-1/config-fortigate`) — _dependency / init failure_  
  The plan aborted because Terragrunt could not resolve the "hub" dependency: the referenced module directory terraform/aws/network/af-south-1/hub does not exist, leaving the dependency.hub.outputs and dependency.vpc.outputs references in config-fortigate/terragrunt.hcl (lines 43-46) as unknown variables.
- **`config-mikrotik`** (`terraform/aws/network/af-south-1/config-mikrotik`) — _dependency / init failure_  
  Terragrunt could not resolve dependency "hub" because its module directory terraform/aws/network/af-south-1/hub does not exist, so dependency.hub.outputs.{mikrotiks,fortigates,chrs} referenced at terragrunt.hcl lines 43-45 resolved to no "dependency" variable, halting the plan.
- **`router-fleet-network-iam`** (`terraform/aws/network/af-south-1/router-fleet-network-iam`) — _dependency / init failure_  
  tofu init failed with "Duplicate required providers configuration": required_providers is declared in both versions.tf line 3 and provider.tf line 5, and a module may have only one.

### Prod account (777788889999)

- **`config-mikrotik`** (`terraform/aws/prod/af-south-1/config-mikrotik`) — _dependency / init failure_  
  tofu init failed because the module config is invalid: the routeros provider block uses for_each = var.chr_instances with alias = each.key and resources reference provider = routeros[each.key], which OpenTofu rejects (provider for_each requires a static alias, variables not allowed in alias, and instance-key provider references require an aliased provider), compounded by a duplicate required_providers block at provider.tf line 5 already defined in main.tf.
- **`load-balancers`** (`terraform/aws/prod/af-south-1/load-balancers`) — _referenced resource missing in AWS_  
  The data source data.aws_s3_bucket.logs[0] (s3_logs.tf line 5) failed with "reading S3 Bucket (example-logs-prod): couldn't find resource" because S3 bucket example-logs-prod does not exist, aborting the plan with exit status 1.
- **`router-fleet-prod-iam`** (`terraform/aws/prod/af-south-1/router-fleet-prod-iam`) — _dependency / init failure_  
  tofu init failed with "Duplicate required providers configuration" because required_providers is declared in both versions.tf line 3 and provider.tf line 5.

## Clean — no changes

These leaves planned cleanly (exit code `0`, no drift) at the time of the snapshot:

- **network:** `cross-account-grafana`, `vpn-alerting`, `vpn-metrics-network-iam`
- **prod:** `api-cdn`, `cross-account-grafana`, `vpn-metrics-prod-iam`
- **staging:** `cross-account-grafana`, `external-dns`

## Not assessed

Leaves whose plan could not be evaluated for reasons **other** than a code/infra defect — a missing
plan-time credential or an out-of-scope stack. Neither confirmed clean nor confirmed drifted.

- **`pagerduty`** (`terraform/aws/network/af-south-1/pagerduty`) — the `pagerduty` provider reads its
  API token from the `PAGERDUTY_TOKEN` environment variable (by design, never committed; sourced from
  1Password at plan time). That variable was not set for this sweep, so `plan` aborted with “No valid
  credentials found for PagerDuty provider.” This is an environmental prerequisite, not drift.
- **Azure** (`terraform/azure/prod/southafricanorth/` — 8 leaves: `avd`, `dns`, `nsg`, `rg`, `rt`,
  `sa`, `vm`, `vnet`) was excluded from this pass and carries no entry here either way.

