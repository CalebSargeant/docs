# Offboarding & revocation

The inverse of [Onboarding & access](../onboarding.md): the ordered checklist for withdrawing an
engineer's access to `platform-infra` and everything it reaches. Work through the sections top to
bottom — revoke the identity-plane access first (SSO, GitHub, 1Password), then the
system-specific entries that name a person (cluster `map_users`, the management WireGuard peer,
PagerDuty), then decide on the shared secrets the person still holds copies of.

!!! info "Scope"
    This covers the infrastructure surfaces this repo can see. Company-wide accounts — email,
    Slack, the Google/Microsoft directory, laptop return — are outside it and belong to whatever
    HR/IT process owns them. Where an owner or approver is not recorded anywhere in the repo, this
    page writes **Owner: to be confirmed** rather than guessing.

!!! warning "Revoking access does not un-share a secret already held"
    Removing someone from SSO, GitHub or 1Password stops *future* access. It does not retract
    material they already have a copy of — most importantly the **SOPS Age private key**, which
    decrypts every committed secret in the tree. If the departing person held it, section 7 is not
    optional. The same applies to any plaintext they decrypted along the way: the static AWS
    credentials in `sops/staging.enc.yaml`, the database and device passwords in the other bundles,
    and anything read out of the `Platform` 1Password vault.

## At a glance

