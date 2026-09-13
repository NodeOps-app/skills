# Migrations

Two unrelated migrations share this file: moving asdf itself from 0.15 to 0.16+, and moving a
project from nvm/rbenv/pyenv onto asdf.

## Contents

- [asdf 0.15 → 0.16+](#asdf-015--016)
- [From nvm, rbenv, pyenv and friends](#from-nvm-rbenv-pyenv-and-friends)
- [Adopting asdf in an existing repo](#adopting-asdf-in-an-existing-repo)

## asdf 0.15 → 0.16+

0.16.0 is a ground-up rewrite from Bash to Go. asdf stopped being a shell function and became a
plain binary. That single change drives every breaking change below.

### The upgrade is not self-service

`asdf update` cannot reach 0.16 — it only knew how to update the Bash repo, and the command has
been removed in 0.16+ anyway. Install the new binary the same way you would install asdf fresh
(package manager, release tarball, `go install`); see `setup.md`.

### Upgrade checklist

1. Install the 0.16+ binary onto `PATH`. Confirm with `asdf version`.
2. Note your existing data directory: run the *old* `asdf info` first and copy its
   `ASDF_DATA_DIR` value. Export it in your shell rc if it is not the default `$HOME/.asdf` —
   this is what preserves your installed tools and plugins.
3. Add the shims directory to `PATH` in your shell rc:
   `export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"`.
4. **Delete the old sourcing line** — `. "$HOME/.asdf/asdf.sh"`, `source ~/.asdf/asdf.fish`, or
   the Homebrew `libexec/asdf.sh` variant. Leaving it in place resurrects the shell function and
   produces confusing hybrid behavior.
5. Open a new shell. Verify `asdf version` reports 0.16+.
6. **`asdf reshim`.** Non-negotiable. Every existing shim was written by the Bash implementation
   and references machinery that no longer exists.
7. Once everything works, optionally clean out the old Bash-era files. Only these four
   directories carry real data — `downloads`, `installs`, `plugins`, `shims`:

   ```bash
   find "${ASDF_DATA_DIR:-$HOME/.asdf}/" -maxdepth 1 -mindepth 1 \
     -not -name downloads -not -name plugins -not -name installs -not -name shims \
     -exec rm -r {} \;
   ```

   Run this only after confirming the new install works. It is not reversible.

### Command changes

| 0.15 | 0.16+ | Note |
|---|---|---|
| `asdf global <t> <v>` | `asdf set -u <t> <v>` | "global" was always a misnomer — any nearer `.tool-versions` beat it |
| `asdf local <t> <v>` | `asdf set <t> <v>` | now the default behavior of `set` |
| — | `asdf set -p <t> <v>` | new: edit the nearest existing parent file in place |
| `asdf shell <t> <v>` | `export ASDF_<TOOL>_VERSION=<v>` | removed: a binary cannot mutate its parent shell |
| `asdf update` | package manager / replace binary | removed |
| `asdf list-all <t>` | `asdf list all <t>` | |
| `asdf plugin-add\|-list\|-update\|-remove\|-test` | `asdf plugin add\|list\|update\|remove\|test` | hyphens became spaces |
| `asdf plugin-list-all` | `asdf plugin list all` | |
| `asdf shim-versions <c>` | `asdf shimversions <c>` | hyphen dropped, not replaced by a space |
| `asdf <plugin> <extcmd>` | `asdf cmd <plugin> <extcmd>` | extension commands need the `cmd` prefix |

### Behavior changes that bite

- **Shebangs are mandatory.** 0.16+ runs executables through `syscall.Exec`. A script with no
  shebang used to work under Bash and now fails with an exec format error.
- **`asdf current` gained a column.** Now: Name, Version, **Source**, **Installed**. The old
  third column conflated the source with a suggested install command; they are separate now.
  Anything parsing this output by column index needs updating — use `--no-header` and index
  from the left.
- **Custom shim templates are gone.** Rarely used; only `asdf-elixir` needed them, and no
  longer does.
- **Extension commands must be executable with a shebang.** They used to be sourced as Bash
  when non-executable. They can now be any language, but the executable bit is required.
- **`use_release_candidates` in `.asdfrc` does nothing.** It is commented out in the 0.16+
  config. Older docs still mention it.

### What did not change

`.tool-versions` format, version resolution order, plugin script contracts, the shim concept,
and the data directory layout. Plugins written for 0.15 work unchanged.

## From nvm, rbenv, pyenv and friends

The goal is one committed `.tool-versions` replacing a pile of per-tool version files.

### Convert the files

| Old file | Read the version, then |
|---|---|
| `.nvmrc`, `.node-version` | `asdf plugin add nodejs && asdf set nodejs <version>` |
| `.ruby-version` | `asdf plugin add ruby && asdf set ruby <version>` |
| `.python-version` | `asdf plugin add python && asdf set python <version>` |
| `.java-version` | `asdf plugin add java && asdf set java <version>` |
| `.terraform-version` | `asdf plugin add terraform && asdf set terraform <version>` |
| `go.mod` `go` directive | `asdf plugin add golang && asdf set golang <version>` |
| `.tfswitchrc`, `.crenv-version`, etc. | same shape — find the plugin, `asdf set` |

Loose version specifiers do not survive the trip. `.nvmrc` containing `lts/*` or `18` has to
become an exact version, because `.tool-versions` refuses ranges by design. `asdf latest nodejs 18`
resolves one for you.

### Or read the old files directly, for a while

If converting now is disruptive, plugins that support it can read the legacy files:

```ini
# ~/.asdfrc
legacy_version_file = yes
```

Understand the tradeoff before recommending it: this is a **per-user machine setting**. It does
nothing for a teammate who has not set it, and nothing in CI. It buys a quiet transition period
on one laptop, not a reproducible project. A committed `.tool-versions` is the actual fix.

### Uninstall the old manager last

Keep nvm/rbenv/pyenv installed until the team has switched. When you do remove them, strip their
shell rc lines too — leftover `nvm.sh` sourcing or a `~/.rbenv/shims` entry prepended after
asdf's will silently win the `PATH` race and make asdf look broken.

## Adopting asdf in an existing repo

A complete adoption is four commits' worth of work and mostly documentation:

1. **Pin what is actually in use.** Do not invent versions — read them off the current
   environment (`node --version`, `go version`, the CI image tag) so nothing changes behavior
   on day one.

   ```bash
   asdf plugin add nodejs && asdf plugin add golang
   asdf set nodejs 22.11.0
   asdf set golang 1.23.4
   ```

2. **Commit `.tool-versions`.** Never gitignore it — it is the deliverable.

3. **Make onboarding one command.** In the README and in `make setup`, name the plugin URLs
   explicitly — you already know them from step 1, and writing them down means onboarding does
   not depend on the community short-name index resolving correctly on someone else's machine:

   ```bash
   asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
   asdf plugin add golang https://github.com/asdf-community/asdf-golang.git
   asdf install
   ```

   The derived form (`cut -d' ' -f1 .tool-versions | xargs -n1 asdf plugin add`) is fine for a
   one-off on your own machine, but it fails for any tool with no index entry, and it hides
   which repo each plugin actually came from.

4. **Make CI use the same file** so drift between laptops and the pipeline is impossible. See
   `ci.md`.

Where the repo also has a Dockerfile pinning `FROM node:22.11.0`, or a CI matrix listing
versions inline, point them at `.tool-versions` too — otherwise you have added a fourth place
that has to agree with the other three.
