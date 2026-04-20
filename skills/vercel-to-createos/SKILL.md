---
name: vercel-to-createos
description: Migrate Next.js, Vite, React, Vue, Svelte, and other web applications from Vercel to CreateOS. Parses vercel.json, maps environment variables, detects framework and build settings, and deploys to CreateOS via the CreateOS MCP server. Use this skill whenever the user mentions migrating from Vercel, leaving Vercel, moving a deployment off Vercel, replacing Vercel, or when a repository contains a vercel.json file and the user wants to deploy elsewhere. Also use when the user references concerns about Vercel reliability, pricing, security, or the Vercel breach, and wants an alternative.
---

# Vercel → CreateOS Migration

This skill migrates a project currently deployed on Vercel to CreateOS. It reads the existing Vercel configuration, translates it into a CreateOS project, provisions environments and environment variables, and triggers the first deployment — all through the CreateOS MCP server.

---

## When to use this skill

Activate this skill when any of the following is true:

- The user explicitly asks to migrate, move, or deploy from Vercel to CreateOS.
- The user expresses intent to leave Vercel (pricing, reliability, security, ownership concerns).
- The repository contains a `vercel.json`, `.vercel/` directory, or `@vercel/*` dependencies in `package.json`.
- The user asks for a "Vercel alternative" or references the April 2026 Vercel security incident.

Do NOT use this skill when:

- The user is deploying a fresh project with no prior Vercel deployment — use the standard `createos` skill instead.
- The project is a pure Next.js application with heavy dependencies on Vercel-specific features (Edge Middleware, Vercel KV, Vercel Blob, Vercel Postgres). Surface compatibility notes before proceeding.

---

## Prerequisites

Before running any migration steps, confirm the user has:

1. A CreateOS account — if not, direct them to `https://createos.nodeops.network` to sign in via Email, GitHub, Google, or Wallet.
2. CreateOS MCP connected OR a `CREATEOS_API_KEY` environment variable set.
3. Access to their current Vercel project's environment variables (they may need to export these from the Vercel dashboard).
4. GitHub repository access for the project (CreateOS deploys from GitHub for VCS projects).

If the user does not have their Vercel environment variables accessible, pause the migration and provide these instructions:

> Export your Vercel environment variables by running `vercel env pull .env.vercel.backup` in your project directory, or download them from Project Settings → Environment Variables in the Vercel dashboard. Keep this file local and do not commit it.

---

## Migration workflow

Follow these steps in order. Do not skip steps. Report progress to the user after each completed step.

### Step 1: Inventory the Vercel project

Read the following files from the repository if they exist:

- `vercel.json` — build, routing, function, and header configuration
- `package.json` — detect framework, build scripts, and Node.js version
- `next.config.js` / `next.config.mjs` / `next.config.ts` — Next.js specific configuration
- `.nvmrc` — Node version pin
- Any `.env*` files for reference (do NOT read secrets; only note which keys exist)

Produce a short summary for the user:

```
Detected project:
- Framework: [Next.js 14 / Vite / Remix / etc.]
- Node version: [20.x]
- Build command: [npm run build]
- Output directory: [.next]
- Environment variables needed: [count, with names — NOT values]
- Vercel-specific features in use: [list any edge middleware, KV, blob, etc.]
```

### Step 2: Flag incompatibilities before proceeding

Check for Vercel-specific features that do not have direct CreateOS equivalents. If any are present, STOP and confirm with the user how they want to handle each before continuing.

| Vercel feature | CreateOS handling |
|---|---|
| Edge Functions / Middleware | Runs as standard Node runtime on CreateOS — confirm latency impact is acceptable |
| Vercel KV | Migrate to CreateOS Valkey (Redis-compatible managed service) |
| Vercel Postgres | Migrate to CreateOS managed PostgreSQL |
| Vercel Blob | Use any S3-compatible storage; CreateOS does not provide blob storage natively |
| Image Optimization | Next.js image optimization works on CreateOS but uses the standard Node adapter |
| ISR / On-demand revalidation | Supported via standard Next.js caching; confirm revalidation paths work |
| Cron jobs | Use CreateOS cronjob support (see `CreateCronjob` MCP tool) |
| Preview deployments | Map to CreateOS preview environments (one per branch) |

### Step 3: Create the CreateOS project

Use the CreateOS MCP to create a new VCS-type project. Note: CreateOS uses a nested shape — `source` carries the GitHub linkage and `settings` carries build/runtime config. The deployment branch is set on the project's **environment** (Step 3b), not on the project itself.

