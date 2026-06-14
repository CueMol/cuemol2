#!/usr/bin/env bash
# Pre-packaging staging script for electron-builder.
#
# Does two things:
#   (1) Collect cuemol2 runtime (dylibs + share tree) into
#       react-gui/packaging/cuemol2-runtime/ -- consumed by extraResources.
#   (2) Stage monorepo-linked deps (@cuemol/core, bindings, file-uri-to-path)
#       into react-gui/packaging/staging/ -- consumed by the files FileSet.
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

# Default to the per-checkout install prefix used by build_scripts/Taskfile.yml
# (OUTDIR/cuemol2 = <topdir>/.build_out/cuemol2) when LIBCUEMOL2_ROOT is unset,
# so packaging works after `task build_libcuemol2` without manual env setup.
if [ -z "${LIBCUEMOL2_ROOT:-}" ]; then
  LIBCUEMOL2_ROOT="$(cd "$REPO_ROOT/.." && pwd)/.build_out/cuemol2"
  echo "LIBCUEMOL2_ROOT not set; defaulting to $LIBCUEMOL2_ROOT"
fi

if [ ! -d "$LIBCUEMOL2_ROOT" ]; then
  echo "Error: LIBCUEMOL2_ROOT does not exist: $LIBCUEMOL2_ROOT" >&2
  echo "  Build libcuemol2 first (build_scripts: task build_libcuemol2)," >&2
  echo "  or set LIBCUEMOL2_ROOT=/path/to/cuemol2 explicitly." >&2
  exit 1
fi

# Validate the prefix really is a cuemol2 install (holds the runtime data tree).
if [ ! -f "$LIBCUEMOL2_ROOT/share/sysconfig.xml" ]; then
  echo "Error: $LIBCUEMOL2_ROOT/share/sysconfig.xml not found;" >&2
  echo "  LIBCUEMOL2_ROOT does not look like a cuemol2 install prefix." >&2
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
# Detect which config the core addon was built into. The Taskfile default on
# POSIX is Debug; Release is preferred for distribution. Override with
# CORE_CONFIG=Release|Debug. The staged file always lands in build/Release/
# (where the packaged bundle and the `bindings` lookup expect it).
CORE_CONFIG="${CORE_CONFIG:-}"
if [ -z "$CORE_CONFIG" ]; then
  if [ -f "$CORE_DIR/build/Release/cuemol_internal.node" ]; then
    CORE_CONFIG=Release
  elif [ -f "$CORE_DIR/build/Debug/cuemol_internal.node" ]; then
    CORE_CONFIG=Debug
  else
    echo "Error: cuemol_internal.node not found in $CORE_DIR/build/{Release,Debug}." >&2
    echo "  Build the core addon first (build_scripts: task build_tritium_core)." >&2
    exit 1
  fi
fi
NODE_SRC="$CORE_DIR/build/$CORE_CONFIG/cuemol_internal.node"
if [ ! -f "$NODE_SRC" ]; then
  echo "Error: $NODE_SRC not found (CORE_CONFIG=$CORE_CONFIG)." >&2
  exit 1
fi
if [ "$CORE_CONFIG" != "Release" ]; then
  echo "Warning: staging a $CORE_CONFIG core build; Release is recommended for distribution." >&2
fi
echo "  cuemol_internal.node: $NODE_SRC ($CORE_CONFIG)"
cp "$NODE_SRC" "$STAGING_DEST/@cuemol/core/build/Release/cuemol_internal.node"

# dylibs: copied by cmake post-build to core/build/lib/; stage them next to
# cuemol_internal.node so the @loader_path/../lib rpath resolves correctly
# in the packaged .app.
cp "$CORE_DIR/build/lib/"*.dylib "$STAGING_DEST/@cuemol/core/build/lib/"
echo "  dylibs staged: $(ls "$STAGING_DEST/@cuemol/core/build/lib/"*.dylib 2>/dev/null | wc -l | tr -d ' ') files"

# bindings + its sole dep file-uri-to-path. pnpm's layout varies (these may be
# hoisted into core/node_modules/ or kept nested under .pnpm/), so resolve the
# real package directories via Node instead of assuming a flat layout. Stage
# them flat (siblings) so Node's require resolution finds file-uri-to-path next
# to bindings at runtime.
RESOLVED="$(node -e '
const path = require("path");
const core = process.argv[1];
const bdir = path.dirname(require.resolve("bindings/package.json", { paths: [core] }));
const fdir = path.dirname(require.resolve("file-uri-to-path/package.json", { paths: [bdir] }));
console.log(bdir);
console.log(fdir);
' "$CORE_DIR" 2>/dev/null)" || {
  echo "Error: failed to resolve bindings / file-uri-to-path from $CORE_DIR" >&2
  exit 1
}
BINDINGS_DIR="$(printf '%s\n' "$RESOLVED" | sed -n 1p)"
FUP_DIR="$(printf '%s\n' "$RESOLVED" | sed -n 2p)"
if [ -z "$BINDINGS_DIR" ] || [ -z "$FUP_DIR" ]; then
  echo "Error: could not resolve bindings ($BINDINGS_DIR) / file-uri-to-path ($FUP_DIR)" >&2
  exit 1
fi
rm -rf "$STAGING_DEST/bindings" "$STAGING_DEST/file-uri-to-path"
cp -RL "$BINDINGS_DIR" "$STAGING_DEST/bindings"
cp -RL "$FUP_DIR" "$STAGING_DEST/file-uri-to-path"
echo "  bindings: $BINDINGS_DIR"
echo "  file-uri-to-path: $FUP_DIR"

echo "Staging done."
