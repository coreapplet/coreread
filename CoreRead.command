#!/bin/bash
# ============================================================
#  CoreRead - macOS launcher
#  Opens CoreRead.html in a chromeless Chrome/Edge/Brave window
#  so it behaves like a native app (own Dock icon, no tabs).
#
#  First run: right-click this file -> Open (Gatekeeper asks once).
#  If it won't run:  chmod +x "CoreRead.command"
# ============================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML="$DIR/CoreRead.html"

if [ ! -f "$HTML" ]; then
  osascript -e 'display alert "CoreRead" message "CoreRead.html was not found next to this launcher.\n\nKeep both files in the same folder."' >/dev/null 2>&1
  exit 1
fi

# percent-encode spaces for the file:// URL
URL="file://$(printf '%s' "$HTML" | sed 's/ /%20/g')"

APPS=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)

for APP in "${APPS[@]}"; do
  if [ -x "$APP" ]; then
    "$APP" --app="$URL" --window-size=1360,900 >/dev/null 2>&1 &
    exit 0
  fi
done

# No Chromium browser found - fall back to the default handler.
# Safari has no app mode, so this opens a normal window.
open "$HTML"
