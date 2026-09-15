# Writing an asdf plugin

A plugin is a git repository of executable scripts under `bin/`. asdf core knows nothing about
the tool; it sets environment variables, runs your scripts, and reads their stdout. That is the
whole interface.

Repository naming convention: `asdf-<tool>`. Start from
[asdf-vm/asdf-plugin-template](https://github.com/asdf-vm/asdf-plugin-template) — generate a
repo from it and run `setup.bash` — unless you have a reason to hand-roll.

## Contents

- [Rules that apply to every script](#rules-that-apply-to-every-script)
- [Required scripts](#required-scripts)
- [Optional scripts](#optional-scripts)
- [Environment variable reference](#environment-variable-reference)
- [Extension commands](#extension-commands)
- [Testing](#testing)
- [Publishing](#publishing)

## Rules that apply to every script

- **Never call `asdf` from inside a plugin script.** asdf may already be mid-execution; a
  recursive call deadlocks or produces nonsense. Everything you need arrives as an env var.
- **Every script needs a shebang and the executable bit.** 0.16+ runs them via `syscall.Exec`,
  which will not infer an interpreter.
- **Stay portable.** These scripts run on macOS (BSD userland, ancient Bash 3.2) and Linux
  (GNU). `sort -V`, `sed -i` without a suffix, `readlink -f`, and `grep -P` are the usual
  casualties. asdf's own test suite bans some of these outright; the plugin template's
  `lib/utils.bash` ships a portable git-based version sort.
- **Keep the dependency surface small.** Every tool you shell out to is something a user must
  have installed. `curl`, `git`, `sed`, `awk`, `grep` are reasonable; anything exotic is not.
- **Exit non-zero on failure.** asdf trusts your exit code.

## Required scripts

### `bin/list-all`

Prints every installable version, **space-separated on one line**, oldest first / newest last.

```bash
#!/usr/bin/env bash
set -euo pipefail

curl -fsSL "https://api.github.com/repos/owner/tool/tags" \
  | grep -o '"name": "v[0-9.]*"' \
  | sed 's/"name": "v//;s/"//' \
  | sort_versions \
  | xargs echo
```

Receives no environment variables. Newest-last matters: `asdf latest` falls back to taking the
last entry when `bin/latest-stable` is absent.

If the upstream source already returns a sensible order, keep it — `tac` to reverse is
cheaper and safer than re-sorting.

### `bin/download`

Fetches the source or binary for one version into `$ASDF_DOWNLOAD_PATH`, decompressed.

```bash
#!/usr/bin/env bash
set -euo pipefail

url="https://github.com/owner/tool/archive/v${ASDF_INSTALL_VERSION}.tar.gz"
archive="$(mktemp)"
staging="$(mktemp -d)"
trap 'rm -rf "$archive" "$staging"' EXIT

# Download and unpack entirely outside $ASDF_DOWNLOAD_PATH, then move the finished
# tree in. asdf treats a non-empty download directory as a completed download, so
# anything partial left there is worse than nothing — it suppresses the retry.
curl -fsSL -o "$archive" "$url"
tar -xzf "$archive" -C "$staging" --strip-components=1

mkdir -p "$ASDF_DOWNLOAD_PATH"
cp -r "$staging"/. "$ASDF_DOWNLOAD_PATH"
```

Note what this deliberately avoids: `curl … | tar -xz -C "$ASDF_DOWNLOAD_PATH"` is shorter and
wrong. A transfer that dies mid-stream leaves a half-extracted tree in the download directory,
which asdf then reads as "already downloaded" and never retries. The same reasoning applies one
step later to `$ASDF_INSTALL_PATH`, so the two scripts share a shape: build somewhere disposable,
publish only on success.

Receives `ASDF_INSTALL_TYPE`, `ASDF_INSTALL_VERSION`, `ASDF_INSTALL_PATH`, `ASDF_DOWNLOAD_PATH`.

On failure, leave `$ASDF_DOWNLOAD_PATH` empty — asdf treats a populated download directory as
a completed download and may skip re-fetching. This is the same hazard as a partial install,
one step earlier, and it is why the download lands in a temp file before anything touches
`$ASDF_DOWNLOAD_PATH`.

### `bin/install`

Installs one version into `$ASDF_INSTALL_PATH`.

```bash
#!/usr/bin/env bash
set -euo pipefail

build_dir="$(mktemp -d)"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir" "$stage_dir"' EXIT

cp -r "$ASDF_DOWNLOAD_PATH"/. "$build_dir"
cd "$build_dir"

# --prefix is the path the tool will BELIEVE it lives at, so it must be the final
# install path. DESTDIR redirects only where files are written now, which is what
# lets us keep a failed build out of $ASDF_INSTALL_PATH.
./configure --prefix="$ASDF_INSTALL_PATH"
make -j"${ASDF_CONCURRENCY:-1}"
make install DESTDIR="$stage_dir"

mkdir -p "$ASDF_INSTALL_PATH"
cp -r "${stage_dir}${ASDF_INSTALL_PATH}"/. "$ASDF_INSTALL_PATH"
```

Receives `ASDF_INSTALL_TYPE`, `ASDF_INSTALL_VERSION`, `ASDF_INSTALL_PATH`, `ASDF_DOWNLOAD_PATH`,
`ASDF_CONCURRENCY`.

Two things are going on, and conflating them breaks tools subtly:

**Only publish to `$ASDF_INSTALL_PATH` after the build succeeds.** A half-written install
directory looks installed to asdf, so the user gets a broken tool that `asdf install` will not
retry.

**But `--prefix` must still be the final path.** Autotools, CMake and friends bake the
configured prefix into binaries, `#!` lines, `pkg-config` files, and resource lookups.
Configuring with a temp prefix and copying afterward produces an install that points at a
directory you just deleted — and the failure shows up later, at runtime, far from the cause.
`DESTDIR` exists precisely for this: real prefix, redirected write location.

If a build system has no `DESTDIR` equivalent, install straight into `$ASDF_INSTALL_PATH` and
clean it up yourself on failure:

```bash
trap 'rm -rf "$ASDF_INSTALL_PATH"' ERR
```

Shims are generated automatically for every executable in `$ASDF_INSTALL_PATH/bin` unless
`bin/list-bin-paths` says otherwise.

Legacy note: `bin/download` is technically optional for plugins predating the split. If yours
must support both, branch on whether `ASDF_DOWNLOAD_PATH` is set. New plugins should always
ship both scripts.

## Optional scripts

### `bin/latest-stable` — strongly recommended

Prints the latest stable version, excluding release candidates and prereleases. Receives one
positional argument: a filter query (a version prefix, or a provider name for multi-provider
tools like Ruby's `truffleruby`).

```bash
#!/usr/bin/env bash
set -euo pipefail
query="${1:-}"
list-all-versions | tr ' ' '\n' | grep -v -E '(rc|alpha|beta|dev)' | grep "^${query}" | tail -1
```

Without it, `asdf latest` just takes the last line of `bin/list-all` — which quietly returns
a release candidate whenever upstream published one most recently.

### `bin/list-bin-paths`

Space-separated directories, **relative to `$ASDF_INSTALL_PATH`**, containing executables to
shim. Default when absent: `bin`.

```bash
#!/usr/bin/env bash
echo "bin tools/bin"
```

### `bin/exec-env`

Sourced to set up the environment before a shim executes — `export JAVA_HOME=...`,
`export GOROOT=...`, PATH additions.

```bash
#!/usr/bin/env bash
export TOOL_HOME="$ASDF_INSTALL_PATH"
```

Debug it with `asdf env <shimmed-command>`, which dumps the resulting environment.

### `bin/exec-path`

Overrides which executable a shim actually runs. Called with three positional arguments:
install path, command name, and the default relative path. Prints the relative path to use.

```bash
#!/usr/bin/env bash
install_path="$1"; cmd="$2"; relative_path="$3"
echo "$relative_path"
```

### `bin/uninstall`

Custom teardown when `asdf uninstall` runs. Without it asdf removes the install directory,
which is usually sufficient — implement this only if your tool scatters files elsewhere.

### `bin/list-legacy-filenames` and `bin/parse-legacy-file`

Support for other version managers' files, consulted only when the user sets
`legacy_version_file = yes` in `.asdfrc`.

```bash
# bin/list-legacy-filenames
#!/usr/bin/env bash
echo ".nvmrc .node-version"
```

```bash
# bin/parse-legacy-file  — receives the file path as $1, prints one version
#!/usr/bin/env bash
cat "$1" | head -1 | tr -d 'v \n'
```

`parse-legacy-file` must be deterministic: the same file contents must always yield the same
string, regardless of what is installed on the machine. asdf falls back to `cat`ing the file if
the script is absent.

### Plugin lifecycle hooks

| Script | Runs | Receives |
|---|---|---|
| `bin/post-plugin-add` | after `asdf plugin add` | `ASDF_PLUGIN_PATH`, `ASDF_PLUGIN_SOURCE_URL` |
| `bin/post-plugin-update` | after `asdf plugin update` | `ASDF_PLUGIN_PATH`, `ASDF_PLUGIN_PREV_REF`, `ASDF_PLUGIN_POST_REF` |
| `bin/pre-plugin-remove` | before `asdf plugin remove` | `ASDF_PLUGIN_PATH` |

### `bin/help.*`

`asdf help <tool>` output. **`bin/help.overview` is the gate** — the other three are ignored
unless it exists.

- `bin/help.overview` — a short paragraph about the tool. No heading; asdf adds one.
- `bin/help.deps` — one system dependency per line.
- `bin/help.config` — free-form notes on env vars or flags that affect the build.
- `bin/help.links` — one per line, `Title:<TAB>URL` or a bare URL.

Each receives `ASDF_INSTALL_TYPE`, `ASDF_INSTALL_VERSION`, `ASDF_INSTALL_PATH`.

## Environment variable reference

| Variable | Contains | Given to |
|---|---|---|
| `ASDF_INSTALL_TYPE` | `version` or `ref` | download, install, latest-stable, list-bin-paths, exec-env, exec-path, help.*, list-legacy-filenames |
| `ASDF_INSTALL_VERSION` | the version, or the git ref when type is `ref` | same as above |
| `ASDF_INSTALL_PATH` | where the tool is or will be installed | same as above |
| `ASDF_DOWNLOAD_PATH` | where the download was placed | download, install |
| `ASDF_CONCURRENCY` | core count for parallel builds | install |
| `ASDF_PLUGIN_PATH` | the plugin's own directory | post-plugin-add, post-plugin-update, pre-plugin-remove |
| `ASDF_PLUGIN_SOURCE_URL` | the plugin's source URL (may be a local path) | post-plugin-add |
| `ASDF_PLUGIN_PREV_REF` / `ASDF_PLUGIN_POST_REF` | git refs before and after an update | post-plugin-update |
| `ASDF_CMD_FILE` | full path of the sourced extension-command file | non-executable extension commands only |

`bin/list-all` and `bin/parse-legacy-file` get nothing (the latter gets its file path as `$1`).
Do not assume a variable is present in a script that is not listed for it.

## Extension commands

Plugin-specific subcommands live in `lib/commands/`, named by dash-joined words:

```
lib/commands/command.bash           → asdf cmd <plugin>
lib/commands/command-build.bash     → asdf cmd <plugin> build
lib/commands/command-build-all.bash → asdf cmd <plugin> build all
```

The most specific match wins; remaining arguments are passed through. In 0.16+ these must be
executable with a shebang, and users invoke them via `asdf cmd <plugin> ...` — the bare
`asdf <plugin> ...` form from 0.15 is gone. Document them in your README; nothing else
advertises their existence.

## Testing

```bash
asdf plugin test <name> <plugin-url> [--asdf-tool-version <v>] [--asdf-plugin-gitref <ref>] [test-cmd...]
```

This clones the plugin, installs a version (latest by default), and runs the test command to
prove the installed tool actually executes:

```bash
asdf plugin test nodejs https://github.com/asdf-vm/asdf-nodejs.git node --version
```

`--asdf-plugin-gitref` is what makes this useful in PR CI — it tests the branch under review
rather than the default branch. A local path works in place of a URL on most CI systems.

GitHub Actions, testing on both platforms because macOS and Linux break differently:

```yaml
name: Test
on: [push, pull_request]
jobs:
  plugin_test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: asdf-vm/actions/plugin-test@v4
        with:
          command: "<tool> --version"
```

**Rate limiting** will bite any plugin whose `list-all` hits the GitHub API — unauthenticated
CI runners share an IP pool and exhaust the limit constantly. Support an optional token:

```bash
cmd="curl -fsSL"
[ -n "${GITHUB_API_TOKEN:-}" ] && cmd="$cmd -H 'Authorization: token $GITHUB_API_TOKEN'"
```

Never commit the token.

## Publishing

- Recommend the explicit-URL install in your README:
  `asdf plugin add <tool> https://github.com/<you>/asdf-<tool>.git`.
- To get a short name (`asdf plugin add <tool>`), submit your plugin to
  [asdf-vm/asdf-plugins](https://github.com/asdf-vm/asdf-plugins) following that repo's
  contribution instructions.
- Tag the repo with the `asdf-plugin` GitHub topic so it is discoverable.
- [asdf-community](https://github.com/asdf-community) accepts plugins for shared long-term
  maintenance — worth considering rather than letting a widely-used plugin depend on one person.
