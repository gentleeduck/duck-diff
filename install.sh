#!/bin/sh
# duck-diff installer.
#
#   curl -fsSL https://raw.githubusercontent.com/gentleeduck/duck-diff/main/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --version 0.7.2 --dir ~/bin
#   curl -fsSL .../install.sh | sh -s -- --uninstall
#
# Downloads the release binary for this machine, checks its sha256 against the release's checksums.txt,
# and puts it in ~/.local/bin (or --dir). A GITHUB_TOKEN, GH_TOKEN or gh login is used when there is one.
set -eu

REPO="${DUCK_DIFF_REPO:-gentleeduck/duck-diff}"
API="${DUCK_DIFF_API:-https://api.github.com}"
DIR="${DUCK_DIFF_DIR:-$HOME/.local/bin}"
VERSION="${DUCK_DIFF_VERSION:-}"
UNINSTALL=0

# Drawn as duck-diff update draws (apps/server/src/cli-ui.ts): the name over a green rule, then a line per step.
# On a terminal a running step spins, a download draws its bar on a line of its own, and both give way to the
# result; piped, only results print.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != dumb ]; then
  LIVE=1
  WHITE="$(printf '\033[37m')" RULE="$(printf '\033[1;32m')" GREEN="$(printf '\033[32m')" RED="$(printf '\033[31m')"
  CYAN="$(printf '\033[36m')" YELLOW="$(printf '\033[33m')" DIM="$(printf '\033[2m')" BOLD="$(printf '\033[1m')"
  N="$(printf '\033[0m')"
else
  LIVE=0 WHITE="" RULE="" GREEN="" RED="" CYAN="" YELLOW="" DIM="" BOLD="" N=""
fi
CLEAR="$(printf '\r\033[2K')"
UP="$(printf '\033[1A')"
STEP="" LINES=0

say() { printf '%s\n' "$*"; }
header() { printf '\n%s %s%s\n%s%s%s\n\n' "$WHITE" "🦆 @gentleduck/diff installer" "$N" "$RULE" "──────────────────────────────" "$N"; }
# Takes a running step's lines off the screen, so its result or the next draw takes their place.
clear_step() {
  [ "$LIVE" = 1 ] || return 0
  if [ "$LINES" = 2 ]; then printf '%s%s%s' "$CLEAR" "$UP" "$CLEAR"; elif [ "$LINES" = 1 ]; then printf '%s' "$CLEAR"; fi
  LINES=0
}
step() {
  STEP="$*"
  [ "$LIVE" = 1 ] || return 0
  clear_step
  printf '%s⠋%s %s' "$CYAN" "$N" "$STEP"
  LINES=1
}
ok() {
  clear_step
  printf '%s✔%s %s\n' "$GREEN" "$N" "$*"
}
note() { printf '  %s%s%s\n' "$DIM" "$*" "$N"; }
die() {
  clear_step
  printf '%s✖%s %s\n' "$RED" "$N" "$*" >&2
  exit 1
}

# 512 B, 1.5 KB, 93.0 MB: sizes as duck-diff prints them.
size() {
  awk -v bytes="$1" 'BEGIN {
    if (bytes < 1024) { printf "%d B", bytes; exit }
    split("KB MB GB", units, " "); value = bytes; unit = 0
    while (value >= 1024 && unit < 3) { value /= 1024; unit++ }
    printf "%.1f %s", value, units[unit]
  }'
}

# The bar line under a download: bar, share, sizes, speed and time left, fitted to the terminal's width.
bar_line() {
  awk -v done_="$1" -v total="$2" -v elapsed="$3" -v cols="$4" '
    function fmt(bytes,   value, unit) {
      if (bytes < 1024) return sprintf("%d B", bytes)
      split("KB MB GB", units, " "); value = bytes; unit = 0
      while (value >= 1024 && unit < 3) { value /= 1024; unit++ }
      return sprintf("%.1f %s", value, units[unit])
    }
    BEGIN {
      rate = done_ / (elapsed < 1 ? 1 : elapsed)
      speed = fmt(int(rate + 0.5)) "/s"
      if (total <= 0) { printf "%s  %s", fmt(done_), speed; exit }
      fraction = done_ / total; if (fraction > 1) fraction = 1
      line = sprintf("%3d%%  %s / %s  %s", int(fraction * 100), fmt(done_), fmt(total), speed)
      if (rate > 0) {
        left = int((total - done_) / rate + 0.999)
        line = line "  " (left < 60 ? left "s left" : sprintf("%dm %02ds left", int(left / 60), left % 60))
      }
      width = cols - 2 - 48; if (width > 28) width = 28
      if (width < 6) { sub(/^ +/, "", line); printf "%s", line; exit }
      filled = int(fraction * width + 0.5); bar = ""
      for (i = 0; i < width; i++) bar = bar (i < filled ? "█" : "░")
      printf "%s %s", bar, line
    }'
}

SPINNER="⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏"
frame() {
  index=$(($1 % 10 + 1))
  # shellcheck disable=SC2086
  set -- $SPINNER
  eval "printf '%s' \"\${$index}\""
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
  # git stops opening duck-diff before the binary it would run goes.
  [ -x "$DIR/duck-diff" ] && "$DIR/duck-diff" git-setup --off --quiet 2>/dev/null || true
  rm -f "$DIR/duck-diff"
  ok "Removed $DIR/duck-diff"
  say ""
  note "Your settings and comments are still in \${DUCK_DIFF_HOME:-~/.duck-diff}; delete that folder to forget everything."
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
trap 'rm -rf "$TMP" ${NEXT:+"$NEXT"}' EXIT INT TERM

if [ -n "$VERSION" ]; then
  step "Finding release $VERSION"
  RELEASE_URL="$API/repos/$REPO/releases/tags/v$VERSION"
else
  step "Finding the latest release"
  RELEASE_URL="$API/repos/$REPO/releases/latest"
fi
if ! api "$RELEASE_URL" >"$TMP/release.json" 2>/dev/null; then
  [ -n "$TOKEN" ] || die "could not read the release of $REPO; GitHub may be limiting requests, so set GITHUB_TOKEN or run gh auth login"
  die "could not read the release ${VERSION:+v$VERSION }of $REPO"
fi
TAG="$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$TMP/release.json" | head -n 1)"

