# Incident response

How the platform runs an incident once something is already broken: how badly it counts, who
does what, which runbook applies, who gets told, and what is written down afterwards.

This page is the **process** layer. The **paging** layer — which alerts exist, where each
one is routed, the all-hands escalation policy, how to acknowledge a page, and how to test
the pipeline without a real outage — is documented in
[Alerting & on-call](alerting-and-on-call.md) and is not repeated here.

Much of what follows is a **proposal to be agreed**, not established practice. It is
written in the standard shape (severity levels, an incident lead, a blameless postmortem)
so that adopting it is a decision rather than a design exercise; where a convention is
industry-standard this page links out rather than re-explaining it.

## What exists today

| Layer | Status |
|---|---|
| **Paging** | One PagerDuty service, **"AWS VPN Tunnels"** (`terraform/aws/network/af-south-1/pagerduty/terragrunt.hcl`). Its `services` map has exactly one entry, `aws-vpn-tunnels`. |
| **Slack alerting** | Three networking channels fed by CloudWatch → Lambda, `tunnel-trampoline`, and in-cluster Alertmanager. See [Alerting & on-call](alerting-and-on-call.md). |
| **Prometheus rules** | Three `PrometheusRule` files, prod overlay only — `router-icmp`, `router-health`, `vpn-tunnels`. All networking. |
| **Dashboards** | Grafana at `grafana.prod.cpt.aws.example.net` / `grafana.staging.cpt.aws.example.net` (ALB + Google OIDC), see [Observability](kubernetes-observability.md). |
| **Severity / roles / comms plan** | Not yet defined — this page proposes them. |
| **Incident log** | None. Two past incidents survive only as asides in other pages (below). |

!!! warning "Paging coverage is networking-only"
    PagerDuty covers **AWS Site-to-Site VPN tunnel health** and the `ClientRouterDown`
    ICMP alert. Nothing pages for a bad application release, a failed Flux
    reconciliation, RDS or CloudNativePG problems, MongoDB Atlas, or data loss. Those
    failure modes are detected by a person looking at Grafana, a user complaining, or a
    `kubectl` / `flux get` check — not by an alert. Treat "no page" as "no coverage",
    not as "nothing is wrong".

