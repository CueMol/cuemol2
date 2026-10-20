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
#
# Windows (Git Bash): cmake-js defaults to the Visual Studio generator with cl.
# For clang-cl (win_cc.sh) use Ninja instead, which needs no VS ClangCL
# toolset; CUEMOL_WIN_CC=cl keeps the cmake-js default.
CMAKEJS_WIN_OPT=""
if [ -n "${MSYSTEM:-}" ] && [ "${CUEMOL_WIN_CC:-clang-cl}" != "cl" ]; then
    . "$REPOS_DIR/build_scripts/win_cc.sh"
    CMAKEJS_WIN_OPT="--generator Ninja $(echo "$WIN_CC_COMPILER_OPT" | sed 's/-D/--CD/g')"
    # cmake-js skips configure when build/CMakeCache.txt exists, so a cache left
    # by the plain "cmake-js build" install hook (pnpm install) would keep the
    # Visual Studio generator. Drop such a cache.
    CORE_CACHE=$WORKSPACE/tritium/core/build/CMakeCache.txt
    if [ -f "$CORE_CACHE" ] && ! grep -q '^CMAKE_GENERATOR:INTERNAL=Ninja' "$CORE_CACHE"; then
        rm -rf "$WORKSPACE/tritium/core/build"
    fi
fi
cd $WORKSPACE/tritium/core
npx cmake-js build \
    $CMAKEJS_WIN_OPT \
    --CDLIBCUEMOL2_ROOT=$INST_PATH \
    --CDBoost_ROOT=$BOOST_DIR \
    --config $CONFIG

# Tests are run separately via test_tritium_core_posix/run.sh
