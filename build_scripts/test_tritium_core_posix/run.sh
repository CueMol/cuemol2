#!/bin/sh
#
# test script for tritium/core addon in posix
# usage: run.sh deplibs_dir
#

set -eux

BASEDIR=$1
# deps root (BASEDIR) is shared; build/install root (OUTDIR) can be per-checkout.
# OUT_DIR unset falls back to BASEDIR, preserving the original/CI behavior.
OUTDIR="${OUT_DIR:-$BASEDIR}"

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

# Install location
INST_PATH=$OUTDIR/cuemol2

cd $WORKSPACE/tritium/core
env LD_LIBRARY_PATH=$INST_PATH/lib \
    pnpm run test
