---
name: daytona-to-createos-sandbox
description: Migrate a project's Daytona sandbox usage to CreateOS Sandbox. Use when leaving Daytona, replacing `@daytona/sdk`, `@daytonaio/sdk`, `daytona`/`daytona_sdk` (Python), Daytona Go/Java/Ruby SDK, `daytona` CLI, or Daytona REST calls, or moving a Daytona sandbox workflow to CreateOS; covers TypeScript, Python, Go, Java, Rust, C# SDKs and the `createos sandbox` CLI.
---

# Daytona to CreateOS Sandbox

Migrate an application's Daytona sandbox workflow to CreateOS Sandbox. Preserve what the application needs to do; do not assume the platforms share lifecycle, network, storage, or preview semantics. This skill uses the **CreateOS Sandbox SDKs and CLI**, not CreateOS application deployment projects or the MPP deployment gateway.

## When to use

Use when the user wants to move a project off Daytona, replace Daytona SDK/API/CLI calls, or run an existing Daytona-backed workflow on CreateOS Sandbox. For a new project with no Daytona usage, use the target SDK directly. Installing this skill alone does not start work; once a user asks for migration, carry the supported work through code changes and verification rather than stopping after a plan. If the user asks only for an assessment, complete the inventory and mapping without changing code or creating cloud resources.

## Prerequisites

- Access to the application's source is sufficient for code migration. Daytona or CreateOS account access is needed only for live inventory, data transfer, or a live smoke test.
- CreateOS API keys come from <https://createos.sh/app/profile>. CLI users run `createos login` (browser) or `createos login --token "$TOKEN"` in CI.
- Check the application's runtime and package versions. The CreateOS TypeScript package is ESM-only and requires Node 20+; Python needs 3.10+; Go 1.25+; Java 17; Rust 1.98+ (`createos` 0.1.1); C# .NET 8. Confirm other SDK signatures against the version actually installed.
- Credential variable names differ by SDK. TypeScript and Go read `CREATEOS_SANDBOX_API_KEY`; Python, Java, Rust, and C# read `CREATEOS_API_KEY`. All SDKs read the base URL override from `CREATEOS_SANDBOX_BASE_URL` (default `https://api.sb.createos.sh`). Do not print secret values, copy them into committed files, or replace a Daytona key with a CreateOS key in a shared variable.
- Check the account's plan before choosing resources. Free allows 1 concurrent sandbox, 0 disks, 0 templates, and at most 1 vCPU / 1 GB; creates beyond the concurrency cap fail instead of queueing. Beginner and above allow disks and templates. `whoami` returns the running count.

## Official CreateOS SDK sources

Use the repository for the application's target language as the source of truth for installation, API signatures, and runnable examples. Match guidance to the dependency version selected by the application and compile or typecheck the migration; do not copy a signature from another language.

