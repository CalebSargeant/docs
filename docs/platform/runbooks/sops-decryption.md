# Troubleshooting: SOPS Decryption Errors in Flux

## Problem

Flux fails to reconcile with error:
```
Secret/flux-system/ghcr-credentials is SOPS encrypted, configuring decryption is required for this secret to be reconciled
```

## Root Cause

The `flux-system` Kustomization in the cluster is missing the `decryption` configuration spec. This creates a chicken-and-egg problem:
- Flux needs the decryption config to decrypt SOPS-encrypted secrets
- But Flux can't update its own Kustomization because reconciliation fails on the encrypted secrets

## Diagnosis Steps

1. **Check if decryption config exists in cluster:**
   ```bash
   kubectl get kustomization flux-system -n flux-system -o jsonpath='{.spec.decryption}'
   ```
   If output is empty, the decryption config is missing.

2. **Verify SOPS secret exists:**
   ```bash
   kubectl get secret sops-age -n flux-system
   ```

3. **Check Flux logs:**
   ```bash
   kubectl logs -n flux-system deployment/kustomize-controller --tail=50 | grep -i sops
   ```

## Solution

### 1. Ensure SOPS age key secret exists

```bash
kubectl create secret generic sops-age \
  --namespace=flux-system \
  --from-file=identity.agekey=~/.sops.agekey \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2. Manually patch the flux-system Kustomization

Since Flux can't update itself when stuck, manually add the decryption config:

```bash
kubectl patch kustomization flux-system -n flux-system --type=merge \
  -p '{"spec":{"decryption":{"provider":"sops","secretRef":{"name":"sops-age"}}}}'
```

### 3. Force reconciliation

```bash
flux reconcile kustomization flux-system --with-source
```

## Prevention

Ensure `gotk-sync.yaml` includes the decryption configuration:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: flux-system
  namespace: flux-system
spec:
  # ... other config ...
  decryption:
    provider: sops
    secretRef:
      name: sops-age
```

!!! warning "Two secret names are in use, and the difference is deliberate"
    Do not standardise on one name without changing the manifests to match. Today:

    - **`sops-age`** — used by the **cluster root** `Kustomization` in
      `kubernetes/overlays/<cluster>/flux-system/gotk-sync.yaml`.
    - **`sops-keys`** — used by the **per-app decryption patch** in each cluster's
      `kustomization.yaml`, and the name the Ansible bootstrap roles create.

    Both must exist in `flux-system` for a cluster to reconcile everything. See
    [How Flux decrypts SOPS](../reference/secrets-sops.md#4-how-flux-decrypts-sops) for the full wiring.

!!! note "`sops-age` is not created by the bootstrap roles"
    The Ansible roles create `sops-keys` only, so after a fresh bootstrap or re-bootstrap the
    `sops-age` secret must be created manually using the command above. This is the most common
    cause of a cluster root that reconciles nothing after a rebuild.

## Related Files

- `kubernetes/overlays/*/flux-system/gotk-sync.yaml` - Contains the Kustomization with decryption config
- `kubernetes/overlays/*/flux-system/ghcr-secret.yaml` - SOPS-encrypted container registry credentials
- `kubernetes/overlays/*/flux-system/github-app-secret.yaml` - SOPS-encrypted GitHub App credentials
