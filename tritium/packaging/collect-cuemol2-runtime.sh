#!/usr/bin/env bash
# Pre-packaging staging script for electron-builder (macOS / Windows / Linux).
#
# (1) Collect the cuemol2 runtime data tree (share/) into
#     react-gui/packaging/cuemol2-runtime/  -- consumed by extraResources.
# (2) Stage the monorepo-linked runtime deps (@cuemol/core + its native addon,
#     the cuemol2/Boost shared libraries, bindings, file-uri-to-path) into
#     react-gui/packaging/staging/  -- consumed by the files FileSet. This is
#     needed because electron-builder will not pack files whose real path is
#     outside react-gui/.
#
# Per-OS native library layout (matches tritium/core/CMakeLists.txt):
#   macOS : *.dylib -> @cuemol/core/build/lib/      (found via @loader_path/../lib rpath)
#   Linux : *.so*   -> @cuemol/core/build/lib/      (found via $ORIGIN/../lib rpath)
#   Win   : *.dll   -> @cuemol/core/build/Release/  (next to the .node; no rpath)
#
# Runs under bash on all three platforms (Git Bash / MSYS on Windows).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DEST="$REPO_ROOT/react-gui/packaging/cuemol2-runtime"
STAGING_DEST="$REPO_ROOT/react-gui/packaging/staging"
CORE_DIR="$REPO_ROOT/core"

case "$(uname -s)" in
  Darwin) PLATFORM=mac ;;
  Linux) PLATFORM=linux ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=win ;;
  *) echo "Error: unsupported OS $(uname -s)" >&2; exit 1 ;;
esac
echo "Staging platform: $PLATFORM"

# Default to the per-checkout install prefix used by build_scripts/Taskfile.yml
# (OUTDIR/cuemol2 = <topdir>/.build_out/cuemol2) when LIBCUEMOL2_ROOT is unset.
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

# Guard: an embedded-Python libcuemol2 (built with ENABLE_PYTHON_EMBED=ON) installs
# a Python runtime under <prefix>/lib/python and the native addon depends on it at
# load time. This script does not stage that runtime, so packaging such a build
# yields an app that starts then immediately crashes (the worker fails to load
# libcuemol2). Detect via the install layout (cross-platform) and fail loudly.
# Rebuild libcuemol2 without ENABLE_PYTHON_EMBED, or implement Python staging
# (ADR-0030 task 1-3).
if [ -d "$LIBCUEMOL2_ROOT/lib/python" ]; then
  echo "Error: libcuemol2 looks like an embedded-Python build" >&2
  echo "  ($LIBCUEMOL2_ROOT/lib/python exists), but the Python runtime is not" >&2
  echo "  staged into the bundle, so the packaged app would start and crash." >&2
  echo "  Rebuild libcuemol2 without ENABLE_PYTHON_EMBED, or implement Python" >&2
  echo "  staging (ADR-0030 task 1-3)." >&2
  exit 1
fi

# --- (1) cuemol2 runtime (share/ only) ---------------------------------------
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

# Detect which config the core addon was built into. The POSIX Taskfile default
# is Debug; Windows/CI build Release. Override with CORE_CONFIG=Release|Debug.
# The staged .node always lands in build/Release/ (where the packaged bundle and
# the `bindings` lookup expect it).
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

# Native shared libraries, staged per-OS (see header). cmake post-build placed
# them in build/lib/ (mac/linux) or next to the .node in build/<config>/ (win).
case "$PLATFORM" in
  mac)
    cp "$CORE_DIR/build/lib/"*.dylib "$STAGING_DEST/@cuemol/core/build/lib/"
    echo "  dylibs staged: $(ls "$STAGING_DEST/@cuemol/core/build/lib/"*.dylib 2>/dev/null | wc -l | tr -d ' ') files"
    ;;
  linux)
    cp -P "$CORE_DIR/build/lib/"*.so* "$STAGING_DEST/@cuemol/core/build/lib/"
    echo "  shared libs staged: $(ls "$STAGING_DEST/@cuemol/core/build/lib/" 2>/dev/null | wc -l | tr -d ' ') entries"
    ;;
  win)
    cp "$CORE_DIR/build/$CORE_CONFIG/"*.dll "$STAGING_DEST/@cuemol/core/build/Release/"
    echo "  DLLs staged: $(ls "$STAGING_DEST/@cuemol/core/build/Release/"*.dll 2>/dev/null | wc -l | tr -d ' ') files"
    ;;
