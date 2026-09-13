---
name: asdf
description: "Manage runtime and CLI tool versions with asdf — the plugin-based version manager that replaces nvm, rbenv, pyenv, gvm, tfenv, jenv and friends with one tool and one `.tool-versions` file. Use this skill whenever the work touches: installing or pinning a language runtime (Node, Python, Go, Ruby, Java, Rust, Erlang, Elixir, PHP, .NET) or a CLI tool (kubectl, terraform, helm, awscli, jq, golangci-lint); a `.tool-versions` file appearing, being read, or needing an edit; `asdf` appearing in a shell command, Dockerfile, Makefile, or CI config; errors like `No version is set for command X`, `command not found` after installing a tool, `unknown command: global`, or a shim resolving to the wrong version; onboarding a repo so every dev and CI runner gets identical toolchain versions; migrating off nvm/rbenv/pyenv/`.nvmrc`/`.ruby-version`; upgrading asdf 0.15 to 0.16+; or writing/debugging an asdf plugin. Also use when someone asks to pin, bump, lock, or reproduce tool versions across machines, containers, or CI, even if they never say the word 'asdf'."
metadata:
  short-description: Pin and reproduce runtime/CLI tool versions with asdf
---

# asdf

One CLI, one config file, every runtime. asdf installs tools, generates shims for their
executables, and picks a version per-directory at execution time.

**Target: asdf 0.16+ (the Go rewrite).** 0.15 and earlier were Bash and had a different
command set. Check before doing anything else — the wrong assumption here produces commands
that silently do not exist:

```bash
asdf version   # 0.16.0+ → this skill applies as written
               # 0.15.x or lower → read references/migration.md first
```

## Mental model

Four facts explain nearly every asdf behavior and every asdf bug report:

1. **Shims, not shell magic.** Installing a tool writes a small executable into
   `$ASDF_DATA_DIR/shims/` for each of the tool's binaries. That directory sits on `$PATH`.
   Typing `node` runs the *shim*, which resolves the version at that instant and `exec`s the
   real binary. Nothing mutates your shell. This is why asdf works in scripts, Makefiles, and
   CI without sourcing anything — and why a missing shim looks like `command not found`.

2. **Version resolution happens per invocation, walking up the tree.** In order:
   `ASDF_<TOOL>_VERSION` env var → `.tool-versions` in the current directory → each parent
   directory in turn → `$HOME/.tool-versions` as the last fallback. First match wins; the
   search stops there. (Source: `internal/resolve/resolve.go`.) The env var name is the tool
   name uppercased with dashes turned into underscores: `aws-sam-cli` → `ASDF_AWS_SAM_CLI_VERSION`.

3. **A plugin supplies the knowledge, asdf supplies the mechanism.** asdf core knows nothing
   about Node or kubectl. `asdf plugin add nodejs` clones a git repo of shell scripts that know
   how to list, download, and install that tool. No plugin means no tool — the most common
   first-run error is forgetting the plugin step.

4. **`.tool-versions` is a lockfile, so it forbids `latest`.** Exact versions only. `latest`
   is a CLI argument that gets *resolved* to a number at write time, never a value stored in
   the file. This is deliberate: the same file must produce the same toolchain on every machine
   at every point in time, the way `package-lock.json` does.

## The 90% workflow

```bash
asdf plugin add nodejs                  # once per tool, per machine
asdf install nodejs 22.11.0             # download + build/install that version
asdf set nodejs 22.11.0                 # write ./.tool-versions
node --version                          # verify through the shim
```

For an existing repo that already has a `.tool-versions`, onboarding is: add a plugin for each
pinned tool, then install.

```bash
cut -d' ' -f1 .tool-versions | grep -v '^#' | xargs -n1 asdf plugin add   # best effort
asdf install                                                              # install everything the file pins
```

`asdf install` with no arguments reads `.tool-versions` and installs every entry. That is the
command to put in a README, a `make setup`, and a CI step.

The `xargs` line is a convenience, not a guarantee — it assumes every tool name resolves through
the community short-name index, and some do not. Expect to fix up a few by hand the first time:

```
error fetching plugin URL: plugin <name> not found in repository
```

That error means the name has no entry in the index, so you need the explicit form,
`asdf plugin add <name> <git-url>`. Once you know the URLs for a given repo, write **those**
into the README rather than the `xargs` line — pinning the source is the whole point, and a
setup script that names its plugin URLs cannot silently resolve somewhere new later.

## Picking the right plugin

Short names are a convenience index, not a registry with guarantees. Three things surprise
people, and all three are worth checking before you tell someone to run a command:

**The short name often is not the binary name.** Go's plugin is `golang` (there is no `go`
entry) and it installs a binary called `go`. AWS CLI is `awscli`, not `aws`. The name in
`.tool-versions` is the *plugin* name, and it has to match what you passed to `asdf plugin add`.

**One repo can serve many tools, and the name you choose is the contract.**
`asdf-community/asdf-hashicorp` provides terraform, vault, consul, packer, and nomad from a
single repository. It works out which tool it is by reading the basename of the directory asdf
cloned it into — so the local plugin name is load-bearing:

```bash
asdf plugin add vault https://github.com/asdf-community/asdf-hashicorp.git   # works
asdf plugin add myvault https://github.com/asdf-community/asdf-hashicorp.git # breaks
```

The second one clones fine and then fails at install, because the plugin goes looking for a
HashiCorp product named `myvault`. Never rename a plugin to something friendlier.

