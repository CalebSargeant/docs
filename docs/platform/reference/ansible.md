# Ansible

The `ansible/` tree is the **imperative, operator-run bootstrapping layer** of `platform-infra`. Where Terraform provisions cloud infrastructure and Flux/Kustomize reconcile the Kubernetes state, Ansible is what an engineer runs by hand from a laptop to *seed* a new cluster (install k3s, apply Calico/cert-manager/nginx, bootstrap Flux, plant the SOPS Age key), to stand up the legacy **v1** capture portal/driver stack on plain EC2/Azure VMs, and to perform one-off fleet operations (repoint camera alarm servers, migrate a MySQL database from Azure to AWS, shut down Azure VMs, bootstrap a MikroTik CHR).

It is **not** wired into CI. Every playbook here is run manually, mostly against `localhost` (for the Kubernetes/Flux work) or against SSH/RouterOS/Azure targets.

!!! warning "Operator-machine assumptions baked in"
    These playbooks run from the operator's control node (mostly `localhost`): `age_key_path` and the Flux SSH-key directory resolve to that machine's `$HOME` (via `lookup('env', 'HOME')`), and the roles expect local CLIs (`flux`, `kubectl`, `sops`, `age`, `expect`, `az`, `ansible-playbook`) plus the `community.sops`, `kubernetes.core`, `community.routeros`, `ansible.netcommon` and `azure.azcollection` collections. There is **no `ansible.cfg`, no `requirements.yml`, and no README** in this tree — the runtime contract is implicit.

---

## Directory layout

```text
ansible/
├── _hosts.yaml                     # Structured YAML inventory (region/provider/env/version/type)
├── inventory.ini                   # Generated camera inventory (INI) — committed, see legacy notes
├── k8s_bootstrap_prod_cpt.yaml     # Flux bootstrap → prod-cpt-aws  (localhost)
├── k8s_bootstrap_staging_cpt.yaml  # Flux bootstrap → staging-cpt-aws (localhost)
├── k3s_bootstrap.yaml              # k3s + Flux + Age secret for the obs k3s box
├── chr_bootstrap.yaml              # First-boot MikroTik CHR setup via expect
├── change_alarm_server.yaml        # Repoint vendor-A cameras' alarm server (ISAPI)
├── azure_turn_off_vm.yaml          # Deallocate Azure v1 staging VMs
├── mysql-export-import.yaml        # Azure MySQL → AWS RDS dump/restore
├── v1_app_bootstrap.yaml           # Build/run legacy admin portal (backend+frontend) on a VM
├── v1_driver_bootstrap.yaml        # Build/run legacy vendor-A + vendor-B drivers on a VM
├── run_change_alarm_server_playbook.py  # Python wrapper around change_alarm_server.yaml
├── test-connection.sh              # curl smoke test for the vendor-A ISAPI login
├── vars/                           # Per-target variable files (see table)
└── roles/                          # 18 roles (see inventory)
```

Source: `ansible/`

The SOPS-encrypted secret bundle the roles decrypt lives **outside** this tree at the repo root in `sops/` — roles reference it as `../sops/…` relative to the `ansible/` playbook dir (`root.enc.yaml`, `staging.enc.yaml`, `prod.enc.yaml`, `shared.enc.yaml`, `network.enc.yaml`).

---

## Inventories

There are **two disjoint inventories**, and different playbooks assume different ones.

### `_hosts.yaml` — the structured inventory

A nested group hierarchy encoding a **region → provider → environment → version → type** taxonomy. Group vars set `env`, and the top-level `all.vars` default SSH user/key/interpreter.

| Level | Examples | Notes |
|-------|----------|-------|
| Region | `cpt` (Cape Town), `jhb` (Johannesburg) | |
| Provider | `cpt_aws`, `cpt_office`, `jhb_azure` | |
| Environment | `cpt_aws_staging`, `cpt_aws_prod`, `jhb_azure_staging`, `jhb_azure_prod_v1` | staging group sets `env: staging` |
| Version | `*_v1` (legacy VM stack), `*_v2` (k3s/CHR/FortiGate) | |
| Type (v2) | `*_k3s`, `*_chr`, `*_fgt` | CHR/FGT groups set RouterOS `network_cli` connection |

