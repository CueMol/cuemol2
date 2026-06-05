#!/bin/bash
#
# build script for libcuemol2 in posix
# usage: run.sh deplibs_dir host_os host_arch
#  host_os ... macOS
#  host_arch ... ARM64 X64

usage()
{
    echo "usage: run.sh base_dir host_os host_arch"
    echo "  host_os ... macOS"
    echo "  host_arch ... ARM64 X64"
    exit 1
}

if [ -z "${1:-}" ] || [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
   usage
fi

set -eux

BASEDIR=$1
RUNNER_OS=$2
RUNNER_ARCH=$3
# deps/extpkgs root (BASEDIR) is shared; libcuemol2 install root (OUTDIR) can be
# per-checkout. OUT_DIR unset falls back to BASEDIR, preserving original behavior.
OUTDIR="${OUT_DIR:-$BASEDIR}"

SCRIPT_DIR=$(cd $(dirname $0); pwd)
REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}
# Dependency versions are defined in build_scripts/deplibs.env
. "$SCRIPT_DIR/../deplibs.env"
# DEBUG Flag
CUEMOL_DEBUG=""

TMPDIR=$BASEDIR/tmp
mkdir -p $TMPDIR
cd $TMPDIR

###########
# Retrieve UXP tarball
if [ ! -d ${WORKSPACE}/uxp_gui/platform ]; then
    wget --progress=dot:giga -c \
         https://github.com/CueMol/uxp_release/releases/download/$UXP_VERSION/$UXP_TGZ
    tar xjf $UXP_TGZ
    mv uxp ${WORKSPACE}/uxp_gui/platform
    
    # Apply patch
    cd ${WORKSPACE}/uxp_gui
    patch -p0 < uxp_diff.patch
fi

###########
# Build UXP
cd ${WORKSPACE}/uxp_gui

BUNDLE_DIR=$BASEDIR
CUEMOL_DIR=$OUTDIR/cuemol2
BOOST_DIR=$BASEDIR/boost_$BOOST_VER
DEPLIBS_DIR=$BASEDIR/boost_$BOOST_VER/lib

ls -l $BUNDLE_DIR
ls -l $BUNDLE_DIR/povray
ls -l $BUNDLE_DIR/ffmpeg
ls -l $BUNDLE_DIR/apbs

if [ $RUNNER_OS = "macOS" ]; then
    brew install yasm

    SDK_BASE_PATH=$(dirname $(xcrun --show-sdk-path))
    SDK_PATH=$(echo $SDK_BASE_PATH/MacOSX*.*.sdk | tr ' ' '\n' | sort | tail -1)
    echo SDK_PATH: $SDK_PATH
    ls -la $SDK_PATH
    ls -la $SDK_PATH/../

    ADD_MOZCONFIG=""
    if [ $RUNNER_ARCH = "ARM64" ]; then
        BUILD_ARCH="aarch64-apple-darwin"
        # SDK_PATH=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX14.0.sdk
    elif [ $RUNNER_ARCH = "X64" ]; then
        BUILD_ARCH="x86_64-apple-darwin"
        # SDK_PATH=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX11.1.sdk
        ADD_MOZCONFIG="export CXXFLAGS='-stdlib=libc++'"
    else
        echo "unknown runner arch: $RUNNER_ARCH"
        exit 1
    fi

    CC_CMD="sccache clang -Wno-implicit-int"
    CXX_CMD="sccache clang++"
    # CC_CMD="clang -Wno-implicit-int"
    # CXX_CMD="clang++"
    sed "s!@CUEMOL_BUNDLE@!$BUNDLE_DIR!g" $SCRIPT_DIR/mozconfig_macOS \
        | sed "s!@CUEMOL_DIR@!$CUEMOL_DIR!g" \
        | sed "s!@CUEMOL_DEBUG@!$CUEMOL_DEBUG!g" \
        | sed "s!@BOOST_DIR@!$BOOST_DIR!g" \
        | sed "s!@DEPLIBS_DIR@!$DEPLIBS_DIR!g" \
        | sed "s!@BUILD_ARCH@!$BUILD_ARCH!g" \
        | sed "s!@SDK_PATH@!$SDK_PATH!g" \
        | sed "s!@CC_CMD@!$CC_CMD!g" \
        | sed "s!@CXX_CMD@!$CXX_CMD!g" \
              > .mozconfig

    echo $ADD_MOZCONFIG >> .mozconfig

    # elif [ $RUNNER_OS = "Linux" ]; then
else
    echo "unknown runner os: $RUNNER_OS"
    exit 1
fi

./mach build

# Packaging
./mach package

# find obj-*-apple-darwin/dist -name "apbs"
if [ "${ARTIFACT_NAME+foo}" ]; then
    if [ $RUNNER_OS = "macOS" ]; then
        ls -l obj-*/dist/cuemol2-*.dmg
        cp obj-*/dist/cuemol2-*.dmg ${WORKSPACE}/
        cd ${WORKSPACE}
        ls -l cuemol2-*.dmg
        tar cjvf ${WORKSPACE}/${ARTIFACT_NAME} *.dmg
    else
        echo "unknown runner os: $RUNNER_OS"
        exit 1
    fi
fi
