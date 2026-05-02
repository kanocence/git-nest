# git-nest CLI

Command-line interface for [Git Nest](../README.md) — manage your self-hosted Git repos from the terminal.

## Install

```bash
# From the repo root
cd cli
pnpm install
pnpm build

# Link globally (optional)
npm link
# or: add dist/main.mjs to your PATH
```

## Quick Start

```bash
# 1. Point the CLI at your Git Nest server (and optionally set a password)
git-nest login --server http://myserver:3000 --password mypassword

# 2. Create a new bare repo on the server
git-nest repo create my-project

# 3. In an existing local Git repo, add Git Nest as a remote
cd /path/to/local/repo
git-nest remote add my-project

# 4. Push / pull as normal
git-nest push
git-nest pull
```

> `--password` is the same value as `WEB_PASSWORD` in your `docker-compose.yml`.
> The plain-text password is **never stored** — only its sha256 hash is saved locally.

## Commands

### `git-nest login`

Configure the server URL and password. Settings are saved to `~/.git-nest/config.json`.

```
OPTIONS
  --server    Server base URL  e.g. http://myserver:3000
  --password  WEB_PASSWORD set on the server (omit if no password is configured)
```

Running `login` again updates only the flags you pass; omitting `--password` keeps the existing token.

---

### `git-nest repo`

| Command | Description |
|---------|-------------|
| `git-nest repo list` | List all repos on the server |
| `git-nest repo create <name>` | Create a new bare repo |
| `git-nest repo create <name> --clone <url>` | Clone from a remote URL into Git Nest |

---

### `git-nest remote add <repo>`

Add the Git Nest server as a Git remote in the current directory.

```
ARGUMENTS
  repo          Repository name on Git Nest

OPTIONS
  --name        Local remote name (default: git-nest)
  --ssh         SSH host override  (default: inferred from --server URL)
```

Resulting remote URL: `git@<host>:/data/git/<repo>.git`

---

### `git-nest status`

Show the current server config and detect any Git Nest–linked remote in the local repo.

---

### `git-nest push`

Push the current branch to the `git-nest` remote.

```
OPTIONS
  --remote    Remote name (default: git-nest)
  --branch    Branch to push (default: current branch)
  --force     Force push
```

---

### `git-nest pull`

Pull from the `git-nest` remote into the current branch.

```
OPTIONS
  --remote    Remote name (default: git-nest)
  --branch    Branch to pull (default: current branch)
```

## Configuration file

`~/.git-nest/config.json`

```json
{
  "server": "http://myserver:3000",
  "sessionToken": "<sha256 of your password>"
}
```

Edit this file directly if you need to switch servers without re-typing your password.

## Development

```bash
# Watch mode — rebuilds on every save
pnpm dev

# Type check
pnpm typecheck

# One-shot build
pnpm build
```

The CLI is bundled into a single `dist/main.mjs` (ESM, ~8 KB) with a `#!/usr/bin/env node` shebang.
