#!/bin/bash
set -eux

DEPLIBS_VERSION=v0.0.2

BASEDIR=$1
RUNNER_OS=Windows
RUNNER_ARCH=X64
TMPDIR=$BASEDIR/tmp

mkdir -p $TMPDIR
cd $TMPDIR

# Retrieve deplibs binary
DEPLIBS_TGZ=deplibs_${RUNNER_OS}_${RUNNER_ARCH}.tar.gz
DEPLIBS_URL=https://github.com/CueMol/build_prerequisites/releases/download
wget --progress=dot:mega -c \
     $DEPLIBS_URL/$DEPLIBS_VERSION/$DEPLIBS_TGZ

tar xzf $DEPLIBS_TGZ
mkdir -p $BASEDIR/proj64_deplibs
mv -v proj64_deplibs/* $BASEDIR/proj64_deplibs
