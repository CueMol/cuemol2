#!/bin/sh
#
# build script for pymod in posix
# usage: run.sh deplibs_dir
#

usage()
{
    echo "usage: run.sh deplibs_dir"
    exit 1
}

if [ -z "${1:-}" ]; then
   usage
fi

set -eux

BASEDIR=$1
# deps root (BASEDIR) is shared; build/install root (OUTDIR) can be per-checkout.
# OUT_DIR unset falls back to BASEDIR, preserving the original/CI behavior.
OUTDIR="${OUT_DIR:-$BASEDIR}"

# Use PYTHON env var if already set, otherwise default to python3
PYTHON="${PYTHON:-python3}"

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

# Use venv if exists
VENV_DIR=$REPOS_DIR/.venv
if [ -d $VENV_DIR ]; then
    echo "Activating virtual environment at $VENV_DIR"
    source $VENV_DIR/bin/activate
fi

BOOST_VER=boost_1_84_0
BOOST_DIR=$BASEDIR/$BOOST_VER

# Install location
INST_PATH=$OUTDIR/cuemol2

# Copy dependent libs (boost)
# ls -la $BOOST_DIR/lib/lib*
cp $BOOST_DIR/lib/lib* $OUTDIR/cuemol2/lib/

export CMAKE_GENERATOR="Unix Makefiles"
export CMAKE_MAKE_PROGRAM="make"
cd $WORKSPACE/pymod

$PYTHON -m pip install "numpy<2"

$PYTHON -m pip install \
     --config-settings=cmake.define.LIBCUEMOL2_ROOT=$INST_PATH \
     --config-settings=cmake.define.Boost_ROOT=$BOOST_DIR \
     -v . 

# $PYTHON -m pip install \
#      --config-settings=cmake.define.LIBCUEMOL2_ROOT=$INST_PATH \
#      --config-settings=cmake.define.Boost_ROOT=$BOOST_DIR \
#      --config-settings=cmake.args="--debug-find" \
#      -vv . \
#      2>&1 | tee build.log

# run python tests
cd $WORKSPACE
$PYTHON -m pip install pytest

if [ "$(uname)" == 'Darwin' ]; then
    env DYLD_LIBRARY_PATH=$INST_PATH/lib \
        pytest tests
else
    env LD_LIBRARY_PATH=$INST_PATH/lib \
        pytest tests
fi
