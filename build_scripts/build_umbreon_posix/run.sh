#!/bin/bash
#
# Build libumbreon (the Embree ray-tracing backend) from source and install it
# into the deplibs prefix, so libcuemol2 can consume it via find_package(umbreon).
# Reused by the local `install_umbreon` task and the umbreon_smoke CI workflow.
#
# usage: run.sh <deplibs_dir> <umbreon_src_dir>
#

# Dependency versions (TBB_VER / EMBREE_VER / OIDN_VER) are defined in deplibs.env.
# OIDN comes from the deplibs bundle (static, CPU-only); UMBREON_WITH_OIDN=ON links
# it PUBLIC into libumbreon so the OIDN denoiser backend is available to consumers.
. "$(cd "$(dirname "$0")/.."; pwd)/deplibs.env"

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
    echo "usage: run.sh <deplibs_dir> <umbreon_src_dir>"
    exit 1
fi

set -eux

BASEDIR=$1
UMBREON_SRC=$2

# Match the dynamic CRT (/MD) of the bundled static Embree/TBB on MSVC, and
# normalize Windows paths under Git Bash.
MSVC_OPT=""
if [[ -n "${MSYSTEM:-}" || "$OSTYPE" == msys* ]]; then
    BASEDIR=$(cygpath -u "$BASEDIR")
    UMBREON_SRC=$(cygpath -u "$UMBREON_SRC")
    # Force MSVC even when a Strawberry Perl g++ sits ahead of cl on PATH: the
    # Ninja generator would otherwise auto-pick g++ (which ICEs here, and whose
    # objects could not link the MSVC /MD deplibs anyway). Mirrors WIN_OPT in
    # build_libcuemol2_posix/run.sh. Requires an MSVC dev environment (cl on PATH).
    MSVC_OPT="-DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL"
fi

# Build out-of-source under the deplibs prefix so the umbreon working copy (the
# local co-dev checkout) is never dirtied.
BUILD_DIR=$BASEDIR/tmp/umbreon_build

cmake -G Ninja -S "$UMBREON_SRC" -B "$BUILD_DIR" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
      -DCMAKE_PREFIX_PATH="$BASEDIR" \
      -DTBB_DIR="$BASEDIR/tbb-$TBB_VER/lib/cmake/TBB" \
      -Dembree_DIR="$BASEDIR/embree-$EMBREE_VER/lib/cmake/embree-$EMBREE_VER" \
      -DUMBREON_WITH_OIDN=ON \
      -DOpenImageDenoise_DIR="$BASEDIR/oidn-$OIDN_VER/lib/cmake/OpenImageDenoise-$OIDN_VER" \
      -DCMAKE_INSTALL_PREFIX="$BASEDIR/umbreon" \
      $MSVC_OPT

# Build only the library target: the bench CLI and the umbreon unit tests (and
# their bench_core dependency) are left unbuilt, and umbreon's install rules
# cover just the static lib, public headers and the find_package() config.
cmake --build "$BUILD_DIR" --target umbreon --parallel
cmake --install "$BUILD_DIR"
