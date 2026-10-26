# Changelog

## 0.7.2

- A merge pick is never final before Continue: pressing the side taken again takes it back, Start over clears a
  whole file, and a file already resolved is listed under Resolved, in the merge sidebar and the Merge tab, with
  Reopen, which writes its conflict back as git first did.
- Open files in, in the settings, picks the editor Open uses: Automatic as before, or Neovim, VS Code, VS Code
  Insiders, VSCodium, Cursor, Windsurf, Zed or Sublime Text. One that is not installed is reported, never swapped.
- The comments panel deletes comments, a comment on a file that has left the diff included.

## 0.7.1

- The windows git opens as its merge tool, diff tool and rebase editor carry the display settings (split or stacked,
  theme, wrapping and the rest) and the keyboard shortcuts, and ? lists them there too.
- The side panel's show and hide tooltips name Cmd+B on a Mac.

## 0.7.0

- The diff's from and to stay as chosen: a page that opens without them (a reload from Neovim, a new window, a
  restarted server) lands on the comparison last picked in that repo. Picking the working tree again goes back to
  opening on it.
- Ctrl+H, Ctrl+J, Ctrl+K and Ctrl+L move between the panels the way Neovim moves between windows and tmux between
  panes: the top bar, the side panel, the page, the symbol panel and the bottom panel, from a terminal too (where a
  key with no panel on that side still reaches the shell). A text box keeps them; Esc first. A hidden side panel
  or a closed bottom panel opens on the way.
- The Vim-style key layer is gone: no leader chords, which-key, `:` command line, modes in the status bar or
  keymaps editor. A few plain keys do one thing each: Ctrl+P (Cmd+P on a Mac) searches, j and k step through
  changes, J and K through files, s, u and x stage, unstage and discard, c comments, v marks viewed, o opens in
  your editor, t flips the layout, / filters, and arrows, Home and End walk any list. `?` lists them.
- duck-diff is git's merge tool, diff tool and rebase editor. `git mergetool` resolves a merge, cherry-pick, revert,
  rebase or stash pop in a window with only the conflicts and their files, and returns each file to git once it
  is staged; `git difftool` shows each file and moves on with Next file; `git rebase -i` plans the rebase as a
  list (a todo with lines it does not plan opens the usual editor). The window closes once git has what it asked
  for. The install sets this up where no other tool is chosen (`duck-diff git-setup`, `--off` to undo); so does
  the Neovim plugin, unless `git_setup = false`.
- Each file on the merge page carries Open, Blame and History in its header. Blame names who last changed each
  line of the current and incoming sides (the merge base's for the lines a side removed), and the result names
  the side each pick came from; b blames the file at the top of the page. History lists the commits on each side
  that changed the file since the two parted.
- A conflict written by git in its usual style, which folds blocks split only by a lone brace and trims lines
  both sides share, now shows its merge base, so a side that removed lines shows them removed instead of
  showing nothing.
- Editing a merge as text is editing code: coloured as the diff is, numbered, and with each side of a conflict
  tinted, and each conflict's opening line carries Accept current, Accept incoming, Both and Base. The same
  editor writes a single block by hand.
- Moving to a file or a change glides there gently on the diff and the merge page, and the file list marks the
  file it is headed for at once instead of flicking through those on the way. The merge page no longer says
  everything is resolved before it has read the conflicts, and shows its files together rather than one by one.
- A worktree's tag sits right after its branch name instead of under a long one.
- Conflicts met in the page's terminal are announced only when there are conflicts: a rebase being planned no
  longer reads as stopped.
- The merge page shows every conflicted file on one page, as the diff shows changed files: each under a header
  that stays while it scrolls, the list beside it jumping to a file and marking the one on screen, and each
  column scrolling sideways as the diff's do. It shows a conflict as GitHub does: the current change and the
  incoming one, each headed by its branch, short hash and subject and drawn against the merge base in red and
  green with the changed words marked, beside the result being built. It follows the diff settings (split or
  stacked, word marks, wrapping, line numbers, backgrounds, change markers, tab width), with j, k and t working
  there too. The top bar says what is coming together and how many files are left, with
  Continue and Abort; each file shows its conflict count; each conflict reads across one strip with its state in
  a badge; and after the last file the page offers Continue right there.
- A merge, rebase, cherry-pick or revert in progress shows everywhere: in the status bar on every page, as a
  Merge entry with its count on the rail, and as a Merge tab in the bottom panel listing the conflicted files with
  Take current, Take incoming and Resolve. One that stops in the page's terminal (or anywhere else) turns the
  panel to that tab at once and says so.
- Files opens the README, or offers the file tree back, when the tree is hidden; it no longer shows an empty
  page pointing at a panel that is not there.
- Nothing you start has a time limit any more: a push of a big repo, a pre-push build, a long rebase or a bisect
  run takes as long as it takes. Background reads still give up on a git that has printed nothing for a while,
  and then stop the hooks and everything it started with it.
- macOS no longer kills duck-diff after an update. Every install path (the Neovim plugin, `duck-diff update`,
  install.sh and a local build) writes a new file and renames it over the old one instead of rewriting it, and
  signs it ad hoc when its signature does not check out. A release now fails if a Mac build does not verify.
- Editing a hide pattern keeps its name in the box instead of emptying it, and a name that is only the regex
  follows the regex as it changes. Set upstream starts from the branch's current upstream.
- A reload brings the page back as it was: the bottom panel open on the same terminal or output, terminals in
  their order with their names, the side panel's tab, where every list and the diff were scrolled, folded files
  and folders, opened context, filters and sorts, blame, the symbol panel, and anything half typed (the commit
  message, comments, replies, merge picks, new pull request, issue and release forms).
- A push, pull, commit or any other git action still running shows as running after a reload and in every
  other tab, and its toast comes when it ends there too. A new build installed meanwhile waits for it instead of
  cutting it off; one cut off by a restart says so.
- The browser's own shortcuts (print, save, find, history, downloads, bookmarks, view source, developer tools,
  the F keys, Alt+arrows) do nothing in duck-diff; reload still works, and text boxes keep copy, cut, paste,
  select all, undo and redo. Chrome keeps Ctrl+W, Ctrl+T, Ctrl+N and Ctrl+Tab for itself.
