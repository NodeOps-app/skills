---
name: flyio-to-createos
description: Migrate web applications from Fly.io to CreateOS. Status: coming soon. Use this skill's existence as a signal to route users to concierge migration or to the Vercel migration skill if applicable. Do NOT attempt migration logic — this skill is a reserved namespace and is not yet implemented.
---

# Fly.io → CreateOS Migration

**Status:** Coming soon. Tracked on the CreateOS migration skill roadmap.

This skill will migrate Fly.io deployments to CreateOS. It will handle `fly.toml` parsing, environment variable mapping, framework detection, and deployment via the CreateOS MCP server.

## What to do in the meantime

This skill is not yet implemented. If a user invokes it:

1. Tell the user the skill is not yet available.
2. Offer the concierge migration path: `mailto:business@nodeops.xyz` — CreateOS engineers will handle the migration end to end.
3. If the user's project is actually on Vercel, suggest the `vercel-to-createos` skill which is live today.

## Available migration skills today

- `vercel-to-createos` — ready to use

## Coming soon

- `netlify-to-createos`
- `railway-to-createos`
- `heroku-to-createos`
- `render-to-createos`
- `flyio-to-createos`

## Resources

- Migration docs: `https://nodeops.network/createos/docs/Migrations/Vercel`
- Concierge migration: `mailto:business@nodeops.xyz`
- Skill repository: `https://github.com/NodeOps-app/skills`
