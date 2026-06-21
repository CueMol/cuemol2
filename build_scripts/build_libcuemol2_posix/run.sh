#!/bin/bash
#
# build script for libcuemol2 in posix (and Windows Git Bash)
# usage: run.sh deplibs_dir [Debug]
#

# Dependency versions are defined in build_scripts/deplibs.env
. "$(cd "$(dirname "$0")/.."; pwd)/deplibs.env"

usage()
{
    echo "usage: run.sh deplibs_dir [Debug]"
    exit 1
}

if [ -z "${1:-}" ]; then
   usage
fi

set -eux

# Detect Windows (Git Bash / MSYS2)
IS_WINDOWS=false
if [[ -n "${MSYSTEM:-}" || "$OSTYPE" == msys* ]]; then
    IS_WINDOWS=true
fi

# Normalize BASEDIR: convert Windows paths (c:\...) to POSIX (/c/...)
if $IS_WINDOWS; then
    BASEDIR=$(cygpath -u "$1")
else
    BASEDIR=$1
fi

# deps root (BASEDIR) is shared; build/install root (OUTDIR) can be per-checkout.
# OUT_DIR unset falls back to BASEDIR, preserving the original/CI behavior.
if $IS_WINDOWS && [ -n "${OUT_DIR:-}" ]; then
    OUTDIR=$(cygpath -u "$OUT_DIR")
else
    OUTDIR="${OUT_DIR:-$BASEDIR}"
fi

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}
DEBUG_FLAG=${2:-}
NCPU=8

CMAKE_OPT=""
if [ "${GITHUB_WORKSPACE+foo}" ]; then
    CMAKE_SCCACHE_OPT="-DCMAKE_C_COMPILER_LAUNCHER=sccache -DCMAKE_CXX_COMPILER_LAUNCHER=sccache"
else
    CMAKE_SCCACHE_OPT=""
fi

# Windows: use the Windows-specific GLEW bundle version
if $IS_WINDOWS; then
    GLEW_VER=$GLEW_VER_WINDOWS
fi

# Build
BUILD_DIR=$OUTDIR/build_libcuemol2
mkdir -p $BUILD_DIR
cd $BUILD_DIR

if [ $DEBUG_FLAG = "Debug" ]; then
    BUILD_TYPE=Debug
else
    BUILD_TYPE=Release
fi

# Python embed (posix only; Windows build disables Python bindings)
if $IS_WINDOWS; then
    BUILD_PYTHON_BINDINGS=OFF
    ENABLE_PYTHON_EMBED=OFF
    PYTHON_OPT="-DBUILD_PYTHON_BINDINGS=OFF -DBUILD_PYTHON_MODULE=OFF"
else
    if [ -d "${EMBED_PYTHON_ROOT:-}" ]; then
        ENABLE_PYTHON_EMBED=ON
        PYTHON_ROOT=$EMBED_PYTHON_ROOT
        echo "Using PYTHON_ROOT=$EMBED_PYTHON_ROOT"
    else
        PYTHON_ROOT=$(python3 -c 'import sys;import pathlib; print(pathlib.Path(sys.executable).parent.parent)')
        echo "Found PYTHON_ROOT=$PYTHON_ROOT"
        ENABLE_PYTHON_EMBED=OFF
    fi
    echo "ENABLE_PYTHON_EMBED=$ENABLE_PYTHON_EMBED"
    BUILD_PYTHON_BINDINGS=ON
    PYTHON_OPT="-DBUILD_PYTHON_BINDINGS=$BUILD_PYTHON_BINDINGS \
                -DENABLE_PYTHON_EMBED=$ENABLE_PYTHON_EMBED \
                -DPython3_ROOT_DIR=$PYTHON_ROOT"
fi

BUILD_NODEJS_BINDINGS=ON
ENABLE_TYPESCRIPT=ON

# Windows-specific cmake flags: MSVC compiler, Perl without spaces in path, LibLZMA
if $IS_WINDOWS; then
    WIN_OPT="-DCMAKE_C_COMPILER=cl \
             -DCMAKE_CXX_COMPILER=cl \
             -DPERL_EXECUTABLE=C:/Strawberry/perl/bin/perl.exe \
             -DLibLZMA_ROOT=$BASEDIR/xz-$LZMA_VER"
else
    WIN_OPT=""
fi

# Install location
CMAKE_INSTALL_PREFIX=$OUTDIR/cuemol2

CMAKE_PREFIX_PATH="$BASEDIR"
ls -la $BASEDIR

# GENERATOR="Unix Makefiles"
GENERATOR="Ninja"

cmake -G "$GENERATOR" \
      -S ${WORKSPACE} -B $BUILD_DIR \
      $CMAKE_OPT \
      $CMAKE_SCCACHE_OPT \
      $WIN_OPT \
      -DCMAKE_INSTALL_PREFIX=$CMAKE_INSTALL_PREFIX \
      -DCMAKE_PREFIX_PATH=$CMAKE_PREFIX_PATH \
      -DBoost_ROOT=$BASEDIR/boost_$BOOST_VER \
      -DCGAL_DIR=$BASEDIR/CGAL-$CGAL_VER/lib/cmake/CGAL/ \
      -DFFTW_ROOT=$BASEDIR/fftw-$FFTW_VER \
      -DLCMS2_ROOT=$BASEDIR/lcms2-$LCMS2_VER \
      -DGLEW_ROOT=$BASEDIR/glew-$GLEW_VER \
      -DTBB_DIR=$BASEDIR/tbb-$TBB_VER/lib/cmake/TBB \
      -Dembree_DIR=$BASEDIR/embree-$EMBREE_VER/lib/cmake/embree-$EMBREE_VER \
      -Dumbreon_DIR=$BASEDIR/umbreon/lib/cmake/umbreon \
      $PYTHON_OPT \
      -DBUILD_NODEJS_BINDINGS=$BUILD_NODEJS_BINDINGS \
      -DENABLE_TYPESCRIPT=$ENABLE_TYPESCRIPT \
      -DBUILD_XPCJS_BINDINGS=ON \
      -DENABLE_TBB=${ENABLE_TBB:-ON} \
      -DENABLE_UMBREON=${ENABLE_UMBREON:-OFF} \
      -DCGAL_DO_NOT_WARN_ABOUT_CMAKE_BUILD_TYPE=TRUE \
      -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
      -DCGAL_DISABLE_GMP=TRUE \
      -DCGAL_HEADER_ONLY=TRUE \
      -DBUILD_TESTS=$(if $IS_WINDOWS; then echo OFF; else echo ON; fi)

cmake --build $BUILD_DIR --parallel --config $BUILD_TYPE
# ctest --test-dir $BUILD_DIR --output-on-failure
cmake --install $BUILD_DIR --config $BUILD_TYPE

# Copy dependent shared libs (posix only; Windows DLLs are handled separately)
if ! $IS_WINDOWS; then
    cp $BASEDIR/boost_$BOOST_VER/lib/lib* $OUTDIR/cuemol2/lib/
fi

# Python embed
if [ -n "${EMBED_PYTHON_ROOT:-}" ]; then
    cp -r $EMBED_PYTHON_ROOT $OUTDIR/cuemol2/lib/
fi

ls -la $OUTDIR/cuemol2/lib/
