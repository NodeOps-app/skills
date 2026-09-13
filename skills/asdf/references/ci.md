# asdf in CI, containers, and build systems

asdf is a good fit for automation precisely because 0.16+ needs no shell integration — it is a
binary plus a `PATH` entry. The one rule that governs everything here:

> **Non-interactive shells never read `~/.bashrc` or `~/.zshrc`.** CI steps, `docker RUN`,
> `make` recipes, and cron all run non-interactively. The shims directory must be put on `PATH`
> through the environment, not through a shell rc file.

Every failure mode in this file traces back to that sentence or to a missing plugin.

## Contents

- [GitHub Actions](#github-actions)
- [Caching](#caching)
- [Docker](#docker)
- [GitLab CI](#gitlab-ci)
- [Makefiles and scripts](#makefiles-and-scripts)
- [Hardening for unattended builds](#hardening-for-unattended-builds)

## GitHub Actions

The official actions live at [asdf-vm/actions](https://github.com/asdf-vm/actions).

**Use `@v4` or newer.** v4.0.0 was the release that added asdf 0.16+ support; `v3` and earlier
only drive the old 0.15 Bash implementation. This is the single most common way an asdf CI setup
ends up mysteriously running 0.15 semantics.

```yaml
- uses: asdf-vm/actions/install@v4       # installs asdf, then every tool in .tool-versions
  with:
    asdf_version: "0.20.0"               # pin it; the default is "latest"
```

Available actions and their inputs:

| Action | Does | Inputs |
|---|---|---|
| `asdf-vm/actions/install@v4` | installs asdf **and** all tools from `.tool-versions` | `asdf_version`, `asdf_branch`, `skip_install`, `tool_versions`, `before_install`, `github_token` |
| `asdf-vm/actions/setup@v4` | installs the asdf CLI only | `asdf_version`, `asdf_branch`, `skip_install`, `github_token` |
| `asdf-vm/actions/plugins-add@v4` | adds plugins without installing tools | `asdf_version`, `asdf_branch`, `skip_install`, `tool_versions`, `github_token` |
| `asdf-vm/actions/plugin-test@v4` | for plugin authors testing their own plugin | `command` (required), `plugin`, `version`, `giturl`, `gitref`, + the shared inputs |

A complete workflow where `.tool-versions` is the only place versions are written down:

```yaml
name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/cache@v4
        with:
          path: |
            ~/.asdf/installs
            ~/.asdf/plugins
            ~/.asdf/downloads
          key: asdf-${{ runner.os }}-${{ hashFiles('.tool-versions') }}
          restore-keys: asdf-${{ runner.os }}-

      - uses: asdf-vm/actions/install@v4
        with:
          asdf_version: "0.20.0"

      - run: asdf current          # log the resolved toolchain — cheap, and invaluable in a failure
      - run: npm ci && npm test
```

Having done this, delete the now-redundant `actions/setup-node`, `setup-go`, `setup-python`
steps. Leaving both in place means two sources of truth that will disagree, which is the
problem you were solving.

### Without the action

If you would rather not depend on it, or you are on a self-hosted runner:

```yaml
- name: Install asdf
  run: |
    ASDF_VERSION=v0.20.0
    curl -fsSL "https://github.com/asdf-vm/asdf/releases/download/${ASDF_VERSION}/asdf-${ASDF_VERSION}-linux-amd64.tar.gz" \
      | sudo tar -xz -C /usr/local/bin asdf
    echo "$HOME/.asdf/shims" >> "$GITHUB_PATH"

- name: Install tools
  run: |
    asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
    asdf plugin add golang https://github.com/asdf-community/asdf-golang.git
    asdf install
```

List the plugin URLs explicitly rather than deriving them from `.tool-versions` with
`xargs asdf plugin add`. The derived form depends on the community short-name index resolving
every name — a network fetch and a third-party repo in your build path — and it fails outright
for any tool with no index entry. Naming the URLs costs one line per tool and makes every
plugin's origin reviewable in the diff.

`$GITHUB_PATH` is how you persist a `PATH` entry across steps — a bare `export PATH=` inside one
`run:` block dies with that block's shell.

## Caching

Cache the three directories that hold downloaded and built artifacts:

```yaml
path: |
  ~/.asdf/installs
  ~/.asdf/plugins
  ~/.asdf/downloads
key: asdf-${{ runner.os }}-${{ hashFiles('.tool-versions') }}
```

Keying on `hashFiles('.tool-versions')` is exactly right: the cache is valid for as long as the
pinned versions are, and invalidates the moment someone bumps one.

Two things to know:

- **Do not cache all of `~/.asdf`.** Restoring the whole directory has been reported to break
  `asdf-vm/actions`, which sees a partially-populated tree and errors rather than installing
  ([asdf-vm/actions#445](https://github.com/asdf-vm/actions/issues/445)). Cache the subdirectories.
- **`shims/` is cheap to regenerate and risky to restore.** Leave it out and let the install
  step or an explicit `asdf reshim` rebuild it.

For tools that compile from source (Ruby, Python, Erlang), caching is the difference between a
30-second job and a 10-minute one — it is worth getting right.

## Docker

There is **no official asdf image**. `asdfvm/asdf` on Docker Hub is third-party, as are the
`vborja/*` and `asdf-community` images. For anything you depend on, install the binary yourself
from a pinned release — it is five lines.

```dockerfile
FROM debian:bookworm-slim AS toolchain

ARG ASDF_VERSION=0.20.0
ENV ASDF_DATA_DIR=/opt/asdf-data
ENV PATH="${ASDF_DATA_DIR}/shims:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://github.com/asdf-vm/asdf/releases/download/v${ASDF_VERSION}/asdf-v${ASDF_VERSION}-linux-amd64.tar.gz" \
       | tar -xz -C /usr/local/bin asdf

WORKDIR /app
COPY .tool-versions .
RUN asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git \
 && asdf plugin add golang https://github.com/asdf-community/asdf-golang.git \
 && asdf install

COPY . .
RUN npm ci && npm run build
```

Points that matter:

- **`ENV PATH=` is mandatory**, not a convenience. Every `RUN`, and every later `docker exec`,
  is a non-login shell that will never source a profile.
- **Copy `.tool-versions` before the source tree.** The `asdf install` layer then caches until
  a version actually changes, instead of being invalidated by every code edit.
- **Pin `ASDF_VERSION`.** `latest` in a Dockerfile is a build that works until it doesn't.
- **Explicit plugin git URLs** skip the short-name index, removing a network dependency and a
  third-party repo from your build.
- **No Alpine.** Most plugins build against glibc, and musl breaks them in ways that surface as
  confusing runtime errors rather than build failures. Use `-slim` Debian.
- For a multi-stage build, remember the shims are thin wrappers that **invoke the `asdf`
  binary** — copying only `$ASDF_DATA_DIR` leaves them pointing at an executable that is not
  there. Carry both:

  ```dockerfile
  FROM debian:bookworm-slim
  COPY --from=toolchain /usr/local/bin/asdf /usr/local/bin/asdf
  COPY --from=toolchain /opt/asdf-data /opt/asdf-data
  ENV ASDF_DATA_DIR=/opt/asdf-data
  ENV PATH="${ASDF_DATA_DIR}/shims:${PATH}"
  ```

  Or skip asdf at runtime entirely: resolve the real paths at build time with `asdf where`,
  copy those directories, and put them on `PATH` directly. That produces a smaller image with
  no asdf dependency, at the cost of the version no longer being introspectable in the
  container.

Match architectures: the release assets cover `linux-amd64`, `linux-arm64`, and `linux-386`.
Use Docker's `TARGETARCH` build arg when building multi-platform.

## GitLab CI

```yaml
variables:
  ASDF_VERSION: "0.20.0"
  ASDF_DATA_DIR: "${CI_PROJECT_DIR}/.asdf"

cache:
  key:
    files: [.tool-versions]
  paths:
    - .asdf/installs
    - .asdf/plugins
    - .asdf/downloads

before_script:
  - curl -fsSL "https://github.com/asdf-vm/asdf/releases/download/v${ASDF_VERSION}/asdf-v${ASDF_VERSION}-linux-amd64.tar.gz" | tar -xz -C /usr/local/bin asdf
  - export PATH="${ASDF_DATA_DIR}/shims:${PATH}"
  - asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
  - asdf install

test:
  script:
    - asdf current
    - node --version
```

Pointing `ASDF_DATA_DIR` inside `$CI_PROJECT_DIR` is deliberate — GitLab can only cache paths
under the project directory, so the default `$HOME/.asdf` would never be cached.

The same shape works for CircleCI, Buildkite, Jenkins, and Azure Pipelines: install the binary,
export the shims `PATH`, add plugins, `asdf install`.

## Makefiles and scripts

`make` runs each recipe line in a fresh non-login `/bin/sh`. Export the path once at the top:

```makefile
export PATH := $(HOME)/.asdf/shims:$(PATH)

.PHONY: setup
setup:
	asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git || true
	asdf install

.PHONY: test
test: setup
	node --version
	npm test
```

Where you would rather not touch `PATH` at all, `asdf exec` resolves and runs directly:

```bash
asdf exec node --version
asdf exec go build ./...
```

This is the most robust form for a script that might run in an environment you do not control.

In shell scripts, remember that adding an already-present plugin is an error:

```bash
set -euo pipefail
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git || true
asdf install                # idempotent on its own, no guard needed
```

## Hardening for unattended builds

For build images and anything that must not break because a third party changed something:

```ini
# .asdfrc
disable_plugin_short_name_repository = yes
concurrency = 4
```

Disabling the short-name repository forces every `asdf plugin add` to carry an explicit git URL.
That is a feature in an unattended context: it removes a network fetch, removes a community
index from your supply chain, and makes every plugin's origin visible in the diff.

The rest of the checklist:

- **Pin the asdf version.** `asdf update` was removed in 0.16+, so pinning is also how you
  control upgrades.
- **Pin plugin refs** for the strictest builds: `asdf plugin update <name> <git-ref>` after
  adding, or vendor the plugin.
- **Set `ASDF_CONCURRENCY`** explicitly on shared runners. `auto` reads the *host's* core count,
  which in a container is usually far more than the cgroup actually allows — a common cause of
  OOM-killed source builds.
- **Log `asdf current` in every job.** One line of output, and it turns "why did this break"
  into a diff.
- **Avoid `asdf plugin update` in CI** unless you mean it: it moves plugins to whatever is on
  the default branch, which makes builds non-reproducible. (asdf 0.16.2 specifically had a bug
  where `plugin update` emptied plugin support directories —
  [asdf#1948](https://github.com/asdf-vm/asdf/issues/1948).)
- **Remember plugins execute arbitrary shell code** at install time, with whatever credentials
  the runner has. Review a plugin before adding it to a pipeline, the same as any other
  build-time dependency.