esac

# bindings + its sole dep file-uri-to-path. pnpm's layout varies (these may be
# hoisted into core/node_modules/ or kept nested under .pnpm/), so resolve the
# real package directories via Node instead of assuming a flat layout. Stage them
# flat (siblings) so Node's require resolution finds file-uri-to-path next to
# bindings at runtime. On Windows, hand Node a native path (it does not
# understand MSYS /c/... paths).
CORE_DIR_NATIVE="$CORE_DIR"
if [ "$PLATFORM" = "win" ]; then
  CORE_DIR_NATIVE="$(cygpath -w "$CORE_DIR" 2>/dev/null || echo "$CORE_DIR")"
fi
RESOLVED="$(node -e '
const path = require("path");
const core = process.argv[1];
const bdir = path.dirname(require.resolve("bindings/package.json", { paths: [core] }));
const fdir = path.dirname(require.resolve("file-uri-to-path/package.json", { paths: [bdir] }));
console.log(bdir);
console.log(fdir);
' "$CORE_DIR_NATIVE" 2>/dev/null)" || {
  echo "Error: failed to resolve bindings / file-uri-to-path from $CORE_DIR_NATIVE" >&2
  exit 1
}
BINDINGS_DIR="$(printf '%s\n' "$RESOLVED" | sed -n 1p)"
FUP_DIR="$(printf '%s\n' "$RESOLVED" | sed -n 2p)"
# Node may print Windows paths (C:\...); convert back to MSYS for cp on Windows.
if [ "$PLATFORM" = "win" ]; then
  BINDINGS_DIR="$(cygpath -u "$BINDINGS_DIR" 2>/dev/null || echo "$BINDINGS_DIR")"
  FUP_DIR="$(cygpath -u "$FUP_DIR" 2>/dev/null || echo "$FUP_DIR")"
fi
if [ -z "$BINDINGS_DIR" ] || [ -z "$FUP_DIR" ]; then
  echo "Error: could not resolve bindings ($BINDINGS_DIR) / file-uri-to-path ($FUP_DIR)" >&2
  exit 1
fi
rm -rf "$STAGING_DEST/bindings" "$STAGING_DEST/file-uri-to-path"
cp -RL "$BINDINGS_DIR" "$STAGING_DEST/bindings"
cp -RL "$FUP_DIR" "$STAGING_DEST/file-uri-to-path"
echo "  bindings: $BINDINGS_DIR"
echo "  file-uri-to-path: $FUP_DIR"

# Assert the staged tree holds everything the runtime require graph + C++ core
# need, so an incomplete stage fails here (before the slow electron-builder step)
# rather than at app launch on a user's machine.
assert_file() {
  [ -f "$1" ] || { echo "Error: staging assertion failed -- missing $1" >&2; exit 1; }
}
assert_file "$RUNTIME_DEST/share/sysconfig.xml"
assert_file "$STAGING_DEST/@cuemol/core/package.json"
assert_file "$STAGING_DEST/@cuemol/core/src/index.cjs"
assert_file "$STAGING_DEST/@cuemol/core/build/Release/cuemol_internal.node"
assert_file "$STAGING_DEST/bindings/package.json"
assert_file "$STAGING_DEST/file-uri-to-path/package.json"
case "$PLATFORM" in
  mac)
    assert_file "$STAGING_DEST/@cuemol/core/build/lib/libcuemol2.dylib"
    ;;
  linux)
    ls "$STAGING_DEST/@cuemol/core/build/lib/"libcuemol2.so* >/dev/null 2>&1 \
      || { echo "Error: staging assertion failed -- libcuemol2.so* missing" >&2; exit 1; }
    ;;
  win)
    assert_file "$STAGING_DEST/@cuemol/core/build/Release/cuemol2.dll"
    ;;
esac

echo "Staging done."
