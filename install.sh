#!/bin/sh
# duck-diff installer.
#
#   curl -fsSL https://raw.githubusercontent.com/gentleeduck/duck-diff/main/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --version 0.5.1 --dir ~/bin
#   curl -fsSL .../install.sh | sh -s -- --uninstall
#
# Downloads the release binary for this machine, checks its sha256 against the release's checksums.txt,
# and puts it in ~/.local/bin (or --dir). While the repo is private, set GITHUB_TOKEN or GH_TOKEN, or be
# logged in with gh.
set -eu

REPO="${DUCK_DIFF_REPO:-gentleeduck/duck-diff}"
DIR="${DUCK_DIFF_DIR:-$HOME/.local/bin}"
VERSION="${DUCK_DIFF_VERSION:-}"
UNINSTALL=0

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B="$(printf '\033[1m')" D="$(printf '\033[2m')" G="$(printf '\033[32m')" Y="$(printf '\033[33m')"
  C="$(printf '\033[36m')" R="$(printf '\033[31m')" N="$(printf '\033[0m')"
else
  B="" D="" G="" Y="" C="" R="" N=""
fi
say() { printf '%s\n' "$*"; }
# The look every duck-diff command has: the name over a green rule, a line per step, a check when it is done.
header() { printf '\n %s\n%s%s%s\n\n' "🦆 @gentleduck/diff installer" "$G$B" "──────────────────────────────" "$N"; }
step() { printf '%s›%s %s\n' "$C" "$N" "$*"; }
ok() { printf '%s✔%s %s\n' "$G" "$N" "$*"; }
die() {
  printf '%s✖ %s%s\n' "$R" "$*" "$N" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2#v}"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h | --help)
      say "usage: install.sh [--version <x.y.z>] [--dir <folder>] [--uninstall]"
      say "  --version    a release other than the latest"
      say "  --dir        where the binary goes (default ~/.local/bin)"
      say "  --uninstall  remove it again; your settings stay"
      exit 0 ;;
    *) die "unknown option $1 (try --help)" ;;
  esac
done

header

if [ "$UNINSTALL" = 1 ]; then
  rm -f "$DIR/duck-diff"
  ok "Removed $DIR/duck-diff"
  say "  ${D}Your settings and comments are still in \${XDG_DATA_HOME:-~/.local/share}/duck-diff; delete that folder to forget everything.${N}"
  exit 0
fi

case "$(uname -s)" in
  Linux) OS=linux ;;
  Darwin) OS=darwin ;;
  *) die "no build for $(uname -s) yet" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) ARCH=x64 ;;
  arm64 | aarch64) ARCH=arm64 ;;
  *) die "no build for $(uname -m) yet" ;;
esac
ASSET="duck-diff-$OS-$ARCH"

command -v curl >/dev/null 2>&1 || die "curl is needed"
if command -v sha256sum >/dev/null 2>&1; then
  SHA="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA="shasum -a 256"
else
  die "sha256sum or shasum is needed to check the download"
fi

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -z "$TOKEN" ] && command -v gh >/dev/null 2>&1; then
  TOKEN="$(gh auth token 2>/dev/null || true)"
fi

api() {
  if [ -n "$TOKEN" ]; then
    curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: ${2:-application/vnd.github+json}" "$1"
  else
    curl -fsSL -H "Accept: ${2:-application/vnd.github+json}" "$1"
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

if [ -n "$VERSION" ]; then
  RELEASE_URL="https://api.github.com/repos/$REPO/releases/tags/v$VERSION"
else
  RELEASE_URL="https://api.github.com/repos/$REPO/releases/latest"
fi
step "Finding ${VERSION:+release v$VERSION}${VERSION:-the latest release} of $REPO"
if ! api "$RELEASE_URL" >"$TMP/release.json" 2>/dev/null; then
  [ -n "$TOKEN" ] || die "could not read the release; while the repo is private, set GITHUB_TOKEN or run gh auth login"
  die "could not read the release ${VERSION:+v$VERSION }of $REPO"
fi
TAG="$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$TMP/release.json" | head -n 1)"

# An asset's api url comes just before its name in GitHub's answer.
asset_url() {
  awk -v want="$1" '
    /"url": *"https:\/\/api\.github\.com\/repos\/.*\/releases\/assets\// { match($0, /https:[^"]*/); url = substr($0, RSTART, RLENGTH) }
    $0 ~ "\"name\": *\"" want "\"" { print url; exit }
  ' "$TMP/release.json"
}
BIN_URL="$(asset_url "$ASSET")"
SUM_URL="$(asset_url checksums.txt)"
[ -n "$BIN_URL" ] || die "$TAG has no $ASSET"
[ -n "$SUM_URL" ] || die "$TAG has no checksums.txt"
ok "Found $TAG"

# The binary is big: on a terminal curl draws its progress bar while it comes in.
download() {
  if [ -t 2 ]; then SHOW="-#"; else SHOW="-s"; fi
  if [ -n "$TOKEN" ]; then
    curl -fSL "$SHOW" -H "Authorization: Bearer $TOKEN" -H "Accept: application/octet-stream" "$1"
  else
    curl -fSL "$SHOW" -H "Accept: application/octet-stream" "$1"
  fi
}
step "Downloading $ASSET"
download "$BIN_URL" >"$TMP/$ASSET" || die "the download failed"
api "$SUM_URL" application/octet-stream >"$TMP/checksums.txt" || die "could not read checksums.txt"
ok "Downloaded $(awk -v bytes="$(wc -c <"$TMP/$ASSET")" 'BEGIN { printf "%.1f MB", bytes / 1048576 }')"

EXPECTED="$(awk -v want="$ASSET" '{ name = $2; sub(/^\*/, "", name); if (name == want) print $1 }' "$TMP/checksums.txt")"
ACTUAL="$($SHA "$TMP/$ASSET" | awk '{ print $1 }')"
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || die "the download does not match its checksum; nothing was installed"
ok "The sha256 matches"

mkdir -p "$DIR"
chmod 755 "$TMP/$ASSET"
mv "$TMP/$ASSET" "$DIR/duck-diff"
ok "Installed ${B}$DIR/duck-diff${N} $D($TAG)$N"

case ":$PATH:" in
  *":$DIR:"*) ;;
  *) printf '%s!%s %s is not on your PATH. Add this to your shell'"'"'s rc file:\n    %sexport PATH="%s:$PATH"%s\n' "$Y" "$N" "$DIR" "$B" "$DIR" "$N" ;;
esac

say ""
say "  ${G}${B}quack.${N} cd into any git repo and run ${B}duck-diff${N}. ${D}duck-diff --help shows the rest.${N}"
say "  ${D}Neovim user too? The plugin keeps its own copy; the two never step on each other.${N}"
