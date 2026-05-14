---
name: claude-code-to-codex
description: Use when migrating a developer setup from Claude Code CLI to Codex CLI, especially hooks, CLI MCP servers, plugins, CLAUDE.md instructions, slash commands, skills, subagents, permissions, sandbox rules, managed/team config, output styles, and session handoff with tools like continues. Do not use for Claude Desktop MCP migration unless explicitly asked.
---

# Claude Code to Codex

Migrate the user's Claude Code CLI setup into Codex CLI without silently dropping automation. Treat hooks, CLI MCP servers, plugins, and session history as first-class migration targets, not afterthoughts.

## Ground Rules

- Preserve behavior first, then improve naming or structure.
- Separate Claude Code CLI configuration from Claude Desktop configuration. Do not read or migrate Claude Desktop MCP servers unless the user explicitly requests it.
- Do not copy secrets into chat, commits, or generated files. Inventory environment variable names only; ask the user to re-enter secret values in the target tool when needed.
- Prefer project-scoped Codex config for team-shared behavior and user-scoped Codex config for personal behavior.
- Verify current CLI syntax with `claude --help`, `claude mcp --help`, `claude plugin --help`, `codex --help`, `codex mcp --help`, and current official docs when exact flags matter.
- Keep original Claude files intact until Codex behavior has been verified. Prefer additive `.codex/` files over destructive rewrites.

## Inventory

Inspect these Claude Code CLI sources if they exist:

| Area | Claude Code source | Codex target |
|---|---|---|
| Instructions | `CLAUDE.md`, nested `CLAUDE.md` files | `AGENTS.md`, `AGENTS.override.md`, `project_doc_fallback_filenames` |
| Custom commands | `.claude/commands/*.md`, plugin `commands/` | Codex skills, `AGENTS.md` command recipes, or prompts |
| Subagents | `.claude/agents/*.md`, plugin `agents/`, `agent` setting | Codex custom agents/subagents or skills |
| User settings | `~/.claude/settings.json`, `~/.claude.json` | `~/.codex/config.toml`, `~/.codex/hooks.json` |
| Project settings | `.claude/settings.json` | `.codex/config.toml`, `.codex/hooks.json` |
| Local settings | `.claude/settings.local.json` | project-local `.codex/config.toml` if intentionally shared, otherwise user config |
| Permissions | `permissions.allow/ask/deny`, permission mode, `--allowedTools`, `--disallowedTools` | `approval_policy`, `sandbox_mode`, `[permissions]`, `rules/*.rules`, hooks |
| Output style | `outputStyle`, `.claude/output-styles/`, plugin `output-styles/` | `personality`, `model_verbosity`, `AGENTS.md`, skills, or no direct equivalent |
| Project MCP | `.mcp.json` | `.codex/config.toml` `[mcp_servers.<name>]` tables, or plugin `.mcp.json` |
| Claude CLI MCP | `claude mcp list/get`, `~/.claude.json`, `.mcp.json` | `codex mcp add`, `~/.codex/config.toml` |
| Hooks | `hooks` objects in Claude settings or plugin `hooks/hooks.json` | Codex hooks in `.codex/hooks.json`, `~/.codex/hooks.json`, inline `[hooks]`, or plugin hooks |
| Plugins | `.claude-plugin/plugin.json`, marketplaces, installed plugin list | Codex plugin with `.codex-plugin/plugin.json`, `skills/`, `.mcp.json`, `hooks/hooks.json` |
| Team policy | managed settings, marketplace settings, allowed/denied MCP servers | Codex system config, `requirements.toml`, managed plugins/config |
| Sessions | `~/.claude/projects/` JSONL transcripts | `~/.codex/sessions/` via handoff, not raw copy |

Report a short inventory before editing:

```text
Claude Code migration inventory:
- Instructions: found/not found
- Hooks: count by event and source
- Claude Code CLI MCP servers: count by scope; Desktop imports excluded
- Plugins: installed/local/marketplace candidates
- Commands/subagents/output styles: count and recommended target
- Permissions/team policy: explicit rules and high-risk gaps
- Sessions: recent Claude sessions found; recommended handoff method
- Secrets: env var names only, values not read
```

## Migration Workflow

