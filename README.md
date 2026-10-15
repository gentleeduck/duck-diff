<p align="center">
  <img src="./public/logo-dark.svg" alt="@gentleduck/diff" width="120"/>
</p>

<h1 align="center">@gentleduck/diff</h1>

<p align="center">
  A git diff viewer and GitHub client that lives in your browser, from the terminal or from Neovim.
</p>

<p align="center">
  <a href="./LICENSE">MIT</a> -
  <a href="./CHANGELOG.md">Changelog</a> -
  <a href="./CONTRIBUTING.md">Contributing</a> -
  <a href="https://github.com/gentleeduck/duck-diff/releases">Releases</a>
</p>

<p align="center">
  <a href="https://github.com/gentleeduck/duck-diff/actions/workflows/ci.yml"><img src="https://github.com/gentleeduck/duck-diff/actions/workflows/ci.yml/badge.svg" alt="ci"/></a>
  <a href="https://github.com/gentleeduck/duck-diff/releases/latest"><img src="https://img.shields.io/github/v/release/gentleeduck/duck-diff" alt="release"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"/></a>
</p>

---

Your changes, a branch, a range or a commit, rendered with [@pierre/diffs](https://diffs.com): split or stacked,
syntax highlighted, virtualized and live as you edit. Around it, the commit graph, the files, pull requests,
issues, notifications, actions and the rest of GitHub, a real terminal, and Neovim-style keys. One binary, no
cloud: it runs on your machine and opens in your browser.

<p align="center">
  <img src="./public/screenshots/diff.png" alt="The working tree in the diff, split, with the file tree" width="760"/>
</p>

<p align="center">
  <img src="./public/screenshots/code-navigation.png" alt="A name in the diff, with its hover and every place it is used" width="760"/>
</p>

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/gentleeduck/duck-diff/main/install.sh | sh
```

It puts the binary for your machine (Linux or macOS, x64 or arm64) in `~/.local/bin` after checking its sha256
against the release. Options go after `sh -s --`:

```sh
curl -fsSL .../install.sh | sh -s -- --version 0.5.0   # a given release
curl -fsSL .../install.sh | sh -s -- --dir ~/bin       # another folder
curl -fsSL .../install.sh | sh -s -- --uninstall       # take it out again
```

`duck-diff update` replaces it with the newest release later.

### In Neovim

With [lazy.nvim](https://github.com/folke/lazy.nvim):

```lua
{ 'gentleeduck/duck-diff', cmd = 'DuckDiff', opts = {} }
```

The first `:DuckDiff` downloads the binary matching the plugin, checks its sha256 and keeps it under
`stdpath('data')/duck-diff`. `:checkhealth duck-diff` says what is off.

## Quick start

```sh
cd your-repo
duck-diff                  # what you changed
duck-diff main             # what this branch adds on top of main
duck-diff prs 12           # pull request #12
duck-diff --help           # the rest
```

It opens the page as an app window (Chrome, Chromium or Brave; the default browser otherwise) and keeps serving
until Ctrl-C, or until no page has been open for a while. A second `duck-diff` in the same repo opens its page on
the server already running.

From Neovim it is `:DuckDiff`, with the same targets.

## What it does

- **Changes**: the diff in tabs (working tree, commits, ranges, pull requests), a file tree with filters, hide
  patterns and viewed marks, stage, unstage and discard by file, hunk or selected lines, blame on both sides,
  comments that follow their line, and a commit box (amend, sign off, commit and push).
- **Commit graph**: every branch's lanes, find by message, author or sha; check out, branch, cherry-pick, revert,
  rebase interactively, bisect, worktrees and submodules.
- **Files**: the whole tree, markdown rendered, blame and history per file, go to definition and references
  through language servers.
- **GitHub**: pull requests and issues with their conversations, reviews and review threads in the diff, merge
  with every method, checks and logs, notifications, releases, actions, discussions and security alerts.
- **Terminal and output**: real shells in a bottom panel, and every git action's command and output, hooks
  included.
- **Keys**: Space leader, `j`/`k` through changes, which-key, a `:` command line and a palette (`Ctrl K`), all
  rebindable; the keyboard button on the rail lists them.
- **Themes**: ten dark ones. There is a light button. It does not do what you think.

Open on any file goes to the Neovim you started from, else runs `nvim` at the line in a terminal in the page,
else VS Code, Cursor, Windsurf, Zed or Sublime.

## Command line

| Command | Opens |
| --- | --- |
| `duck-diff` | your uncommitted changes |
| `duck-diff staged` / `unstaged` | one side of the index |
| `duck-diff <ref>` | what this branch adds on top of `<ref>` |
| `duck-diff a...b` / `a..b` | any two refs, since they split or tip to tip |
| `duck-diff commit [sha]` | one commit |
| `duck-diff graph` / `files [path[:line]]` / `prs [n]` / `issues [n]` / `inbox` | a view |
| `duck-diff update [version]` | the newest release, over this binary |
| `duck-diff cache clear` | empties the GitHub and commit caches |
| `duck-diff serve` | the server alone, for editor plugins (one line of JSON on stdout) |

Options: `-C <path>` another repo, `--no-open` print the url, `-p <port>`, `--no-terminal`.

## Neovim options

```lua
opts = {
  open = 'app',       -- 'app' (Chrome app window), 'tab' (default browser) or function(url)
  browser = nil,      -- browser command for app windows; detected when nil
  binary = nil,       -- your own duck-diff binary
  github_token = nil, -- for downloads from a private fork
  server = { idle_timeout_ms = 600000 },
}
```

| Command | Does |
| --- | --- |
| `:DuckDiff [target]` | opens a diff, targets as above |
| `:DuckDiff status` / `close` | the server for this repo |
| `:DuckDiff build` | builds the binary from this checkout with Bun |

## Where things live

Settings, key bindings, comments, open tabs and viewed files are kept in `$XDG_DATA_HOME/duck-diff` (usually
`~/.local/share/duck-diff`), not in the browser: clearing the browser loses none of it. Each repo's GitHub and
commit answers are cached beside them; `duck-diff cache clear` empties those. The GitHub token never reaches the
page.

## Workspace

| Path | Role |
| --- | --- |
| [`apps/server`](apps/server) | the Bun server and CLI, compiled to one binary with the page inside |
| [`apps/web`](apps/web) | the page: React, TanStack Router and Query, [duck-ui](https://github.com/gentleeduck/duck-ui) |
| [`packages/git`](packages/git) | every git command, run from one place |
| [`packages/protocol`](packages/protocol) | zod schemas shared by the server and the page |
| [`packages/ui`](packages/ui) | the duck-ui components the page uses |
| [`packages/testing`](packages/testing) | throwaway repos for tests |
| [`lua/duck-diff`](lua/duck-diff) | the Neovim plugin |

## Development

```sh
bun install
bun run ci          # biome, types, build, unit tests with coverage
bun run test:e2e    # Playwright against the compiled binary
bun run test:nvim   # Lua specs in headless Neovim
bun run bench       # performance budgets against the compiled binary
```

The budgets: the first diff row within 300 ms for 1,000 changed files, under 300 MB of JS heap for a
50,000-line diff, and 60 fps while scrolling and while a shell floods the terminal. CI checks them on Linux.
See [CONTRIBUTING.md](./CONTRIBUTING.md) for the rest.

## License

[MIT](./LICENSE)
