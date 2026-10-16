# Changelog

## Unreleased

- The binary carries the Nerd Font icons as well as JetBrains Mono, so the file tree and the terminal draw
  their icons on machines without a Nerd Font installed.
- On a busy Mac a git, `gh` or `nvim` call could hang or come back empty, through a Bun bug
  (oven-sh/bun#45483); they now start through `Bun.spawn`, which does not have it.
- Stopping the server waits for the servers it started for other checkouts.
- Settings, key bindings, panel sizes and viewed marks stay in step across open pages and repos: a change
  made in one page shows in the others at once, instead of being written over by the next change made
  there, and a change made just before a reload is no longer lost.

## 0.5.0

The diff viewer became a git and GitHub controller you can run on its own.

### Command line

- `duck-diff` opens your changes; targets read like `:DuckDiff` (`staged`, a ref, `a...b`, `a..b`,
  `commit`), and `graph`, `files path:line`, `prs N`, `issues N` and the other views open by name.
- A second run in the same repo opens its page on the server already running.
- `duck-diff update` installs the newest release, checked against its sha256; `install.sh` does the same from
  curl, with `--version`, `--dir` and `--uninstall`.
- The page opens as an app window, as from Neovim.
- Starting it prints a short `@gentleduck/diff` banner with the repo, the branch and the link.

### Git

- Graph with branch lanes: check out, branch, cherry-pick, revert, interactive rebase, bisect, worktrees and
  submodules.
- Stage, unstage and discard files, hunks or single lines; a three-pane merge editor for conflicts.
- Every action shows its command and output, hooks included, in an Output panel; real shells in the same panel.
- Blame on both sides of the diff; diff tabs; hide patterns; viewed marks that count and fold.

### GitHub

- Pull requests and issues laid out like GitHub's: conversations, reviews, review threads in the diff, merge
  box with every method, checks and logs, linked timeline events.
- Notifications, releases, actions, discussions, security alerts and insights; GitHub Enterprise and GitLab.

### Page

- Neovim-style keys: Space leader, which-key, modes, a `:` command line and a palette, all rebindable.
- Code navigation through language servers, with a hover float like Neovim's.
- Ten dark themes. Light mode was considered and declined.
- Open on a file uses the attached Neovim, else `nvim` in a terminal in the page, else your code editor.
- Built on TanStack Router and Query; visited views and tabs stay alive, paused.
- A reload draws the whole page in its first frame: the server sends the diff, its colors, the graph and the
  saved answers with the html, and keeps them until the repo changes.
- Settings, comments and tabs live in `$XDG_DATA_HOME/duck-diff`, not in the browser.

## 0.4.1 and earlier

The local diff viewer for Neovim: `:DuckDiff` targets, split and stacked diffs, comments, staging, the file
tree and the first GitHub views.