1. Create or update `AGENTS.md` from `CLAUDE.md`.
   - Preserve concrete repo rules, build/test commands, permissions, and style guidance.
   - Remove Claude-only tool names or translate them to Codex equivalents.
   - If both files must coexist, keep shared human-readable policy aligned and put agent-specific details in clearly labeled sections.
   - Use Codex project discovery deliberately: global `~/.codex/AGENTS.md` for personal defaults, repo `AGENTS.md` for shared rules, and `AGENTS.override.md` only for intentional temporary overrides.

2. Migrate custom slash commands and command recipes.
   - Inventory `.claude/commands/` and plugin `commands/`.
   - Convert repeatable procedural commands into Codex skills when they have conditional steps, references, or scripts.
   - Convert short command snippets into `AGENTS.md` recipes if they are project-specific and not worth a standalone skill.
   - Preserve arguments explicitly. Claude command files often rely on text after the command name; Codex skills should say how to pass user-supplied arguments.
   - Flag interactive Claude built-ins with no direct Codex equivalent. Map workflow intent instead:

| Claude command/workflow | Codex target |
|---|---|
| `/init` | `/init` or manually create `AGENTS.md` |
| `/mcp` | `/mcp`, `codex mcp`, `config.toml` |
| `/agents` | `/agent`, Codex subagents/custom agents |
| `/permissions` | `/permissions`, `approval_policy`, sandbox config, rules |
| `/hooks` | Codex hooks files and `/debug-config` |
| `/background`, `/tasks` | Codex `/ps`, `/stop`, subagents, app/remote workflows |
| custom `/deploy` style commands | Codex skill, plugin skill, or repo script documented in `AGENTS.md` |

3. Migrate subagents and agent defaults.
   - Inventory `.claude/agents/`, plugin `agents/`, and the Claude `agent` setting that runs the main thread as a named subagent.
   - Convert agents that describe a reusable workflow into Codex skills.
   - Convert agents that need independent context, parallel execution, or a different model/instruction profile into Codex custom agents/subagents.
   - Preserve tool restrictions as sandbox/approval/rules guidance when Codex custom-agent tool scoping cannot express the same policy.
   - Remember that Codex only spawns subagents when explicitly asked. Add `AGENTS.md` guidance if the old Claude workflow expected automatic delegation.
   - Document whether the agent is `direct`, `partial`, or `manual redesign`:

| Claude agent feature | Codex handling |
|---|---|
| Prompt/instructions | direct to Codex custom agent or skill |
| Model choice | direct if supported in Codex config, otherwise note |
| Tool restrictions | partial; use sandbox, approvals, rules, instructions |
| Hook/MCP/permissionMode frontmatter | partial/manual; verify Codex support before copying |
| Main-thread `agent` setting | manual; use profile/instructions or start with explicit prompt |

4. Migrate permissions, approvals, sandbox, and rules.
   - Treat this as security-sensitive. Do not loosen behavior silently.
   - Map intent rather than syntax:

| Claude behavior | Codex target |
|---|---|
| `permissions.deny` for reads/edits | `[permissions.<name>.filesystem]` deny entries, protected paths, `AGENTS.md` warnings |
| `permissions.allow` for safe Bash prefixes | Codex `rules/*.rules` `prefix_rule(... decision = "allow")` |
| `permissions.ask` | `prefix_rule(... decision = "prompt")` or `approval_policy = "on-request"` |
| `bypassPermissions` | avoid by default; only map to `sandbox_mode = "danger-full-access"` with explicit user approval |
| `acceptEdits` | `workspace-write` plus appropriate approval policy |
| `dontAsk` / auto mode | `approval_policy = "never"` only after confirming sandbox boundaries |
| `--add-dir` | `--add-dir`, writable roots, or scoped project config |
| blocked tool categories | sandbox mode, rules, hooks, MCP server enablement, and instructions |

   - Prefer Codex `approval_policy = "untrusted"` or `"on-request"` and `sandbox_mode = "workspace-write"` as conservative defaults.
   - Use Codex rules for shell escalation prefixes. Rules are exact-prefix based, can be `allow`, `prompt`, or `forbidden`, and load from `rules/` under active config layers.
   - Use hooks only for dynamic checks that rules cannot express.
   - Preserve managed policy intent with system config or `requirements.toml` where available.

