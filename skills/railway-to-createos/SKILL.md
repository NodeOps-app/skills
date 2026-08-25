---
name: railway-to-createos
description: "Migrate Node.js, Python, Go, Ruby, and other applications from Railway to CreateOS. Parses railway.json and railway.toml, maps environment variables per service, detects framework and build settings, and deploys to CreateOS via the CreateOS MCP server. Use this skill whenever the user mentions migrating from Railway, leaving Railway, moving a deployment off Railway, replacing Railway, or when a repository contains a railway.json or railway.toml file and the user wants to deploy elsewhere. Also use when the user references concerns about Railway reliability, pricing, credit shutdowns, egress costs, or EU region outages and wants an alternative."
---

# Railway → CreateOS Migration

This skill migrates a project currently deployed on Railway to CreateOS. It reads the existing Railway configuration, translates it into a CreateOS project, provisions environments and environment variables, and triggers the first deployment — all through the CreateOS MCP server.

---

## When to use this skill

Activate this skill when any of the following is true:

- The user explicitly asks to migrate, move, or deploy from Railway to CreateOS.
- The user expresses intent to leave Railway (pricing, reliability, credit shutdowns, egress costs, EU outages).
- The repository contains a `railway.json`, `railway.toml`, or a `Dockerfile` with Railway-specific environment references (`RAILWAY_*`).
- The user asks for a "Railway alternative" and wants to deploy on CreateOS.

Do NOT use this skill when:

- The user is deploying a fresh project with no prior Railway deployment — use the standard `createos` skill instead.
- The project uses Railway's multi-service canvas with more than 3 services. Surface complexity notes and offer the concierge migration path before proceeding.

---

## Prerequisites

Before running any migration steps, confirm the user has:

1. A CreateOS account — if not, direct them to `https://createos.nodeops.network` to sign in via Email, GitHub, Google, or Wallet.
2. CreateOS MCP connected OR a `CREATEOS_API_KEY` environment variable set.
3. Access to their Railway project's environment variables (export via Railway dashboard or CLI).
4. GitHub repository access for the project (CreateOS deploys from GitHub for VCS projects).

If the user does not have their Railway environment variables accessible, pause the migration and provide these instructions:

> Export your Railway environment variables by running `railway variables` in your project directory (requires Railway CLI), or download them per-service from the Railway dashboard under Variables. Keep this file local and do not commit it.

---

## Railway concepts → CreateOS mapping

Before migrating, understand how Railway's model maps to CreateOS:

| Railway concept | CreateOS equivalent |
|---|---|
| Project | Project |
| Service | Project (one CreateOS project per Railway service is the recommended approach) |
| Environment (Production / Staging) | Project Environment |
| Variables (per service, per environment) | Environment Variables on Project Environment |
| Custom domain (per service) | Domain on Project |
| Volume (persistent storage) | CreateOS does not provide managed volumes — use external storage (S3-compatible or managed DB) |
| Cron service | CreateOS Cronjob (`CreateCronjob` MCP tool) |
| Private networking between services | Not directly supported — services communicate via public URLs or you migrate to a monorepo |

**Important:** Railway's project canvas can run multiple services (web + worker + database) in one project. CreateOS maps each service to its own project. Plan the service split with the user before proceeding.

---

## Migration workflow

Follow these steps in order. Do not skip steps. Report progress to the user after each completed step.

### Step 1: Inventory the Railway project

Read the following files from the repository if they exist:

- `railway.json` or `railway.toml` — build, start, healthcheck, and restart configuration
- `package.json` — detect framework, build scripts, and Node.js version (if Node project)
- `Dockerfile` — if present, Railway may be using Docker-based builds (Railpack or custom)
- `.nvmrc` / `.python-version` / `go.mod` / `Gemfile` — runtime version pins
- Any `.env*` files for reference (do NOT read secrets; only note which keys exist)
- `Procfile` — if present, note web and worker process definitions

Produce a short summary for the user:

```
Detected project:
- Language/Framework: [Node.js 20 / Python 3.11 / Go 1.22 / etc.]
- Build system: [Nixpacks (auto) / Dockerfile / Railpack]
- Build command: [npm run build / pip install -r requirements.txt / etc.]
- Start command: [npm start / gunicorn app:app / ./main / etc.]
- Services detected: [web, worker, postgres, redis — list all]
- Environment variables needed: [count, with names — NOT values]
- Railway-specific features in use: [volumes, cron, private networking, etc.]
```

### Step 2: Plan the service split