1. Call `ListConnectedGithubAccounts` to verify GitHub is connected. The response includes the `installationId` you need for the next call. If no accounts are connected, call `InstallGithubApp` and pause for user action.
2. Call `ListGithubRepositories(installationId)` and confirm the target repo with the user. Capture the repo's `id` — that is the `vcsRepoId`.
3. Call `CheckProjectUniqueName({uniqueName})` to validate the proposed project name. `uniqueName` must match `^[a-zA-Z0-9-]+$`, 4–32 chars.
4. Call `CreateProject` with the nested `source`/`settings` shape. Two valid patterns — pick one:

   **Pattern A — Build AI (recommended default).** Use this when you cannot derive exact `installCommand` / `buildCommand` / `runCommand` from `vercel.json` + `package.json` with high confidence. CreateOS auto-detects from the repo:

   ```json
   CreateProject({
     "uniqueName": "<derived from project name>",
     "displayName": "<human-friendly name>",
     "type": "vcs",
     "source": {
       "vcsName": "github",
       "vcsInstallationId": "<from step 1>",
       "vcsRepoId": "<from step 2>"
     },
     "settings": {
       "useBuildAI": true,
       "runtime": "<see runtime mapping below — required>",
       "port": 80
     }
   })
   ```

   **Pattern B — Explicit commands.** Use this when `vercel.json` gives you concrete commands and a known framework. All command fields, when included, must be non-empty strings — **omit fields entirely rather than passing `""`** (empty strings cause a 400):

   ```json
   CreateProject({
     "uniqueName": "<derived from project name>",
     "displayName": "<human-friendly name>",
     "type": "vcs",
     "source": {
       "vcsName": "github",
       "vcsInstallationId": "<from step 1>",
       "vcsRepoId": "<from step 2>"
     },
     "settings": {
       "framework": "<see mapping table below — omit if no slug fits>",
       "runtime": "<see runtime mapping below>",
       "port": 3000,
       "directoryPath": ".",
       "installCommand": "<from package.json or vercel.json installCommand>",
       "buildCommand": "<from vercel.json buildCommand or package.json build script>",
       "runCommand": "<framework default, e.g. 'npm start' for Next.js>",
       "buildDir": "<from vercel.json outputDirectory or framework default, e.g. '.next'>"
     }
   })
   ```

   **Required-in-practice fields** (the API rejects without them, even though some are marked optional in the schema):
   - `port` — always include. Use `80` for static-shaped sites, `3000` for Node app defaults, or whatever the app actually listens on.
   - `runtime` — always include unless `framework` is set (and even then, include it for safety).
   - Either `useBuildAI: true` OR a complete command set (`installCommand` + `buildCommand` + `runCommand`). Mixing partial commands with `useBuildAI: false` causes a 400.

3b. Call `CreateProjectEnvironment(project_id, body)` to create the `production` environment. **All five body fields below are required by the API** — `description`, `settings`, and `resources` are not optional even though the docs may suggest otherwise. The `resources` triplet is all-or-nothing: include `cpu`, `memory`, and `replicas` together or omit `resources` entirely.

   ```json
   CreateProjectEnvironment(project_id, {
     "displayName": "Production",
     "uniqueName": "production",
     "description": "Production environment migrated from Vercel",
     "branch": "main",
     "isAutoPromoteEnabled": true,
     "settings": { "runEnvs": {} },
     "resources": { "cpu": 200, "memory": 500, "replicas": 1 }
   })
   ```

   Without this call, the project has no environment to deploy to. Resource limits: `cpu` 200–500 millicores, `memory` 500–1024 MB, `replicas` 1–3.

**Framework mapping (`settings.framework`):**

CreateOS supports a fixed set of framework slugs. If your detected framework has no slug, **omit the `framework` field** and rely on `useBuildAI: true` (Pattern A) or `runtime` + `buildCommand` + `runCommand` (Pattern B) instead.

| Detected | `settings.framework` | Notes |
|---|---|---|
| Next.js | `nextjs` | |
| React SPA (CRA, Vite React static) | `reactjs-spa` | |
| React SSR | `reactjs-ssr` | |
| Vue SPA | `vuejs-spa` | |
| Vue SSR | `vuejs-ssr` | |
| Nuxt | `nuxtjs` | |
| Astro | `astro` | |
| Remix | `remix` | |
| SvelteKit / Svelte | *omit* | Use Pattern A (`useBuildAI: true`) or Pattern B with `runtime: "node:20"` |
| Angular | *omit* | Build to static, set `buildCommand: "ng build"` + `buildDir: "dist/<app>"` |
| Vite (generic, non-React/Vue) | *omit* | Use Pattern A, or Pattern B with `runtime: "node:20"` |
| Pure static export | *omit framework* | Use **Pattern A with `runtime: "node:20"` and `port: 80`**. Do NOT use `runtime: "static"` for `type: "vcs"` projects — it is rejected. `runtime: "static"` only works for `type: "upload"` projects |

**Runtime mapping (`settings.runtime`):**

Read `.nvmrc` or `package.json` `engines.node`, then map to the closest supported runtime:

| Source value | `settings.runtime` |
|---|---|
| Node 18.x | `node:18` |
| Node 20.x | `node:20` |
| Node 22.x | `node:22` |
| No version pinned | `node:20` (current LTS default) |
| Static-only (no server) | `node:20` (with `useBuildAI: true`) — **not** `static` for VCS projects |

If the user's `.nvmrc` pins an unsupported version (e.g., Node 16), surface this and ask whether to upgrade to `node:20`.

### Step 4: Migrate environment variables

