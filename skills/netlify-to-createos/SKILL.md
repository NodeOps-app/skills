---
name: netlify-to-createos
description: "Migrate web applications from Netlify to CreateOS. Parses netlify.toml, maps build settings, environment variables, redirects, headers, and functions. Use this skill when the user mentions migrating from Netlify, leaving Netlify, moving off Netlify, switching from Netlify, netlify.toml, Netlify alternatives, replacing Netlify, Netlify is too expensive, Netlify downtime, or deploying a Netlify project elsewhere. Do NOT use this skill for brand-new projects that have never been on Netlify — use the base createos skill instead."
---

# Netlify → CreateOS Migration

This skill migrates a project currently deployed on Netlify to CreateOS. It reads the existing Netlify configuration (`netlify.toml`), translates it into a CreateOS project, provisions environments and environment variables, flags incompatibilities, and guides the first deployment — all through the CreateOS MCP server.

---

## When to use this skill

Activate this skill when any of the following is true:

- The user explicitly asks to migrate, move, or deploy from Netlify to CreateOS.
- The user expresses intent to leave Netlify (pricing, reliability, security, ownership concerns).
- The repository contains a `netlify.toml`, `.netlify/` directory, or `@netlify/*` dependencies in `package.json`.
- The user asks for a "Netlify alternative" or references Netlify-specific concerns.

Do NOT use this skill when:

- The user is deploying a fresh project with no prior Netlify deployment — use the standard `createos` skill instead.
- The project is heavily dependent on Netlify-specific features (Edge Functions, Netlify Forms, Netlify Identity). Surface compatibility notes before proceeding.

---

## Prerequisites

Before running any migration steps, confirm the user has:

1. A CreateOS account — if not, direct them to `https://createos.nodeops.network` to sign in via Email or Google.
2. CreateOS MCP server configured in opencode.json / Claude **OR** a `CREATEOS_API_KEY` environment variable set.
3. Access to their current Netlify project's environment variables (they may need to export these from the Netlify dashboard).
4. GitHub repository access for the project (CreateOS deploys from GitHub for VCS projects).
5. [Optional but recommended] Netlify CLI installed — `npm install -g netlify-cli`. The migration steps below use CLI commands where available for a smoother experience.

If the user does not have their Netlify environment variables accessible, pause the migration and provide these instructions:

> Export your Netlify environment variables by running `ntl env:list --json > netlify-env.json` in your project directory, or download them from Site Settings → Environment Variables in the Netlify dashboard. Keep this file local and do not commit it.

---

## Migration workflow

Follow these steps in order. Do not skip steps. Report progress to the user after each completed step.

### Step 1: Inventory the Netlify project

Read the following files from the repository if they exist:

- `netlify.toml` — build, redirect, header, and function configuration
- `package.json` — detect framework, build scripts, and Node.js version
- Framework-specific config files (e.g., `next.config.*`, `.nuxtrc`, etc.)
- `.nvmrc` / `.node-version` — Node version pin
- Any `.env*` files for reference (do NOT read secrets; only note which keys exist)

If Netlify CLI is available, optionally run `ntl deploy --build --json --dry-run` to get a full build preview — this reveals build output, functions, and any config issues before migration.

Produce a short summary for the user:

```
Detected project:
- Framework: [Next.js 14 / Vue / Astro / etc.]
- Node version: [20.x]
- Build command: [npm run build]
- Output directory: [dist / .next / build]
- Base directory: [. / subdir]
- Environment variables needed: [count, with names — NOT values]
- Netlify-specific features in use: [list any edge functions, forms, identity, plugins]
- Redirect rules: [count]
- Header rules: [count]
- Functions: [count]
```

### Step 2: Flag incompatibilities before proceeding

Check for Netlify-specific features that do not have direct CreateOS equivalents. If any are present, STOP and confirm with the user how they want to handle each before continuing.

