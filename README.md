# NodeOps Skills

AI agent skills for the [NodeOps](https://nodeops.network) ecosystem. Works with Claude Code, Cursor, Windsurf, and 40+ other AI coding agents via the [skills](https://skills.sh) CLI.

## Available Skills

| Skill | Description | Install |
|-------|-------------|---------|
| **createos** | Deploy anything to production on CreateOS cloud platform | `npx skills add https://github.com/NodeOps-app/skills --skill createos` |
| **vercel-to-createos** | Migrate Next.js, Vite, React, Vue, Svelte apps from Vercel to CreateOS | `npx skills add https://github.com/NodeOps-app/skills --skill vercel-to-createos` |

### Migration skills

`vercel-to-createos` is the first shipped skill in the migration family. Stubs for `netlify-to-createos`, `railway-to-createos`, `heroku-to-createos`, `render-to-createos`, and `flyio-to-createos` are reserved and route users to the concierge migration path until they ship. See [MIGRATIONS.md](./MIGRATIONS.md) for the full list and roadmap.

## CreateOS Authentication

The `createos` skill can be used in two modes:

- MCP mode (preferred when available): authentication is handled by the MCP server (no API key needed).
- REST/script mode: you must provide an API key via `CREATEOS_API_KEY`.

For REST/script usage:

```bash
export CREATEOS_API_KEY="<your-createos-api-key>"
```

Never commit API keys to git; prefer setting them in your shell or your agent environment.

## Installation

Install a specific skill:

```bash
npx skills add https://github.com/NodeOps-app/skills --skill createos
```

Install to a specific agent:

```bash
npx skills add https://github.com/NodeOps-app/skills --skill createos -a claude-code
```

List all available skills:

```bash
npx skills add https://github.com/NodeOps-app/skills --list
```

## Adding a New Skill

1. Create a new directory under `skills/` with your skill name:
   ```
   skills/
   └── your-skill/
       └── SKILL.md
   ```

2. Add a `SKILL.md` with frontmatter:
   ```markdown
   ---
   name: your-skill
   description: What the skill does and when to activate it.
   ---

   # Your Skill

   Instructions for the agent...
   ```

3. Optionally add supporting files:
   ```
   skills/your-skill/
   ├── SKILL.md          # Required: skill definition
   ├── config/           # Optional: configuration files
   ├── references/       # Optional: extended documentation
   ├── scripts/          # Optional: helper scripts
   └── assets/           # Optional: templates, images
   ```