Railway projects often contain multiple services (e.g., a web service, a background worker, and a managed Postgres). Confirm with the user which services to migrate and how:

| Railway service type | Migration plan |
|---|---|
| Web service | Migrate to CreateOS VCS project |
| Background worker / queue consumer | Migrate to separate CreateOS VCS project |
| Railway managed Postgres | Migrate to CreateOS managed PostgreSQL or external provider |
| Railway managed Redis | Migrate to CreateOS Valkey (Redis-compatible) |
| Railway managed MySQL | Migrate to CreateOS managed MySQL or external provider |
| Railway managed MongoDB | Use external MongoDB Atlas or self-hosted |
| Cron service | Use CreateOS Cronjob (`CreateCronjob` MCP tool) |
| Volume (persistent disk) | Flag — CreateOS does not provide managed volumes. Use S3-compatible storage or a managed database instead. |

For each managed database service on Railway, advise the user to export data before proceeding:

> **Postgres:** `pg_dump -h $PGHOST -U $PGUSER -d $PGDATABASE > backup.sql`
> **MySQL:** `mysqldump -h $MYSQLHOST -u $MYSQLUSER -p$MYSQLPASSWORD $MYSQLDATABASE > backup.sql`
> **Redis:** `redis-cli -h $REDISHOST SAVE` then copy the dump file.

Do not proceed with migration until the user confirms data is backed up.

### Step 3: Flag incompatibilities before proceeding

Check for Railway-specific features and patterns. If any are present, STOP and confirm with the user how they want to handle each before continuing.

| Railway feature | CreateOS handling |
|---|---|
| `RAILWAY_*` environment variables | These are Railway-injected runtime vars. Replace with CreateOS equivalents or remove. See variable mapping table below. |
| Private networking (`*.railway.internal`) | Services communicate via private hostnames on Railway. On CreateOS, services use public URLs — update any internal service URLs in config. |
| Railway volumes (persistent disk) | CreateOS does not offer managed volumes. Migrate data to S3-compatible storage or a managed database. |
| Multi-service canvas (3+ services) | Each service becomes a separate CreateOS project. Confirm wiring between them via public URLs. |
| Railway managed databases | Migrate data to CreateOS managed databases or external providers. |
| Cron services | Use CreateOS `CreateCronjob` MCP tool. |
| Healthcheck paths | Map to CreateOS health check configuration on the project environment. |
| Custom build args in Dockerfile | Supported — pass as environment variables on the CreateOS project. |
| Nixpacks auto-detection | CreateOS uses `useBuildAI: true` as the equivalent — it auto-detects language, runtime, and build commands. |

**Railway → CreateOS environment variable mapping:**

| Railway variable | CreateOS replacement |
|---|---|
| `RAILWAY_PUBLIC_DOMAIN` | Use the CreateOS deployment URL from `GetDeployment` |
| `RAILWAY_PRIVATE_DOMAIN` | Not applicable — use public URL of the target CreateOS service |
| `RAILWAY_PROJECT_ID` | Not needed — remove |
| `RAILWAY_SERVICE_ID` | Not needed — remove |
| `RAILWAY_ENVIRONMENT` | Replace with `NODE_ENV` or equivalent |
| `PORT` | Set explicitly on the CreateOS project (`port` field); Railway injects this automatically, CreateOS requires it declared |

### Step 4: Create the CreateOS project

Use the CreateOS MCP to create a new VCS-type project for each Railway web/worker service.

1. Call `ListConnectedGithubAccounts` to verify GitHub is connected. The response includes the `installationId` needed for the next call. If no accounts are connected, call `InstallGithubApp` and pause for user action.
2. Call `ListGithubRepositories(installationId)` and confirm the target repo. Capture the repo's `id` — that is the `vcsRepoId`.
3. Call `CheckProjectUniqueName({uniqueName})` to validate the proposed project name. `uniqueName` must match `^[a-zA-Z0-9-]+$`, 4–32 chars.
4. Call `CreateProject` with the nested `source`/`settings` shape. Two valid patterns — pick one:

   **Pattern A — Build AI (recommended default).** Use this when the Railway project uses Nixpacks auto-detection or when you cannot confidently derive exact commands from config files. CreateOS auto-detects from the repo:

   ```json
   CreateProject({
     "uniqueName": "<derived from Railway service name>",
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
       "port": 3000
     }
   })
   ```

   **Pattern B — Explicit commands.** Use this when `railway.json` / `railway.toml` gives you concrete `buildCommand` and `startCommand`. All command fields, when included, must be non-empty strings — **omit fields entirely rather than passing `""`** (empty strings cause a 400):

   ```json
   CreateProject({
     "uniqueName": "<derived from Railway service name>",
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
       "installCommand": "<from railway.json installCommand or package.json>",
       "buildCommand": "<from railway.json buildCommand>",
       "runCommand": "<from railway.json startCommand>",
       "buildDir": "<output directory if applicable>"
     }
   })
   ```

   **Required-in-practice fields:**
   - `port` — always include. Railway injects `PORT` automatically; CreateOS requires it declared. Default to `3000` for Node, `8000` for Python, `8080` for Go. Use whatever the app actually listens on.
   - `runtime` — always include.
   - Either `useBuildAI: true` OR a complete command set (`installCommand` + `buildCommand` + `runCommand`). Mixing partial commands with `useBuildAI: false` causes a 400.

