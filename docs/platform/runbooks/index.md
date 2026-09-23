# Runbooks

Step-by-step operational procedures. Each one is written to be followed under pressure:
the commands are literal, the checks are explicit, and the failure modes are named.

| Runbook | When you need it |
|---------|------------------|
| [Flux bootstrap](flux-bootstrap.md) | Standing up GitOps on a new or rebuilt cluster, from `flux bootstrap` through to verified reconciliation. |
| [SOPS decryption failures](sops-decryption.md) | A Flux `Kustomization` is applying secrets as ciphertext, or decryption is failing outright. |
| [Node disk cleanup](eks-node-disk-cleanup.md) | A node is under disk pressure: logs, journal and unused container images. |
| [RDS snapshot export](rds-snapshot-export.md) | Exporting an encrypted RDS snapshot to S3 for analysis or restore. |
| [MikroTik IPsec](vpn-mikrotik-ipsec.md) | A Site-to-Site VPN tunnel is wedged, or lifetimes and DPD need aligning with the AWS side. |
| [GitHub App setup](github-app-setup.md) | Wiring a GitHub App so Flux can authenticate to the source repositories. |
| [Camera site allow-list](camera-site-allow-list.md) | The RouterOS firewall rules a site needs so cameras and platform can reach each other. |

!!! tip "Related reference material"
    Runbooks assume the background is already understood. For the why behind these steps,
    see [GitOps with Flux](../reference/gitops-flux.md),
    [Secrets (SOPS + Age)](../reference/secrets-sops.md),
    [Rollback procedures](../reference/rollback.md) and
    [Incident response](../reference/incident-response.md).