Notable hosts: the v1 stacks target a MikroTik CHR front door via port-forwarded SSH (`chr.v1.<env>.cpt.aws.example.net` ports 2222/2223), the observability k3s box is `chr.obs.staging.cpt.aws.example.net:2222` (`10.162.24.100`), and the office k3s box is `office.example.com:2222`. CHR/FortiGate hosts resolve to `fgt-1/2.<env>.cpt.aws.example.net`. Global defaults: `ansible_ssh_user: ubuntu`, `ansible_python_interpreter: /usr/bin/python3`, `ansible_ssh_private_key_file: ~/.ssh/fleet_admin_key`.

Source: `ansible/_hosts.yaml`

!!! note "Group names referenced by playbooks that don't exist here"
    `chr_bootstrap.yaml` targets `hosts: mikrotik` and `change_alarm_server.yaml` targets `hosts: cameras`, but **neither group exists in `_hosts.yaml`**. The `cameras` group is supplied by `inventory.ini`; there is no `mikrotik` group anywhere, so `chr_bootstrap.yaml` requires an ad-hoc `-i` / group definition to run.

### `inventory.ini` — the generated camera inventory

A one-line-per-camera INI file under a `[cameras]` group. The committed copy carries a header `# Inventory generated on 2025-05-02 17:52:58` and a single camera row with a plaintext `login`/`pass`.

Source: `ansible/inventory.ini`