- [Go SDK](https://github.com/NodeOps-app/createos-go-sdk)
- [Python SDK](https://github.com/NodeOps-app/createos-python-sdk)
- [Java SDK](https://github.com/NodeOps-app/createos-java-sdk)
- [Rust SDK](https://github.com/NodeOps-app/createos-rust-sdk)
- [C# SDK](https://github.com/NodeOps-app/createos-csharp-sdk)
- [TypeScript SDK (`@nodeops-createos/sandbox`)](https://github.com/NodeOps-app/createos-sandbox-sdk)
- [CreateOS CLI](https://github.com/NodeOps-app/createos-cli) (`createos sandbox …`)

Daytona's own surface is defined by its SDKs in [daytona/clients](https://github.com/daytona/clients) and its [docs](https://www.daytona.io/docs/en.md). Use those, not Daytona's agent skill, when a Daytona method's behavior matters.

## Migration workflow

### 1. Inventory the Daytona project

Search case-insensitively (`rg -i`) across manifests, lockfiles, source, scripts, CI, and configuration for:

- Packages: `@daytona/sdk`, `@daytonaio/sdk` (legacy), PyPI `daytona` and `daytona_sdk`/`daytona-sdk` (legacy), `github.com/daytona/clients/sdk-go`, `github.com/daytonaio/daytona/libs/sdk-go` (legacy), Maven `io.daytona:sdk` or `io.daytona:sdk-java`, gems `daytona`/`daytona-sdk`.
- Symbols: `Daytona`, `AsyncDaytona`, `DaytonaConfig`, `CreateSandboxFromSnapshotParams`, `CreateSandboxFromImageParams`, `Image.`.
- Environment: `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `DAYTONA_TARGET`, `DAYTONA_ORGANIZATION_ID`, `DAYTONA_JWT_TOKEN`, `DAYTONA_SERVER_URL`.
- Hosts and CLI: `daytona.io`, `app.daytona.io/api`, `proxy.app.daytona.io`, `x-daytona-preview-token`, and `daytona create|exec|snapshot|volume|ssh|preview-url|mcp` in scripts.

Inspect every path that creates, uses, reconnects to (`get`, `list` by labels), or deletes a sandbox. Record environment variable **names**, not values.

Give a compact inventory update before editing, then continue:

```text
Language/runtime and Daytona integration (SDK, CLI, REST):
Sandbox creation: image/snapshot, resources, env vars, secrets, labels, region/target, lifetime (auto-stop/archive/delete, ttl, ephemeral)
Operations: exec/code_run, sessions/PTY, files, Git, LSP, preview, SSH, desktop
State: volumes, data paths, stored sandbox IDs, snapshots
Network: public/preview auth, allow lists, outbound proxy, VPN
Platform: webhooks, MCP server, orgs/API keys
Verification path: the smallest real operation that shows success
```

Distinguish configuration in source from state that exists only in a Daytona account. Do not assume a local repository reveals live volumes, snapshots, or secret values.

### 2. Make the feature mapping

Read [feature-map.md](references/feature-map.md) for the features actually present, including its CLI table for scripts and CI. Classify each as a direct SDK/CLI translation, an application change, a separate data task, or an unresolved capability. Explain changes to private previews, persistent state, lifecycle, environment, or network policy before enabling target behavior. Use a safe target configuration while resolving ordinary choices; ask only when a required credential, data source, or consequential behavior choice cannot be inferred. A Daytona snapshot name, volume ID, or resource preset is not a CreateOS `rootfs`, disk, or shape.

### 3. Choose the CreateOS configuration

Read only the relevant language section of [sdk-recipes.md](references/sdk-recipes.md). Select shape and rootfs from the live catalog (`listShapes`/`listRootfs` or language equivalent, or `createos sandbox shapes` / `createos sandbox rootfs`) within the plan's limits, or reuse an existing approved target configuration. Omitting `rootfs` gives `alpine:3.20`, which lacks most Daytona default tooling.

Decide whether the workflow needs:

- **Template:** a Dockerfile template when the Daytona image/snapshot installs tooling. Template Dockerfiles must be single-stage, `FROM` an allowlisted base (e.g. `nodeops/sandbox:debian`), contain no `COPY`/`ADD`, not use `ARG` in `FROM`, and be ≤ 64 KiB. Move local files the Daytona image copied in into a post-create upload or a `RUN curl`/`git clone` step.
- **Environment:** all keys at create (≤ 64 keys, write-only). Per-command env can change a declared key's value but cannot add new keys, so collect every key Daytona passed per `exec` into the create request.
- **Egress:** an empty rule list means open outbound; any rule makes it deny-by-default. Rules take `host`, `host:port`, `*.host`, `ip`, `ip:port`, `cidr[:port]`, and apply live. Bandwidth is capped at 5 GiB per sandbox by default.
- **Region:** `eu` or `us`, matching the control plane; map Daytona `target` deliberately.
- **Also consider:** disk (BYO S3), overlay network, SSH keys, auto-pause (off by default; 60–86,400 s), ingress.

Preserve a private preview requirement through application-level authentication; CreateOS ingress exposes a public HTTPS URL and apps must bind `0.0.0.0`. Paused sandboxes still bill memory and storage; there is no maximum lifetime, so replace Daytona auto-delete/ttl with explicit destroy or `selfDelete`.

Treat a request to migrate the running workflow as including target provisioning and verification when the necessary credentials are available. Prepare the exact resources and transfer path first. For a code-only request, finish the code migration and local checks without creating live resources.

### 4. Change the application

Replace the Daytona dependency, imports, client setup, sandbox creation, operations, reconnect (`get`/`list` → `getSandbox`/`listSandboxes`), and cleanup in the application's existing files. Daytona labels have no CreateOS equivalent; store the sandbox ID or `name` the application needs to reconnect. Translate shell command strings deliberately: CreateOS command requests pass an executable and arguments, while `shell`/`sh` runs shell syntax. Commands take no working directory; use `cd dir && …` in a shell command or a managed process `working_directory`. Run stateless Daytona `code_run` through an installed interpreter; design persistent interpreter contexts separately. Update environment examples and deployment settings to use the selected SDK's credential name.

Work through each supported Daytona call site, including error handling, timeouts, reconnect paths, and cleanup. Keep the source path available until the target behavior is verified. Remove obsolete Daytona dependencies and configuration only when no remaining path needs them. Do not delete Daytona sandboxes, snapshots, or volumes as part of verification.

### 5. Verify and report

Run the project's build, typecheck, lint, or tests and fix migration-related failures. Search again for remaining Daytona references and explain any intentionally retained ones. When live migration is requested and credentials are available, create a target sandbox, run the application's representative operation, check its exit code and output, test files/processes/previews it uses, and clean up test resources. Check the destination's public access behavior before sharing a preview URL. If credentials or live data are unavailable, complete every local change and verification step before reporting the specific remaining blocker.

Finish only when the supported call sites have been migrated, the local checks pass, and the requested live path has been verified or its concrete blocker is identified. Report changed files, target configuration, tests and their results, any created resource IDs, features still using Daytona, and what remains unverified. The rollback path is the retained Daytona integration and resources until the CreateOS path passes the application's acceptance checks.

## Routing

- **TypeScript, Python, Go, Java:** Daytona ships SDKs for these; use the corresponding target SDK recipe.
- **Rust, C#:** Daytona ships no SDK for these. Inspect whether the application calls Daytona through REST, CLI, or another service, then replace that integration with the CreateOS Rust or C# SDK.
- **Ruby:** Daytona ships a Ruby SDK; CreateOS has none. Use the REST API (`https://api.sb.createos.sh`, `X-Api-Key` header) or the `createos` CLI, following the CreateOS Sandbox REST docs. Do not invent SDK method names.
- **Daytona CLI in scripts or CI:** use the CLI table in the feature map.

When a feature has no verified direct mapping, retain the working source path and describe the specific redesign or validation needed. A partial migration report must identify which paths were changed and which still use Daytona. For migrations that need hands-on help, offer the concierge path: `mailto:business@nodeops.xyz`.
