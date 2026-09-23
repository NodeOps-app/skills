# Feature map

Use this map after inventorying a real project. It describes the Daytona SDKs in [daytona/clients](https://github.com/daytona/clients) and the CreateOS Sandbox SDKs, docs, and CLI; verify the installed SDK and live platform before relying on a capability that affects access, state, or cost. Daytona names are Python (`snake_case`); TypeScript uses camelCase and Go uses PascalCase. CreateOS names are shown in Python; check the target language's SDK.

## SDK and API

| Daytona use | CreateOS Sandbox approach | Check during migration |
| --- | --- | --- |
| `Daytona().create(...)` from snapshot or image; `resources` (cpu/memory/disk/gpu) apply only with `image` | `create_sandbox(CreateSandboxRequest(shape=..., rootfs=...))` | `shape` is required; pick from `list_shapes()` / `list_root_file_systems()` within the plan limit. Do not copy Daytona sizes or snapshot names. No GPU shapes. |
| `get(id_or_name)`, `list(labels)` | `get_sandbox(id)`, `get_sandbox_by_ip`, `list_sandboxes` | No labels; persist the sandbox ID or `name`. |
| `env_vars` on create; per-exec `env` | `environment_variables` (TS `envs`) on create; per-command env overrides | Every key must be declared at create (≤ 64). Per-command env cannot add new keys. |
| `secrets`, `update_secrets`, `update_env` | Declared create-time env vars (write-only values) | No secrets service or post-create env update; recreate or fork to change keys. |
| `sandbox.process.exec` (TS `executeCommand`, Go `ExecuteCommand`) | `run_command`, `shell`/`sh`, or `stream_command` | Preserve stdin, env, shell expansion, exit status, timeout. `RunCommandRequest` takes executable + arguments. No `cwd`: use `cd` in `shell` or a managed process `working_directory`. |
| Stateless `code_run` (with `language`) | Invoke installed Python, Node, or another interpreter through a command | Check that the rootfs/template has the runtime and dependencies. |
| Code interpreter contexts (`create_context`, `run_code`) | Persistent interpreter run as a managed process; see SDK example `14-jupyter-singleton` | Variables and context lifetime need redesign; no stateful interpreter API exists. |
| `sandbox.fs` (`list_files`, `create_folder`, `move_files`, `delete_file`, `find_files`, `search_files`, `replace_in_files`, `set_file_permissions`, `get_file_info`) | `files.upload` / `files.download`; `ls`, `mkdir`, `mv`, `rm`, `find`, `grep`, `sed`, `chmod`, `stat` through `shell` | CreateOS files are upload/download only. Move directories as a tar. |
| Signed `upload_url` / `download_url(ttl)` | Proxy transfers through the application, or presigned URLs on a BYO S3 disk | No signed file URLs. |
| Sessions (`create_session`, `execute_session_command`, logs), PTY | Managed processes (input, signals, output reconnect from sequence), PTY | Verify expected output retention and process lifetime. |
| `sandbox.git.*` | `git` commands through `shell` in a rootfs that has git | Handle credentials via declared env vars or SSH keys; no git helper API. |
| LSP (`create_lsp_server`) | Run the language server as a managed process | No LSP API. |
| `Image` builder or prebuilt snapshot | Dockerfile template (`templates` API / `createos sandbox template submit`), used as `rootfs` | Single-stage, allowlisted `FROM`, no `COPY`/`ADD`, no `ARG` in `FROM`, ≤ 64 KiB. Not on Free. A Daytona snapshot ID is not a template ID. |
| `create_snapshot`, `fork` | `fork` (snapshot of disk + memory into a new sandbox) | No snapshot import from Daytona; rebuild the environment and transfer selected files separately. |
| Volumes (FUSE over S3, `subpath`) | Registered S3-compatible disk and `DiskAttachment` | Needs a bucket, endpoint, credentials, and a data migration plan. Not on Free. Do not silently create a bucket or copy secret files. |
| `network_block_all`, `network_allow_list`, `domain_allow_list` | `egress` rules (Python `egress_rules`), changeable live | Empty list = open; any rule = deny-by-default. No documented block-all mode: `network_block_all` becomes the smallest allowlist the workflow needs, or an unresolved item. 5 GiB bandwidth cap per sandbox. |
| `outbound_proxy_url`, VPN connections | Overlay networks, `createos sandbox vpn`, tunnels | Semantics differ; test required destinations. |
| `public`, `get_preview_link` (token in `x-daytona-preview-token`), signed/expiring preview URLs | `ingress_enabled` / `set_ingress(True)`, `wait_for_port`, `preview_url(port)` | CreateOS ingress is a public HTTPS URL with no token. Add application authentication for private access. App must bind `0.0.0.0`. |
| SSH access tokens | SSH public keys at create or added later, shell websocket, tunnels | Key-based, not token-based. |
| Computer use, VNC | Computer/desktop APIs (`desktop:1` rootfs; screens, mouse, keyboard, windows; noVNC connect URL) | noVNC URL requires ingress. No recording or accessibility tree. |
| `stop`/`start`, `archive`, `auto_stop_interval`, `auto_pause_interval`, `pause` | `pause`/`resume`, `auto_pause_after_seconds` (60–86,400, off by default), `self_pause` | Paused sandboxes still bill memory and storage. |
| `auto_delete_interval`, `ttl_minutes`, `ephemeral` | Explicit `destroy`, or `self_delete` from inside | No max lifetime and no auto-delete. |
| `resize` | `resize` (disk) | CPU/memory need a new sandbox with another shape. |
| `target` (`us`/`eu`) | `region` (`eu`/`us`) matching the control plane | Data residency: self-hosting plus Bring-Your-Own-Storage. |
| Per-sandbox API delegation | Sandbox access tokens (`skp_sb_*`; create/rotate/disable) | Scoped to one sandbox; not preview auth. |
| Webhooks | CreateOS webhooks (`createos webhooks …`) | Check event names. |
| Metrics, OTel, log streaming, audit logs | Inspect the actual use case | No verified equivalent. |
| Object storage, linked sandboxes, spot, warm pools, Windows, GPU, runners/BYOC, MCP server | Inspect the actual use case | Do not infer parity. Report unsupported or unverified behavior. |

## CLI

| Daytona CLI | CreateOS CLI |
| --- | --- |
| `daytona login` | `createos login` (browser) or `createos login --token "$TOKEN"`; `whoami`, `logout` |
| `daytona create` | `createos sandbox create --shape … --rootfs … [--env K=V] [--egress rule] [--ingress] [--ssh-key …] [--network …] [--disk …] [--disk-mib …] [--auto-pause …]` |
| `daytona list`, `info` | `createos sandbox list`, `get` |
| `daytona start`/`stop`/`archive` | `createos sandbox resume`/`pause`; `edit --auto-pause` |
| `daytona delete` | `createos sandbox rm` |
| `daytona exec` | `createos sandbox exec <sandbox> -- <cmd> [args]` (`--stream`, `--env`) |
| `daytona ssh` | `createos sandbox shell`, or SSH with `edit --add-ssh-key` |
| `daytona preview-url` | `createos sandbox edit --ingress on`, then the public URL from `get` |
| File transfer | `createos sandbox push`, `pull`, `sync` |
| `daytona snapshot create` / `push` | `createos sandbox template submit <name> -f Dockerfile`; `template ls`, `show`, `logs`, `rm` |
| `daytona volume …` | `createos sandbox disk …` |
| Network settings | `createos sandbox firewall show\|set\|clear`, `network …`, `tunnel`, `vpn` |
| Size/image discovery | `createos sandbox shapes`, `createos sandbox rootfs` |
| `daytona mcp init` | No equivalent; use this skill or the SDKs. |

Daytona `create_snapshot` makes cold snapshots (files only) of container sandboxes and hot snapshots (files and memory) of Linux VM and Windows sandboxes. None of these import into CreateOS; transfer only the files the workflow needs.
