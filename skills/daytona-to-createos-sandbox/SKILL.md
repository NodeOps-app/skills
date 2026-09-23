---
name: daytona-to-createos-sandbox
description: Migrate a project's Daytona sandbox usage to CreateOS Sandbox. Use when replacing Daytona SDK, CLI, or API calls, or moving a Daytona sandbox workflow to CreateOS; covers TypeScript, Python, Go, Java, Rust, and C# target integrations.
---

# Daytona to CreateOS Sandbox

Migrate an application's Daytona sandbox workflow to CreateOS Sandbox. Preserve what the application needs to do; do not assume the platforms share lifecycle, network, storage, or preview semantics. This skill uses the **CreateOS Sandbox SDK**, not CreateOS application deployment projects or the MPP deployment gateway.

## When to use

Use when the user wants to move a project off Daytona, replace Daytona SDK/API/CLI calls, or run an existing Daytona-backed workflow on CreateOS Sandbox. For a new project with no Daytona usage, use the target SDK directly. Installing this skill alone does not start work; once a user asks for migration, carry the supported work through code changes and verification rather than stopping after a plan. If the user asks only for an assessment, complete the inventory and mapping without changing code or creating cloud resources.

## Prerequisites

- Access to the application's source is sufficient for code migration. Daytona or CreateOS account access is needed only for live inventory, data transfer, or a live smoke test.
- Check the application's runtime and package versions. The inspected CreateOS TypeScript package is ESM-only and requires Node 20+; its Java SDK requires Java 17. Confirm other SDK signatures against the version actually installed.
- Keep the two credentials separate. TypeScript reads `CREATEOS_SANDBOX_API_KEY` by default; the inspected Python, Go, Java, Rust, and C# SDKs use `CREATEOS_API_KEY`. Do not print secret values, copy them into committed files, or replace a Daytona key with a CreateOS key in a shared variable.

## Official CreateOS SDK sources

Use the repository for the application's target language as the source of truth for installation, API signatures, and runnable examples. Match guidance to the dependency version selected by the application and compile or typecheck the migration; do not copy a signature from another language.

- [Go SDK](https://github.com/NodeOps-app/createos-go-sdk)
- [Python SDK](https://github.com/NodeOps-app/createos-python-sdk)
- [Java SDK](https://github.com/NodeOps-app/createos-java-sdk)
- [Rust SDK](https://github.com/NodeOps-app/createos-rust-sdk)
- [C# SDK](https://github.com/NodeOps-app/createos-csharp-sdk)

The TypeScript target uses [`@nodeops-createos/sandbox`](https://github.com/NodeOps-app/createos-sandbox-sdk).

## Migration workflow

### 1. Inventory the Daytona project

Search manifests, lockfiles, source, scripts, and configuration for `daytona`, `@daytona/sdk`, `io.daytona`, `DAYTONA_`, `daytona.io`, Daytona CLI commands, and raw API calls. Inspect every path that creates, uses, reconnects to, or deletes a sandbox. Record environment variable **names**, not values.

Give a compact inventory update before editing, then continue:

```text
Language/runtime and Daytona integration:
Sandbox creation: image/snapshot, resources, environment, region, lifetime
Operations: commands/code, files, Git, processes, preview, desktop
State: volumes, data paths, sandbox IDs, snapshots
Network: inbound access, outbound restrictions, private links
Verification path: the smallest real operation that shows success
```

Distinguish configuration in source from state that exists only in a Daytona account. Do not assume a local repository reveals live volumes, snapshots, or secret values.

### 2. Make the feature mapping

Read [feature-map.md](references/feature-map.md) for the features actually present. Classify each as a direct SDK translation, an application change, a separate data task, or an unresolved capability. Explain changes to private previews, persistent state, lifecycle, or network policy before enabling target behavior. Use a safe target configuration while resolving ordinary choices; ask only when a required credential, data source, or consequential behavior choice cannot be inferred. A Daytona snapshot name, volume ID, or resource preset is not a CreateOS `rootfs`, disk, or shape.

### 3. Choose the CreateOS configuration

Read only the relevant language section of [sdk-recipes.md](references/sdk-recipes.md). Use the installed SDK's shape and root filesystem catalogs, or an existing approved target configuration. Decide whether the workflow needs a Dockerfile template, disk, overlay network, environment variables, SSH keys, auto-pause, or ingress. Preserve a private preview requirement through application-level authentication; CreateOS SDK ingress exposes a public URL.

Treat a request to migrate the running workflow as including target provisioning and verification when the necessary credentials are available. Prepare the exact resources and transfer path first. For a code-only request, finish the code migration and local checks without creating live resources.

### 4. Change the application

Replace the Daytona dependency, imports, client setup, sandbox creation, operations, and cleanup in the application's existing files. Translate shell command strings deliberately: CreateOS command requests pass an executable and arguments, while `shell`/`sh` runs shell syntax. Run stateless Daytona `code_run` through an installed interpreter; design persistent interpreter contexts separately. Update environment examples and deployment settings to use the selected CreateOS SDK's credential name.

Work through each supported Daytona call site, including error handling, timeouts, reconnect paths, and cleanup. Keep the source path available until the target behavior is verified. Remove obsolete Daytona dependencies and configuration only when no remaining path needs them. Do not delete Daytona sandboxes, snapshots, or volumes as part of verification.

### 5. Verify and report

Run the project's build, typecheck, or tests and fix migration-related failures. Search again for remaining Daytona references and explain any intentionally retained ones. When live migration is requested and credentials are available, create a target sandbox, run the application's representative operation, check its exit code and output, test files/processes/previews it uses, and clean up test resources. Check the destination's public access behavior before sharing a preview URL. If credentials or live data are unavailable, complete every local change and verification step before reporting the specific remaining blocker.

Finish only when the supported call sites have been migrated, the local checks pass, and the requested live path has been verified or its concrete blocker is identified. Report changed files, target configuration, tests and their results, any created resource IDs, features still using Daytona, and what remains unverified. The rollback path is the retained Daytona integration and resources until the CreateOS path passes the application's acceptance checks.

## Routing

- **TypeScript, Python, Go, Java:** use the corresponding source and target SDK recipe.
- **Rust:** Daytona's skill has no Rust SDK. Inspect whether the application calls Daytona through HTTP, CLI, or another service, then replace that integration with the CreateOS Rust SDK if appropriate.
- **C#:** Daytona's skill has no C# SDK. Inspect whether the application calls Daytona through HTTP, CLI, or another service, then replace that integration with the CreateOS C# SDK if appropriate.
- **Ruby:** Daytona documents this SDK, but no CreateOS Ruby SDK was found in the inspected workspaces. Inspect an available target SDK before providing code. If none is available, report the missing integration path instead of inventing method names.

When a feature has no verified direct mapping, retain the working source path and describe the specific redesign or validation needed. A partial migration report must identify which paths were changed and which still use Daytona.