This is the highest-risk step. Handle with care.

1. Ask the user to paste their Vercel env var list (names only, NOT values) OR upload the `.env.vercel.backup` file.
2. Show them the list and confirm which variables should be migrated. Some Vercel-injected vars do NOT need migration:
   - `VERCEL_*` vars — these are Vercel-specific runtime vars and are not needed on CreateOS.
   - `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_REGION` — handled differently by CreateOS.
3. For each remaining variable, ask the user to provide the value (do NOT log or persist these values in the skill output).
4. Call `UpdateProjectEnvironmentEnvironmentVariables` to set them on the `production` environment.
5. Remind the user to mark sensitive values (API keys, tokens, database URLs) as sensitive in the CreateOS dashboard for encryption at rest.

**Security note to surface to the user:** If any Vercel environment variables were exposed during the April 2026 Vercel security incident, advise the user to rotate those credentials at the source (e.g., regenerate API keys in the issuing platform) before setting them on CreateOS.

### Step 5: Handle Vercel-specific dependencies in code

Scan for and flag these patterns in the codebase. Do NOT auto-rewrite code unless the user explicitly approves.

| Pattern | Action |
|---|---|
| `@vercel/kv` import | Flag for replacement with `ioredis` or `redis` pointed at CreateOS Valkey |
| `@vercel/postgres` import | Flag for replacement with `pg` or `postgres` pointed at CreateOS PostgreSQL |
| `@vercel/blob` import | Flag for replacement with S3-compatible client |
| `@vercel/analytics` import | Safe to remove or leave; no CreateOS replacement needed |
| `@vercel/speed-insights` import | Safe to remove; use Amplitude or similar if needed |
| `runtime: 'edge'` in route config | Flag — will run as standard Node on CreateOS |
| `middleware.ts` with edge runtime | Flag — will run as standard Node middleware |

Produce a summary of required code changes and ask the user whether they want the skill to generate a migration branch with these changes, or whether they will handle them manually.

### Step 6: Trigger the first deployment

1. Call `TriggerLatestDeployment` to kick off the first build.
2. Poll `GetDeployment` status until the build completes (or fails).
3. If the build fails:
   - Call `GetBuildLogs` to retrieve logs.
   - Summarize the failure for the user.
   - Suggest likely fixes based on common Vercel-to-CreateOS migration issues (see `references/common-issues.md` if bundled).
4. If the build succeeds, report:
   - The CreateOS deployment URL as returned by the API response (do NOT construct or guess the URL; use the exact `url` field from `GetDeployment`). The default subdomain pattern is `https://[project].createos.nodeops.network`, but always defer to the API's returned value.
   - Build duration
   - Deployment ID for reference

### Step 7: Domain handoff (guided, not automated)

Do NOT cut over DNS automatically. Walk the user through domain migration manually.

1. Ask if they want to configure a custom domain now.
2. If yes, call `CreateDomain` with their domain.
3. Surface the DNS records they need to configure at their DNS provider (not at Vercel).
4. Advise them to:
   - Test the CreateOS deployment thoroughly at the `createos.nodeops.network` subdomain first.
   - Lower their DNS TTL at the current provider to 300 seconds 24 hours before cutover.
   - Keep the Vercel deployment live until the CreateOS deployment is verified.
   - Cut DNS over only when ready.
   - Keep the Vercel deployment active for at least 72 hours post-cutover as a fallback.

### Step 8: Post-migration checklist

Produce a final report for the user covering:

- [ ] First deployment succeeded on CreateOS
- [ ] All environment variables migrated and tested
- [ ] Vercel-specific dependencies flagged (and resolved if applicable)
- [ ] Custom domain configured (if requested)
- [ ] DNS cutover plan understood
- [ ] Concierge support contact shared for complex issues

Share these resources:

- Docs: `https://nodeops.network/createos/docs/deploy`
- Migration guide: `https://nodeops.network/createos/docs/Migrations/Vercel`
- Concierge migration (for projects that need white-glove support): `mailto:business@nodeops.xyz`

---

## Failure modes and rollback

If the migration fails at any step and the user wants to abort:

1. The CreateOS project can be deleted with `DeleteProject` — no charges are incurred for a project that never successfully deployed.
2. The user's Vercel deployment is untouched throughout this workflow. Nothing in this skill modifies Vercel resources.
3. Offer the concierge migration path as a fallback for complex projects.

---

## What this skill does NOT do

Be explicit with the user about these boundaries:

- Does not modify or delete anything on Vercel.
- Does not automatically rewrite application code that uses Vercel-specific SDKs — only flags them.
- Does not perform DNS cutover — the user must do this intentionally.
- Does not migrate data from Vercel KV, Postgres, or Blob — data migration requires separate tooling.
- Does not migrate Vercel team members or access controls.

---

## Resources

- CreateOS MCP tools reference: `https://nodeops.network/createos/docs/api-mcp/mcp-operations`
- Skill repository: `https://github.com/NodeOps-app/skills`
- Full migration guide: `https://nodeops.network/createos/docs/Migrations/Vercel`
