# Branch protection

Applied to `main` with `gh api` (see below). Keep this file in step with the live settings.

## `main`

- Pull request required, 1 approval, stale approvals dismissed, code owner review on.
- Required checks, branch up to date:
  - `verify (ubuntu-latest)` and `verify (macos-latest)` from `ci`
  - `Analyze` from `CodeQL`
  - `dependency-review` from `Dependency Review`
  - `lint` from `Lint PR title`
- Conversation resolution required, linear history, no force pushes, no deletions.
- Admins may bypass, so a sole maintainer can still merge their own PRs.

## Repository settings

- Squash and rebase merges only, head branches deleted after merge.
- Dependabot alerts and security updates, secret scanning and push protection, private vulnerability reporting.

## Tags

`v*` tags trigger `release.yml`, which builds the four binaries and `checksums.txt` and checks `install.sh` against them.
