#!/bin/sh
#
# build script for tritium/core addon in posix
# usage: run.sh deplibs_dir
#

set -eux

BASEDIR=$1
# deps root (BASEDIR) is shared; build/install root (OUTDIR) can be per-checkout.
# OUT_DIR unset falls back to BASEDIR, preserving the original/CI behavior.
OUTDIR="${OUT_DIR:-$BASEDIR}"

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

BOOST_VER=boost_1_84_0
BOOST_DIR=$BASEDIR/$BOOST_VER

# Install location
INST_PATH=$OUTDIR/cuemol2

cd $WORKSPACE/tritium/core
npm --version
node --version
# Use --ignore-scripts to skip the cmake-js lifecycle hook (run it manually below with explicit flags)
npm install --ignore-scripts
npx cmake-js compile \
    --CDLIBCUEMOL2_ROOT=$INST_PATH \
    --CDBoost_ROOT=$BOOST_DIR

# Copy dependent libs (boost)
ls -la $BOOST_DIR/lib/lib*
cp $BOOST_DIR/lib/lib* $OUTDIR/cuemol2/lib/

env LD_LIBRARY_PATH=$INST_PATH/lib \
    npm test
