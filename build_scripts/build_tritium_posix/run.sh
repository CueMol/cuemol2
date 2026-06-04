#!/bin/sh
#
# Build script for tritium (Electron + React GUI app) on POSIX
# Usage: run.sh deplibs_dir [Debug|Release]
#

set -eux

BASEDIR=$1
CONFIG=${2:-Release}
# deps root (BASEDIR) is shared; build/install root (OUTDIR) can be per-checkout.
# OUT_DIR unset falls back to BASEDIR, preserving the original/CI behavior.
OUTDIR="${OUT_DIR:-$BASEDIR}"

SCRIPT_DIR=$(cd $(dirname $0); pwd)
REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

BOOST_VER=boost_1_84_0
BOOST_DIR=$BASEDIR/$BOOST_VER
INST_PATH=$OUTDIR/cuemol2
TRITIUM_DIR=$WORKSPACE/tritium

export LIBCUEMOL2_ROOT=$INST_PATH
export Boost_ROOT=$BOOST_DIR

# Install workspace deps and build the core native addon. Shared with CI via the
# single core-build script, so the cmake-js invocation is not duplicated here.
OUT_DIR="$OUTDIR" bash "$SCRIPT_DIR/../build_tritium_core_posix/run.sh" "$BASEDIR" "$CONFIG"

# Ensure the electron binary is downloaded. `pnpm rebuild electron` is
# unreliable across pnpm versions / platforms (no-op on pnpm v10 + Windows),
# so invoke electron's install.js directly. electron is a react-gui dep.
cd $TRITIUM_DIR/react-gui
node "$(node -p "require.resolve('electron/install.js')")"

# Build react-gui with electron-vite
cd $TRITIUM_DIR/react-gui
pnpm run build
