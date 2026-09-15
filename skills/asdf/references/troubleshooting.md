# asdf troubleshooting

Indexed by what the user actually sees. Start with the diagnostic triad — it identifies the
cause of most reports in three commands:

```bash
asdf info                  # version, OS, shell, config, PATH
asdf current <tool>        # resolved version + WHICH file or env var decided it
asdf which <command>       # the real binary behind the shim, or an error explaining why not
```

## `No version is set for command <cmd>`

The shim ran, found no applicable version, and stopped. One of:

- **No `.tool-versions` anywhere up the tree and none in `$HOME`.** `asdf current <tool>` shows
  no source. Fix: `asdf set <tool> <version>` in the project, or `asdf set -u` for a personal
  default.
- **The file pins a version that is not installed.** `asdf current` shows the version with
  `Installed = false` and suggests the install command. Fix: `asdf install`.
- **A parent directory's file was shadowed.** Some nearer `.tool-versions` exists and does not
  mention this tool. Resolution stops at the first *file that names the tool*, walking up — so
  add the tool to the nearer file, or use `asdf set -p` to edit the ancestor.

## `command not found` right after installing something

Two distinct causes, distinguished by what you installed:

**You installed a package *through* an asdf-managed tool** — `npm install -g yarn`,
`pip install black`, `gem install rubocop`, `go install ...`. asdf generates shims during its
own install step only; binaries that appear later have none.

```bash
asdf reshim nodejs    # or python / ruby / golang
```

**You installed asdf itself and the shims directory is not on `PATH`.**

```bash
echo "$PATH" | tr ':' '\n' | grep -n asdf   # is <data-dir>/shims there, and early?
```

If it is missing, the shell rc line was never added or is being overwritten later in startup.
See `setup.md`. If it is present but *after* `/usr/bin`, the system copy of the tool wins —
the shims entry must be prepended, not appended.

## Wrong version is being used

`asdf current <tool>` names the deciding file in its Source column. Work outward from there:

1. **Source is an `ASDF_<TOOL>_VERSION` env var.** Env beats every file, unconditionally, and
   often lingers in a shell from an earlier experiment. `unset ASDF_NODEJS_VERSION`.
2. **Source is an unexpected file.** Some parent directory — commonly `$HOME/.tool-versions`
   from a long-forgotten `asdf set -u` — is pinning it. Edit or remove that entry.
3. **Source looks right but the binary does not.** The shim is being bypassed. `which node`
   should print a path under `<data-dir>/shims`. If it prints `/usr/local/bin/node` or
   `/opt/homebrew/bin/node`, something prepends to `PATH` after asdf does.
4. **A version is pinned as `system`.** That is asdf explicitly deferring to the OS copy.

## `unknown command: global` (or `local`, or `shell`)

You are on 0.16+ running 0.15 syntax. `asdf global` → `asdf set -u`, `asdf local` →
`asdf set`, `asdf shell` → `ASDF_<TOOL>_VERSION=<v> <cmd>`. Full table in `migration.md`.

The reverse also happens: `asdf set` fails on a machine still running 0.15. Always
`asdf version` first when a command that "should exist" does not.

## Plugin not found / `asdf plugin add <name>` fails

```
error fetching plugin URL: plugin <name> not found in repository
```

The name has no entry in the community short-name index. Causes, in order of likelihood:

- **The short name differs from the tool name.** Go is indexed as `golang` (there is no `go`),
  AWS CLI as `awscli` (not `aws`). Search before concluding it is absent:
  `asdf plugin list all | grep -i <name>`.
