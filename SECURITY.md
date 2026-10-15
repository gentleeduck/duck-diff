# Security Policy

## Supported versions

Pre-1.0. Only the latest release of `@gentleduck/diff` is supported; fixes ship as a new release.

## Reporting a vulnerability

Do not open a public issue. Use [private vulnerability reporting](https://github.com/gentleeduck/duck-diff/security/advisories/new) or email [ahmedayobbusiness@gmail.com](mailto:ahmedayobbusiness@gmail.com) with:

- a description of the issue
- the version (`duck-diff --version`) and your OS
- a minimal reproducer if possible
- your assessment of the impact

We aim to acknowledge within 72 hours and to release a fix or mitigation within 30 days for high severity issues.

## Threat surfaces

duck-diff is a local server that runs git and shells on your machine and serves a page to your browser.

- **Local server**: it listens on `127.0.0.1` only, and every API call and socket needs the per-run token in the page URL. Anyone who can read that URL can act on the repo as you, so do not share it.
- **Terminal**: the page can open real shells in the repo. Treat the page like a terminal window.
- **Git**: every git command goes through one module (`packages/git/src/run.ts`) with an allowlist of subcommands. Hooks in the repo run as they would from the command line.
- **GitHub token**: read from `gh` or the environment, kept in the server and never sent to the page.
- **Install script**: `install.sh` checks each binary's sha256 against the release's `checksums.txt` before installing it. Read it before piping it to `sh`.
- **Rendered content**: markdown, diffs and GitHub bodies are rendered as text or sanitised HTML; report any way to run script through them.

## Responsible disclosure

Please give us 90 days to address an issue before public disclosure. We credit reporters in the release notes unless they prefer otherwise.
