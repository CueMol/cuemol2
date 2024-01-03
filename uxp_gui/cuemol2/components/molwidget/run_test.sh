#!/bin/sh

if test $# -ne 0;
then
  SCRIPT=$1
fi

PREFIX=/net3/ishitani/proj/cuemol2/src/xul_gui/
GECKO_SDK=/net3/ishitani/src/xulrunner-1.9.0.4-sdk/sdk
#GECKO_SDK=/net3/ishitani/proj/firefox_20071119/mozilla/fx-shared/dist/sdk

XPT_FILES="$PREFIX/components/qIObjWrapper.xpt $PREFIX/components/qICueMol.xpt $PREFIX/components/libxpcqm.so"

FX_DIST=$GECKO_SDK/..

XPIDL=$GECKO_SDK/bin/xpidl
XPIDL_INCLUDE=$GECKO_SDK/idl/

RUNMOZ=$FX_DIST/bin/run-mozilla.sh

REGCOMP="$RUNMOZ $GECKO_SDK/bin/regxpcom"
COMPONENT_LOCATION=$FX_DIST/bin/components/

cp $XPT_FILES $COMPONENT_LOCATION

$REGCOMP

###########

XPCSH=$FX_DIST/bin/xpcshell

#$RUNMOZ -g -d valgrind $XPCSH $SCRIPT
$RUNMOZ $XPCSH $SCRIPT

#$RUNMOZ -g -d gdb $XPCSH $SCRIPT


exit;