| Netlify feature | CreateOS handling |
|---|---|
| Edge Functions | Not supported — rewrite as standard serverless functions or middleware |
| Netlify Forms | Use Formspree, Web3Forms, or a custom form handler |
| Netlify Identity | Use Auth0, Clerk, Supabase Auth, or NextAuth |
| Split Testing | App-level A/B testing (e.g., GrowthBook, LaunchDarkly) |
| Large Media | Use any S3-compatible object storage |
| Build hooks / webhooks | Use CreateOS API `POST /v1/projects/{id}/trigger-latest` — or works out of the box with GitHub (git push → auto-deploy) |
| Netlify Functions (simple) | Rewrite as standard REST endpoints within the same project |
| Netlify Functions (complex) | Deploy as a separate CreateOS microservice |
| Plugins (`@netlify/plugin-nextjs`, etc.) | Review per plugin — most are unnecessary on CreateOS |
| `[[redirects]]` simple | Implement in app framework (next.config.js, Express, etc.) |
| `[[redirects]]` with conditions | May need CDN-level configuration |
| `[[headers]]` | Implement in app framework or middleware |

### Step 3: Create the CreateOS project

#### 3a. Connect GitHub

1. Call `ListConnectedGithubAccounts` to verify GitHub is connected. The response includes the `installationId` you need for the next call. If no accounts are connected, call `InstallGithubApp` and pause for user action.
2. Call `ListGithubRepositories(installationId)` and confirm the target repo with the user. Capture the repo's `id` — that is the `vcsRepoId`.
3. Call `CheckProjectUniqueName({uniqueName})` to validate the proposed project name. `uniqueName` must match `^[a-zA-Z0-9-]+$`, 4–32 chars. Derive from the repo name (lowercase, replace underscores/special chars with hyphens).

#### 3b. Create the project

Call `CreateProject` with the nested `source`/`settings` shape. Two valid patterns — pick one:

**Pattern A — Build AI (recommended default).** Use this when you cannot derive exact `installCommand` / `buildCommand` / `runCommand` from `netlify.toml` + `package.json` with high confidence. CreateOS auto-detects from the repo:

