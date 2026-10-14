# duck-diff

A fast local git diff viewer for Neovim. `:DuckDiff` opens your changes, a branch, a range or a commit in an app
window rendered with [@pierre/diffs](https://diffs.com): split or stacked, syntax highlighted, virtualized, and live
as you edit.

## Install

With [lazy.nvim](https://github.com/folke/lazy.nvim):

```lua
{ 'gentleeduck/duck-diff', cmd = 'DuckDiff', opts = {} }
```

The first `:DuckDiff` downloads the binary for your machine from the matching GitHub release, checks its sha256 and
caches it under `stdpath('data')/duck-diff`. Linux and macOS, x64 and arm64. While the repo is private, downloads
use a GitHub token from `opts.github_token`, `GITHUB_TOKEN`, `GH_TOKEN` or `gh auth token`. Run
`:checkhealth duck-diff` if something is off.

## Use

| Command | Opens |
|---------|-------|
| `:DuckDiff` | all local changes (working tree against HEAD) |
| `:DuckDiff staged` / `unstaged` | one side of the index |
| `:DuckDiff main` | what the current branch adds on top of `main` |
| `:DuckDiff main...feature` / `a..b` | any two refs, PR-style or tip to tip |
| `:DuckDiff commit [sha]` | one commit (HEAD by default) |
| `:DuckDiff status` / `close` | the server for this repo |
| `:DuckDiff build` | build the binary from this checkout with Bun instead of downloading |

In the page: `j`/`k` next or previous change, `Shift J`/`Shift K` next or previous file, `t` split or stacked,
`/` filter files, `Ctrl K` command palette, `?` all shortcuts. Saving a buffer refreshes the page, and the
"Open in Neovim" button on a file jumps back to it.

## Options

```lua
opts = {
  open = 'app',      -- 'app' (Chrome app window), 'tab' (default browser) or function(url)
  browser = nil,     -- browser command for app windows; detected when nil
  binary = nil,      -- path to your own duck-diff binary
  github_token = nil, -- for private release downloads
  server = { idle_timeout_ms = 600000 },
}
```

## Without Neovim

```sh
duck-diff serve --repo . # prints {"port":..., "token":..., "url":...}; open the url
```

## Development

```sh
bun install
bun run ci        # biome, types, build, unit tests with coverage
bun run test:e2e  # Playwright against the compiled binary
bun run test:nvim # Lua specs in headless Neovim
```
