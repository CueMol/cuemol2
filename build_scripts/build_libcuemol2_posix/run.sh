#!/bin/bash
#
# build script for libcuemol2 in posix
# usage: run.sh deplibs_dir [Debug]
#

# Dependency versions
BOOST_VER=1_84_0
FFTW_VER=3.3.10
# LCMS2_VER=2.15
LCMS2_VER=2.17
GLEW_VER=2.1.0
# CGAL_VER=4.14.3
CGAL_VER=6.1

usage()
{
    echo "usage: run.sh deplibs_dir [Debug]"
    exit 1
}

if [ -z "${1:-}" ]; then
   usage
fi

set -eux

BASEDIR=$1

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

# Build
BUILD_DIR=$BASEDIR/build_libcuemol2
mkdir -p $BUILD_DIR
cd $BUILD_DIR

if [ $DEBUG_FLAG = "Debug" ]; then
    BUILD_TYPE=Debug
else
    BUILD_TYPE=Release
fi

# Python embed
if [ -d "${EMBED_PYTHON_ROOT:-}" ]; then
    # if [ "${EMBED_PYTHON_ROOT+foo}" ]; then
    ENABLE_PYTHON_EMBED=ON
    PYTHON_ROOT=$EMBED_PYTHON_ROOT
    echo "Using PYTHON_ROOT=$EMBED_PYTHON_ROOT"
else
    # PYTHON=python3
    PYTHON_ROOT=$(python3 -c 'import sys;import pathlib; print(pathlib.Path(sys.executable).parent.parent)')
    echo "Found PYTHON_ROOT=$PYTHON_ROOT"
    ENABLE_PYTHON_EMBED=OFF
fi
echo "ENABLE_PYTHON_EMBED=$ENABLE_PYTHON_EMBED"

BUILD_PYTHON_BINDINGS=ON
BUILD_NODEJS_BINDINGS=ON

# Install location
CMAKE_INSTALL_PREFIX=$BASEDIR/cuemol2

CMAKE_PREFIX_PATH="$BASEDIR"
ls -la $BASEDIR

# GENERATOR="Unix Makefiles"
GENERATOR="Ninja"

cmake -G "$GENERATOR" \
      -S ${WORKSPACE} -B $BUILD_DIR \
      $CMAKE_OPT \
      $CMAKE_SCCACHE_OPT \
      -DCMAKE_INSTALL_PREFIX=$CMAKE_INSTALL_PREFIX \
      -DCMAKE_PREFIX_PATH=$CMAKE_PREFIX_PATH \
      -DBoost_ROOT=$BASEDIR/boost_$BOOST_VER \
      -DCGAL_DIR=$BASEDIR/CGAL-$CGAL_VER/lib/cmake/CGAL/ \
      -DFFTW_ROOT=$BASEDIR/fftw-$FFTW_VER \
      -DLCMS2_ROOT=$BASEDIR/lcms2-$LCMS2_VER \
      -DGLEW_ROOT=$BASEDIR/glew-$GLEW_VER \
      -DBUILD_PYTHON_BINDINGS=$BUILD_PYTHON_BINDINGS \
      -DENABLE_PYTHON_EMBED=$ENABLE_PYTHON_EMBED \
      -DBUILD_NODEJS_BINDINGS=$BUILD_NODEJS_BINDINGS \
      -DPython3_ROOT_DIR=$PYTHON_ROOT \
      -DBUILD_XPCJS_BINDINGS=ON \
      -DCGAL_DO_NOT_WARN_ABOUT_CMAKE_BUILD_TYPE=TRUE \
      -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
      -DCGAL_DISABLE_GMP=TRUE \
      -DCGAL_HEADER_ONLY=TRUE

cmake --build $BUILD_DIR --parallel --config $BUILD_TYPE
cmake --install $BUILD_DIR --config $BUILD_TYPE

# Copy dependent shared libs
cp $BASEDIR/boost_$BOOST_VER/lib/lib* $BASEDIR/cuemol2/lib/

# Python embed
if [ -n "${EMBED_PYTHON_ROOT:-}" ]; then
    cp -r $EMBED_PYTHON_ROOT $BASEDIR/cuemol2/lib/
fi

ls -la $BASEDIR/cuemol2/lib/