| # | Access item | How it is revoked | Grounded in |
|---|-------------|-------------------|-------------|
| 1 | AWS SSO (5 accounts) | A human removes permission-set assignments / disables the user in Identity Center | [AWS accounts & access](../reference/aws-accounts.md) |
| 2 | `kubectl` to `prod-eks` / `staging-eks` | Remove the SSO role ARN from the cluster's `map_users` and `terragrunt apply` the `eks` leaf | `terraform/aws/{prod,staging}/af-south-1/eks/terragrunt.hcl` |
| 3 | GitHub org + app repos | Remove from the `example-org` org; revoke PATs, SSH keys and deploy keys | [CI/CD & tooling](../reference/cicd-and-tooling.md) |
| 4 | Client VPN / network access | Remove the management WireGuard peer and its routes; re-handover any device credentials they held | [Client VPN](client-vpn.md), [Ansible](../reference/ansible.md) |
| 5 | PagerDuty | Drop the address from `engineer_emails`, apply the leaf manually, then deactivate the PagerDuty user | [Alerting & on-call](../reference/alerting-and-on-call.md) |
| 6 | 1Password `Platform` vault | Vault administrator removes the member | [Onboarding & access §6](../onboarding.md) |
| 7 | SOPS Age private key | **Rotate** — revocation is not possible; the key must be replaced everywhere | [Secret stores → Rotation blast radius](../reference/secret-stores.md#rotation-blast-radius) |

---

## 1. AWS SSO access

All AWS access is through **AWS IAM Identity Center (SSO)** — there are no long-lived IAM users for
engineers, so there is nothing to delete in each account. Revocation happens once, in the identity
store, and takes effect for all five accounts.

- [ ] Remove the user's **permission-set assignments** for `network`, `shared`, `prod`, `staging` and
      `dev` (account IDs in [AWS accounts & access](../reference/aws-accounts.md)).
- [ ] **Disable or delete the user** in the identity store, so no new SSO session can be started.
- [ ] Confirm no **IAM access keys** were issued to them out of band. The repo's convention is SSO
      only, but the staging SOPS bundle does carry a static `aws_access_key_id` /
      `aws_secret_access_key` pair — if the leaver could decrypt it, treat that pair as exposed and
      rotate it (section 7).
- [ ] Note that any **active SSO session** persists until it expires. If the departure is not
      amicable, ask the Identity Center administrator to terminate live sessions rather than waiting
      them out.

!!! warning "Operator input needed — who revokes SSO"
    Removing permission-set assignments happens in the AWS Identity Center admin console (or the
    upstream IdP). This repo does not record who administers that, and
    [AWS accounts & access](../reference/aws-accounts.md#organization-structure-guardrails)
    deliberately does not enumerate permission-set assignments. **Owner: to be confirmed.**

---

## 2. Kubernetes access (kubeconfig & `map_users`)

Cluster authorisation is granted by the EKS module's `map_users` list, which maps an SSO role ARN to
Kubernetes groups. Removing SSO (section 1) already stops the person assuming the role, but the
`map_users` entry should be cleaned up so the committed state matches reality.

- [ ] Remove the leaver's SSO role ARN from `map_users` in **both**
      `terraform/aws/prod/af-south-1/eks/terragrunt.hcl`
      and the staging equivalent, then `terragrunt apply` each `eks` leaf.
- [ ] Ask them to delete local kubeconfig entries for `prod-eks` and `staging-eks` (section 8).
- [ ] Check for any **service-account tokens or kubeconfigs** they generated for personal use
      outside the SSO path.

!!! warning "Do not remove the last `map_users` entry"
    As committed, each `eks` leaf maps a **single** admin SSO role
    (`AWSReservedSSO_AdministratorAccess_*`, username `site-a.example.net`, groups
    `eks-console-dashboard-full-access-group` and `system:masters`) — the same entry on both
    clusters. If that entry belongs to the departing engineer, **add the successor's role ARN and
    apply it first**, verify `kubectl auth can-i --list` against both clusters, and only then remove
    the old one. Removing the sole entry leaves no human with cluster admin, and the API endpoint is
    private-only, so recovery means going back through the EKS cluster-creator identity.

!!! note "Cluster admin implies the Age key was reachable"
    The Age private identity sits in the `sops-keys` and `sops-age` Secrets in `flux-system`.
    Anyone who held `system:masters` and in-VPC `kubectl` could read it, whether or not they were
    ever handed the key directly. Factor that into the section 7 decision — see
    [Secret stores → Key custody](../reference/secret-stores.md#key-custody).

---

## 3. GitHub org & repository access

The repo lives at `github.com/example-org/platform-infra`, and the application manifests live
in each application's own repo under the same org.

- [ ] Remove the user from the **`example-org` GitHub org** — this covers `platform-infra`,
      `platform-utils`, `shared-workflows` and the application repos in one action.
- [ ] Check for **outside-collaborator** grants on individual repos, which org removal does not
      cover.
- [ ] Remove them from the **`release-approvers` team** — `.github/CODEOWNERS`
      routes every path to `@example-org/release-approvers`, so team membership is what gates
      merges.
- [ ] Revoke any **personal access tokens**, SSH keys or GPG/SSH signing keys they registered
      against the org, and any **deploy keys** they added to a repo.
- [ ] Review **GitHub Actions secrets** for anything issued in their name — the inventory is in
      [Secret stores §4](../reference/secret-stores.md). Values cannot be read back, so if
      provenance is unclear, rotate rather than inspect.
- [ ] Remove them from the **Cloudflare Access** application in front of the docs site
      (`docs.example.com`) and from Cloudflare itself if they had an account — see
      [CI/CD & tooling](../reference/cicd-and-tooling.md).
- [ ] Check the **self-hosted runners**: if a runner was registered on hardware they control,
      deregister it and confirm the replacement.

!!! warning "Operator input needed — who administers the GitHub org"
    Org membership and team assignment are human-granted and this repo does not record the
    administrator, the same gap flagged in [Onboarding & access §4](../onboarding.md).
    **Owner: to be confirmed.**

!!! note "Nothing to revoke for the local toolchain"
    [Onboarding §3](../onboarding.md) installs CLIs (`terragrunt`, `sops`, `flux`, `kubectl`,
    `ansible`). None of those carry access on their own — the credentials they read are covered by
    the other sections here, and the residual local files by section 8.

---

## 4. Client VPN / network access

[Client VPN](client-vpn.md) documents the **client site-to-site boundary** — the AWS-side `vpn`
module and the MikroTik `.rsc` handed to each client. Those tunnels authenticate site to site with
per-client PSKs, not per-person credentials, so a departure does not require re-handing any client
config. The person-specific network access is elsewhere.

- [ ] **Management WireGuard peer.** `_modules/config-mikrotik/_wireguard-peers.tf`
      defines a named personal peer (`admin-home`) on the management interface of every MikroTik,
      with matching routes in `_ip_route.tf`. If the leaver owns that peer, remove the resource and
      its routes and apply the `config-mikrotik` leaves in the `network` and `prod` environments.
- [ ] **Device credentials.** `sops/network.enc.yaml` carries `fortigate_password`,
      `mikrotik_password` and `management_wg_key` — shared device credentials, not per-person. If
      the leaver could decrypt that bundle, rotate the device passwords on the Fortigate and the
      MikroTik fleet and re-encrypt the bundle.
- [ ] **Ansible SSH material.** The bootstrap roles ship SOPS-encrypted deploy keys and use
      `ansible_sudo_pass` from `root.enc.yaml` — see
      [Ansible → The SOPS / Age secret model](../reference/ansible.md#the-sops-age-secret-model).
      These are shared, so they follow the same rotate-if-exposed logic.
- [ ] **Azure Virtual Desktop.** `invite-avd-user.yaml`
      automates *inviting* a guest user (`<firstname>@az.example.net`) and assigning the VM-login and
      desktop-virtualisation roles. There is no matching removal workflow — remove the guest user
      and both role assignments in the Azure portal by hand.

!!! note "The management WireGuard peer is named after a person"
    Because the peer is a Terraform resource with a personal name, offboarding it is a code change
    and a `terragrunt apply`, not a console click. Owner of the `config-mikrotik` leaves:
    **to be confirmed.**

---

## 5. PagerDuty & on-call

There is a single all-hands PagerDuty service, **"AWS VPN Tunnels"**, with the escalation policy
`Platform Engineering - All Hands`. The engineer list is in code; the notification settings are not.

Remove the leaver's address from `engineer_emails` in
`terraform/aws/network/af-south-1/pagerduty/terragrunt.hcl`,
then apply the leaf manually — the `network` account is not in CI:

```bash
export PAGERDUTY_TOKEN="$(op read 'op://platform/PagerDuty/API Key')"
cd terraform/aws/network/af-south-1/pagerduty && AWS_PROFILE=network terragrunt apply
```

Then work down the rest:

- [ ] `engineer_emails` updated and the `pagerduty` leaf applied (above).
- [ ] **Deactivate the PagerDuty user account** in PagerDuty itself. The Terraform side looks users
      up by email via a `pagerduty_user` data source, so an address that no longer resolves will
      fail the plan — remove it from `engineer_emails` **before** deleting the user.
- [ ] Confirm the remaining escalation policy still has at least one reachable engineer, and that
      their contact methods are current. Per-user contact methods live in PagerDuty and are not in
      this repo — see the note in [Alerting & on-call](../reference/alerting-and-on-call.md).
- [ ] Remove them from the `#networking-alerts`, `#networking-warnings` and `#networking-info` Slack
      channels as part of the wider Slack offboarding. The platform-bot bot token is shared infrastructure,
      not a personal credential — see [CI/CD & Slack notifications](cicd-and-notifications.md).

---

## 6. 1Password & shared credentials

- [ ] Remove the user from the **`Platform`** 1Password vault.
- [ ] Treat every item they could read as **potentially retained**, and rotate the ones that matter —
      starting with `op://platform/PagerDuty/API Key`.
- [ ] Rotate the **platform-bot Slack bot token** if they held it. It lives in two AWS Secrets Manager
      stores and both must be updated together; the runbook is in
      [CI/CD & Slack notifications](cicd-and-notifications.md).
- [ ] Review **AWS Secrets Manager** in the accounts they had admin on. Anything they could read with
      `GetSecretValue` is a rotation candidate; the inventory of what the clusters consume is in
      [Secrets (SOPS + Age) §6](../reference/secrets-sops.md#6-external-secrets-operator-eso).

!!! warning "Operator input needed — who administers the vault"
    Vault membership is human-granted and this repo does not record the administrator.
    **Owner: to be confirmed.**

---

## 7. SOPS Age key — rotate if the leaver held a copy

This is the item that distinguishes offboarding from a routine access change. The Age private
identity cannot be revoked: it is a file, and anyone who has held it can decrypt every
`sops/*.enc.yaml` bundle and every in-tree encrypted manifest, from any clone of the repo, forever.
The only remedy is rotation.

**Rotate if any of the following is true:**

- They were handed the private key, or set `SOPS_AGE_KEY_FILE` on their own machine.
- They held `system:masters` on either cluster (the key is readable from `sops-keys` / `sops-age`).
- They ran a Terragrunt leaf that calls `sops_decrypt_file`, or an Ansible bootstrap playbook.
- Provenance is unclear. Rotation is cheap relative to the alternative.

The rotation touches four surfaces that must move together — the five bundles, the in-tree
Kubernetes `Secret`s, **both** in-cluster secret names on **both** clusters, and the CI
`SOPS_AGE_KEY`. Ten live Terragrunt leaves decrypt at **plan** time, so a partial rotation breaks
`terragrunt plan` for everyone, not just Flux reconciliation.

- [ ] Follow the safe sequence in
      [Secret stores → Rotation blast radius](../reference/secret-stores.md#rotation-blast-radius):
      add the new recipient alongside the old, re-encrypt, roll out to every consumer, verify, then
      drop the old recipient. The step-by-step commands are in
      [Secrets (SOPS + Age) §10](../reference/secrets-sops.md#10-age-private-key-custody-and-rotation).
- [ ] Rotate the **plaintext values** the old key protected where they are independently valuable —
      the static AWS credentials and Mongo/Azure connection strings in `sops/staging.enc.yaml`, the
      device passwords in `network.enc.yaml`, the `github_token` and Cloudflare key in
      `root.enc.yaml`, and the database passwords in `prod.enc.yaml` / `shared.enc.yaml`. Re-encrypting
      with a new key does not help if the old plaintext is still live.
- [ ] Confirm the **successor holds the new key** and that its escrow location is recorded — the open
      item in [Secret stores → Key custody](../reference/secret-stores.md#key-custody).

!!! note "Take the opportunity to add a second recipient"
    `.sops.yaml` currently has one creation rule with one recipient, so a rotation is also the
    natural moment to move to two — which removes the single-custody position that made this section
    necessary in the first place.

---

## 8. Local workstation & residual copies

Ask the departing engineer to confirm these are removed from any machine they keep. None of it is
enforceable, which is exactly why sections 6 and 7 exist.

- [ ] `~/.sops.agekey` (and any other Age identity file).
- [ ] `~/.aws/config` profiles and the `~/.aws/sso/cache` token cache.
- [ ] `~/.kube/config` entries and any per-cluster kubeconfig files (`~/.kube/example-*.yaml`).
- [ ] `~/.ssh/*.pem` deploy keys written by the Ansible bootstrap roles.
- [ ] `/tmp/sops-age-secret.yaml` — the `k3s-sops-age-secret` role writes the base64-encoded Age key
      to this path on the control node before applying it, and does not clean it up.
- [ ] Local clones of `platform-infra` and the application repos, including any decrypted files or
      `terragrunt` plan output left in working directories.

---

## Leaver checklist

Work down this list; each item links to its section above.

- [ ] **AWS SSO revoked** — permission-set assignments removed for all five accounts, user disabled,
      live sessions terminated if needed (§1).
- [ ] **Cluster access cleaned up** — `map_users` entry removed from both `eks` leaves and applied,
      **after** confirming a successor entry exists (§2).
- [ ] **GitHub removed** — org membership, `release-approvers` team, outside-collaborator grants,
      PATs, SSH/deploy keys, Cloudflare Access (§3).
- [ ] **Network access removed** — management WireGuard peer and routes, Azure AVD guest user;
      shared device credentials rotated if they were decryptable (§4).
- [ ] **PagerDuty updated** — removed from `engineer_emails` and applied, then the user deactivated;
      remaining escalation path verified (§5).
- [ ] **1Password removed** — vault membership revoked; PagerDuty key and any other items they could
      read rotated (§6).
- [ ] **Age key decision made** — rotated if they held a copy, and the successor's copy plus escrow
      location recorded (§7).
- [ ] **Local copies confirmed removed** — Age key file, AWS/kube config, deploy keys, `/tmp`
      artefacts, repo clones (§8).
- [ ] **Smoke test** — the successor can `aws sso login`, `flux get kustomizations` against both
      clusters, `sops -d sops/staging.enc.yaml`, and `terragrunt plan` in
      `terraform/aws/staging/af-south-1/eks` — all with their own credentials.

## See also

- [Onboarding & access](../onboarding.md) — the joining runbook this page mirrors.
- [Secret stores](../reference/secret-stores.md) — the inventory of every store, key custody, and the
  rotation blast radius.
- [Secrets (SOPS + Age)](../reference/secrets-sops.md) — the deep dive on the committed plane and the
  External Secrets inventory.
- [Alerting & on-call](../reference/alerting-and-on-call.md) — the PagerDuty service and escalation
  policy.
- [Client VPN](client-vpn.md) — the client site-to-site boundary and why it is not per-person.
