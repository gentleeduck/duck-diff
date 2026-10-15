# Contributing to duck-diff

## Repo layout

```
duck-diff/
|- apps/server/       Bun server and CLI, compiled to one binary with the page inside
|- apps/web/          the page: React, TanStack Router and Query, duck-ui
|- packages/git/      every git command (only packages/git/src/run.ts spawns git)
|- packages/protocol/ zod schemas shared by the server and the page
|- packages/ui/       the duck-ui components the page uses
|- packages/testing/  throwaway repos for tests
|- lua/duck-diff/     the Neovim plugin
`- tests/nvim/        the plugin's specs
```

## Build and test

```sh
bun install
bun run ci          # biome, types, build, unit tests with coverage
bun run test:e2e    # Playwright against the compiled binary
bun run test:nvim   # Lua specs in headless Neovim
bun run bench       # performance budgets
```

`apps/server/dist/duck-diff` is the binary those build; point the plugin at it with `opts.binary`, or link it
onto your PATH.

## Rules

- Write the failing test first; tests live in `__tests__` folders.
- Commits are conventional (`feat(web): ...`, `fix(git): ...`), plain ASCII, header under 100 characters.
- Comments say why, in a line or two.
- The GitHub token stays on the server; nothing sends it to the page.

## Releasing

Bump `apps/server/package.json` and the plugin's version, add the changes to `CHANGELOG.md`, merge to `main` and
push a `v<version>` tag. The release workflow builds the four binaries, publishes them with `checksums.txt`, and
installs the result with `install.sh` to check it.
