# Platform engineering reference

A complete, genericised reference for a production multi-cloud platform: how it is
provisioned with Terraform/Terragrunt, delivered with FluxCD, bootstrapped with Ansible,
secured with SOPS and External Secrets, observed with Prometheus/Thanos/Loki, and
operated day to day.

These pages are a scrubbed copy of the internal documentation for a real system, namely
roughly 800 edge cameras uploading captured images into a set of microservices on two EKS
clusters. Names, accounts, addresses and customer identities have been replaced with
generic placeholders. The architecture, the file layouts, the command sequences and the
reasoning behind each decision are intact.

!!! info "How to read the repository references"
    The pages describe two repositories, and refer to them the way the original docs did:

    - **`platform-infra`** is the infrastructure monorepo: Terragrunt live environments,
      Flux manifests, Ansible playbooks and encrypted secrets. When a page says
      "this repo", it means this one.
    - **`platform-utils`** is the companion repo that builds the small utility container
      images (exporters, reconcilers, housekeeping jobs) the platform runs.

    Application source and Kubernetes `Deployment` manifests live in each application's
    own repository. The infra repo holds only the Flux wiring and image automation that
    points at them.

## The toolchains

| Toolchain | Path | Role |
|-----------|------|------|
| **Terraform / Terragrunt** | `terraform/` | Provisions AWS + Azure (EKS, VPC, RDS/Postgres, S3, VPN, DNS, AVD…) |
| **FluxCD (Kustomize)** | `kubernetes/` | GitOps deployment to the clusters |
| **Ansible** | `ansible/` | Cluster bootstrapping and fleet operations |
| **SOPS + Age** | `sops/` | Encrypted secrets, decrypted by Flux at apply time |

## Where to start

- **[Architecture](architecture.md)** shows how the Kubernetes and Terraform trees are
  laid out and wired together. Read this first.
- **[Environments](reference/environments.md)** puts prod, staging and dev side by side:
  accounts, CIDRs, cluster versions, and what exists where.
- **[Setup](setup.md)** and **[Onboarding & access](onboarding.md)** cover the tools, SSO,
  kubeconfig, commit hooks and the day-to-day commands.
- **[The edge capture platform](reference/capture-platform.md)** describes the
  application domain the whole estate exists to serve.

## What is in each section

| Section | Covers |
|---------|--------|
| **[Reference](reference/index.md)** | The subsystem-by-subsystem documentation: Terraform, networking, GitOps, Kubernetes workloads, observability, data services, secrets, releases, incident response and rollback. |
| **[Handover](handover/index.md)** | The material an incoming team needs: pipelines and alert notifications, the client VPN boundary, and offboarding/revocation. |
| **[Utilities](utils/index.md)** | The companion repo's exporters, router-fleet tooling, capture utilities, storage jobs and cluster housekeeping. |
| **[Runbooks](runbooks/index.md)** | Step-by-step operational procedures: Flux bootstrap, SOPS decryption failures, node disk cleanup, RDS snapshot export, MikroTik IPsec and GitHub App setup. |

!!! note "Placeholders used throughout"
    AWS account IDs (`111122223333`, `444455556666`, `777788889999`, `123456789012`,
    `210987654321`), the `example.com` / `aws.example.net` / `az.example.net` domains,
    customer keys (`client-a` through `client-i`), engineer handles and every public IP
    address are fictional stand-ins. Cloud region names, third-party product names and
    AWS-owned account IDs are real, because the technical detail depends on them.
