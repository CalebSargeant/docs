# Setup

## Prerequisites

```bash
# Kubernetes
brew install kubectl kubectx kustomize helm flux
# IaC
brew install terraform terragrunt
# Automation + cloud
brew install ansible awscli
# Secrets
brew install age sops
# Hooks
brew install pre-commit
```

## AWS access

```bash
aws sso login
awsp                                  # interactive profile selector
aws eks update-kubeconfig --region af-south-1 --name staging-eks \
  --kubeconfig ~/.kube/staging.yaml
kubectx staging                    # or prod
```

## Pre-commit hooks

```bash
pre-commit install                    # installs pre-commit + pre-push hooks
pre-commit run --all-files            # run the full security-gate hook set once
```

The hooks mirror the CI security gate (shellcheck, actionlint, hadolint, kustomize, trivy, trufflehog, semgrep, checkov, and language audits). Bypass with `--no-verify` only in emergencies.

!!! note "Commit messages matter"
    Versioning is automated via [Conventional Commits](https://www.conventionalcommits.org/): `feat:` → minor, `fix:`/`perf:`/`chore:` → patch. Do **not** hand-edit the version in `pyproject.toml` or `CHANGELOG.md`.

## Day-to-day

```bash
# Kubernetes / Flux
kubectl kustomize kubernetes/apps/utils/base      # validate a kustomization
flux get kustomizations                           # GitOps status
flux reconcile kustomization <name> --with-source # force a sync

# Terraform / Terragrunt (from a leaf component dir)
cd terraform/aws/prod/af-south-1/<component>
terragrunt plan
terragrunt apply

# Ansible
cd ansible
ansible-playbook -i _hosts.yaml k8s_bootstrap_staging_cpt.yaml
```

!!! important "No image builds here"
    This repository does not build container images — that moved to the sibling repo **`platform-utils`**. Application manifests live in each app's own repo. See [Architecture](architecture.md).

## Previewing these docs

```bash
pip install mkdocs-material
mkdocs serve      # live preview at http://127.0.0.1:8000
mkdocs build      # render static site into ./site (git-ignored)
```
