# Migration Skills

A family of skills that migrate existing deployments from other cloud platforms to [CreateOS](https://createos.nodeops.network).

Each migration skill reads the source platform's configuration, maps it to CreateOS equivalents, provisions environments and environment variables, and triggers the first deployment via the CreateOS MCP server. Skills do not modify or delete anything on the source platform — your existing deployment stays live until you cut DNS over.

> **Note on naming:** The `skills` CLI in this repository uses a flat layout (`skills/<skill-name>/SKILL.md`). All migration skills are named `<platform>-to-createos` and live as siblings under `skills/`, not under a `migrate/` subdirectory.

## Available today

| Skill | Description | Install |
|-------|-------------|---------|
| **vercel-to-createos** | Migrate Next.js, Vite, React, Vue, Svelte apps from Vercel to CreateOS | `npx skills add https://github.com/NodeOps-app/skills --skill vercel-to-createos` |

## Coming soon

These skills are reserved namespaces with stub `SKILL.md` files in place. Until they ship, they route users to the concierge migration path at `https://createos.nodeops.network/migrate`.

| Skill | Source platform | Config file(s) it will parse |
|-------|----------------|------------------------------|
| **netlify-to-createos** | Netlify | `netlify.toml` |
| **railway-to-createos** | Railway | `railway.json` or `railway.toml` |
| **heroku-to-createos** | Heroku | `Procfile`, `app.json` |
| **render-to-createos** | Render | `render.yaml` |
| **flyio-to-createos** | Fly.io | `fly.toml` |

## Need a migration that hasn't shipped yet?

CreateOS offers a concierge migration service. Engineers will move your project end to end — config translation, environment variables, data, DNS — at no charge.

→ `https://createos.nodeops.network/migrate`

## Resources

- Full Vercel migration guide: `https://nodeops.network/createos/docs/Migrations/Vercel`
- CreateOS deployment docs: `https://nodeops.network/createos/docs/deploy`
- Concierge migration: `https://createos.nodeops.network/migrate`
- Skill repository: `https://github.com/NodeOps-app/skills`
