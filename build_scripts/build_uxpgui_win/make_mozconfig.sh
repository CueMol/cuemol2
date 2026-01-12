#!/bin/bash

set -eux

cd $GITHUB_WORKSPACE
# WIN32_REDIST_DIR=$(echo "${VCToolsRedistDir}x64\\Microsoft.VC142.CRT" | sed 's/\\/\//g')
# WIN32_REDIST_DIR=$(echo "${VCToolsRedistDir}x64\\Microsoft.VC143.CRT" | sed 's/\\/\//g')
WIN32_REDIST_DIR=$(cygpath -m "${VCToolsRedistDir}x64\\Microsoft.VC143.CRT")
echo "$WIN32_REDIST_DIR"
# WIN_UCRT_REDIST_DIR=$(echo "${WindowsSdkDir}Redist\\${WindowsSDKLibVersion}ucrt\\DLLs\\x64" | sed 's/\\/\//g')
WIN_UCRT_REDIST_DIR=$(cygpath -m "${WindowsSdkDir}Redist\\${WindowsSDKLibVersion}ucrt\\DLLs\\x64")
echo "$WIN_UCRT_REDIST_DIR"

DEPLIBS_DIR=${MSYS_TOP_DIR2}/target
BUNDLE_DIR=${MSYS_TOP_DIR2}/target

BOOST_DIR=$DEPLIBS_DIR/boost_1_84_0/include/boost-1_84
LIBDIR=$DEPLIBS_DIR/boost_1_84_0/lib
CUEMOL_DIR=$DEPLIBS_DIR/cuemol2
CUEMOL_DEBUG=""

SCCACHE_PATH=$(cygpath -m "$SCCACHE_PATH")
CC_CMD="$SCCACHE_PATH cl.exe"
CXX_CMD="$SCCACHE_PATH cl.exe"

cd uxp_gui
sed "s!@WIN32_REDIST_DIR@!$WIN32_REDIST_DIR!g" $GITHUB_WORKSPACE/build_scripts/mozconfig_Windows \
    | sed "s!@WIN_UCRT_REDIST_DIR@!$WIN_UCRT_REDIST_DIR!g" \
    | sed "s!@CUEMOL_BUNDLE@!$BUNDLE_DIR!g" \
    | sed "s!@CUEMOL_DIR@!$CUEMOL_DIR!g" \
    | sed "s!@CUEMOL_DEBUG@!$CUEMOL_DEBUG!g" \
    | sed "s!@BOOST_DIR@!$BOOST_DIR!g" \
    | sed "s!@CC_CMD@!$CC_CMD!g" \
    | sed "s!@CXX_CMD@!$CXX_CMD!g" \
    | sed "s!@DEPLIBS_DIR@!$LIBDIR!g" > .mozconfig

cat .mozconfig
