# MikroTik IPsec runbook — AWS Site-to-Site VPN customer gateways

Customer-side (MikroTik CHR) IPsec settings for the IKEv2 tunnels that terminate the
AWS Site-to-Site VPN connections (`client-a`, `client-b`, `client-c`, `client-d`,
`client-e*`). This is the **customer-router half** of the lifetime/rekey fix; the
AWS half lives in `terraform/aws/_modules/vpn/main.tf`
and the auto-remediation in `terraform/aws/_modules/tunnel-trampoline`.

> **Why this exists.** On 2026‑07‑17 ~14:00 the Client A/Client C/Client B tunnels went
> fully down and stayed wedged (a stale IKE SA) until Client A was manually
> disabled/re‑enabled on 2026‑07‑20 ~08:15. Two things caused/prolonged it: (1) an
> over‑aggressive AWS rekey margin (now fixed AWS‑side: `rekey_margin_time_seconds`
> 1800 → 540), and (2) MikroTik‑side IKE/child‑SA lifetimes that don't align with
> AWS and **DPD not tearing down the dead peer**, so a wedged SA never cleared
> itself. This runbook aligns the lifetimes and enables DPD so a dead peer
> self‑heals instead of needing a hand‑bounce.
>
> **Phase B will automate this** via the RouterOS API (see the infra plan); until
> then, apply it by hand per router — Client A first.

## Target settings (match the AWS side)

| Layer | RouterOS object | Set to | AWS side it matches |
|---|---|---|---|
| Phase 1 (IKE SA) | `/ip ipsec profile` `lifetime` | `8h` | `phase1_lifetime_seconds = 28800` |
| Phase 1 DPD | `/ip ipsec profile` `dpd-interval` / `dpd-maximum-failures` | `10s` / `3` | `dpd_timeout_seconds = 30`, `dpd_timeout_action = "restart"` |
| Phase 2 (child SA) | `/ip ipsec proposal` `lifetime` | `1h` | `phase2_lifetime_seconds = 3600` |

Rationale:
- **Equal lifetimes + AWS's smaller rekey margin** ⇒ AWS always initiates the rekey
  first, so the two peers don't both try at once (the collisions that leave stale
  child SAs).
- **DPD (`dpd-interval=10s`, `dpd-maximum-failures=3`)** ⇒ if the AWS peer stops
  responding, the MikroTik tears the SA down (~30s) and renegotiates automatically —
  the self‑heal that was missing on 2026‑07‑17.

## Router endpoints (MikroTik cloud DDNS)

| Customer | Endpoint | AWS BGP ASN |
|---|---|---|
| client-a | `hx0000000a1.sn.mynetname.net` | 65102 |
| client-b | `hx0000000c3.sn.mynetname.net` | 65103 |
| client-c | `hx0000000b2.sn.mynetname.net` (TMC: `client-c-tmc.ddns.net`) | 65104 |
| client-d (site D) | `hx0000000e5.sn.mynetname.net` | 65105 |
| client-e | `b2c3d4e5f6a7.sn.mynetname.net` | 65109 |
| client-e-site2 | `hx0000000d4.sn.mynetname.net` | 65106 |
| client-e-site3 | `a1b2c3d4e5f6.sn.mynetname.net` | 65107 |

Access is over the RouterOS API / SSH / WinBox with a **write‑capable** account (the
monitoring `readonly` credentials cannot make these changes). Endpoints are also the
canonical inventory in `platform-utils` `router-fleet-resolver/routers-inventory.yml`.

## Apply (per router)

Always `print` first — object names differ per router; scope `set` by the printed
`.id`/name of the objects the **AWS peer** uses, never blindly across all IPsec.

```routeros
# 1. Find the AWS peer and the profile/proposal it uses.
/ip ipsec peer print detail
/ip ipsec profile print detail
/ip ipsec proposal print detail

# 2. Phase 1 (IKE) — align lifetime to AWS (8h) and enable DPD self-heal.
#    Replace <aws-profile> with the profile name the AWS peer references.
/ip ipsec profile set [find name="<aws-profile>"] \
    lifetime=8h dpd-interval=10s dpd-maximum-failures=3

# 3. Phase 2 (child SA) — align lifetime to AWS (1h).
#    Replace <aws-proposal> with the proposal name used by the AWS policy.
/ip ipsec proposal set [find name="<aws-proposal>"] lifetime=1h
```

## Verify

```routeros
/ip ipsec profile print detail   ;# lifetime=8h, dpd-interval=10s, dpd-maximum-failures=3
/ip ipsec proposal print detail  ;# lifetime=1h
/ip ipsec active-peers print     ;# the AWS peer is "established", uptime resets after a rekey
/ip ipsec installed-sa print     ;# fresh SAs; no duplicate/half-open child SAs
```

On the AWS side, confirm the connection's tunnels return to `UP` and traffic flows
again on the **VPN Tunnels** Grafana dashboard (`aws_vpn_tunnel_state_maximum == 1`).

## Manual bounce (emergency clear of a wedged tunnel)

This is the fix that was done by hand on 2026‑07‑17→20. Prefer letting the
**tunnel‑trampoline** do the AWS‑side equivalent (`ReplaceVpnTunnel`) once
`down_dry_run=false`; use this only when acting directly on the router.

```routeros
# Bounce the AWS peer to force a clean renegotiation (flushes the stale SA).
/ip ipsec identity disable [find peer="<aws-peer>"]
/ip ipsec identity enable  [find peer="<aws-peer>"]

# If SAs linger, flush them (they renegotiate immediately):
/ip ipsec installed-sa flush
```

## Notes

- Do **not** widen these `set` commands to all IPsec objects — a router may also run
  WireGuard/other IPsec; scope to the AWS peer's profile/proposal only.
- Keep the MikroTik lifetimes **equal to (not shorter than)** the AWS values so AWS
  stays the rekey initiator. If you ever raise the AWS `phase*_lifetime_seconds`,
  raise these to match.
- `client-e` is not yet in the monitoring router‑fleet inventory; add it there when
  Phase B automation lands so it is covered.