4b. Call `CreateProjectEnvironment(project_id, body)` to create the `production` environment. **All five body fields are required:**

   ```json
   CreateProjectEnvironment(project_id, {
     "displayName": "Production",
     "uniqueName": "production",
     "description": "Production environment migrated from Railway",
     "branch": "main",
     "isAutoPromoteEnabled": true,
     "settings": { "runEnvs": {} },
     "resources": { "cpu": 200, "memory": 500, "replicas": 1 }
   })
   ```

   Resource limits: `cpu` 200–500 millicores, `memory` 500–1024 MB, `replicas` 1–3.

**Framework mapping (`settings.framework`):**

| Detected | `settings.framework` | Notes |
|---|---|---|
| Next.js | `nextjs` | |
| React SPA | `reactjs-spa` | |
| React SSR | `reactjs-ssr` | |
| Vue SPA | `vuejs-spa` | |
| Vue SSR | `vuejs-ssr` | |
| Nuxt | `nuxtjs` | |
| Astro | `astro` | |
| Remix | `remix` | |
| Express / Fastify / Hapi | *omit* | Use Pattern B with `runtime: "node:20"` and explicit `runCommand` |
| Django / FastAPI / Flask | *omit* | Use Pattern A or Pattern B with `runtime: "python:3.11"` |
| Go | *omit* | Use Pattern A or Pattern B with `runtime: "go:1.22"` |
| Ruby on Rails | *omit* | Use Pattern A or `runtime: "ruby:3.3"` |
| SvelteKit / Svelte | *omit* | Use Pattern A (`useBuildAI: true`) |
| Dockerized app | *omit* | Use Pattern A; CreateOS supports Dockerfile-based builds |

**Runtime mapping (`settings.runtime`):**

| Language / source value | `settings.runtime` |
|---|---|
| Node 18.x | `node:18` |
| Node 20.x | `node:20` |
| Node 22.x | `node:22` |
| Python 3.10 | `python:3.10` |
| Python 3.11 | `python:3.11` |
| Python 3.12 | `python:3.12` |
| Go 1.21 | `go:1.21` |
| Go 1.22 | `go:1.22` |
| Ruby 3.x | `ruby:3.3` |
| No version pinned | `node:20` (default if JS/TS project), else use Pattern A |

If the user's config pins an unsupported version, surface this and ask whether to upgrade to the nearest supported runtime.

### Step 5: Migrate environment variables

This is the highest-risk step. Handle with care.

1. Ask the user to paste their Railway variable list (names only, NOT values) or output of `railway variables`.
2. Show the list and confirm which variables to migrate. Filter out Railway-injected variables that do NOT need migration (see variable mapping table in Step 3).
3. For each remaining variable, ask the user to provide the value (do NOT log or persist these values in the skill output).
4. Call `UpdateProjectEnvironmentEnvironmentVariables` to set them on the `production` environment.
5. Remind the user to mark sensitive values (API keys, tokens, database URLs) as sensitive in the CreateOS dashboard for encryption at rest.
6. If the Railway project used service-to-service private networking (e.g., a worker connecting to Postgres via `*.railway.internal`), flag that these hostnames must be replaced with the new CreateOS managed database connection strings or external database URLs.

### Step 6: Handle Railway-specific patterns in code

Scan for and flag these patterns. Do NOT auto-rewrite unless the user explicitly approves.

