# Reference

Subsystem-by-subsystem documentation for the platform. Every page is grounded in the
files it describes: the Terragrunt leaves, the Flux manifests, the Ansible playbooks and
the module source.

## Start here

- **[The edge capture platform](capture-platform.md)** covers the application domain: the
  camera fleet, the ingest path, the worker services, and the two deployment models.
- **[Environments](environments.md)** puts prod, staging and dev side by side: accounts,
  CIDRs, cluster versions, and which Terraform leaves exist where.
- **[AWS accounts & access](aws-accounts.md)** explains the five-account layout and the
  SSO permission sets that reach them.

## Infrastructure as code

| Page | Covers |
|------|--------|
| [Terragrunt foundation](terraform-overview.md) | The root configuration, generated backends and providers, the environment map, and the live component inventory. |
| [State & backends](terraform-state.md) | Remote state layout, locking, and the state-surgery commands. |
| [AWS network & edge](terraform-aws-network-edge.md) | VPC, transit, Site-to-Site VPN, CloudFront, WAF, Route53 and the alerting Lambdas. |
| [AWS platform & data](terraform-aws-platform-data.md) | EKS, RDS, ElastiCache, S3, IRSA and the data-tier modules. |
| [Azure](terraform-azure.md) | The Azure estate: resource groups, VNet, NSGs, storage and virtual desktop. |
| [Network addressing (IPAM)](network-addressing.md) | The authoritative CIDR register across both clouds and every client site. |
| [Drift register](terraform-drift.md) | Known differences between committed configuration and deployed reality. |
| [Tagging & cost](tagging-and-cost.md) | Tag conventions and cost-allocation posture. |

## Kubernetes and delivery

| Page | Covers |
|------|--------|
| [GitOps with Flux](gitops-flux.md) | Bootstrap roots, sources, Kustomizations, and image automation. |
| [Applications](kubernetes-apps.md) | The Flux wiring for each application repo. |
| [Utility workloads](kubernetes-utils.md) | The CronJobs, exporters and reconcilers that run from the infra repo. |
| [Controllers & configs](kubernetes-controllers.md) | cert-manager, external-dns, external-secrets, tunnels and image-pull config. |
| [Observability](kubernetes-observability.md) | Prometheus, Thanos, Loki, Grafana, blackbox probes and the exporter fleet. |
| [Data services](kubernetes-data-services.md) | CloudNativePG, Postgres, Valkey, MinIO and the stateful tier. |
| [Security & AppSec services](kubernetes-security-services.md) | SonarQube, DefectDojo, Dependency-Track, runners and session replay. |
| [Releases & promotion](releases-and-promotion.md) | How application images are versioned, published and promoted. |

## Operations

| Page | Covers |
|------|--------|
| [Ansible](ansible.md) | Inventory, playbooks and roles for cluster bootstrap and fleet operations. |
| [CI/CD & tooling](cicd-and-tooling.md) | Workflows, the security gate, pre-commit and the supporting automation. |
| [Alerting & on-call](alerting-and-on-call.md) | Alert inventory, routing, escalation and silences. |
| [Incident response](incident-response.md) | Severities, comms, and the first-response playbooks. |
| [Rollback procedures](rollback.md) | Undoing a bad change at each layer of the stack. |
| [Backup & disaster recovery](backup-and-restore.md) | What is backed up, where, and how to restore it. |
| [Secrets (SOPS + Age)](secrets-sops.md) | The encrypted-secret workflow and how Flux decrypts it. |
| [Secret stores & key custody](secret-stores.md) | Every place secret material lives, and the rotation blast radius. |
| [DNS & certificates](dns-and-certificates.md) | Zones, records, issuance and the certificate inventory. |
| [Legacy & orphans](legacy-and-orphans.md) | Dead code, stale trees and known technical debt. |
