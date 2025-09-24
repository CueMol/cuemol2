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
WSDIR=$(cd $(dirname $0)/..; pwd)
cd ${WSDIR}/uxp_gui

# Retrieve UXP tarball
if [ ! -d ${WSDIR}/uxp_gui/platform ]; then
    # Retrieve UXP tarball
    UXP_TGZ=RB_20231106.tar.gz
    UXP_VERSION=v0.0.1
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
         https://github.com/CueMol/uxp_release/releases/download/$UXP_VERSION/other-licenses_RB_20231106.tar.bz2

    rm -rf other-licenses
    tar xjf other-licenses_RB_20231106.tar.bz2
fi

# Setup external packages
BUNDLE_DIR=$DEPLIBS_DIR
TMPDIR=$DEPLIBS_DIR/tmp

mkdir -p $BUNDLE_DIR

# Retrieve extpkgs binary
mkdir -p $TMPDIR
pushd $TMPDIR
PKG_TGZ=extpkgs_${RUNNER_OS}_${RUNNER_ARCH}.tar.bz2
PKG_VER=v0.0.5
URL=https://github.com/CueMol/povray_build/releases/download/$PKG_VER/$PKG_TGZ
wget --progress=dot:mega -c $URL
popd

# extract files
pushd $BUNDLE_DIR
tar xjvf $TMPDIR/$PKG_TGZ
popd

###########
# Build UXP
cd ${WSDIR}/uxp_gui
DEPLIBS_DIR_WD=$(echo $DEPLIBS_DIR | sed "s|/c/|c:/|g")

CUEMOL_DIR=$DEPLIBS_DIR_WD/cuemol2
BOOST_DIR=$DEPLIBS_DIR_WD/boost_1_84_0/include/boost-1_84
DEPLIBS_DIR=$DEPLIBS_DIR_WD/boost_1_84_0/lib
BUNDLE_DIR=$DEPLIBS_DIR_WD
# DEBUG Flag
CUEMOL_DEBUG=""

BUILD_ARCH=x64
WIN32_REDIST_DIR="C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Redist/MSVC/14.38.33130/$BUILD_ARCH/Microsoft.VC143.CRT"
WIN_UCRT_REDIST_DIR="C:/Program Files (x86)/Windows Kits/10/Redist/10.0.22621.0/ucrt/DLLs/$BUILD_ARCH"

sed "s!@CUEMOL_BUNDLE@!$BUNDLE_DIR!g" $SCRIPT_DIR/mozconfig_Windows \
    | sed "s!@CUEMOL_DIR@!$CUEMOL_DIR!g" \
    | sed "s!@CUEMOL_DEBUG@!$CUEMOL_DEBUG!g" \
    | sed "s!@BOOST_DIR@!$BOOST_DIR!g" \
    | sed "s!@DEPLIBS_DIR@!$DEPLIBS_DIR!g" \
    | sed "s!@WIN32_REDIST_DIR@!$WIN32_REDIST_DIR!g" \
    | sed "s!@WIN_UCRT_REDIST_DIR@!$WIN_UCRT_REDIST_DIR!g" \
          > .mozconfig

# echo $ADD_MOZCONFIG >> .mozconfig


# Build UXP
cd ${WSDIR}/uxp_gui
./mach build
./mach package
./mach installer