| Pattern | Action |
|---|---|
| `process.env.RAILWAY_*` references | Replace with CreateOS equivalents or remove (see variable mapping table) |
| `*.railway.internal` hostnames | Replace with public URLs of the corresponding CreateOS service or external managed DB |
| `process.env.PORT` without a default | Railway always injects `PORT`; on CreateOS it must match the declared `port` field. Add a fallback: `const port = process.env.PORT \|\| 3000` |
| Health check endpoint missing | Railway can use TCP health checks; CreateOS may require an HTTP health check path — add a `/healthz` or `/health` route if absent |
| `Procfile` with `worker:` process | The worker process becomes a separate CreateOS project |
| Volume mounts (`/data`, `/storage`) | Flag — CreateOS does not support volumes. Refactor to use S3-compatible storage or a managed database |

Produce a summary of required code changes and ask the user whether they want the skill to generate a migration branch or whether they will handle them manually.

### Step 7: Trigger the first deployment

1. Call `TriggerLatestDeployment` to kick off the first build.
2. Poll `GetDeployment` status until the build completes or fails.
3. If the build fails:
   - Call `GetBuildLogs` to retrieve logs.
   - Summarize the failure for the user.
   - Common Railway-to-CreateOS failure causes:
     - Missing `PORT` declaration — ensure port is set both in code and in the CreateOS project settings.
     - `RAILWAY_*` variable still referenced in code — remove or replace.
     - Private networking hostname (`*.railway.internal`) still in config — replace with public URL.
     - Nixpacks build assumed a specific runtime not declared in CreateOS — switch to Pattern A (`useBuildAI: true`).
     - Volume mount path referenced in code — refactor to external storage.
4. If the build succeeds, report:
   - The CreateOS deployment URL as returned by the API (do NOT construct or guess the URL; use the exact `url` field from `GetDeployment`). The default subdomain pattern is `https://[project].createos.nodeops.network`, but always defer to the API's returned value.
   - Build duration
   - Deployment ID for reference

### Step 8: Domain handoff (guided, not automated)

Do NOT cut over DNS automatically. Walk the user through domain migration manually.

1. Ask if they want to configure a custom domain now.
2. If yes, call `CreateDomain` with their domain.
3. Surface the DNS records they need to configure at their DNS provider (not at Railway).
4. Advise them to:
   - Test the CreateOS deployment thoroughly at the `createos.nodeops.network` subdomain first.
   - Lower their DNS TTL at the current provider to 300 seconds 24 hours before cutover.
   - Keep the Railway deployment live until the CreateOS deployment is verified.
   - Cut DNS over only when ready.
   - Keep the Railway deployment active for at least 72 hours post-cutover as a fallback.

### Step 9: Post-migration checklist

Produce a final report for the user covering:

- [ ] All Railway services inventoried and migration plan confirmed
- [ ] Database data exported and backed up before migration
- [ ] First deployment succeeded on CreateOS
- [ ] All environment variables migrated (Railway-injected vars removed/replaced)
- [ ] Private networking hostnames replaced with public URLs
- [ ] `PORT` handling verified in code and CreateOS project settings
- [ ] Volume dependencies flagged and refactored (if applicable)
- [ ] Worker/cron services migrated to separate CreateOS projects or Cronjobs
- [ ] Custom domain configured (if requested)
- [ ] DNS cutover plan understood
- [ ] Concierge support contact shared for complex issues

Share these resources:

- Docs: `https://nodeops.network/createos/docs/deploy`
- Migration guide: `https://nodeops.network/createos/docs/Migrations/Vercel` (use as reference; Railway guide coming soon)
- Concierge migration (for projects needing white-glove support): `mailto:business@nodeops.xyz`

---

## Failure modes and rollback

If the migration fails at any step and the user wants to abort:

1. The CreateOS project can be deleted with `DeleteProject` — no charges are incurred for a project that never successfully deployed.
2. The user's Railway deployment is untouched throughout this workflow. Nothing in this skill modifies Railway resources.
3. Offer the concierge migration path as a fallback for complex multi-service projects.

---

## What this skill does NOT do

Be explicit with the user about these boundaries:

- Does not modify or delete anything on Railway.
- Does not automatically rewrite application code — only flags patterns that need changing.
- Does not perform DNS cutover — the user must do this intentionally.
- Does not migrate database data — data migration requires separate tooling (`pg_dump`, `redis-cli`, etc.).
- Does not migrate Railway team members or access controls.
- Does not support Railway volume migration — volumes must be refactored to external storage.
- Does not handle multi-service projects with private networking automatically — each service is migrated individually and rewired via public URLs.

---

## Resources

- CreateOS MCP tools reference: `https://nodeops.network/createos/docs/api-mcp/mcp-operations`
- Skill repository: `https://github.com/NodeOps-app/skills`
- Concierge migration: `mailto:business@nodeops.xyz`