!!! note "Alertmanager swallows anything not explicitly routed"
    The prod Alertmanager route's default receiver is `"null"`
    (`kubernetes/infrastructure/services/observability/overlays/prod/kube-prometheus-stack/helmrelease.yaml`).
    Only `ClientRouterDown` and `team: networking` alerts reach a human. A new
    `PrometheusRule` without matching labels fires silently — see
    [Alerting & on-call](alerting-and-on-call.md#alert-inventory-prometheus-alertmanager).

## Severity

A starting point, **to be agreed** by the team and then treated as the shared vocabulary.
Severity is set by **customer impact**, not by which component broke: a dead exporter is
SEV3 even though it is "monitoring", and one client's site being blind is SEV1 even though
it is "just one router". When in doubt, start higher and downgrade — downgrading is cheap.

| Severity | Customer impact | Response |
|---|---|---|
| **SEV1** | Capture capture or the admin portal is down for one or more clients; a client site is fully blind; confirmed or suspected data loss. | Respond immediately, at any hour. Declare, assign an incident lead, post in Slack. Page if a paging path exists (today: VPN only). |
| **SEV2** | Meaningful degradation with a workaround or partial coverage — some cameras not reporting, one tunnel of a redundant pair down, portal slow or partly broken, backups not running. | Same working day. Declare and assign a lead; no out-of-hours wake-up unless it is trending toward SEV1. |
| **SEV3** | No customer impact yet, but the system is one failure away from it — a stuck Flux reconciliation, a node filling its disk, a dead exporter, unreconciled Terraform drift. | Next working day, tracked as normal work. No incident ceremony. |

!!! note "Severity is a decision, not a lookup"
    The table sizes the *response*; it does not diagnose. Anyone may declare an incident
    and set an initial severity, and the incident lead may change it at any time as the
    picture improves. PagerDuty's [severity
    guidance](https://response.pagerduty.com/before/severity_levels/) is a reasonable
    reference if the definitions need sharpening.

## Roles

For anything above SEV3, name these explicitly at the start — out loud, in the Slack
thread — so they are not ambiguous. One person may hold more than one role in a small
incident; the point is that each is held by *someone*.

| Role | Owns |
|---|---|
| **Incident lead** | The single decision-maker. Holds the current state, decides what is tried next, sets severity, calls the incident over. Does **not** debug hands-on if that costs them the overview. |
| **Comms** | Keeps everyone outside the incident informed — internal Slack updates on a stated cadence, and client-facing updates where relevant. |
| **Scribe** | Timestamps what was observed, what was changed, and when. Feeds the postmortem. In practice: the Slack thread, if people narrate their actions into it. |

Because the escalation policy pages **everyone at once with no rotation**
([Alerting & on-call](alerting-and-on-call.md#routing-model-slack-channels-pagerduty)),
there is no predetermined lead. Sensible default: **the first engineer to acknowledge is
the incident lead until they explicitly hand over.** Handover must be stated and accepted,
never assumed.

The roles above are the standard ones; see the Google SRE Book on [managing
incidents](https://sre.google/sre-book/managing-incidents/) and PagerDuty's [incident
response documentation](https://response.pagerduty.com/) for the full treatment.

## Failure mode → first action → runbook

The routing table for "something is broken, where do I start". Every runbook linked here
is a real page in this repo.

| Failure mode | First action | Runbook |
|---|---|---|
| **Bad application release** — a deployed image is broken or regressed | Roll back to the previous known-good image tag before debugging | [Rollback](rollback.md) |
| **Flux not reconciling** — desired state in Git is not reaching the cluster | `flux get all -A` on the affected cluster; identify the failing `Kustomization`/`HelmRelease` and read its status message | [GitOps with Flux](gitops-flux.md), then [Flux bootstrap](../runbooks/flux-bootstrap.md) if the controllers themselves are unhealthy |
| **SOPS decryption failing** — reconciliation blocked on encrypted manifests | Check the Age key secret in `flux-system` and the `.sops.yaml` creation rules | [SOPS decryption troubleshooting](../runbooks/sops-decryption.md) |
| **Node disk full** — kubelet evicting pods, `DiskPressure`, image pulls failing | Identify the node, then reclaim log/journal/container space | [EKS node disk cleanup](../runbooks/eks-node-disk-cleanup.md) |
| **Data loss or corruption** — Postgres (CNPG), RDS MySQL, MongoDB Atlas, S3 objects | **Stop writing to the affected store first.** Then choose the restore path for that datastore; CNPG recovery is out-of-place | [Backup & disaster recovery](backup-and-restore.md) |
| **All tunnels down on a client VPN connection** | This pages. Acknowledge, then check whether `tunnel-trampoline`'s DOWN remediation has already acted before touching anything | [Alerting & on-call](alerting-and-on-call.md), [Client VPN](../handover/client-vpn.md), [MikroTik IPsec runbook](../runbooks/vpn-mikrotik-ipsec.md) |
| **Tunnel UP but passing no traffic** (blackhole) | Expected to self-remediate via `tunnel-trampoline`; escalate only if the replace did not restore traffic | [Alerting & on-call](alerting-and-on-call.md#auto-remediation-tunnel-trampoline) |
| **`ClientRouterDown`** — named client router unreachable on ICMP | This pages. Confirm scope: one router or the path to the site | [Alerting & on-call](alerting-and-on-call.md#router-icmp-the-only-paging-prometheus-rule), [MikroTik IPsec runbook](../runbooks/vpn-mikrotik-ipsec.md) |
| **Monitoring itself is down** — Prometheus, Alertmanager, an exporter, or the blackbox pipeline | Treat as SEV2 minimum: while it is down there is **no detection**. Restore visibility before continuing other work | [Observability](kubernetes-observability.md) |
| **Cluster unreachable / needs re-bootstrap** | Confirm the control plane and node state before assuming a Flux problem | [Flux bootstrap](../runbooks/flux-bootstrap.md), [Environments](environments.md) |

!!! warning "Prefer reverting to debugging"
    For a suspected release or config regression, get back to the last known-good state
    first and investigate afterwards. Because deploys are GitOps-driven, a rollback is
    itself a Git change that Flux reconciles — see [Rollback](rollback.md) for how to do
    it without fighting image automation.

## Communications

**Internal — networking incidents.** The three platform-bot channels already exist and are the
natural home for anything VPN, router, or fleet related
([CI/CD & Slack notifications](../handover/cicd-and-notifications.md)):

| Channel | ID | Use during an incident |
|---|---|---|
| `#networking-alerts` | `C000000AAA5` | Where the page lands. Run the incident thread here. |
| `#networking-warnings` | `C000000AAA6` | Supporting signal — remediation attempts, device health. |
| `#networking-info` | `C000000AAA3` | Heartbeat only; do not use for incident traffic. |

**Internal — everything else.** No channel is documented for platform, application, or
data incidents. **To be confirmed:** either nominate an existing channel or create one,
and record it here.

**External — clients.** Who contacts an affected client, on what cadence, and in what
form is **not documented anywhere in this repo**. This matters most for SEV1 site outages,
where the client usually notices before we do. **To be agreed.**

A workable default until something better is agreed: the incident lead posts in the
relevant channel at declaration, on a stated cadence (every 30 minutes for SEV1), and at
resolution — even when the update is "no change, still investigating". Silence during an
incident is read as absence.

!!! note "Client contact details live outside this repo"
    Per-client contacts are not committed. Confirm where they are held (CRM, 1Password,
    or a shared document) and reference that location here rather than duplicating it.

## After the incident

Once service is restored, the incident is not finished — the write-up is what stops it
recurring. Keep postmortems **blameless**: the goal is the systemic cause and the
follow-up actions, never the individual. Google's [Postmortem
Culture](https://sre.google/sre-book/postmortem-culture/) chapter is the standard
reference and is short enough to read in full before writing the first one.

**Proposed practice:** for every SEV1, and for any SEV2 that was surprising or took longer
than expected, write a short dated entry — what broke, what customers saw, the timeline,
the root cause, and the follow-up actions with owners. Half a page is enough. What matters
is that it exists and is findable.

**Proposed location:** `docs/incidents/`, one file per incident named
`YYYY-MM-DD-short-slug.md`, newest first in the nav. Plain Markdown, in this repo, next to
the runbooks it will send people to.

### Known past incidents

Two incidents are already recorded, but only as asides inside pages about something else.
They should be the first two entries so the log starts populated:

| Date | Summary | Currently recorded in |
|---|---|---|
| **2026-06-10** | AZ-locked EBS volume on the operator-flagged sensitive single-node AZ. Prod Prometheus was pinned to a **single replica** and its memory limit raised 4Gi → 16Gi after the head ballooned to ~22Gi and OOM-crashlooped WAL replay for ~3 months. **Still unresolved:** `replicas: 2` may only be restored once dedicated capacity exists in that AZ *and* pod-1's stale WAL has been flushed. | [Environments](environments.md), [Observability](kubernetes-observability.md#resource-sizing-resourcesyaml-patchtransformer) |
| **2026-07-17** | Client A, Client C and Client B were down for **~3 days** — every tunnel DOWN and wedged on a stale IKE / Phase-1 SA that AWS's own DPD restart never recovered. Fixed by lowering `rekey_margin_time_seconds` to `540` on the AWS side and aligning the MikroTik Phase-1/Phase-2 lifetimes; the `tunnel-trampoline` DOWN-remediation path was built in response. | [Client VPN](../handover/client-vpn.md), [MikroTik IPsec runbook](../runbooks/vpn-mikrotik-ipsec.md), [Alerting & on-call](alerting-and-on-call.md#down-remediation) |

!!! note "The 2026-06-10 restore condition is still open"
    Prod Prometheus remains single-replica. That condition is a live follow-up action, not
    history — it belongs on whatever list tracks platform work, and re-reading it is the
    quickest illustration of why a real incident log is worth keeping.

## Open items

Recorded here so they are visible rather than assumed. None of these block day-to-day
operation; all of them widen the gap between "something broke" and "someone knew".

!!! warning "Not yet established"
    - **Severity definitions and roles are proposals.** The SEV1–SEV3 table and the
      lead/comms/scribe split above have not been agreed by the team. Agree them, then
      delete this caveat.
    - **Flux failures are silent.** There are **no `Provider` or `Alert` resources**
      anywhere under `kubernetes/` — the only `notification.toolkit.fluxcd.io` objects
      present are the CRDs installed by `gotk-components.yaml`. The
      `notification-controller` is running but has nothing to send. A failed
      reconciliation, a stuck `HelmRelease`, or a broken image automation is discovered
      only by someone running `flux get all -A`. Wiring a Flux `Provider` (Slack) +
      `Alert` is the smallest available improvement.
    - **PagerDuty covers VPN only.** The `services` map contains exactly one entry. Bad
      releases, RDS/CNPG failures, backup failures, and data loss have no paging path.
    - **No recovery procedure has been rehearsed.** Nothing in this documentation set
      records a restore test, game day, or fire drill for CNPG PITR, RDS restore, Atlas
      restore, SOPS/Age key recovery, or a cluster re-bootstrap. The runbooks in
      [Backup & disaster recovery](backup-and-restore.md) and
      [Flux bootstrap](../runbooks/flux-bootstrap.md) are written but unverified —
      their real recovery times are unknown.
    - **No incident log exists.** `docs/incidents/` is a proposal in this page, not a
      directory in the repo.
    - **No agreed comms channel for non-networking incidents**, and no documented
      client-communication owner or cadence.

## See also

- [Alerting & on-call](alerting-and-on-call.md) — the alert catalog, escalation policy,
  acknowledge/silence procedures, and how to test a page.
- [Rollback](rollback.md) — reverting a bad release under GitOps.
- [Backup & disaster recovery](backup-and-restore.md) — restore paths per datastore.
- [Observability](kubernetes-observability.md) — Prometheus, Alertmanager, Grafana, Loki.
- [GitOps with Flux](gitops-flux.md) — reconciliation model and quick reference.
- [CI/CD & Slack notifications](../handover/cicd-and-notifications.md) — the platform-bot bot and channel
  wiring.
