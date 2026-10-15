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
`/` filter files, `1` to `5` switch views, `Ctrl K` command palette, `?` all shortcuts. Saving a buffer refreshes the page, and the
"Open in Neovim" button on a file jumps back to it.

On unstaged changes, stage or discard a file from its header or one change from the toolbar next to a hovered line
(`s` and `x` act on the change `j`/`k` landed on); on staged changes, unstage (`u`). A discard asks first and can be
undone from the toast or the palette.

Hover any line and choose Comment (or press `c`) to leave a note. Comments stay on this machine under
`$XDG_DATA_HOME/duck-diff`, follow their line when code above it moves, and show as outdated when the line is gone.
The Comments button lists them all. Tick Viewed on a file (or press `v`) to fold it until it changes again.

What the page remembers (settings, key bindings, panel sizes, open diff tabs, viewed files) is kept there too, in
`state.json`, and the GitHub and commit answers it reuses in each repo's `cache` folder (`duck-diff cache clear`
empties those). Clearing the browser loses none of it.

The History tab lists the branch's commits and your stashes. "File history" on a file header narrows it to the
commits that touched that file (following renames): click one to see its change to the file, Shift-click a second
to compare the two versions. Stashes also show in the ref pickers, so any stash can be compared with any ref.

During a merge, a conflicted file shows once with its markers and cannot be staged from the page; resolve it in
Neovim. Binary files show their size change, changed images show before and after, and files marked
`linguist-generated` in `.gitattributes` start folded.

### Beyond the diff

The rail on the left (or keys `1` to `5`) switches between five views of the repo:

- **Changes**: the diff above, with a commit box (amend, commit and push, stash) under the file tree. Branch
  menu, pull, push and fetch sit in the top bar.
- **Commit graph**: every commit with its branch lanes, like VS Code's Git Graph. Find commits by message,
  author or sha. A commit's panel shows its files and starts a branch there, checks it out, cherry-picks or
  reverts it. Branch rows switch, merge into the current branch or delete; stash rows apply, pop or drop.
  When a merge or pick stops on conflicts, the commit box says so and offers Abort.
- **Files**: the whole repo as a tree, opening on the README. Markdown renders, with a toggle for its source.
- **Pull requests** and **Issues**: GitHub for this repo's `origin`. Sign in with `gh auth login` (or paste a
  token, kept only in the server's memory). Read and comment, approve or request changes, merge, open a pull
  request from the current branch, and see its CI checks. Review files fetches the head and shows it in the
  diff, with GitHub's review threads under their lines; a line comment can go straight to GitHub.

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
bun run bench     # performance budgets against the compiled binary
```

The budgets: the first diff row within 300 ms of the file list for 1,000 changed files, under 300 MB of JS heap
for a 50,000-line diff, and 60 fps while scrolling. CI checks them on Linux.
