# Changelog

## Unreleased

- Open in editor never uses a terminal in the page: a file opens in the Neovim the plugin started from, else
  in VS Code (found on a Mac even without `code` on the PATH), else another editor (Cursor, VSCodium, Zed,
  Sublime Text and others), else the system's own app. A toast says where it went.
- The changes tree looks like nvim-tree: its git colours and marks, a folder coloured by what is inside it,
  thin chevrons and indent lines, and no folding of single-child folders.
- In the split layout, a comment sits under the side it was made on, deleted lines on the left and added on
  the right.
- Your own review comments on a pull request can be edited and deleted from a "..." menu, as on GitHub, and
  local notes use the same card and menu instead of loose buttons. Deleting asks first.
- Esc closes a comment being written even when its box does not have the keyboard, and Esc during a drag
  over lines lets them go instead of commenting.
- The repo switcher drops folders that no longer exist and always lists the repo being served. The test
  suites keep their repos out of your list and no longer leave temp folders behind.

## 0.5.2

- `duck-diff update` shows each step as it happens: the release it found, the download with a bar, its size
  and speed, the sha256 check and the install. On a terminal the running step spins; piped, one line per
  step.
- Every command starts with the same header as the server, and errors are one red line on a terminal.
- `install.sh` shows the same steps and curl's progress bar, and the Neovim plugin shows how far the
  first download of a version is in the command line.

## 0.5.1

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
