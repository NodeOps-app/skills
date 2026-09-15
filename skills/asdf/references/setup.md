# Installing and configuring asdf (0.16+)

## Contents

- [Dependencies](#dependencies)
- [Installing the binary](#installing-the-binary)
- [Shell setup](#shell-setup)
- [Completions](#completions)
- [Environment variables](#environment-variables)
- [`.asdfrc`](#asdfrc)
- [Hooks](#hooks)
- [Data directory layout](#data-directory-layout)
- [Uninstalling asdf](#uninstalling-asdf)

## Dependencies

asdf core needs only:

- `git` ≥ 1.7.7.2
- `bash` ≥ 3.2.48 (plugins are shell scripts, even though asdf itself is a Go binary)

Individual plugins need more — compilers, `curl`, `openssl` headers, `unzip`. A plugin that
builds from source will fail with a compiler error, not an asdf error. `asdf help <tool>`
surfaces a plugin's dependency list when the plugin ships one.

## Installing the binary

**Package manager** (simplest, but confirm it ships 0.16+ — some repos still carry the 0.15
Bash implementation):

```bash
brew install asdf                 # macOS / Linuxbrew
zypper install asdf               # openSUSE
# Arch: AUR package asdf-vm
```

**Pre-built binary** — release assets follow `asdf-v<VERSION>-<os>-<arch>.tar.gz`
(`linux`/`darwin` × `amd64`/`arm64`, plus `linux-386`):

```bash
ASDF_VERSION=v0.20.0
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')
curl -fsSL "https://github.com/asdf-vm/asdf/releases/download/${ASDF_VERSION}/asdf-${ASDF_VERSION}-${OS}-${ARCH}.tar.gz" \
  | tar -xz -C /usr/local/bin asdf
```

Pin the version explicitly in anything reproducible. `latest` in a Dockerfile is how a build
that worked last week stops working.

**Go toolchain:**

```bash
go install github.com/asdf-vm/asdf/cmd/asdf@v0.20.0
```

**From source:**

```bash
git clone https://github.com/asdf-vm/asdf.git --branch v0.20.0
cd asdf && make          # produces ./asdf; copy it onto PATH
```

Verify with `type -a asdf` — the directory you installed into must be the first hit, and
`asdf version` must report 0.16.0 or higher.

## Shell setup

Two things must be true: the `asdf` binary is on `PATH`, and `$ASDF_DATA_DIR/shims` is on
`PATH` **ahead of** the system directories. There is no script to source in 0.16+ — `asdf.sh`
and `asdf.fish` no longer exist. If a setup guide tells you to source something, it is
describing 0.15.

**bash** (`~/.bashrc`), **zsh** (`~/.zshrc`), **POSIX sh** (`~/.profile`):

```bash
export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"
```

Set `ASDF_DATA_DIR` *above* that line if you use a custom location.

**fish** (`~/.config/fish/config.fish`):

```fish
if test -z $ASDF_DATA_DIR
    set _asdf_shims "$HOME/.asdf/shims"
else
    set _asdf_shims "$ASDF_DATA_DIR/shims"
end
if not contains $_asdf_shims $PATH
    set -gx --prepend PATH $_asdf_shims
end
set --erase _asdf_shims
```

**elvish** (`~/.config/elvish/rc.elv`):

```elvish
var asdf_data_dir = ~'/.asdf'
if (and (has-env ASDF_DATA_DIR) (!=s $E:ASDF_DATA_DIR '')) {
  set asdf_data_dir = $E:ASDF_DATA_DIR
}
if (not (has-value $paths $asdf_data_dir'/shims')) {
  set paths = [$asdf_data_dir'/shims' $@paths]
}
```

**nushell** (`~/.config/nushell/config.nu`):

```nu
const asdf_data_dir = '~/.asdf' | path expand
const asdf_shims = [$asdf_data_dir shims] | path join
$env.PATH = $env.PATH | where {$in != $asdf_shims} | prepend $asdf_shims
```

**PowerShell Core** (`~/.config/powershell/profile.ps1`):

```powershell
if ([string]::IsNullOrEmpty($env:ASDF_DATA_DIR)) {
  $_asdf_shims = "${env:HOME}/.asdf/shims"
} else {
  $_asdf_shims = "${env:ASDF_DATA_DIR}/shims"
}
$env:PATH = "${_asdf_shims}:${env:PATH}"
```

Note the `$env:` prefix. The upstream asdf docs show this snippet reading a bare
`$ASDF_DATA_DIR`, which in PowerShell is an ordinary script variable unrelated to the exported
environment variable — so for anyone using a custom data directory the check always takes the
default branch and puts the *wrong* shims directory on `PATH`. Environment variables in
PowerShell live in the `env:` drive.

Open a new shell afterward. Because 0.16+ is a plain binary with a plain `PATH` entry, the old
0.15 rule about sourcing at the *bottom* of the rc file after oh-my-zsh no longer applies —
though the shims entry still has to survive whatever else rewrites `PATH` later.

## Completions

```bash
# bash — in ~/.bashrc
. <(asdf completion bash)

# zsh — generate once, then load from fpath
mkdir -p "${ASDF_DATA_DIR:-$HOME/.asdf}/completions"
asdf completion zsh > "${ASDF_DATA_DIR:-$HOME/.asdf}/completions/_asdf"
# then in ~/.zshrc:
#   fpath=(${ASDF_DATA_DIR:-$HOME/.asdf}/completions $fpath)
#   autoload -Uz compinit && compinit

# fish
asdf completion fish > ~/.config/fish/completions/asdf.fish

# elvish
asdf completion elvish >> ~/.config/elvish/rc.elv
echo "\n"'set edit:completion:arg-completer[asdf] = $_asdf:arg-completer~' >> ~/.config/elvish/rc.elv

# nushell — save to a file and `source` it from config.nu
asdf completion nushell | save -f ~/.asdf/completions/nushell.nu
```

PowerShell: not supported.

## Environment variables

| Variable | Effect | Default |
|---|---|---|
| `ASDF_DATA_DIR` | Where plugins, installs, downloads, and shims live. Must be absolute. | `$HOME/.asdf` if it exists, else `$ASDF_DIR` |
| `ASDF_DIR` | Location of the asdf install itself. Must be absolute. | parent directory of the `asdf` binary |
| `ASDF_CONFIG_FILE` | Path to the config file. Must be absolute. | `$HOME/.asdfrc` |
| `ASDF_TOOL_VERSIONS_FILENAME` | Filename asdf looks for instead of `.tool-versions` | `.tool-versions` |
| `ASDF_DEFAULT_TOOL_VERSIONS_FILENAME` | Deprecated former name of the above; still honored as a fallback | unset |
| `ASDF_CONCURRENCY` | Cores used when a plugin compiles from source; overrides `.asdfrc` | `auto` |
| `ASDF_<TOOL>_VERSION` | Overrides the resolved version for one tool, beating every file | unset |

`ASDF_<TOOL>_VERSION` is the 0.16+ replacement for the removed `asdf shell`. The name is the
tool uppercased with `-` → `_`:

```bash
ASDF_NODEJS_VERSION=20.11.1 npm test     # one command
export ASDF_PYTHON_VERSION=3.11.9        # rest of this shell
export ASDF_AWS_SAM_CLI_VERSION=1.120.0  # aws-sam-cli
```

It accepts the same syntax as the file, including a space-separated fallback chain.

## `.asdfrc`

Lives at `$HOME/.asdfrc` unless `ASDF_CONFIG_FILE` says otherwise. `key = value`, one per line.
Defaults shown:

```ini
legacy_version_file = no
always_keep_download = no
plugin_repository_last_check_duration = 60
disable_plugin_short_name_repository = no
concurrency = auto
```

| Key | Values | Meaning |
|---|---|---|
| `legacy_version_file` | `no` / `yes` | `yes` lets plugins that support it read other managers' files — `.nvmrc`, `.node-version`, `.ruby-version`, `.python-version`. Off by default. |
| `always_keep_download` | `no` / `yes` | Keep the downloaded archive/source after a successful install instead of deleting it. Useful when debugging a plugin or reinstalling repeatedly offline. |
| `plugin_repository_last_check_duration` | minutes, `0`, or `never` | Minimum gap between short-name index syncs. `0` syncs on every trigger; `never` skips re-syncs but still performs the first one. |
| `disable_plugin_short_name_repository` | `no` / `yes` | `yes` disables the index entirely — `asdf plugin add <name>` without a URL stops working, and only explicit git URLs are accepted. Sensible hardening for build images. |
| `concurrency` | integer or `auto` | Parallelism for source builds. `auto` probes `nproc`, then `sysctl hw.ncpu`, then `/proc/cpuinfo`, falling back to `1`. |

`use_release_candidates` appears in older documentation. It is commented out in the 0.16+
config struct and has no effect — do not put it in a config file and expect it to do anything.

Enabling `legacy_version_file = yes` is the low-friction path when a repo still has `.nvmrc` or
`.ruby-version` and you do not want to convert it yet. It is a *user* setting, not a repo one,
so it will not help teammates or CI — a committed `.tool-versions` is the portable answer. See
`migration.md`.

## Hooks

`.asdfrc` can run commands around asdf operations:

```ini
pre_asdf_install_nodejs = echo "about to install nodejs $1"
post_asdf_install_nodejs = npm install -g corepack
post_asdf_plugin_add_python = echo "python plugin added"
```

Available patterns:

- `{pre,post}_asdf_{install,reshim,uninstall}_<plugin>` — `$1` is the version
- `{pre,post}_asdf_plugin_{add,update,remove}` — `$1` is the plugin name
- `{pre,post}_asdf_plugin_{add,update,remove}_<plugin>`
- `pre_asdf_download_<plugin>`
- `pre_<plugin>_<command>` — before a plugin extension command

Hooks are shell commands running with the user's privileges on every matching asdf operation.
Treat a `.asdfrc` from an untrusted source the way you would treat a shell rc file from one.

## Data directory layout

Under `$ASDF_DATA_DIR` (default `$HOME/.asdf`):

```
downloads/    fetched archives and source trees (deleted after install unless always_keep_download)
installs/     the tools themselves — installs/<plugin>/<version>/
plugins/      cloned plugin repos — plugins/<name>/bin/...
shims/        generated shim executables; this is the directory that goes on PATH
repository/   clone of the community short-name index
```

Outside it: `$HOME/.tool-versions` (fallback pins) and `$HOME/.asdfrc` (config).

Caching `installs/`, `plugins/`, and `downloads/` between CI runs is what makes asdf fast in a
pipeline — see `ci.md`.

## Uninstalling asdf

There is no uninstall command.

```bash
rm -rf "${ASDF_DATA_DIR:-$HOME/.asdf}"
rm -f "$HOME/.tool-versions" "$HOME/.asdfrc"
# then remove the shims PATH line from your shell rc,
# and remove the binary (brew uninstall asdf, or rm the file you installed)
```
