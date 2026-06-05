#!/bin/sh
#
# build script for libcuemol2 in windows
# usage: run.sh deplibs_dir

usage()
{
    echo "usage: run.sh deplibs_dir"
    echo "  deplibs_dir: dependent libs/packages dir"
    exit 1
}

if [ -z "${1:-}" ]; then
   usage
fi

set -eux

DEPLIBS_DIR=$1
RUNNER_OS="Windows"
RUNNER_ARCH="X64"

SCRIPT_DIR=$(cd $(dirname $0); pwd)
WSDIR=$(cd $(dirname $0)/../..; pwd)
# Dependency versions are defined in build_scripts/deplibs.env
. "$SCRIPT_DIR/../deplibs.env"
cd ${WSDIR}/uxp_gui

# Retrieve UXP tarball
if [ ! -d ${WSDIR}/uxp_gui/platform ]; then
    UXP_BASE=${UXP_TGZ%.tar.gz}
    wget --progress=dot:giga -c \
         https://github.com/CueMol/uxp_release/releases/download/$UXP_VERSION/$UXP_TGZ
    rm -rf uxp
    set +e
    tar xzf $UXP_TGZ
    set -e
    mv uxp platform

    # Apply patch
    patch -p0 < uxp_diff.patch

    # Other-licenses
    wget --progress=dot:giga -c \
         https://github.com/CueMol/uxp_release/releases/download/$UXP_VERSION/other-licenses_${UXP_BASE}.tar.bz2

    rm -rf other-licenses
    tar xjf other-licenses_${UXP_BASE}.tar.bz2
fi

###########
# Build UXP

cd ${WSDIR}/uxp_gui
./mach build
./mach package
./mach installer