5. Migrate general settings, environment, and UX preferences.
   - Map Claude `env` to shell environment, Codex config, MCP `env`, or `env_vars` forwarding. Never hardcode secrets.
   - Map model defaults to Codex `model`, `model_reasoning_effort`, `model_verbosity`, `service_tier`, and profiles when appropriate.
   - Map file opener/editor preferences to Codex `file_opener`.
   - Map transcript retention to Codex history settings if the user has privacy requirements.
   - Map status line/title preferences to Codex `/statusline`, `/title`, or config fields when available.
   - Flag Claude-specific settings with no Codex equivalent instead of pretending they migrated.

6. Migrate output styles, rules, and memory-like context.
   - Claude output styles change the system prompt. Codex does not use the same output-style format.
   - Convert output styles into one of:
     - `AGENTS.md` communication preferences for repo-wide behavior.
     - Codex `personality` / `model_verbosity` when the style is mostly tone or brevity.
     - A Codex skill when the style is actually a workflow.
     - A plugin skill if it must be distributed.
   - Keep coding-safety guidance that Claude output styles inherited from `keep-coding-instructions: true`; do not drop it during conversion.
   - For Claude memory/convention files, put durable project behavior in `AGENTS.md` and personal reusable behavior in global Codex guidance.

7. Migrate Claude Code CLI MCP servers.
   - Use `claude mcp list` and `claude mcp get <name>` when possible.
   - Include project `.mcp.json` and Claude Code user/project/local scopes.
   - Exclude servers imported only from Claude Desktop unless the user asks for Desktop migration.
   - Convert stdio servers to Codex:

```toml
[mcp_servers.server-name]
command = "node-or-binary"
args = ["arg1", "arg2"]
env = { TOKEN_ENV_VAR = "value-or-placeholder" }
# env_vars = ["TOKEN_ENV_VAR"]  # forward from shell instead of hardcoding
# cwd = "/absolute/or/project/path"
```

   - Prefer `codex mcp add <server-name> --env VAR=VALUE -- <command>` for simple stdio servers.
   - For HTTP MCP servers, configure the transport according to current Codex MCP docs and run `codex mcp login <server-name>` when OAuth is required.
   - After migration, verify in Codex with `/mcp` in the TUI or `codex mcp --help`/available subcommands.

8. Migrate hooks with extra care.
   - Enable Codex hooks:

```toml
[features]
codex_hooks = true
```

   - Codex looks for hooks next to active config layers as `hooks.json` or inline `[hooks]` tables. Common locations are `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json`, and `<repo>/.codex/config.toml`.
   - Map direct equivalents first:

