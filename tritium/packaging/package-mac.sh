#!/usr/bin/env bash
# Orchestrates a full macOS packaging run:
#   1. Stage cuemol2 runtime + monorepo deps into react-gui/packaging/
#   2. Run electron-vite build (needs the @cuemol/core symlink for TS resolution)
#   3. Temporarily remove react-gui/node_modules/@cuemol/core symlink so that
#      electron-builder does not follow it into files outside the app dir
#      (otherwise the asar walker picks up ../core/.clang-format etc. and
#      fails with "must be under react-gui/").
#   4. Run electron-builder
#   5. Always restore the symlink on exit (trap), so dev workflow is intact
#      even if packaging fails partway.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REACT_GUI="$REPO_ROOT/react-gui"
SYMLINK="$REACT_GUI/node_modules/@cuemol/core"

SAVED_TARGET=""

restore_symlink() {
  if [ -n "$SAVED_TARGET" ] && [ ! -e "$SYMLINK" ] && [ ! -L "$SYMLINK" ]; then
    ln -s "$SAVED_TARGET" "$SYMLINK"
    echo "package-mac: restored symlink $SYMLINK -> $SAVED_TARGET"
  fi
}
trap restore_symlink EXIT

# --- 1. stage runtime + monorepo deps ---------------------------------------
bash "$SCRIPT_DIR/collect-cuemol2-runtime.sh"

# --- 2. electron-vite build (needs the symlink for TS module resolution) ----
cd "$REACT_GUI"
pnpm exec electron-vite build

# --- 3. remove @cuemol/core symlink before electron-builder walks files -----
if [ -L "$SYMLINK" ]; then
  SAVED_TARGET="$(readlink "$SYMLINK")"
  rm "$SYMLINK"
  echo "package-mac: temporarily removed symlink $SYMLINK (target: $SAVED_TARGET)"
fi

# --- 4. electron-builder ----------------------------------------------------
pnpm exec electron-builder --mac --arm64

# --- 5. restore_symlink runs via EXIT trap ----------------------------------
echo "package-mac: done."
