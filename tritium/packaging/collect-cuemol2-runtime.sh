#!/usr/bin/env bash
# Pre-packaging staging script for electron-builder.
#
# Does two things:
#   (1) Collect cuemol2 runtime (dylibs + share tree) into
#       react-gui/packaging/cuemol2-runtime/ — consumed by extraResources.
#   (2) Stage monorepo-linked deps (@cuemol/core, bindings, file-uri-to-path)
#       into react-gui/packaging/staging/ — consumed by the files FileSet.
#       This is required because electron-builder refuses to unpack files
#       whose source path is outside the app directory (react-gui/).
#
# Requires LIBCUEMOL2_ROOT to be set to the cuemol2 install prefix.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DEST="$REPO_ROOT/react-gui/packaging/cuemol2-runtime"
STAGING_DEST="$REPO_ROOT/react-gui/packaging/staging"
CORE_DIR="$REPO_ROOT/core"

if [ -z "${LIBCUEMOL2_ROOT:-}" ]; then
  echo "Error: LIBCUEMOL2_ROOT environment variable is not set." >&2
  echo "  export LIBCUEMOL2_ROOT=/path/to/cuemol2" >&2
  exit 1
fi

if [ ! -d "$LIBCUEMOL2_ROOT" ]; then
  echo "Error: LIBCUEMOL2_ROOT does not exist: $LIBCUEMOL2_ROOT" >&2
  exit 1
fi

# --- (1) cuemol2 runtime (share/ only) ---------------------------------------
# dylibs are no longer bundled here; they live next to cuemol_internal.node
# at build/lib/ (set by cmake post-build) and are staged into
# staging/@cuemol/core/build/lib/ below.
echo "Collecting cuemol2 runtime (share/ only)"
echo "  from: $LIBCUEMOL2_ROOT"
echo "  to:   $RUNTIME_DEST"

rm -rf "$RUNTIME_DEST"
mkdir -p "$RUNTIME_DEST/share"

cp -r "$LIBCUEMOL2_ROOT/share/." "$RUNTIME_DEST/share/"

echo "  share/: $(find "$RUNTIME_DEST/share" -type f | wc -l | tr -d ' ') files"

# --- (2) monorepo deps staging ----------------------------------------------
echo "Staging monorepo deps"
echo "  to: $STAGING_DEST"

rm -rf "$STAGING_DEST"
mkdir -p "$STAGING_DEST/@cuemol/core/src"
mkdir -p "$STAGING_DEST/@cuemol/core/build/Release"
mkdir -p "$STAGING_DEST/@cuemol/core/build/lib"

# @cuemol/core: only the files needed at runtime by the CJS entry.
cp "$CORE_DIR/package.json" "$STAGING_DEST/@cuemol/core/package.json"
cp "$CORE_DIR/src/index.cjs" "$STAGING_DEST/@cuemol/core/src/index.cjs"
cp "$CORE_DIR/build/Release/cuemol_internal.node" \
   "$STAGING_DEST/@cuemol/core/build/Release/cuemol_internal.node"

# dylibs: copied by cmake post-build to core/build/lib/; stage them next to
# cuemol_internal.node so the @loader_path/../lib rpath resolves correctly
# in the packaged .app.
cp "$CORE_DIR/build/lib/"*.dylib "$STAGING_DEST/@cuemol/core/build/lib/"
echo "  dylibs staged: $(ls "$STAGING_DEST/@cuemol/core/build/lib/"*.dylib 2>/dev/null | wc -l | tr -d ' ') files"

# bindings + its sole dep file-uri-to-path (both live under core/node_modules/)
cp -r "$CORE_DIR/node_modules/bindings" "$STAGING_DEST/bindings"
cp -r "$CORE_DIR/node_modules/file-uri-to-path" "$STAGING_DEST/file-uri-to-path"

echo "Staging done."
