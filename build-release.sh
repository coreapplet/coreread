#!/bin/bash
# ============================================================
#  CoreRead - release builder
#  Produces one zip per platform in dist/, each containing only
#  the app, that platform's launcher, the README and the LICENSE.
#
#  Usage:  ./build-release.sh 1.0.0
# ============================================================

set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: ./build-release.sh <version>    e.g. ./build-release.sh 1.0.0" >&2
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -f "CoreRead.html" ]; then
  echo "CoreRead.html not found. Run this from the repo root." >&2
  exit 1
fi

# keep the in-app version stamp in sync with the release tag
if grep -q "CoreRead v[0-9]" CoreRead.html; then
  sed -i.bak -E "s/CoreRead v[0-9]+\.[0-9]+\.[0-9]+/CoreRead v${VERSION}/" CoreRead.html
  rm -f CoreRead.html.bak
  echo "version stamp -> v${VERSION}"
fi

rm -rf dist
mkdir -p dist

export REPO="https://github.com/coreapplet/coreread"

# The README ships inside every zip, and people open it in CoreRead itself.
# Two things there only work on the GitHub page:
#   - the screenshots, which aren't bundled and would render as broken images
#   - ../../ links, a GitHub-only convention that resolves to nothing offline
# Both are rewritten on the way into the zip. The repo copy is left alone.
stage_readme() {
  perl -0777 -pe '
    s!<div align="center">\s*<img src="\.github/[^>]*>\s*</div>\n\n?!!g;
    s!^<img src="\.github/[^>]*>\n\n?!!gm;
    s!\]\(\.\./\.\./!]($ENV{REPO}/!g;
  ' README.md > "$1/README.md"
}

build() {
  local platform="$1" launcher="$2"
  local stage="dist/.stage/coreread"

  rm -rf dist/.stage
  mkdir -p "$stage"

  cp CoreRead.html "$launcher" LICENSE "$stage/"
  stage_readme "$stage"
  chmod +x "$stage/$launcher" 2>/dev/null || true

  ( cd dist/.stage && zip -qr "../coreread-${platform}.zip" coreread )
  rm -rf dist/.stage

  printf "  %-22s %s\n" "coreread-${platform}.zip" "$(du -h "dist/coreread-${platform}.zip" | cut -f1)"
}

echo "building v${VERSION}..."
build windows CoreRead.vbs
build macos   CoreRead.command
build linux   CoreRead.sh

# the raw app, for people who don't want a launcher at all
cp CoreRead.html dist/CoreRead.html
printf "  %-22s %s\n" "CoreRead.html" "$(du -h dist/CoreRead.html | cut -f1)"

echo
echo "done -> dist/"