- The worktree and repository card shows the folder's name, its path with a copy button, the branch with how far
  it is ahead of or behind its upstream, the commit it is on with author and age, and how many files differ.
- The rebase, merge and cherry-pick banner puts its buttons on a row of their own above the message, so a narrow
  side panel no longer squeezes the words into a column.

## 0.6.0

- Open in editor never uses a terminal in the page: a file opens in the Neovim the plugin started from, else
  in VS Code (found on a Mac even without `code` on the PATH), else another editor (Cursor, VSCodium, Zed,
  Sublime Text and others), else the system's own app. A toast says where it went.
- The changes tree looks like nvim-tree: its git colours and marks, a folder coloured by what is inside it,
  thin chevrons and indent lines, and no folding of single-child folders.
- In the split layout, a comment sits under the side it was made on, deleted lines on the left and added on
  the right.
- Your own review comments on a pull request can be edited and deleted from small buttons at the top of the
  comment, and comments kept on this machine use the same card and buttons. Deleting asks first.
- Esc closes a comment being written even when its box does not have the keyboard, and Esc during a drag
  over lines lets them go instead of commenting.
- The repo switcher drops folders that no longer exist and always lists the repo being served. The test
  suites keep their repos out of your list, and the Neovim suite no longer leaves about 95 MB in /tmp per run.
- The repo switcher lists this repo's other worktrees, so switching to one and seeing its diff is one click.
  Another worktree or repo opens the way the current page was opened: through the Neovim plugin (its open
  setting, an app window by default), or as an app window from the command line, not a browser tab. Adding a
  folder that does not exist says so.
- Any commit can be the from side of the working tree or staged comparison, not only HEAD, and HEAD (or any
  commit) compared with an older commit shows what changed between them instead of nothing. Two branch or tag
  names still compare from where they split, as GitHub does.
- The from and to pickers open with their ref selected, to replace by typing or edit in place (Home, End and
  the arrows move the caret), and take any revision git reads: a hash, abc^, ^abc as the commit before abc,
  HEAD~2, a tag, :/a message, main@{yesterday}. Under the box git says which commit it is, or shows in red why it
  does not know it (no such hash, an ambiguous one). Enter or Use applies it, and a typed range (a..b, a...b)
  sets both sides. Typing still narrows branches, tags and recent commits, and finds older commits by message.
- Lines picked for a comment keep their added or deleted colour, with the selection tinted over them, a bar
  beside them and their line numbers lit, as GitHub marks them; before, a solid yellow hid what changed.
- The repo switcher lists each checkout once: this repo's worktrees under Worktrees, found by git, and only
  other repositories under Repositories.
- Worktrees also include checkouts kept in .claude/worktrees or .worktrees that git does not list as this repo's
  (a copy synced from another machine, a clone), marked separate. Clicking a worktree's row opens it.
- A window opened for another worktree or repo survives a new build: the server that opened it restarts in place
  and leaves it running, where it used to close it, and its page reloads onto the new build.