| Claude hook | Codex handling |
|---|---|
| `PreToolUse` on `Bash` | `PreToolUse` matcher `Bash` |
| `PreToolUse` on `Edit`/`Write` | `PreToolUse` matcher `Edit|Write` or `apply_patch` |
| `PreToolUse` on MCP tools | matcher `mcp__server__tool` or `mcp__server__.*` |
| `PostToolUse` | `PostToolUse` where supported |
| `PermissionRequest` | `PermissionRequest` where approval policy triggers it |
| `UserPromptSubmit` | `UserPromptSubmit`; matcher is ignored in Codex |
| `SessionStart` | `SessionStart` with matcher `startup|resume|clear` |
| `Stop` | `Stop`; matcher is ignored in Codex |

   - Flag non-equivalent or partial migrations:
     - Claude `Notification`, `SubagentStop`, `SessionEnd`, `PreCompact`, `Setup`, `UserPromptExpansion`, prompt hooks, agent hooks, HTTP hooks, and `mcp_tool` hooks may need redesign instead of a direct copy.
     - Codex `PreToolUse` is a guardrail, not a complete enforcement boundary. It can intercept Bash, `apply_patch` file edits, and MCP tool calls; it does not cover every possible tool path.
     - Claude hooks that return `additionalContext`, `updatedInput`, allow/ask decisions, or async results may fail open or need rewriting for Codex-supported output fields.
   - Replace `CLAUDE_PROJECT_DIR` with a Codex-stable path. For repo hooks, prefer resolving from git root:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/pre_tool_use_policy.py\"",
            "timeout": 30,
            "statusMessage": "Checking Bash command"
          }
        ]
      }
    ]
  }
}
```

   - Test each migrated hook by triggering the matching event in Codex and confirming whether it blocks, warns, or adds context as expected.

9. Migrate plugins.
   - Inventory Claude plugins with `claude plugin list --json` when available, plugin marketplace settings, local `--plugin-dir` folders, and plugin roots that contain `.claude-plugin/plugin.json`.
   - Classify each Claude plugin component:

| Claude plugin component | Codex target |
|---|---|
| `skills/<name>/SKILL.md` | Codex `skills/<name>/SKILL.md` |
| `commands/*.md` | Convert to Codex skills or AGENTS.md commands guidance |
| `agents/*.md` | Convert to Codex subagents if available, otherwise skills or AGENTS.md |
| `hooks/hooks.json` | Codex plugin `hooks/hooks.json`, after hook compatibility review |
| `.mcp.json` | Codex plugin `.mcp.json` or user/project `[mcp_servers]` |
| `bin/` scripts | Keep as plugin assets/scripts if Codex plugin packaging supports the needed runtime |
| `settings.json`, themes, output styles, monitors, LSP | Usually not direct; flag for manual redesign |

   - Codex plugins use `.codex-plugin/plugin.json`. Keep `skills/`, `.mcp.json`, `hooks/`, `assets/`, and app files at the plugin root, not inside `.codex-plugin/`.
   - If the user only needs local reusable workflows, create standalone Codex skills first. Package as a Codex plugin when they need installable distribution.
   - Track marketplace migration separately from plugin conversion. A Claude marketplace entry does not automatically become a Codex plugin source.
   - For every plugin, produce a component inventory:

```text
Plugin: <name>
- skills: direct/partial/manual
- commands: converted to skills/AGENTS/manual
- agents: converted to subagents/skills/manual
- hooks: direct/partial/manual, with event notes
- MCP: user/project/plugin scope target
- settings/output styles/monitors/LSP/themes: direct/partial/no equivalent
```

10. Migrate sessions with handoff, not raw transcript copying.
   - Back up or export before handoff if the session is important:

```bash
continues inspect <session-id> --preset full --write-md handoff.md
continues dump claude ./session-backup/claude --preset full
```

   - Prefer `continues` when available:

```bash
npx continues
continues list --source claude --json
continues resume <session-id> --in codex --preset standard
continues inspect <session-id> --preset full --write-md handoff.md
continues resume <session-id> --in codex --debug-prompt
```

   - Use `bunx continues` if the user prefers Bun, but verify the package works in their environment. The documented package command may be `npx continues`.
   - Explain that `continues` reads Claude Code sessions from `~/.claude/projects/`, Codex sessions from `~/.codex/sessions/`, and creates a structured handoff prompt. It should not mutate original session files.
   - Also document native Codex resume for future work: `codex resume`, `codex resume --last`, and `codex resume <SESSION_ID>`.
   - Choose preset by risk:
     - `minimal`: quick context transfer
     - `standard`: default
     - `verbose`: complex task with relevant tool output
     - `full`: audit/debug migration where token cost is acceptable
   - If `continues` is unavailable, export or summarize the Claude transcript into a handoff document with: objective, decisions, modified files, commands run, failures, pending tasks, and exact current workspace state.

11. Validate.
   - Run `codex --version` and `codex mcp`/`/mcp` checks.
   - Start Codex in the migrated repo and ask it to summarize loaded instructions.
   - Trigger migrated hooks intentionally.
   - Call each MCP server with a harmless read-only request.
   - Open plugin/skill lists in Codex (`/plugins`, `/skills`) when relevant.
   - Use `/status`, `/debug-config`, `/permissions`, `/diff`, and `/review` to verify config, policy, and changes.
   - Use `continues --debug-prompt` or equivalent before launching a cross-tool handoff when the session contains sensitive context.

12. Keep a rollback path.
   - Keep `.claude/`, `.mcp.json`, and `CLAUDE.md` until Codex migration is verified.
   - Isolate generated `.codex/` changes in a separate commit or branch.
   - To disable pieces quickly, disable Codex hooks by removing `[features].codex_hooks = true`, disable MCP servers in config, or start Codex from an untrusted project layer.
   - Do not delete Claude sessions. They are the source of truth for handoff retries.

## Unsupported and Partial Equivalents

Use this table when users ask for a "complete" migration:

| Claude Code feature | Codex status | Action |
|---|---|---|
| Claude Desktop MCP connectors | out of scope by default | Ignore unless explicitly requested |
| `CLAUDE.md` | direct concept, different filename/discovery | Convert to `AGENTS.md` |
| `.claude/commands/*.md` | no exact same command store | Convert to Codex skills or recipes |
| Claude output styles | no same file format | Convert to personality/verbosity/AGENTS/skill |
| Claude themes | no direct migration unless Codex theme supports same fields | Recreate manually |
| Claude LSP plugin config | partial/no direct | Prefer MCP or local tooling; flag manual |
| Claude monitors/background hooks | partial | Convert to hooks, scripts, `/ps`, or external supervisor |
| Claude `Notification`, `SessionEnd`, `PreCompact` hooks | partial/no direct | Redesign or skip with notes |
| Claude agent hooks/prompt hooks/HTTP hooks | partial/no direct | Rewrite as Codex command hooks, MCP, or skills |
| Claude managed settings | partial | Map to Codex system config/requirements where possible |
| Raw session files | not portable contract | Use `continues` or handoff docs |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Migrating Claude Desktop MCP servers by accident | Only use Claude Code CLI sources unless Desktop migration is requested |
| Copying hook JSON verbatim | Check event, matcher, input, output, path variables, and fail-open behavior |
| Hardcoding MCP secrets in TOML | Use env forwarding or placeholders; ask user to set env vars locally |
| Treating plugins as only skills | Inventory hooks, MCP servers, agents, commands, bin scripts, and settings separately |
| Raw-copying session files | Use a handoff tool or generated handoff prompt; session stores are implementation details |
| Assuming hooks fully enforce policy | Treat hooks as guardrails; keep critical controls in sandbox, approvals, MCP scopes, and instructions too |
| Ignoring permission modes | Map policy intent to Codex approvals, sandbox, rules, and permissions before using Codex |
| Dropping output styles | Preserve role/tone/process instructions in `AGENTS.md`, personality, verbosity, or skills |
| Migrating team policy as user config | Use Codex system config or `requirements.toml` for managed constraints |

## Final Report

End each migration with:

```text
Claude Code -> Codex migration result:
- AGENTS.md/instructions: migrated/unchanged/pending
- Hooks: migrated count, skipped count, compatibility notes
- CLI MCP servers: migrated count, Desktop servers excluded
- Plugins: converted to skills/plugins/manual follow-up
- Commands/subagents/output styles: migrated target and gaps
- Permissions/sandbox/rules: conservative mapping and remaining risks
- Managed/team config: migrated target or unsupported notes
- Sessions: handoff command or exported handoff file
- Verification run: commands and outcomes
- Manual actions left: secret setup, OAuth login, plugin install, hook rewrites
```

## References

- Claude Code hooks: `https://markdown.new/https://code.claude.com/docs/en/hooks`
- Claude Code MCP: `https://markdown.new/https://code.claude.com/docs/en/mcp`
- Claude Code plugins: `https://markdown.new/https://code.claude.com/docs/en/plugins`
- Claude Code commands: `https://markdown.new/https://code.claude.com/docs/en/commands`
- Claude Code permissions: `https://markdown.new/https://code.claude.com/docs/en/permissions`
- Claude Code subagents: `https://markdown.new/https://code.claude.com/docs/en/sub-agents`
- Claude Code output styles: `https://markdown.new/https://code.claude.com/docs/en/output-styles`
- Codex config: `https://markdown.new/https://developers.openai.com/codex/config-basic`
- Codex advanced config: `https://markdown.new/https://developers.openai.com/codex/config-advanced`
- Codex rules: `https://markdown.new/https://developers.openai.com/codex/rules`
- Codex hooks: `https://markdown.new/https://developers.openai.com/codex/hooks`
- Codex MCP: `https://markdown.new/https://developers.openai.com/codex/mcp`
- Codex plugins: `https://markdown.new/https://developers.openai.com/codex/plugins`
- Codex skills: `https://markdown.new/https://developers.openai.com/codex/skills`
- Codex subagents: `https://markdown.new/https://developers.openai.com/codex/subagents`
- Codex CLI slash commands: `https://markdown.new/https://developers.openai.com/codex/cli/slash-commands`
- continues: `https://github.com/yigitkonur/cli-continues`