- **No index entry exists** — common for newer, niche, or internal tools. Use the explicit form:
  `asdf plugin add <name> https://github.com/<owner>/asdf-<name>.git`. Find the repo through the
  [`asdf-plugin` GitHub topic](https://github.com/topics/asdf-plugin) or the
  [asdf-community org](https://github.com/asdf-community).
- **The index is stale or unreachable.** The explicit URL form skips the index entirely, which
  is also why it is the better choice in CI.
- **Already added.** Adding an existing plugin is an error, not a no-op. `asdf plugin list` to
  confirm; guard scripts with `|| true`.

To read an index entry directly without installing anything — it is one line of text:

```bash
curl -s https://raw.githubusercontent.com/asdf-vm/asdf-plugins/master/plugins/<name>
# → repository = https://github.com/asdf-community/asdf-hashicorp.git
```

## Plugin added fine, but every install of it fails

If `asdf plugin add` succeeded and `asdf install <tool>` fails at the download or list step,
suspect a **multi-tool plugin repo given the wrong local name**.

Repos like `asdf-community/asdf-hashicorp` (terraform, vault, consul, packer, nomad) determine
which tool they are installing from the basename of the directory asdf cloned them into. Name
the plugin anything other than the tool's canonical name and the scripts go looking for a
product that does not exist:

```bash
asdf plugin add tofu https://github.com/asdf-community/asdf-hashicorp.git   # clones, then fails
asdf plugin remove tofu
asdf plugin add nomad https://github.com/asdf-community/asdf-hashicorp.git  # correct
```

Check what you actually named it with `asdf plugin list`, and make sure `.tool-versions` uses
that same name.

## Install fails while compiling

The failure is the tool's build, not asdf. The message comes from `make`, a compiler, or a
missing header.

- Read the plugin's README for required system packages; `asdf help <tool>` may list them.
- Common on macOS: missing Xcode CLT (`xcode-select --install`), or openssl/readline headers
  for Python and Ruby.
- Common in slim containers: no `build-essential`, `curl`, `git`, `ca-certificates`.
- `always_keep_download = yes` in `.asdfrc` keeps the source tree around so you can retry the
  build by hand instead of re-downloading each attempt.
- Reduce parallelism if the build is being OOM-killed: `ASDF_CONCURRENCY=1 asdf install ...`.

## A shim shadows a system command

asdf shims every executable in an installed tool's `bin` directory. If an npm package or a gem
ships a binary with a common name, it lands on `PATH` ahead of the system one.

```bash
asdf which which            # what is the shim actually pointing at
asdf shimversions <cmd>     # which plugin+version put it there
```

Then remove the offending package from the tool and `asdf reshim`.

## `exec format error` / a shim does nothing

0.16+ executes via `syscall.Exec`, which requires a real shebang line. Scripts that worked
under the 0.15 Bash implementation without one now fail. Add `#!/usr/bin/env bash` (or the
appropriate interpreter) to the script.

Same root cause for plugin extension commands: in 0.16+ they must be executable and have a
shebang, and are invoked as `asdf cmd <plugin> <subcommand>`.

## Everything broke right after upgrading to 0.16+

Old shims were generated by the Bash implementation and point at machinery that no longer
exists:

```bash
asdf reshim
```

Also confirm the old `. "$HOME/.asdf/asdf.sh"` line is gone from your shell rc and the
`PATH` export replaced it. Full checklist in `migration.md`.

## asdf works interactively but not in CI, cron, Docker RUN, or a Makefile

Non-interactive shells do not read `~/.bashrc` or `~/.zshrc`, so the shims `PATH` entry never
gets set. Set it explicitly in the environment rather than relying on shell startup:

```dockerfile
ENV PATH="/root/.asdf/shims:${PATH}"
```

```makefile
export PATH := $(HOME)/.asdf/shims:$(PATH)
```

```yaml
- name: Put asdf shims on PATH for later steps
  run: echo "$HOME/.asdf/shims" >> "$GITHUB_PATH"
```

Do **not** reach for a workflow-level `env: PATH:` in GitHub Actions. The `env` context holds
only variables the workflow itself defined — it does not inherit the runner's `HOME` or `PATH` —
so `"${{ env.HOME }}/.asdf/shims:${{ env.PATH }}"` expands to `/.asdf/shims:` and *replaces* the
search path instead of extending it, breaking every subsequent step. `$GITHUB_PATH` is the
supported mechanism and appends correctly.

Alternatively, invoke through `asdf exec <command>`, which resolves without needing the shims
directory on `PATH` at all. See `ci.md`.

## `asdf current` does not list a tool that is in `.tool-versions`

`asdf current` walks installed *plugins*, not file entries. A pinned tool with no plugin added
is invisible to it. `asdf plugin list` will show the gap; `asdf plugin add <name>` closes it.

This is also why bulk onboarding has to add plugins before installing:

```bash
cut -d' ' -f1 .tool-versions | grep -v '^#' | xargs -n1 asdf plugin add
asdf install
```

## Slow `asdf plugin add` or hangs on first run

The short-name index is being cloned or re-synced from GitHub. Bypass it with an explicit git
URL, or turn it off permanently in `.asdfrc`:

```ini
disable_plugin_short_name_repository = yes
plugin_repository_last_check_duration = never
```

## WSL

WSL1 is not supported. WSL2 works, but only when the working directory is on the Linux
filesystem — running from a mounted Windows drive causes permission and performance problems.

## Reporting a bug upstream

Include the output of `asdf info` (OS, shell, asdf version, config, PATH), the exact command,
and the full error. It is the first thing maintainers ask for.