```json
CreateProject({
  "uniqueName": "<derived from repo name>",
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

**Pattern B — Explicit commands.** Use this when `netlify.toml` gives you concrete commands and a known framework. All command fields, when included, must be non-empty strings — **omit fields entirely rather than passing `""`** (empty strings cause a 400):

```json
CreateProject({
  "uniqueName": "<derived from repo name>",
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
    "directoryPath": "<base from netlify.toml, default '.'>",
    "installCommand": "<e.g. 'npm install'>",
    "buildCommand": "<from netlify.toml build.command>",
    "runCommand": "<framework default, e.g. 'npm start' for Next.js>",
    "buildDir": "<from netlify.toml build.publish, e.g. 'dist'>"
  }
})
```

**Required-in-practice fields** (the API rejects without them, even though some are marked optional in the schema):
- `port` — always include. Use `80` for static sites, `3000` for Node app defaults, or whatever the app actually listens on.
- `runtime` — always include unless `framework` is set.
- Either `useBuildAI: true` OR a complete command set (`installCommand` + `buildCommand` + `runCommand`).

#### 3c. Create the production environment

Call `CreateProjectEnvironment(project_id, body)` to create the `production` environment. **All five body fields below are required by the API** — `description`, `settings`, and `resources` are not optional even though the docs may suggest otherwise. The `resources` triplet is all-or-nothing: include `cpu`, `memory`, and `replicas` together or omit `resources` entirely.

```json
CreateProjectEnvironment(project_id, {
  "displayName": "Production",
  "uniqueName": "production",
  "description": "Production environment migrated from Netlify",
  "branch": "main",
  "isAutoPromoteEnabled": true,
  "settings": { "runEnvs": {} },
  "resources": { "cpu": 200, "memory": 500, "replicas": 1 }
})
```

Without this call, the project has no environment to deploy to. Resource limits: `cpu` 200–500 millicores, `memory` 500–1024 MB, `replicas` 1–3.

**Framework mapping (`settings.framework`):**

CreateOS supports a fixed set of framework slugs. If your detected framework has no slug, **omit the `framework` field** and rely on `useBuildAI: true` (Pattern A) or `runtime` + commands (Pattern B).

| Detected | `settings.framework` | Notes |
|---|---|---|
| Next.js (`next` in deps) | `nextjs` | |
| React SPA (CRA, Vite React) | `reactjs-spa` | |
| React SSR | `reactjs-ssr` | |
| Vue SPA | `vuejs-spa` | |
| Vue SSR | `vuejs-ssr` | |
| Nuxt | `nuxtjs` | |
| Astro | `astro` | |
| Angular | *omit* | Build to static, set `buildDir: "dist/<app>"` |
| Svelte / SvelteKit | *omit* | Use Pattern A (`useBuildAI: true`) with `runtime: "node:20"` |
| Vite (generic) | *omit* | Use Pattern A, or Pattern B with `runtime: "node:20"` |
| Pure static (HTML/CSS/JS) | *omit framework* | Use Pattern A with `runtime: "node:20"` and `port: 80` |
| Hugo / 11ty / Jekyll | *omit* | Set explicit `buildCommand`, pick `vanilla-js` framework if it fits |

**Runtime mapping (`settings.runtime`):**

Read `NODE_VERSION` from `netlify.toml [build.environment]`, `.nvmrc`, or `package.json` `engines.node`, then map:

| Source value | `settings.runtime` |
|---|---|
| Node 18.x | `node:18` |
| Node 20.x | `node:20` |
| Node 22.x | `node:22` |
| No version pinned | `node:20` |
| `python` in build command | `python:3.12` |
| `bun.lock` present | `bun:1.3` |
| Go binary detected | `golang:1.25` |
| Static-only (no server) | `node:20` with `useBuildAI: true` |

If the user's config pins an unsupported version (e.g., Node 16), surface this and ask whether to upgrade.

### Step 4: Migrate environment variables

This is the highest-risk step. Handle with care.

1. Ask the user to paste their Netlify env var list (names only, NOT values) OR upload the `netlify-env.json` file. If Netlify CLI is available, the user can run `ntl env:list --json > netlify-env.json` and share the file, or run `ntl env:list` for a readable table view.
2. Show them the list and confirm which variables should be migrated. Some Netlify-injected vars do NOT need migration:

   | Netlify Var | Action |
   |---|---|
   | `NETLIFY` | ❌ Remove |
   | `CONTEXT` | ❌ Remove |
   | `URL` | 🔄 Replace with `CREATEOS_DEPLOYMENT_URL` |
   | `DEPLOY_URL` | 🔄 Replace with `CREATEOS_DEPLOYMENT_URL` |
   | `DEPLOY_PRIME_URL` | 🔄 Replace with `CREATEOS_DEPLOYMENT_URL` |
   | `SITE_NAME` | ➡️ Keep as-is |
   | `SITE_ID` | ➡️ Keep as-is |
   | Any custom var | ➡️ Keep as-is |

3. For each remaining variable, ask the user to provide the value (do NOT log or persist these values in the skill output).
4. Call `UpdateProjectEnvironmentEnvironmentVariables` to set them on the `production` environment.
5. Remind the user to mark sensitive values (API keys, tokens, database URLs) as sensitive in the CreateOS dashboard for encryption at rest.

**Security note to surface to the user:** If any environment variables were exposed, advise the user to rotate those credentials at the source before setting them on CreateOS.

### Step 5: Handle Netlify-specific dependencies in code

Scan for and flag these patterns in the codebase. Do NOT auto-rewrite code unless the user explicitly approves.

| Pattern | Action |
|---|---|
| `process.env.NETLIFY` or similar Netlify env vars | Replace with `process.env.CREATEOS_DEPLOYMENT_URL` |
| `exports.handler` (Netlify Functions pattern) | Flag for rewrite as Express route or serverless function |
| `@netlify/functions` import | Flag for removal |
| `@netlify/plugin-nextjs` | Safe to remove — CreateOS supports Next.js natively |
| `netlify-*` dependencies | Evaluate per package |
| `[[redirects]]` in netlify.toml | Flag for implementation in app framework |
| Edge Functions config | Flag — not supported on CreateOS |

Produce a summary of required code changes and ask the user whether they want the skill to generate a migration branch with these changes, or whether they will handle them manually.

### Step 6: Trigger the first deployment

1. Call `TriggerLatestDeployment` to kick off the first build.
2. Poll `GetDeployment` status until the build completes (or fails).
3. If the build fails:
   - Call `GetBuildLogs` to retrieve logs.
   - Summarize the failure for the user.
   - Suggest likely fixes based on common Netlify-to-CreateOS migration issues.
4. If the build succeeds, report:
   - The CreateOS deployment URL as returned by the API response (use the exact `url` field from `GetDeployment`).
   - Build duration
   - Deployment ID for reference

### Step 7: Domain handoff (guided, not automated)

Do NOT cut over DNS automatically. Walk the user through domain migration manually.

1. Ask if they want to configure a custom domain now.
2. If yes, call `CreateDomain` with their domain.
3. Surface the DNS records they need to configure at their DNS provider (not at Netlify).
4. Advise them to:
   - Test the CreateOS deployment thoroughly at the CreateOS subdomain first.
   - Lower their DNS TTL at the current provider to 300 seconds 24 hours before cutover.
   - Keep the Netlify deployment live until the CreateOS deployment is verified.
   - Cut DNS over only when ready.
   - Keep the Netlify deployment active for at least 72 hours post-cutover as a fallback.

### Step 8: Post-migration checklist

Produce a final report for the user covering:

- [ ] First deployment succeeded on CreateOS
- [ ] All environment variables migrated and tested
- [ ] Netlify-specific dependencies flagged (and resolved if applicable)
- [ ] Custom domain configured (if requested)
- [ ] DNS cutover plan understood
- [ ] Redirects and headers verified
- [ ] Functions rewritten or alternative in place
- [ ] Netlify Forms/Identity replaced (if applicable)
- [ ] Concierge support contact shared for complex issues

Share these resources:

- Docs: `https://nodeops.network/createos/docs/deploy`
- Migration guide: `https://nodeops.network/createos/docs/Migrations/Netlify`
- Concierge migration (for projects that need white-glove support): `mailto:business@nodeops.xyz`

