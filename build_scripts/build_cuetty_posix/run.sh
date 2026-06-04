#!/bin/sh
#
# build script for cuetty in posix
# usage: run.sh deplibs_dir
#

set -eux

BASEDIR=$1
# deps root (BASEDIR) is shared; build/install root (OUTDIR) can be per-checkout.
# OUT_DIR unset falls back to BASEDIR, preserving the original/CI behavior.
OUTDIR="${OUT_DIR:-$BASEDIR}"
REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
TOP_DIR=${GITHUB_WORKSPACE:-$REPOS_DIR}

BOOST_VER=boost_1_84_0
BOOST_DIR=$BASEDIR/$BOOST_VER

# Install location
INST_PATH=$OUTDIR/cuemol2

# Build
BUILD_DIR=$OUTDIR/build_cuetty
mkdir -p $BUILD_DIR
cd $BUILD_DIR

# BUILD_TYPE=Debug
BUILD_TYPE=Release

ls -la $BASEDIR

# GENERATOR="Unix Makefiles"
GENERATOR="Ninja"

cmake -G "$GENERATOR" \
      -S ${TOP_DIR}/cli -B $BUILD_DIR \
      -DCMAKE_INSTALL_PREFIX=$INST_PATH \
      -DCMAKE_PREFIX_PATH=$BASEDIR \
      -DBoost_ROOT=$BOOST_DIR/ \
      -DLIBCUEMOL2_ROOT=$INST_PATH \
      -DCMAKE_BUILD_TYPE=$BUILD_TYPE

cmake --build $BUILD_DIR --parallel --config $BUILD_TYPE
cmake --install $BUILD_DIR --config $BUILD_TYPE

# Copy dependent libs (boost)
cp $BOOST_DIR/lib/lib* $OUTDIR/cuemol2/lib/
