# Flux Bootstrap Procedure

This document outlines the clean bootstrap procedure for FluxCD on new clusters, based on lessons learned from staging environment issues.

For how application repositories connect to Flux (and where manifests live), see `kubernetes/docs/gitops-apps.md`.

## Overview

FluxCD bootstrap has a dependency challenge: flux pods need calico networking to start, but calico is deployed by flux kustomizations. This procedure addresses this chicken-and-egg problem.

## Prerequisites

1. **Kubernetes cluster** is running and accessible via kubectl
2. **Flux CLI** is installed (`brew install fluxcd/tap/flux`)
3. **GitHub token** with repository access
4. **SOPS/Age keys** for secret decryption
5. **SSH keys** for repository access

## Bootstrap Steps

### 1. Pre-Bootstrap: Apply Critical Infrastructure

!!! warning "This step applies to the Ansible-provisioned on-prem path, not to EKS"
    The Calico and `common/` steps below come from the on-prem cluster path (see
    [Ansible](../reference/ansible.md)). They do **not** apply to the EKS clusters:

    - **EKS** (`prod-cpt-aws`, `staging-cpt-aws`) gets its CNI and kube-proxy from managed EKS
      add-ons provisioned by Terraform (`aws_eks_addon.vpc_cni`, `aws_eks_addon.kube_proxy` in
      `terraform/aws/_modules/eks/_eks-addons.tf`), so there is no CNI ordering problem to break.
      Skip to [step 2](#2-bootstrap-flux) and run `flux bootstrap` directly.
    - A `common/` overlay exists **only** for `staging-cpt-aws`, and currently contains
      cert-manager only — there is no `common/` under `prod-cpt-aws`. Running
      `kubectl apply -k common/` from the prod overlay will fail.

Before flux bootstrap on the on-prem cluster, manually apply the common resources to break the
dependency cycle:

```bash
# Navigate to the overlay directory
cd kubernetes/overlays/<environment>/

# Apply common resources first (cert-manager; nginx/ghcr entries are currently commented out)
kubectl apply -k common/

# Wait for calico to be ready
kubectl wait --for=condition=Ready pods -l k8s-app=calico-node -n kube-system --timeout=300s
kubectl wait --for=condition=Ready pods -l k8s-app=calico-kube-controllers -n kube-system --timeout=300s

# Verify CoreDNS is working (restart if needed)
kubectl rollout status deployment/coredns -n kube-system
# If DNS issues: kubectl rollout restart deployment/coredns -n kube-system
```

### 2. Bootstrap Flux

```bash
# Bootstrap flux with the environment-specific path
flux bootstrap github \
  --owner=example-org \
  --repository=platform-infra \
  --branch=main \
  --path=kubernetes/overlays/<environment> \
  --personal
```

### 3. Configure SOPS Decryption

```bash
# Create age key secret for SOPS decryption
kubectl create secret generic sops-keys \
  --namespace=flux-system \
  --from-file=identity.agekey=<path-to-age-key>
```

### 4. Verify Bootstrap

```bash
# Check flux status
flux check

# Verify all kustomizations
flux get kustomizations

# Check that all controllers are running
kubectl get pods -n flux-system
```

## Environment-Specific Paths

- **Production**: `kubernetes/overlays/prod-cpt-aws`
- **Staging**: `kubernetes/overlays/staging-cpt-aws`
!!! note "Only two overlays exist today"
    `kubernetes/overlays/` contains `prod-cpt-aws` and `staging-cpt-aws` only. An
    `office-cpt-onprem` overlay is referenced in some older material but is not present in this
    repository; treat any reference to it as historical.

## Common Issues & Solutions

### 1. Pods Stuck in ContainerCreating
**Symptom**: Flux pods show `ContainerCreating` status indefinitely
**Cause**: Calico networking not ready
**Solution**: Apply common resources first (step 1)

### 2. DNS Resolution Failures
**Symptom**: `failed to checkout and determine revision: dial tcp: lookup github.com: server misbehaving`
**Cause**: CoreDNS issues after calico installation
**Solution**: Restart CoreDNS: `kubectl rollout restart deployment/coredns -n kube-system`

### 3. Kustomization Build Failures
**Symptom**: `may not add resource with an already registered id`
**Cause**: Multiple kustomization files with same metadata name
**Solution**: Use single kustomization approach with patch references

### 4. Namespace Termination Issues
**Symptom**: `flux-system` namespace stuck in `Terminating`
**Solution**: Remove finalizers from stuck resources:
```bash
kubectl patch kustomization <name> -n flux-system -p '{"metadata":{"finalizers":null}}' --type=merge
```

## Ansible Automation

### Current Roles
- `k8s-fluxcd-bootstrap`: Handles flux bootstrap
- `k3s-sops-age-secret`: Configures SOPS decryption

### Recommended Automation Updates

1. **Add pre-bootstrap step** to apply common resources
2. **Add health checks** for calico and CoreDNS
3. **Add retry logic** for DNS resolution issues
4. **Validate kustomization structure** before bootstrap

## Production Checklist

- [ ] Cluster is ready and kubectl configured
- [ ] Environment-specific overlay exists (`kubernetes/overlays/prod-cpt-aws/`)
- [ ] Common resources validated (`kubectl kustomize common/`)
- [ ] Apps kustomizations validated (`kubectl kustomize apps/`)
- [ ] SOPS age key available
- [ ] GitHub token with repository access
- [ ] SSH deploy key configured in GitHub repository
- [ ] DNS resolution working from cluster pods

## Directory Structure

```
kubernetes/overlays/<environment>/
├── flux-system/
│   ├── kustomization.yaml
│   ├── gotk-components.yaml
│   ├── gotk-sync.yaml
│   └── flux-kustomizations.yaml
├── common/
│   └── kustomization.yaml (→ ../../../_common/*)
└── apps/
    └── <application>/
        ├── kustomization.yaml (single file, references base + patches)
        └── <component>/
            └── *.yaml (patch files only)
```

## Key Principles

1. **Single source of truth**: One flux bootstrap per cluster
2. **Dependency order**: Common infrastructure before flux
3. **Simple kustomizations**: Avoid nested kustomization references
4. **Health validation**: Always verify critical components before proceeding
5. **Idempotent operations**: All steps should be safely repeatable

## Recovery Procedure

If flux becomes completely broken:

1. **Clean up flux-system namespace**:
   ```bash
   kubectl delete namespace flux-system --force --grace-period=0
   ```

2. **Remove flux finalizers** if namespace is stuck:
   ```bash
   kubectl patch kustomization <name> -n flux-system -p '{"metadata":{"finalizers":null}}' --type=merge
   ```

3. **Follow bootstrap procedure** from step 1 — on EKS, that means starting at
   [step 2](#2-bootstrap-flux); the pre-bootstrap step is on-prem only.

4. **Restore SOPS decryption.** `flux bootstrap` does not recreate the decryption secret. Re-create
   it before the root `Kustomization` can reconcile anything encrypted — see
   [Secrets (SOPS + Age)](../reference/secrets-sops.md) for which secret name each cluster expects
   (`sops-age` at the cluster root, `sops-keys` for the per-app patch) and
   [SOPS decryption troubleshooting](sops-decryption.md).

This ensures a clean, reproducible flux deployment for production environments.

!!! warning "Re-bootstrapping requires the Age private key"
    Without it the cluster cannot decrypt anything and this procedure cannot complete. Confirm you
    have access to the key **before** deleting `flux-system`. See
    [Secret stores](../reference/secret-stores.md) for custody.

!!! note "Not yet rehearsed"
    This procedure has not been recorded as tested against a live cluster. Treat timings as
    unverified and prefer rehearsing on staging first. Record the outcome here once it has been
    exercised.
