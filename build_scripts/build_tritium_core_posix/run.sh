#!/bin/sh
#
# build script for tritium/core addon in posix
# usage: run.sh deplibs_dir [Debug|Release]
#

set -eux

BASEDIR=$1
CONFIG=${2:-Release}
# deps root (BASEDIR) is shared; build/install root (OUTDIR) can be per-checkout.
# OUT_DIR unset falls back to BASEDIR, preserving the original/CI behavior.
OUTDIR="${OUT_DIR:-$BASEDIR}"

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

# Dependency versions are defined in build_scripts/deplibs.env
. "$(cd "$(dirname "$0")/.."; pwd)/deplibs.env"
BOOST_DIR=$BASEDIR/boost_$BOOST_VER

# Install location
INST_PATH=$OUTDIR/cuemol2

node --version
pnpm --version

# Install workspace deps without lifecycle scripts (core's "install" hook runs
# cmake-js build in Release only; we run it explicitly below with the config).
cd $WORKSPACE/tritium
pnpm install --ignore-scripts

# Build the core native addon. Boost runtime libs are already copied into the
# install lib dir by build_libcuemol2_posix/run.sh, so no copy is needed here.
cd $WORKSPACE/tritium/core
npx cmake-js build \
    --CDLIBCUEMOL2_ROOT=$INST_PATH \
    --CDBoost_ROOT=$BOOST_DIR \
    --config $CONFIG

# Tests are run separately via test_tritium_core_posix/run.sh
