# asdf command reference (0.16+)

Verified against the urfave/cli command tree in `internal/cli/cli.go` and a live `asdf 0.18.0`
binary. Anything not listed here does not exist in 0.16+, no matter what a blog post says.

## Contents

- [Plugins](#plugins)
- [Installing and removing tool versions](#installing-and-removing-tool-versions)
- [Listing versions](#listing-versions)
- [Setting versions](#setting-versions)
- [Inspecting what is in effect](#inspecting-what-is-in-effect)
- [Shims and execution](#shims-and-execution)
- [Extension commands](#extension-commands)
- [Shell completion](#shell-completion)
- [Exit codes and scripting](#exit-codes-and-scripting)

## Plugins

A plugin is a git repo of shell scripts that teaches asdf how to install one tool. No plugin,
no tool.

```bash
asdf plugin add <name>                  # resolve <name> through the community short-name index
asdf plugin add <name> <git-url>        # add a specific repo — preferred for anything automated
asdf plugin list                        # installed plugins
asdf plugin list --urls --refs          # ...with their git URL and checked-out ref
asdf plugin list all                    # every plugin in the short-name index, with URLs
asdf plugin update <name> [<git-ref>]   # pull latest default-branch commit, or pin to a ref
asdf plugin update --all
asdf plugin remove <name>               # DESTRUCTIVE: removes the plugin AND every installed version
asdf plugin test <name> <url> [--asdf-tool-version <v>] [--asdf-plugin-gitref <ref>] [cmd...]
```

`asdf plugin add <name>` without a URL triggers a sync of the short-name index repo (cloned to
`$ASDF_DATA_DIR/repository`). `asdf plugin list all` triggers it too. Passing an explicit URL
skips the sync entirely — one fewer network round trip and no dependency on a third-party index,
which is why it is the better form in CI and in scripts.

Sync frequency is governed by `plugin_repository_last_check_duration` in `.asdfrc`; the index
can be turned off completely with `disable_plugin_short_name_repository = yes`. See
`setup.md`.

### Short names, and where they fall down

An index entry is a single file in `asdf-vm/asdf-plugins` containing one line:

```
repository = https://github.com/asdf-community/asdf-hashicorp.git
```

That is the whole mechanism. It implies three things worth knowing:

**A missing name fails like this**, and the fix is always the explicit git URL form:

```
$ asdf plugin add doesnotexist123zz
error fetching plugin URL: plugin doesnotexist123zz not found in repository
```

**The plugin name you choose becomes part of the contract for multi-tool repos.** asdf clones
a plugin into `$ASDF_DATA_DIR/plugins/<name-you-passed>`, and a repo serving several tools
works out which one it is by reading that directory's basename:

```bash
# asdf-community/asdf-hashicorp serves terraform, vault, consul, packer, nomad
asdf plugin add vault https://github.com/asdf-community/asdf-hashicorp.git    # correct
asdf plugin add hashicorp https://github.com/asdf-community/asdf-hashicorp.git  # installs nothing usable
```

The wrong name clones successfully and then fails at install time, which makes it an annoying
bug to chase. Use the tool's canonical name, and use the same name in `.tool-versions`.

**Names that commonly trip people up:**

| You want | Short name | Notes |
|---|---|---|
| Go | `golang` | no `go` entry exists; the installed binary is still `go` |
| Terraform | `terraform` | resolves to the shared `asdf-hashicorp` repo, not a terraform-only one |
| Vault / Consul / Packer / Nomad | each its own name | all the same shared repo; name is load-bearing |
| AWS CLI | `awscli` | not `aws`, not `aws-cli` |
| OpenTofu | `opentofu` | maintained at `virtualroot/asdf-opentofu` |
| Java | `java` | one index entry, but competing community plugins exist outside the index |

To inspect where a name points before committing to it:

```bash
asdf plugin list all | grep '^kubectl'
curl -s https://raw.githubusercontent.com/asdf-vm/asdf-plugins/master/plugins/kubectl
```

`asdf plugin test` is for plugin authors and plugin CI, not for users. It clones the plugin,
installs a version, and runs a command to prove the install works:

```bash
asdf plugin test nodejs https://github.com/asdf-vm/asdf-nodejs.git node --version
```

## Installing and removing tool versions

```bash
asdf install                            # install every entry in the resolved .tool-versions
asdf install <name>                     # install just this tool at its pinned version
asdf install <name> <version>           # install an explicit version
asdf install <name> latest              # resolve latest stable, then install it
asdf install <name> latest:<prefix>     # latest stable starting with <prefix>, e.g. latest:20
asdf install <name> ref:<git-ref>       # build from a branch/tag/commit (plugin must support it)
asdf install --keep-download <name> <version>   # retain the download dir after a successful install

asdf uninstall <name> <version>         # remove one installed version and its shims
```

`asdf install` with no arguments is the command that belongs in onboarding docs, `make setup`,
and CI. It is idempotent: already-installed versions are skipped, so re-running it is cheap.

For a `ref:` install, uninstall with the identical string — `asdf uninstall terraform ref:v1.9.8`,
not the resolved version number.

Builds that compile from source honor `ASDF_CONCURRENCY` (or `concurrency` in `.asdfrc`).

## Listing versions

```bash
asdf list                               # all installed tools and their installed versions
asdf list <name>                        # installed versions of one tool
asdf list <name> <prefix>               # ...filtered to versions starting with <prefix>
asdf list all <name>                    # every version the plugin can install (hits the network)
asdf list all <name> <prefix>           # e.g. asdf list all python 3.12
asdf latest <name>                      # latest stable version (not necessarily installed)
asdf latest <name> <prefix>             # latest stable starting with <prefix>
asdf latest --all                       # latest stable for every installed plugin, plus installed status
```

`asdf list all <name>` can return thousands of lines. Always pass a prefix filter when you know
roughly what you want, and pipe through `tail` when you do not:
`asdf list all nodejs 22 | tail -5`.

## Setting versions

```bash
asdf set <name> <version> [<version>...]   # write ./.tool-versions in the current directory
asdf set -u <name> <version>               # --home: write $HOME/.tool-versions
asdf set -p <name> <version>               # --parent: write the nearest EXISTING parent .tool-versions
asdf set <name> latest                     # resolves to a concrete version before writing
asdf set <name> system                     # hand this tool back to the OS in this directory
```

`-u` and `-p` are mutually exclusive; passing both is an error.

Multiple versions become a fallback chain in the order given:
`asdf set python 3.12.7 3.11.9 system`.

What each flag actually writes:

| Flag | Target file | Created if missing? | Blast radius |
|---|---|---|---|
| (none) | `./.tool-versions` | yes | this directory tree |
| `-u` / `--home` | `$HOME/.tool-versions` | yes | every directory the user has not pinned |
| `-p` / `--parent` | nearest existing `.tool-versions` above cwd | **no** | that directory's tree |

`-p` is the one to use when a monorepo pins tools at the root and you are standing in a package
subdirectory — it edits the root file in place rather than shadowing it with a new one.

Editing `.tool-versions` by hand is equally valid and often clearer in a diff. `asdf set` exists
so you do not have to look up a version number first.

## Inspecting what is in effect

```bash
asdf current                # every tool with an installed plugin: version, source, installed?
asdf current <name>
asdf current --no-header    # machine-readable: drops the column header row
asdf where <name> [<version>]   # install directory of a version
asdf which <command>            # absolute path of the real binary behind a shim
asdf shimversions <command>     # every plugin+version pair providing this command
asdf info                       # OS, shell, asdf config dump — paste this into bug reports
asdf version
asdf help <name> [<version>]    # plugin-supplied docs for a tool, if the plugin ships them
```

`asdf current` columns are: **Name**, **Version**, **Source** (the file path or env var that
decided it), **Installed** (`true`, or a suggested install command). The Source column is what
makes it the right first move when a version is not what you expected — it names the file to go
edit.

Caveat worth knowing: `asdf current` iterates over *installed plugins*, so a `.tool-versions`
entry whose plugin was never added simply does not appear. If a tool is missing from the output,
check `asdf plugin list` before anything else.

For scripting, `--no-header` plus `awk` is the stable shape:

```bash
asdf current --no-header nodejs | awk '{print $2}'    # → 22.11.0
```

## Shims and execution

```bash
asdf reshim                     # regenerate shims for everything
asdf reshim <name>              # ...for one tool
asdf reshim <name> <version>    # ...for one installed version
asdf exec <command> [args...]   # run the shim target directly, bypassing PATH lookup
asdf env <command> [util]       # run <util> (default: env) inside the shim's environment
```

`asdf reshim` is the fix whenever a tool gains executables outside asdf's install step — the
canonical case being `npm install -g <pkg>`, `gem install`, `pip install`, or `go install`,
which drop binaries into an asdf-managed install directory that has no shim yet.

`asdf env <command>` takes the name of a *shimmed binary*, not an arbitrary shell command. It
prints the environment that binary would run in, which is how you debug a plugin's `exec-env`:

```bash
asdf env node                 # dump the env node executes in
asdf env node which npm       # run `which npm` inside that same env
```

Scripts meant to be `source`d cannot go through a shim (shims `exec`). Reach them by path:

```bash
source "$(asdf where nodejs)/bin/some-script.sh"
```

## Extension commands

Plugins may ship their own subcommands. In 0.16+ these require the `cmd` prefix:

```bash
asdf cmd <plugin> <subcommand> [args...]
# e.g. asdf cmd nodejs nodebuild --version
```

In 0.15 this was bare `asdf <plugin> <subcommand>`. That form is gone.

## Shell completion

```bash
asdf completion bash|zsh|fish|elvish|nushell
```

Prints a completion script to stdout; wiring it into each shell is in `setup.md`. PowerShell
has no completion support.

## Exit codes and scripting

asdf returns non-zero on failure, so `set -e` pipelines behave. Two things are worth guarding
in automation:

```bash
# Adding a plugin that already exists is an error, not a no-op.
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git || true

# Test for an installed version. Check the OUTPUT, not the exit code:
# `asdf list <tool> <filter>` exits 0 even when nothing matches, and the filter
# is a prefix match, so "24.2" would match 24.20.0.
asdf list nodejs 2>/dev/null | tr -d ' *' | grep -qx '22.11.0' && echo "already installed"
```

The `tr` strips the leading indent and the `*` that marks the currently-selected version;
`grep -qx` then demands an exact line match. A bare `asdf list <tool> <version> && ...` reports
every version as installed, because the only thing that makes `asdf list` exit non-zero is a
plugin that does not exist at all.

`asdf install` is safely idempotent on its own and needs no such guard.

## Removed in 0.16+ — do not emit these

| Gone | Use instead |
|---|---|
| `asdf global <t> <v>` | `asdf set -u <t> <v>` |
| `asdf local <t> <v>` | `asdf set <t> <v>` |
| `asdf shell <t> <v>` | `export ASDF_<TOOL>_VERSION=<v>` |
| `asdf update` | upgrade via your package manager or replace the binary |
| `asdf list-all <t>` | `asdf list all <t>` |
| `asdf plugin-add` / `-list` / `-update` / `-remove` / `-test` | `asdf plugin add` / `list` / `update` / `remove` / `test` |
| `asdf plugin-list-all` | `asdf plugin list all` |
| `asdf shim-versions <c>` | `asdf shimversions <c>` |
| `asdf <plugin> <extcmd>` | `asdf cmd <plugin> <extcmd>` |

`asdf update` still parses as a command but does nothing except print an error telling you to
use your package manager.