**Several plugins may exist for one tool.** Terraform is reachable as both `terraform` (the
shared HashiCorp repo) and `tf` (a different maintainer's repo). Index entries are effectively
first-come-first-served filenames, not a vetted or exclusive claim. Pick deliberately and record
the URL.

To see where a short name actually points without installing anything:

```bash
asdf plugin list all | grep '^terraform'
curl -s https://raw.githubusercontent.com/asdf-vm/asdf-plugins/master/plugins/terraform
```

The second is a one-line file reading `repository = <git-url>` — the entire index entry.

## Commands worth memorizing

| Goal | Command |
|---|---|
| Add a tool's plugin | `asdf plugin add <name> [<git-url>]` |
| See installable versions | `asdf list all <name> [<filter>]` |
| Install a version | `asdf install <name> <version>` |
| Install everything pinned here | `asdf install` |
| Pin for this directory | `asdf set <name> <version>` |
| Pin for this user, everywhere | `asdf set -u <name> <version>` |
| Pin in the nearest parent's file | `asdf set -p <name> <version>` |
| What version am I getting, and why | `asdf current [<name>]` |
| Where is the real binary | `asdf which <cmd>` / `asdf where <name>` |
| Rebuild shims after a tool adds binaries | `asdf reshim [<name>] [<version>]` |
| Debug info for a bug report | `asdf info` |

`asdf current` is the single most useful diagnostic: it prints the resolved version, **the file
or env var that decided it**, and whether it is actually installed. Reach for it before guessing.
Note it only lists tools whose plugins are installed — a `.tool-versions` entry with no plugin
is invisible to it.

Full reference with every flag and argument: `references/commands.md`.

## `.tool-versions`

```
nodejs 22.11.0
python 3.12.7 3.11.9        # fallback chain: try 3.12.7, then 3.11.9
golang 1.23.4               # trailing comments are fine
kubectl 1.31.3
terraform ref:v1.9.8        # build from a git ref instead of a release
elixir path:~/src/elixir    # use a local build (tool developers)
ruby system                 # deliberately hand this tool back to the OS
```

The file governs its own directory and every subdirectory beneath it, until a nearer
`.tool-versions` overrides it. **Commit it.** That is the entire point: the repo carries its
toolchain, so a new laptop and a CI runner converge on the same versions.

`latest` and version ranges are rejected inside the file. Write `asdf set nodejs latest` and
asdf resolves it to a concrete version before writing — you get determinism without looking
the number up by hand.

## Rules that keep this safe for other people's machines

asdf writes to shared, sometimes global, state. When acting on someone's behalf:

- **Default to directory scope.** Plain `asdf set` writes `./.tool-versions`, affecting one
  project. `asdf set -u` rewrites `$HOME/.tool-versions` and changes every directory the user
  has not otherwise pinned — that is a machine-wide change, so say what you are about to do
  and get agreement before running it.
- **Never silently bump a pinned version.** If a repo pins `nodejs 20.11.1` and the task needs
  22, that is a decision with consequences for every other contributor and for CI. Surface it.
- **Prefer the explicit git URL over the short name** in anything automated:
  `asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git`. The bare short name
  resolves through a community index repo that asdf clones and periodically re-syncs — one
  more network dependency and one more thing that can change underneath a build.
- **Plugins are arbitrary code from a git repo** that runs shell scripts during install. Treat
  adding an unfamiliar plugin the way you would treat `curl | bash` — check who publishes it.
- `asdf plugin remove <name>` deletes the plugin *and every installed version of that tool*.
  It is not a light undo.

## Verify, then report

Installs are slow and fail in interesting ways (missing compilers, missing headers, network).
Do not report success from an exit code alone — the shim layer means a tool can install fine
and still not be reachable. After any change, run the loop that actually proves it:

```bash
asdf current <name>      # right version, from the file you expected?
<tool> --version         # does the shim resolve and execute?
```

If the second line fails while the first succeeds, it is almost always a missing shim →
`asdf reshim <name>`. See `references/troubleshooting.md` for the full symptom-to-cause table.

## Where to go next

Read the matching file only when the task calls for it — each is self-contained.

| File | Read it when |
|---|---|
| `references/commands.md` | You need exact flags, arguments, or a command not in the table above |
| `references/setup.md` | Installing asdf, shell/PATH setup, `.asdfrc`, env vars, data directory layout |
| `references/ci.md` | CI pipelines, Docker images, Makefiles, caching, non-interactive/unattended installs |
| `references/troubleshooting.md` | Something is broken — symptom-indexed fixes |
| `references/migration.md` | Upgrading 0.15 → 0.16+, or migrating from nvm/rbenv/pyenv/`.nvmrc` |
| `references/plugins.md` | Writing, debugging, or reviewing an asdf plugin |

## Fast answers to things people ask constantly

**"Installed a global npm/gem/pip package and the command isn't found."** Expected. asdf only
creates shims during its own install step; a package manager running *inside* an asdf-managed
tool adds binaries afterward. Run `asdf reshim nodejs` (or the relevant tool).

**"`asdf global` / `asdf local` / `asdf shell` says unknown command."** Those are 0.15 names.
`global` and `local` became `asdf set` (`-u` for the home file); `shell` was removed entirely
because a compiled binary cannot modify its parent shell — use `ASDF_<TOOL>_VERSION=x cmd`
instead. Hyphenated commands also became spaced: `asdf list-all` → `asdf list all`.

**"Which asdf version manages this repo's tools?"** None — asdf itself is not self-managing.
`asdf update` was removed in 0.16; upgrade through whatever installed it (Homebrew, a package
manager, or replacing the binary).

**"Can I use asdf in Docker/CI?"** Yes, and it is a good fit precisely because it needs no
shell integration — just `$ASDF_DATA_DIR/shims` on `PATH`. `references/ci.md` has working
Dockerfile and GitHub Actions recipes, including the caching that keeps it from being slow.
