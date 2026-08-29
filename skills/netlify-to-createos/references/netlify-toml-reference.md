# netlify.toml Reference for Migration

This document describes every field in `netlify.toml` and its CreateOS equivalent
(or migration guidance if no direct equivalent exists).

## `[build]` Section

```toml
[build]
  command = "npm run build"
  publish = "out"
  functions = "netlify/functions"
  base = ""
```

| Field | netlify.toml | CreateOS Equivalent | Status |
|-------|-------------|---------------------|--------|
| `command` | Build command | `CreateProject.settings.installCommand` + `settings.buildCommand` | ✅ |
| `publish` | Output directory | `CreateProject.settings.buildDir` | ✅ |
| `functions` | Functions directory | Not directly mappable — separate project | ⚠️ |
| `base` | Base directory | `CreateProject.settings.directoryPath` | ✅ |

## `[build.environment]` Section

```toml
[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS = "--legacy-peer-deps"
```

**Migration:** All key-value pairs map directly to
`UpdateProjectEnvironmentEnvironmentVariables`.

## `[[redirects]]` Section

```toml
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
  force = false
  conditions = {Language = ["en"], Country = ["US"]}
```

| Field | CreateOS Equivalent | Status |
|-------|---------------------|--------|
| `from` | App-level route matching | ⚠️ Manual |
| `to` | Target route or external URL | ⚠️ Manual |
| `status` | HTTP status code | ⚠️ Manual |
| `force` | Override existing content | ⚠️ Manual |
| `conditions` | Geo/language routing | ⚠️ Manual |

**Migration guidance:**
- Simple SPA redirects → Configure in frontend framework (e.g., next.config.js rewrites)
- API proxy redirects → Rewrite as direct API calls or CreateOS API routes
- Geo/language redirects → Implement in app code or use CDN-level rules

## `[[headers]]` Section

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
```

**Migration guidance:**
- Security headers → Configure in app framework or CreateOS settings
- CORS headers → Configure in app code (middleware)
- Custom headers → Configure in app framework

## `[functions]` Section

```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
  external_node_modules = ["sharp"]
  included_files = ["templates/**"]
```

| Field | CreateOS Equivalent | Status |
|-------|---------------------|--------|
| `directory` | Separate CreateOS project | ⚠️ Manual |
| `node_bundler` | Use CreateOS build AI | ✅ |
| `external_node_modules` | Add to package.json dependencies | ✅ |
| `included_files` | Include in project files | ✅ |

**Migration guidance:**
- Simple API functions → Rewrite as Express/FastAPI routes, deploy as CreateOS project
- Background functions → Use CreateOS cron jobs or queue workers
- Serverless → Full server (no cold starts on CreateOS)

## `[edge_functions]` Section

```toml
[edge_functions]
  path = "netlify/edge-functions"
```

**Status: ❌ Not supported.**
Guide the user to:
- Rewrite as serverless functions
- Implement logic in the app framework's middleware layer
- Use a CDN (e.g., Cloudflare Workers) if edge execution is critical

## `[[plugins]]` Section

```toml
[[plugins]]
  package = "@netlify/plugin-nextjs"
```

**Status: ⚠️ Manual per-plugin assessment.**

Common plugins and their CreateOS equivalents:

| Plugin | CreateOS Guidance |
|--------|-------------------|
| `@netlify/plugin-nextjs` | Not needed — CreateOS supports Next.js natively |
| `netlify-plugin-cypress` | Run Cypress in CI/CD pipeline |
| `netlify-plugin-prisma` | Use Prisma Migrate or prisma db push |
| `netlify-plugin-a11y` | Run axe-core in CI |
| `netlify-plugin-subfont` | Implement font subsetting in build step |
| `netlify-plugin-postbuild` | Implement in package.json postbuild script |

## `[context]` Sections

```toml
[context.production]
  command = "npm run build:prod"

[context.deploy-preview]
  command = "npm run build:preview"

[context.branch-deploy]
  command = "npm run build:staging"
```

**Migration:**
- `[context.production]` → `CreateProjectEnvironment` for production
- `[context.deploy-preview]` → Branch-based environment previews
- `[context.branch-deploy]` → `CreateProjectEnvironment` per branch

## `[dev]` Section

```toml
[dev]
  command = "npm run dev"
  port = 8888
  publish = "out"
  framework = "#custom"
```

**Migration:** Local dev is unchanged — not related to deployment.
Ignore this section during migration.

## Other Netlify Features

| Feature | netlify.toml | Status |
|---------|-------------|--------|
| Forms | `[forms]` | ❌ Not supported |
| Identity | `[identity]` | ❌ Not supported |
| CMS | External Netlify CMS config | ❌ Not supported |
| Functions blocking | `[functions.blocking]` | ⚠️ Manual |
| Scoped functions | `[[functions.scopes]]` | ⚠️ Manual |
| Build hooks | External | ⚠️ Manual |
| Post processing | `[build.processing]` | ⚠️ Manual |
