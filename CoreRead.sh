#!/bin/bash
# ============================================================
#  CoreRead - Linux launcher
#  Opens CoreRead.html in a chromeless Chromium-family window
#  so it behaves like a native app.
#
#  If it won't run:  chmod +x CoreRead.sh
# ============================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML="$DIR/CoreRead.html"

if [ ! -f "$HTML" ]; then
  echo "CoreRead.html was not found next to this launcher." >&2
  echo "Keep both files in the same folder." >&2
  exit 1
fi

# percent-encode spaces for the file:// URL
URL="file://$(printf '%s' "$HTML" | sed 's/ /%20/g')"

BROWSERS=(
  google-chrome-stable
  google-chrome
  chromium-browser
  chromium
  microsoft-edge-stable
  microsoft-edge
  brave-browser
  vivaldi-stable
)

for B in "${BROWSERS[@]}"; do
  if command -v "$B" >/dev/null 2>&1; then
    nohup "$B" --app="$URL" --window-size=1360,900 >/dev/null 2>&1 &
    exit 0
  fi
done

# Flatpak fallbacks
if command -v flatpak >/dev/null 2>&1; then
  for ID in com.google.Chrome org.chromium.Chromium com.brave.Browser com.microsoft.Edge; do
    if flatpak info "$ID" >/dev/null 2>&1; then
      nohup flatpak run "$ID" --app="$URL" --window-size=1360,900 >/dev/null 2>&1 &
      exit 0
    fi
  done
fi

echo "No Chromium-based browser found - opening in your default browser." >&2
echo "App-mode window requires Chrome, Chromium, Edge, Brave or Vivaldi." >&2
xdg-open "$HTML" >/dev/null 2>&1