- Copy as prompt, at the top of a comment, and Copy all as prompt, in the comments panel, put your comments on the
  clipboard ready for an AI: the comparison, then each file and its lines and side, the code quoted with its line
  numbers, the exact words when only part of a line was picked, and the comment under it.
- Pull requests, issues, the inbox, lists, actions, releases, discussions, security and insights read in a
  column as wide as GitHub's, centred on a wide screen. A pull request's or issue's details column is GitHub's
  width, with a wider gutter beside the conversation.
- duck-diff update, install.sh and the Neovim plugin show a download the same way: the header, a spinning step,
  the bar on its own line under it (beside it in Neovim's one-line command line) with the share, sizes, speed and
  time left, then a check per finished step. install.sh draws it from the file growing on disk instead of curl's
  own bar.
- A README or other Markdown file reads in a centred column of GitHub's width, however wide the window.
- Each view keeps its own left panel shown or hidden.
- The repo switcher is wider, each row one line that never runs out of its box, and every worktree and repository
  has a card on hover: its full path, what it is, the commit it is on and how to open it. The worktrees in the
  graph's sidebar have the same card.
- Destructive buttons (discard, delete, remove, forget) turn red on hover; the same action has the same icon
  everywhere; a copy turns its button into a green check for a moment.
- Every button in the page is duck-ui's, and every title and every cut-off or clamped text shows in the page's
  own tooltip.
- Toasts say what happened as a title with the detail under it: a success with a check, a failure with its reason
  and, for git, a button to the output. Every action says so when it fails.
- A comment kept on this machine is called a comment, not a note.
- Toasts take the theme's colours instead of stock white or black, and each kind's icon its theme colour.
- Every popover, hover card and tooltip points at what it describes, and the checkout cards are a little wider.
- The repo switcher shows its lists loading, says so when there is no other repository, and says why when the
  list could not be read, with a retry.
- Badges are coloured by what they say, with duck-ui's badge variants: green for open, passed, here or current,
  yellow for pending or waiting on you, red for failed, missing or severe, purple for merged or done, blue for
  details, and grey for the rest.
- The sidebar is never narrower than 300px. Commit and Commit and push share the row in equal halves, and in a
  narrow sidebar the second says Push.
- A failed git action's toast says the reason in a sentence (a hook failed, the remote has newer commits, the
  credentials were refused) instead of the whole colour-coded log, which stays in Output.
- The side panel, the symbol panel, the Output panel's list of actions and the bottom panel all resize with
  duck-ui's resizable panels, keep their sizes, and go back to their first size on a double-click of the edge.
- Words in buttons, badges, tabs and toggles sit centred on their capitals; JetBrains Mono's line box left them
  about a pixel high.
- The Comments count and the ahead and behind counts are badges like the rest.
- Everything duck-diff keeps now lives in one folder, `~/.duck-diff` (or `$DUCK_DIFF_HOME`): settings, the repo
  list, comments, caches and undo snapshots. What older versions kept in `~/.local/share/duck-diff` and
  `~/.cache/duck-diff` moves there the first time duck-diff starts, and empty folders left by old runs are dropped.
- A pull request review not sent yet keeps its comments across closing the page and restarting duck-diff, per
  repository and pull request, until it is sent.
- Viewed files are kept per repository instead of in one list shared by every repository.
- The terminal works as a desktop one: the shell owns it, so Ctrl+C stops what runs, Ctrl+Z suspends it and job
  control works (it said "no job control" and only printed ^C before). Ctrl+Shift+C, Ctrl+Insert or Ctrl+C with
  text selected copy; Ctrl+V, Ctrl+Shift+V and Shift+Insert paste. Closing a terminal hangs up what runs in it.
  This holds for zsh too, which unlike bash never took the terminal over by itself. On Linux for now: macOS
  keeps the terminal as it was, without job control.
- The test suites' shells keep no history, so their commands no longer end up in your own shell history.
- In the commit graph, a commit's card no longer opens over the right-click menu it belongs to.
- Servers change the shared repo list one at a time, each writing it whole, so a repository one server adds while
  another drops a gone folder is never lost, and no server reads a half-written list.
- Every tooltip, hover card, popover, tab strip and picker is duck-ui's: the page-wide tooltip for titles and
  cut-off text, the code hover, the selection toolbar, the @-mention list, the GitHub pickers and the pull request,
  list, inbox and comment tabs.
- Confirm dialogs are one width and keep everything inside: a long file or folder path sits on its own line and
  wraps anywhere, and the buttons stay in the box. A diff's file path stays on one line in its header.

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
