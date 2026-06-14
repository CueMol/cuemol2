#!/usr/bin/env bash
# Cross-platform packaging orchestration for the tritium app. Pass the
# electron-builder platform/arch flags as arguments, for example:
#   package.sh --mac --arm64
#   package.sh --win --x64
#   package.sh --linux --x64
#
# Steps: stage runtime + monorepo deps -> electron-vite build -> electron-builder,
# injecting the bundle version from the master QM_VERSION (src/_version.h).
#
# @cuemol/core is a devDependency of react-gui, so electron-builder does not walk
# the workspace symlink -- no symlink manipulation is needed.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $(basename "$0") <electron-builder platform flags>  (e.g. --mac --arm64)" >&2
  exit 1
fi

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
# src/_version.h, maintained by bump-my-version). electron-builder requires valid
# semver, so map the 4-part QM_VERSION (major.minor.patch.build) to a 3-part
# version + a separate buildVersion (-> CFBundleVersion / FileVersion).
VERSION_FILE="$REPO_ROOT/../src/_version.h"
QM_VERSION="$(grep '#define QM_VERSION' "$VERSION_FILE" | sed 's/.*"\(.*\)".*/\1/')"
SEMVER="$(printf '%s' "$QM_VERSION" | cut -d. -f1-3)"
BUILD_NO="$(printf '%s' "$QM_VERSION" | cut -d. -f4)"
echo "package: QM_VERSION=$QM_VERSION -> version=$SEMVER buildVersion=${BUILD_NO:-<none>}"

EB_ARGS=("$@" --config.extraMetadata.version="$SEMVER")
if [ -n "$BUILD_NO" ]; then
  EB_ARGS+=(--config.buildVersion="$BUILD_NO")
fi
pnpm exec electron-builder "${EB_ARGS[@]}"

echo "package: done ($*)."
