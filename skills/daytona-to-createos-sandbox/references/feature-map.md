# Feature map

Use this map after inventorying a real project. It describes the SDK surface in the inspected Daytona skill and CreateOS SDKs; verify the installed SDK and live platform before relying on a capability that affects access, state, or cost.

| Daytona use | CreateOS Sandbox approach | Check during migration |
| --- | --- | --- |
| `Daytona().create()` and resource options | `Client.create_sandbox(CreateSandboxRequest(...))` or language equivalent | `shape` is required; query available shapes and root file systems rather than copying Daytona sizes or snapshot names. |
| `sandbox.process.exec(...)` | `run_command`, `shell`, or `stream_command` | Preserve working directory, environment, shell expansion, stdin, exit status, and timeout. `RunCommandRequest` takes executable and argument fields. |
| Stateless `code_run` | Invoke installed Python, Node, or another interpreter through a command | Check that the selected rootfs/template has the runtime and dependencies. |
| Stateful code interpreter context | Application-managed persistent process, if suitable | Variables and context lifetime need redesign; no matching stateful interpreter API was found in the supplied CreateOS SDK. |
| `sandbox.fs` file operations | `files.upload` and `files.download`; commands for directory listing and file operations | The inspected CreateOS file service exposes file upload/download, not Daytona's full file-management surface. |
| Process sessions, background commands, PTY | CreateOS managed processes, input, signals, PTY, and reconnect | Verify expected output retention and process lifetime. |
| Image builder or prebuilt snapshot | Build a CreateOS template from a Dockerfile and use its ID as `rootfs` | Translate builder steps; a Daytona snapshot ID is not a CreateOS template ID. |
| Existing snapshot or sandbox state | Rebuild environment; transfer selected files or data separately if required | Do not promise direct snapshot import or memory-state transfer. |
| Daytona volume mount | CreateOS registered S3-compatible disk and `DiskAttachment` | Requires a bucket, endpoint, credentials, and a data migration plan. Do not silently create a bucket or copy secret files. |
| Outbound allowlist, proxy, VPN | CreateOS `egress_rules` and overlay networks where applicable | Semantics differ. Test required destinations and do not assume Daytona domain rules or outbound proxy transfer directly. |
| Private or signed preview | CreateOS public ingress and `preview_url` only when appropriate | No equivalent signed, expiring preview operation appears in the inspected CreateOS SDK. Add application authentication for private access. |
| Stop/start/archive and idle deadlines | Pause/resume, auto-pause, fork, destroy | These have different lifecycle and quota behavior. Map the application's intent, not method names. |
| Git, LSP, object storage, linked sandboxes, GPU, Windows, warm pools | Inspect the actual use case | Do not infer parity from ordinary command or desktop APIs. Report unsupported or unverified behavior. |

The Daytona entrypoint says running sandboxes cannot be snapshotted, while its detailed snapshot reference documents hot snapshots for running Linux VM and Windows sandboxes. If source-state export matters, check the sandbox class and installed Daytona SDK rather than following that blanket statement.
