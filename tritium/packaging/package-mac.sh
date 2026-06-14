#!/usr/bin/env bash
# Orchestrates a full macOS packaging run:
#   1. Stage cuemol2 runtime + monorepo deps into react-gui/packaging/
#   2. Run electron-vite build
#   3. Run electron-builder, injecting the version from the master QM_VERSION
#
# @cuemol/core is a *devDependency* of react-gui (workspace:*), so electron-builder
# does not walk it as a production dependency -- the fragile remove-symlink-then-
# restore-via-trap dance is no longer needed. The minimal runtime copy of
# @cuemol/core (+ bindings, file-uri-to-path, dylibs) is staged into
# packaging/staging/ and mapped to node_modules/ via the files FileSet in
# electron-builder.yml.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REACT_GUI="$REPO_ROOT/react-gui"

# --- 1. stage runtime + monorepo deps ---------------------------------------
bash "$SCRIPT_DIR/collect-cuemol2-runtime.sh"

# --- 2. electron-vite build -------------------------------------------------
cd "$REACT_GUI"
pnpm exec electron-vite build

# --- 3. electron-builder ----------------------------------------------------
# Derive the bundle version from the master QM_VERSION (single source of truth:
# src/_version.h, maintained by bump-my-version). electron-builder requires
# valid semver, so map the 4-part QM_VERSION (major.minor.patch.build) to a
# 3-part version + a separate buildVersion (-> CFBundleVersion).
VERSION_FILE="$REPO_ROOT/../src/_version.h"
QM_VERSION="$(grep '#define QM_VERSION' "$VERSION_FILE" | sed 's/.*"\(.*\)".*/\1/')"
SEMVER="$(printf '%s' "$QM_VERSION" | cut -d. -f1-3)"
BUILD_NO="$(printf '%s' "$QM_VERSION" | cut -d. -f4)"
echo "package-mac: QM_VERSION=$QM_VERSION -> version=$SEMVER buildVersion=${BUILD_NO:-<none>}"

EB_ARGS=(--mac --arm64 --config.extraMetadata.version="$SEMVER")
if [ -n "$BUILD_NO" ]; then
  EB_ARGS+=(--config.buildVersion="$BUILD_NO")
fi
pnpm exec electron-builder "${EB_ARGS[@]}"

echo "package-mac: done."
