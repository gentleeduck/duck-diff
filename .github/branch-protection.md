# Branch protection

Applied through the GitHub API. Keep this file in step with the live settings.

## `main`

- Required checks: `verify (ubuntu-latest)` and `verify (macos-latest)` from `ci`, and `lint` from `Lint PR title`.
- Conversation resolution required, linear history, no force pushes, no deletions.
- No required approvals and admins may bypass, so a sole maintainer can merge their own PRs, as on duck-ui.

## Repository settings

- Squash and rebase merges only, head branches deleted after merge.
- Dependabot alerts and security updates, secret scanning and push protection, private vulnerability reporting.

## Tags

Only admins can create, move or delete `v*` tags (the `release tags` ruleset). They trigger `release.yml`, which builds the four binaries and `checksums.txt` and checks `install.sh` against them.
