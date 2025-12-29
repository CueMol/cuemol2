#!/bin/sh
#
# build script for pymod in posix
# usage: run.sh deplibs_dir
#

usage()
{
    echo "usage: run_pytest.sh deplibs_dir"
    exit 1
}

if [ -z "${1:-}" ]; then
   usage
fi

set -eux

BASEDIR=$1

# PYTHON="python3.12"
PYTHON="python3"

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

# Use venv if exists
VENV_DIR=$REPOS_DIR/.venv
if [ -d $VENV_DIR ]; then
    source $VENV_DIR/bin/activate
fi

# Install location
INST_PATH=$BASEDIR/cuemol2

# run python tests
cd $WORKSPACE
$PYTHON -m pip install pytest

if [ "$(uname)" == 'Darwin' ]; then
    env DYLD_LIBRARY_PATH=$INST_PATH/lib \
        pytest tests -s
else
    env LD_LIBRARY_PATH=$INST_PATH/lib \
        pytest tests
fi