!!! danger "Committed, generated, and contains a plaintext camera credential"
    `inventory.ini` is a generated artifact (the Python runner regenerates and then *deletes* it, treating it as sensitive) yet a copy with a real `admin` password is committed to git. See [legacy findings](#legacy-and-cleanup-notes).

---

## Variable files (`vars/`)

| File | Consumed by | Key contents |
|------|-------------|--------------|
| `prod_k8s.yaml` | `k8s_bootstrap_prod_cpt.yaml` | `cluster_name: prod-cpt-aws`, `repo_owner/name`, `age_key_path: $HOME` |
| `staging_k8s.yaml` | `k8s_bootstrap_staging_cpt.yaml` | `cluster_name: staging-cpt-aws`, `age_key_path: $HOME` |
| `_obs.yaml` | `k3s_bootstrap.yaml` | `cluster_name: obs-cpt-staging`, `server_fqdn/ip`, `k3s_url`, `cert_manager_download_url` (v1.16.2), `age_key_path: $HOME` |
| `office_cpt.yaml` | (k3s office box; not referenced by an in-tree playbook) | `cluster_name: office-k3s`, `server_ip: 192.168.1.118` |
| `v1_common.yaml` | v1 playbooks | ports, repo names, `branch_mapping {staging: staging, prod: master}`, per-service Node versions (frontend 14, backend/vendor/vendor-b 22), timezone |
| `v1_prod.yaml` | `env=prod` v1 runs | `frontend_hostname: secure.example.com`, DB/cache/driver FQDNs, Azure→AWS migration IPs |
| `v1_staging.yaml` | `env=staging` v1 runs | `frontend_hostname: staging.example.com`, staging DB user/host |

!!! note "Age key location"
    All bootstrap var sets resolve `age_key_path` to the control node's `$HOME` (via `lookup('env', 'HOME')`) and expect the operator's key at `$HOME/.sops.agekey`.

---

## The SOPS / Age secret model

Secrets flow through Ansible in two distinct ways.

**1. Decrypting values at runtime for templating.** The `sops-load` role and the two Flux bootstrap roles load the repo-root SOPS bundles into Ansible facts using the `community.sops` decrypt filter:

```yaml
- name: Load SOPS encrypted data
  set_fact:
    decrypted_root: "{{ lookup('file', '../sops/root.enc.yaml') | community.sops.decrypt | from_yaml }}"
```

`decrypted_root` yields values like `github_token`, `agm_core_api_key`, `sentry_dns`, `map_box_token`, `api_secret`, and the v1 `mysql-export-import` role reads `decrypted_env.db_password`. Decryption itself depends on the operator's local Age identity being resolvable by `sops`.

**2. Planting the Age key *into* the cluster** so Flux's `kustomize-controller` can decrypt SOPS-encrypted manifests. This is the job of `k3s-sops-age-secret` (and the inline equivalent inside `k8s-fluxcd-bootstrap-improved`): base64-encode `~/.sops.agekey` and create the `sops-keys` Secret (`identity.agekey`) in the `flux-system` namespace.

```yaml
- name: Base64 encode age key
  shell: cat {{ age_key_path }}/.sops.agekey | base64
  register: base64_key
- name: Create Kubernetes Secret manifest   # → /tmp/sops-age-secret.yaml
  copy:
    dest: /tmp/sops-age-secret.yaml
    content: |
      apiVersion: v1
      kind: Secret
      metadata: { name: sops-keys, namespace: flux-system }
      type: Opaque
      data: { identity.agekey: "{{ base64_key.stdout }}" }
- name: Apply Kubernetes Secret
  command: kubectl apply -f /tmp/sops-age-secret.yaml
```

Source: `roles/k3s-sops-age-secret/tasks/main.yml`. The file opens with a long comment block documenting the whole GPG→Age migration history (how the `app.kubernetes.io/sops=enabled` label + a global Kustomize patch enable decryption) and keeps the superseded GPG tasks commented out.

**Encrypted SSH deploy keys.** The Flux and v1 roles ship SOPS-encrypted PEM deploy keys as role templates (`ssh_key_*.enc.pem`, AES256_GCM Age-encrypted JSON). At bootstrap they are decrypted with `lookup('community.sops.sops', …)` and written to `~/.ssh/<name>.pem` at `0600`, then either handed to `flux bootstrap` / a `<repo>-ssh-key` Secret, or used as `key_file` for the v1 `git clone`.

| Encrypted key template | Role | Purpose |
|------------------------|------|---------|
| `ssh_key_platform-infra.enc.pem` | `k8s-fluxcd-bootstrap`, `k3s-fluxcd-bootstrap` | Flux deploy key for this repo |
| `ssh_key_backend.enc.pem`, `ssh_key_frontend.enc.pem` | `v1_app` | Clone `admin-backend` / `admin-frontend` |
| `ssh_key_vendor_a.enc.pem`, `ssh_key_vendor_b.enc.pem` | `v1_driver` | Clone `capture-driver` / `vendor-b-driver` |

---

## Playbooks

| Playbook | Target | Roles | What it does |
|----------|--------|-------|--------------|
| `k8s_bootstrap_prod_cpt.yaml` | `localhost` | `k8s-fluxcd-bootstrap-improved` | Full Flux bootstrap of the `prod-cpt-aws` cluster |
| `k8s_bootstrap_staging_cpt.yaml` | `localhost` | `k8s-fluxcd-bootstrap-improved` | Same, for `staging-cpt-aws` |
| `k3s_bootstrap.yaml` | `{{ hosts }}` (become) | `k3s-fluxcd-bootstrap`, `k3s-sops-age-secret` | Bootstraps Flux + Age secret on the obs k3s box (most OS-prep roles commented out) |
| `chr_bootstrap.yaml` | `mikrotik` | *(inline tasks, no role)* | First-boot MikroTik CHR: dismiss licence, set password, set identity via `expect` |
| `change_alarm_server.yaml` | `cameras` | `change-alarm-server` | PUT new AlarmServer id/ip/port to vendor-A cameras over ISAPI |
| `azure_turn_off_vm.yaml` | `jhb_azure_staging_v1` | `change-alarm-server` *(see note)* | Intended to deallocate Azure v1 staging VMs |
| `mysql-export-import.yaml` | `{{ hosts \| default(localhost) }}` | `sops-load`, `mysql-azure-export-aws-import` | `mysqldump` from Azure MySQL → import into AWS RDS |
| `v1_app_bootstrap.yaml` | `{{ hosts }}` (become) | `sops-load`, `v1_app` | Clone/build/run the legacy admin portal (nginx + pm2) |
| `v1_driver_bootstrap.yaml` | `{{ hosts }}` (become) | `sops-load`, `v1_driver` | Clone/build/run the legacy vendor-A + vendor-B drivers (pm2) |

The v1 and mysql playbooks are parameterised by `env` and load `vars/v1_common.yaml` + `vars/v1_{{ env }}.yaml`; run them with e.g. `-e hosts=<group> -e env=staging`.

### CHR bootstrap detail

`chr_bootstrap.yaml` doesn't use RouterOS modules — it shells out to a heredoc `expect` script (`local_action`) that SSHes into a *fresh* CHR, answers the licence prompt with `n`, sets the password to `123` twice, sets `/system identity` to the inventory hostname, and quits. It is strictly a **factory-first-boot** helper (default weak password), not idempotent day-2 config.

---

## Roles

18 roles, grouped by function. The two most important groups — Flux bootstrap and SOPS/Age — are detailed below.

### Flux / cluster bootstrap

| Role | Used by | Purpose |
|------|---------|---------|
| k8s-fluxcd-bootstrap-improved | prod & staging k8s playbooks | The **current** full-fat cluster bootstrap |
| k8s-fluxcd-bootstrap | *(none)* | **Superseded** minimal bootstrap |
| k3s-fluxcd-bootstrap | `k3s_bootstrap.yaml` | Flux bootstrap tuned for k3s (`KUBECONFIG=/etc/rancher/k3s/k3s.yaml`, `/root/.ssh`) |
| k3s-fluxcd-reconcile | *(none)* | Force-reconcile `flux-system` + `apps` GitRepository/Kustomization |
| k3s-install | `k3s_bootstrap.yaml` *(commented out)* | Install k3s, rewrite kubeconfig server/name, add `tls-san`, fetch kubeconfig |

#### `k8s-fluxcd-bootstrap-improved` (deep dive)

The production path. Its explicit design goal (per the header comment) is to fix ordering/dependency races that the older role hit. Sequence:

1. **Decrypt** `../sops/root.enc.yaml` → `decrypted_root` (for `github_token`).
2. **Reachability** — `k8s_info` for `Node`, fail if none.
3. **Validate** the Kustomize overlays for the cluster *before* touching it: `kubectl kustomize overlays/{{ cluster_name }}/common/` and `.../apps/` (run on `localhost`, no become).
4. **Pre-bootstrap infra** — `kubectl apply -k overlays/{{ cluster_name }}/common/` to lay down Calico, cert-manager, nginx *before* Flux.
5. **Wait for Calico** nodes and `calico-kube-controllers` to be `Ready` (300s each).
6. **CoreDNS hygiene** — check CoreDNS, restart it if `readyReplicas != replicas` (a known post-Calico symptom), wait for `NewReplicaSetAvailable`.
7. **DNS smoke test** — spin up a `busybox` pod that `nslookup github.com`, wait, read result, delete the pod, and **fail the whole run** if resolution didn't succeed.
8. **Deploy the SOPS-decrypted Flux SSH deploy key** to `$HOME/.ssh/platform-infra.pem` (`0600`) and `ssh-keyscan github.com` into `~/.ssh/github_known_hosts`.
9. **Clean up a stuck `flux-system`** namespace if it is `Terminating` (strip kustomization finalizers, force-delete pods, wait).
10. **`flux bootstrap github`** with `GITHUB_TOKEN=decrypted_root.github_token`, `--owner/--repository/--branch=main --path=kubernetes/overlays/{{ cluster_name }} --personal --force`, retried 3× / 30s.
11. **Wait** for `app.kubernetes.io/part-of=flux` pods to be Ready (600s).
12. **Create the `sops-keys` Secret** in `flux-system` from `age_key_path/.sops.agekey` (inline, via `kubernetes.core.k8s`).
13. **Reconcile**, then verify `flux get kustomizations` contains no `False` (retry 5× / 60s), run `flux check`, and print a summary.

!!! note "Overlay path differs between the two k8s roles"
    The *improved* role bootstraps against `kubernetes/overlays/{{ cluster_name }}`; the old `k8s-fluxcd-bootstrap` role (and the k3s role) bootstrap against `kubernetes/{{ cluster_name }}`. When adding a cluster, match the improved role's overlay layout.

#### `k8s-fluxcd-bootstrap` (legacy) & `k3s-fluxcd-bootstrap`

Both are the earlier, thinner pattern: decrypt root → `kubectl apply --validate=false` the latest Flux install manifest → write the SSH deploy key → create a `<repo>-ssh-key` Secret from the key + known_hosts → `flux bootstrap github`. Neither does the Calico/CoreDNS/DNS gating of the improved role. Both carry the same trailing comment block advocating a "bootstrap once, then add GitRepositories" approach and a `# TODO: add changed_when …`. The k3s variant additionally installs the Flux CLI if missing and pins `KUBECONFIG` to the k3s path. The **`k8s-fluxcd-bootstrap` role is not referenced by any playbook** and is effectively dead.

### SOPS / Age

| Role | Used by | Purpose |
|------|---------|---------|
| k3s-sops-age-secret | `k3s_bootstrap.yaml` | Create the `sops-keys` Age Secret in `flux-system` (standalone) |
| sops-load | v1 + mysql playbooks | Load `../sops/root.enc.yaml` and `../sops/{{ env }}.enc.yaml` into `decrypted_root` / `decrypted_env` facts |

`sops-load` is a tiny two-task role that only sets facts — it renders nothing itself; the v1 templates consume `decrypted_root`/`decrypted_env`. `k3s-sops-age-secret` is the standalone counterpart to the inline Age-secret step that the improved k8s role performs. See [The SOPS / Age secret model](#the-sops-age-secret-model) above for the full flow.

### Node / OS preparation (mostly optional / commented out in `k3s_bootstrap.yaml`)

| Role | Purpose |
|------|---------|
| apt-update-upgrade | `apt update && upgrade dist` |
| sudoers | Drop a `NOPASSWD:ALL` file in `/etc/sudoers.d/<user>` |
| root-terminal-colours | Copy `/etc/skel/.bashrc` → `/root/.bashrc` (coloured prompt) |
| prometheus-dir-permissions | `chmod 0777` on `/mnt/data/prometheus` and `/mnt/data/grafana` |

!!! warning "`prometheus-dir-permissions` uses 0777"
    The role's own comment admits the author can't remember why world-writable is needed ("there's a post about it somewhere"). `0777` on the data dirs is a security smell worth revisiting.

### Legacy v1 application stack

| Role | Used by | Purpose |
|------|---------|---------|
| v1_app | `v1_app_bootstrap.yaml` | Clone + `npm install`/`build` `admin-backend`+`admin-frontend`, template nginx/knex/env/pm2, `pm2 reload`, restart nginx |
| v1_driver | `v1_driver_bootstrap.yaml` | Clone + build `capture-driver`+`vendor-b-driver`, template pm2 ecosystem, `pm2 reload` |

Both roles follow the same shape: `stat` the repo dir; if absent, create `~/repos`, drop the decrypted SSH deploy key, `git clone` at `branch_mapping[env]` (`staging`/`master`), set `core.sshCommand` per-repo, then build via NVM-selected Node versions and (re)load pm2. `v1_app` also renders nginx (`default.j2`, `nginx.conf.j2`), `knexfile.js.j2`, `environment.prod.ts.j2`, and `ecosystem.config.js.j2`; `v1_driver` renders only its pm2 `ecosystem.config.js.j2`. Frontend builds on Node 14, everything else on Node 22; the vendor-b/vendor build additionally installs `node-expat`.

!!! warning "Legacy stack"
    `v1_*` is the pre-Kubernetes ("v1") deployment model — Node apps under pm2 behind nginx on bare VMs, fronted by a MikroTik CHR. It is retained for the still-running v1 environments but is superseded by the k3s/k8s ("v2") path. See legacy findings for a rendered-secrets file committed under `v1_app/templates/`.

### Fleet / one-off operations

| Role | Used by | Purpose |
|------|---------|---------|
| change-alarm-server | `change_alarm_server.yaml`, `azure_turn_off_vm.yaml` | PUT `<AlarmServer>` (id/address/port) to each camera's `/ISAPI/System/Network/AlarmServer` |
| azure-turn-off-vm | *(none directly)* | `azure_rm_virtualmachine … allocated: no` over `vmnames` |
| mysql-azure-export-aws-import | `mysql-export-import.yaml` | `mysqldump` on the Azure portal VM, fetch, copy to EC2, install `mysql-client`, import to RDS, clean up dumps |

!!! danger "`change-alarm-server` role file is written as a playbook"
    `roles/change-alarm-server/tasks/main.yaml` is authored as a **full play** (`- name: … / hosts: cameras / tasks:`), not a bare task list. Loaded as a role that is malformed. The `change_alarm_server.yaml` play meanwhile passes `new_alarm_server_*` vars the role file overrides with its own hard-coded `192.168.1.100:8000` example values. See legacy findings.

---

## Helper scripts

### `run_change_alarm_server_playbook.py`

A Python orchestrator for the camera alarm-server change. It tries to **download `inventory.ini` from S3** (via a `s3_inventory_storage.S3InventoryStorage` module, toggle `S3_DOWNLOAD_ENABLED`), falling back to **local generation** (`generate_camera_inventory.py`), then runs `ansible-playbook -i inventory.ini <PLAYBOOK_PATH default ../change_alarm_server.yaml>` and finally **deletes `inventory.ini`** as sensitive.

Source: `ansible/run_change_alarm_server_playbook.py`

!!! note "External dependencies not in this tree"
    Both `s3_inventory_storage` and `generate_camera_inventory.py` are imported/invoked but **do not exist under `ansible/`** — the script requires them to be supplied on `PYTHONPATH` / cwd at runtime. `PLAYBOOK_PATH` defaults to `../change_alarm_server.yaml`, implying the script is intended to run from a subdirectory.

### `test-connection.sh`

A four-arg (`HOST PORT USER PASS`) curl smoke test that Basic-auths against a vendor-A camera's `/ISAPI/Security/userCheck` and prints "Login successful" on HTTP 200. Handy for validating credentials before a `change-alarm-server` run.

Source: `ansible/test-connection.sh`

---

## Per-environment differences

| Aspect | Staging | Production |
|--------|---------|------------|
| k8s cluster / bootstrap path | `staging-cpt-aws` via `k8s_bootstrap_staging_cpt.yaml` | `prod-cpt-aws` via `k8s_bootstrap_prod_cpt.yaml` |
| v1 git branch (`branch_mapping`) | `staging` | `master` |
| v1 frontend hostname | `staging.example.com` | `secure.example.com` |
| v1 DB user | `capture_mysql_user` | `captureadmin` |
| Azure→AWS MySQL source | `example-staging-db.mysql.database.azure.com`, `--ssl-mode=DISABLED` | `10.0.0.20`, `--ssl-mode=REQUIRED` |
| SOPS env bundle | `../sops/staging.enc.yaml` | `../sops/prod.enc.yaml` |
| Age key path (bootstrap vars) | `$HOME` (`lookup('env','HOME')`) | `$HOME` (`lookup('env','HOME')`) |

The obs k3s cluster (`obs-cpt-staging`) and the office k3s cluster (`office-k3s`) are separate single-node targets with their own vars files; only obs has an in-tree playbook (`k3s_bootstrap.yaml`).

---

## Operational notes

- **Run k8s bootstraps from a workstation** that already has a working kubeconfig context for the target cluster, `flux`/`kubectl`/`sops`/`age` on PATH, `~/.sops.agekey` present at the configured `age_key_path`, and the `community.sops`/`kubernetes.core` collections installed. The play runs against `localhost`.
- **The bootstrap is destructive-ish**: `flux bootstrap … --force` and the "clean up stuck flux-system" block strip finalizers and force-delete pods. Expect it to reconcile the repo's entire `overlays/<cluster>` tree.
- **`k3s_bootstrap.yaml` currently only runs `k3s-fluxcd-bootstrap` + `k3s-sops-age-secret`** — the `k3s-install`, `sudoers`, `apt-update-upgrade`, `root-terminal-colours`, `prometheus-dir-permissions` roles are commented out, so it assumes k3s and the node are already prepared.
- **v1 idempotency is coarse**: most v1 tasks gate on `repos_folder … stat.exists == false`, so a second run skips clone/key/config steps and only rebuilds when `dist/` is missing or templates changed.

---

## Legacy and cleanup notes

!!! danger "Rendered pm2 config with plaintext production secrets is committed"
    `roles/v1_app/templates/ecosystem.config.js` is a **rendered output** of the adjacent `.j2` template, committed to git with live production values inlined (MongoDB SRV URI + password, API secret/key, super-admin password, Outlook/Gmail credentials, Crypto AES secret, driver IPs). It is superseded by `ecosystem.config.js.j2` and should be removed and the exposed secrets rotated.

!!! danger "Secrets hard-coded inside templates and tasks (not sourced from SOPS)"
    The v1 app pm2 template `ecosystem.config.js.j2` still inlines a MongoDB URI/password (`MONGO_URL`, `MONGO_PASSWORD`) and `DB_PASS`; `roles/mysql-azure-export-aws-import/tasks/main.yaml` hard-codes the Azure `mysqldump` password in the shell task (and leaves the AWS import password in a trailing comment). These should move to the SOPS bundles like the rest.

The remaining items are structural/orphaned rather than secret exposures:

- **`inventory.ini`** — a *generated* camera inventory committed with a plaintext camera credential, even though the Python runner regenerates then deletes it as sensitive. Should be `.gitignore`d.
- **`k8s-fluxcd-bootstrap`** (non-"improved") — orphaned; no playbook references it. The `improved` role is the live one.
- **`change-alarm-server` role** — its `tasks/main.yaml` is authored as a standalone play (`hosts:`/`tasks:`) rather than a role task list, and hard-codes example `192.168.1.100:8000` alarm-server values that shadow the vars the calling play passes. Effectively broken as a role.
- **`azure-turn-off-vm` role** — includes **itself** (`include_role: name: azure-turn-off-vm`), which would recurse; and `azure_turn_off_vm.yaml` uses the invalid key `vars-files:` (should be `vars_files:`) and wires the play to the unrelated `change-alarm-server` role. This op path looks non-functional as committed.
- **`chr_bootstrap.yaml`** targets a `mikrotik` group that exists in no inventory, and sets a throwaway password (`123`); it is a factory-first-boot helper only.
- **`k3s-fluxcd-reconcile`** and **`office_cpt.yaml`** are present but referenced by no in-tree playbook (reconcile is run ad hoc; office is a manual target).
- **Commented-out `k3s_bootstrap.yaml` roles** and the large blocks of commented pm2 apps in the v1 `ecosystem.config.js*` files (`up_down_status`, `watch_mongo`, `work_cameras`, `auto_resolve`, `filter_voi`, `auto_import`, etc.) are dead code retained inline.
- **Two inconsistent Flux overlay paths** (`kubernetes/overlays/<cluster>` in the improved role vs `kubernetes/<cluster>` in the old/k3s roles) — a migration seam.