# An asset's api url comes just before its name in GitHub's answer, and its size after.
asset_url() {
  awk -v want="$1" '
    /"url": *"[^"]*\/releases\/assets\// { match($0, /https?:[^"]*/); url = substr($0, RSTART, RLENGTH) }
    $0 ~ "\"name\": *\"" want "\"" { print url; exit }
  ' "$TMP/release.json"
}
asset_size() {
  awk -v want="$1" '
    $0 ~ "\"name\": *\"" want "\"" { found = 1 }
    found && /"size": *[0-9]+/ { match($0, /[0-9]+/); print substr($0, RSTART, RLENGTH); exit }
  ' "$TMP/release.json"
}
BIN_URL="$(asset_url "$ASSET")"
SUM_URL="$(asset_url checksums.txt)"
[ -n "$BIN_URL" ] || die "$TAG has no $ASSET"
[ -n "$SUM_URL" ] || die "$TAG has no checksums.txt"
HAVE=""
if [ -x "$DIR/duck-diff" ]; then HAVE="$("$DIR/duck-diff" --version 2>/dev/null || true)"; fi
ok "Found ${TAG#v}${HAVE:+ (you have $HAVE)}"

fetch() {
  if [ -n "$TOKEN" ]; then
    curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/octet-stream" "$1"
  else
    curl -fsSL -H "Accept: application/octet-stream" "$1"
  fi
}

step "Downloading $ASSET"
if [ "$LIVE" = 1 ]; then
  # curl stays quiet; the file growing on disk is the progress, drawn as duck-diff update draws it.
  TOTAL="$(asset_size "$ASSET")"
  fetch "$BIN_URL" >"$TMP/$ASSET" &
  PID=$!
  START="$(date +%s)" FRAME=0
  while kill -0 "$PID" 2>/dev/null; do
    COLS="$(tput cols 2>/dev/null || echo 80)"
    GOT="$(wc -c <"$TMP/$ASSET" | tr -d ' ')"
    BAR="$(bar_line "$GOT" "${TOTAL:-0}" "$(($(date +%s) - START))" "$COLS")"
    clear_step
    printf '%s%s%s %s\n%s  %s%s%s' "$CYAN" "$(frame "$FRAME")" "$N" "$STEP" "$CLEAR" "$DIM" "$BAR" "$N"
    LINES=2 FRAME=$((FRAME + 1))
    sleep 0.1 2>/dev/null || sleep 1
  done
  wait "$PID" || die "the download failed"
else
  fetch "$BIN_URL" >"$TMP/$ASSET" || die "the download failed"
fi
api "$SUM_URL" application/octet-stream >"$TMP/checksums.txt" || die "could not read checksums.txt"
ok "Downloaded $(size "$(wc -c <"$TMP/$ASSET" | tr -d ' ')")"

step "Checking the sha256"
EXPECTED="$(awk -v want="$ASSET" '{ name = $2; sub(/^\*/, "", name); if (name == want) print $1 }' "$TMP/checksums.txt")"
ACTUAL="$($SHA "$TMP/$ASSET" | awk '{ print $1 }')"
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || die "the download does not match its checksum; nothing was installed"
ok "The sha256 matches"

step "Installing $DIR/duck-diff"
mkdir -p "$DIR"
# A new file beside the old one, then a rename over it: macOS remembers a binary's signature by its file, and kills
# one rewritten in place (as a move from another disk would).
NEXT="$DIR/.duck-diff.$$"
cp "$TMP/$ASSET" "$NEXT" || die "could not write to $DIR"
chmod 755 "$NEXT"
if [ "$OS" = darwin ]; then
  # Apple Silicon kills code whose signature does not check out, and a download may carry the quarantine flag.
  xattr -d com.apple.quarantine "$NEXT" 2>/dev/null || true
  if ! codesign --verify --strict "$NEXT" 2>/dev/null; then
    codesign --force --sign - "$NEXT" >/dev/null 2>&1 || die "could not sign the binary for macOS"
  fi
fi
mv -f "$NEXT" "$DIR/duck-diff"
ok "Installed $DIR/duck-diff"

# git mergetool, git difftool and git rebase -i open duck-diff, unless another tool is already chosen for them.
step "Setting duck-diff up as git's merge tool, diff tool and rebase editor"
if "$DIR/duck-diff" git-setup --quiet; then
  ok "git mergetool, git difftool and git rebase -i open duck-diff (duck-diff git-setup --off undoes it)"
else
  note "Could not set git up; run duck-diff git-setup later."
fi

case ":$PATH:" in
  *":$DIR:"*) ;;
  *) printf '%s!%s %s is not on your PATH. Add this to your shell'"'"'s rc file:\n    %sexport PATH="%s:$PATH"%s\n' "$YELLOW" "$N" "$DIR" "$BOLD" "$DIR" "$N" ;;
esac

say ""
note "Installed ${TAG#v}. cd into any git repo and run duck-diff; duck-diff --help shows the rest."
note "Neovim user too? The plugin keeps its own copy; the two never step on each other."
