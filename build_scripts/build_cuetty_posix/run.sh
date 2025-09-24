#!/bin/sh
#
# build script for cuetty in posix
# usage: run.sh deplibs_dir
#

set -eux

BASEDIR=$1
REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

BOOST_VER=boost_1_84_0

# Install location
INST_PATH=$BASEDIR/cuemol2

# Build
BUILD_DIR=$BASEDIR/build_cuetty
mkdir -p $BUILD_DIR
cd $BUILD_DIR

# BUILD_TYPE=Debug
BUILD_TYPE=Release

ls -la $BASEDIR

# GENERATOR="Unix Makefiles"
GENERATOR="Ninja"

cmake -G "$GENERATOR" \
      -S ${WORKSPACE}/cli -B $BUILD_DIR \
      -DCMAKE_INSTALL_PREFIX=$INST_PATH \
      -DCMAKE_PREFIX_PATH=$BASEDIR \
      -DBoost_ROOT=$BASEDIR/$BOOST_VER/ \
      -DLIBCUEMOL2_ROOT=$BASEDIR\cuemol2 \
      -DCMAKE_BUILD_TYPE=$BUILD_TYPE

cmake --build $BUILD_DIR --parallel --config $BUILD_TYPE
cmake --install $BUILD_DIR --config $BUILD_TYPE

ls -la $BASEDIR/$BOOST_VER/lib/lib*
cp $BASEDIR/$BOOST_VER/lib/lib* $BASEDIR/cuemol2/lib/

