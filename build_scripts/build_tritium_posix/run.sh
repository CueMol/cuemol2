#!/bin/sh
#
# Build script for tritium (Electron + React GUI app) on POSIX
# Usage: run.sh deplibs_dir [Debug|Release]
#

set -eux

BASEDIR=$1
CONFIG=${2:-Release}

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

BOOST_VER=boost_1_84_0
BOOST_DIR=$BASEDIR/$BOOST_VER
INST_PATH=$BASEDIR/cuemol2
TRITIUM_DIR=$WORKSPACE/tritium

export LIBCUEMOL2_ROOT=$INST_PATH
export Boost_ROOT=$BOOST_DIR

# Install dependencies without lifecycle scripts to avoid building core
# twice (core's "install" script runs cmake-js build in Release only).
cd $TRITIUM_DIR
pnpm install --ignore-scripts

# Ensure the electron binary is downloaded. `pnpm rebuild electron` is
# unreliable across pnpm versions / platforms (no-op on pnpm v10 + Windows),
# so invoke electron's install.js directly. electron is a react-gui dep.
cd $TRITIUM_DIR/react-gui
node "$(node -p "require.resolve('electron/install.js')")"

# Build core native addon with the correct config
cd $TRITIUM_DIR/core
npx cmake-js build \
    --CDLIBCUEMOL2_ROOT=$INST_PATH \
    --CDBoost_ROOT=$BOOST_DIR \
    --config $CONFIG

# Build react-gui with electron-vite
cd $TRITIUM_DIR/react-gui
pnpm run build
