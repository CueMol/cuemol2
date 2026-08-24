#!/bin/bash
#
# Build libMeshMS (the analytic SES molecular-surface backend) from source and
# install it into the deplibs prefix, so libcuemol2 can consume it via
# find_package(MeshMS). Reused by the local `install_meshms` task and by the CI
# build workflows, which build every release artifact with ENABLE_MESHMS=ON.
#
# usage: run.sh <deplibs_dir> <meshms_src_dir>
#

# The oneTBB version (TBB_VER) is defined in deplibs.env; MeshMS resolves
# find_package(TBB) to the same bundled static oneTBB the rest of libcuemol2
# uses, so the process holds exactly one oneTBB runtime.
. "$(cd "$(dirname "$0")/.."; pwd)/deplibs.env"

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
    echo "usage: run.sh <deplibs_dir> <meshms_src_dir>"
    exit 1
fi

set -eux

BASEDIR=$1
MESHMS_SRC=$2

# Match the dynamic CRT (/MD) of the bundled static TBB on MSVC, and
# normalize Windows paths under Git Bash. Mirrors build_umbreon_posix/run.sh.
MSVC_OPT=""
if [[ -n "${MSYSTEM:-}" || "$OSTYPE" == msys* ]]; then
    BASEDIR=$(cygpath -u "$BASEDIR")
    MESHMS_SRC=$(cygpath -u "$MESHMS_SRC")
    # Force MSVC even when a Strawberry Perl g++ sits ahead of cl on PATH (the
    # Ninja generator would otherwise auto-pick g++, whose objects could not
    # link the MSVC /MD deplibs). Requires an MSVC dev environment (cl on PATH).
    MSVC_OPT="-DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL"
fi

# Build out-of-source under the deplibs prefix so the MeshMS working copy (the
# local co-dev checkout) is never dirtied.
BUILD_DIR=$BASEDIR/tmp/meshms_build

# Always start from a clean build dir: a stale CMakeCache can pin the wrong
# toolchain across runs (see build_umbreon_posix/run.sh for the full story);
# the MeshMS build is short enough that always rebuilding is cheaper than
# debugging a poisoned cache.
rm -rf "$BUILD_DIR"

# PIC is mandatory: the static libMeshMS.a is linked into the libcuemol2
# SHARED library. MESHMS_BUILD_{TESTS,CLI,TOOLS} default to ON in a top-level
# MeshMS build; turn them off so only the library target is configured.
cmake -G Ninja -S "$MESHMS_SRC" -B "$BUILD_DIR" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DCMAKE_PREFIX_PATH="$BASEDIR" \
      -DTBB_DIR="$BASEDIR/tbb-$TBB_VER/lib/cmake/TBB" \
      -DMESHMS_BUILD_TESTS=OFF \
      -DMESHMS_BUILD_CLI=OFF \
      -DMESHMS_BUILD_TOOLS=OFF \
      -DCMAKE_INSTALL_PREFIX="$BASEDIR/meshms" \
      $MSVC_OPT

# Build only the library target; MeshMS's install rules cover the static lib,
# public headers and the find_package() config.
cmake --build "$BUILD_DIR" --target MeshMS --parallel
cmake --install "$BUILD_DIR"
