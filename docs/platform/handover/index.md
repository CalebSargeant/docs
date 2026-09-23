# Handover

This section is the durable, self-service documentation for the platform areas being handed over — so the topics can be covered without anyone having to write fresh docs each time. It maps each handover topic to where it is documented and, importantly, states the **responsibility boundaries**.

## Topics and where they live

| Handover topic | Documented in |
|----------------|---------------|
| **Infrastructure** (Terraform, EKS/GitOps, AWS + Azure, observability, data stores) | The whole [Reference](../reference/capture-platform.md) section — start with the [Terragrunt foundation](../reference/terraform-overview.md) and [GitOps with Flux](../reference/gitops-flux.md) |
| **CI/CD pipelines & Slack notifications** | [CI/CD & Slack notifications](cicd-and-notifications.md) |
| **Client networking (VPN boundary)** | [Client VPN — the handover boundary](client-vpn.md) |

## Scope notes

!!! note "Infrastructure"
    Infrastructure is covered in depth in the **Reference** section — there is no separate handover write-up because the reference pages already document every subsystem (grounded in the actual files). Use the [architecture overview](../architecture.md) as the entry point and drill into the Reference pages from there.

!!! note "Client networking is mostly general knowledge"
    General client-side networking is **not** documented here — it is standard networking that any competent engineer already knows. The one thing that *is* platform-specific, and therefore documented, is the **boundary**: the Terraform that provisions the AWS side of each client Site-to-Site VPN and the MikroTik RouterOS `.rsc` config that is generated and handed to the client (analogous to the config file AWS Site-to-Site VPN hands you for your own CPE). See [Client VPN](client-vpn.md).

!!! tip "CI/CD is deliberately light"
    The pipelines in this repo are the org's shared tools — **Security Gate** (the MegaLinter-backed security scan) and **Release Workflows** (semantic-release versioning). Their internals live in their own repositories; this section points to them rather than duplicating them. Pipelines in the *other* `example-org` repos are ordinary GitHub Actions. The substantive, platform-specific part — the **Slack/alerting notifications** — is documented fully.