---

## Failure modes and rollback

If the migration fails at any step and the user wants to abort:

1. The CreateOS project can be deleted with `DeleteProject` — no charges are incurred for a project that never successfully deployed.
2. The user's Netlify deployment is untouched throughout this workflow. Nothing in this skill modifies Netlify resources.
3. Offer the concierge migration path as a fallback for complex projects.

---

## What this skill does NOT do

Be explicit with the user about these boundaries:

- Does not modify or delete anything on Netlify.
- Does not automatically rewrite application code that uses Netlify-specific SDKs — only flags them.
- Does not perform DNS cutover — the user must do this intentionally.
- Does not migrate data from Netlify Forms submissions or Netlify Identity — data migration requires separate tooling.
- Does not handle monorepo deployments (recommends per-project migration).
- Does not migrate Netlify team/org settings.

---

## Resources

- CreateOS MCP tools reference: `https://nodeops.network/createos/docs/api-mcp/mcp-operations`
- Skill repository: `https://github.com/NodeOps-app/skills`
- Full migration guide: `https://nodeops.network/createos/docs/Migrations/Netlify`
- Netlify toml reference: `https://docs.netlify.com/configure-builds/file-based-configuration/`
- Netlify env vars reference: `https://docs.netlify.com/configure-builds/environment-variables/`
