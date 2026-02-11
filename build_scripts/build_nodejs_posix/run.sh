#!/bin/sh
#
# build script for nodejs addon in posix
# usage: run.sh deplibs_dir
#

set -eux

BASEDIR=$1

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

BOOST_VER=boost_1_84_0
BOOST_DIR=$BASEDIR/$BOOST_VER

# Install location
INST_PATH=$BASEDIR/cuemol2

cd $WORKSPACE/nodejs
npm --version
node --version
npm install
npx cmake-js compile \
    --CDLIBCUEMOL2_ROOT=$INST_PATH \
    --CDBoost_ROOT=$BOOST_DIR

# npx cmake-js install
npm install

# Copy dependent libs (boost)
ls -la $BOOST_DIR/lib/lib*
cp $BOOST_DIR/lib/lib* $BASEDIR/cuemol2/lib/

env LD_LIBRARY_PATH=$INST_PATH/lib \
    npm test
