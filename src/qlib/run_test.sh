#!/bin/sh

if test $# -ne 0;
then
  SCRIPT=$1
fi

GECKO_SDK=/net3/ishitani/proj/firefox_20071119/mozilla/fx-shared/dist/sdk
MODULE_NAME=libxpcqlib
XPT_FILES='qIObjWrapper.xpt ClassA_qi.xpt ClassB_qi.xpt ClassS_qi.xpt Matrix_qi.xpt Vector_qi.xpt RegExpr_qi.xpt RangeSet_qi.xpt Quat_qi.xpt'

FX_DIST=$GECKO_SDK/..
FX_SDK_INCLUDE1=$FX_DIST/sdk/include
XPIDL=$GECKO_SDK/bin/xpidl
XPIDL_INCLUDE=$GECKO_SDK/idl/

REGCOMP="$FX_DIST/bin/run-mozilla.sh $FX_DIST/bin/regxpcom"
COMPONENT_LOCATION=$FX_DIST/bin/components/

cp $XPT_FILES $COMPONENT_LOCATION
cp .libs/$MODULE_NAME.so.0.0.0 $COMPONENT_LOCATION/$MODULE_NAME.so

$REGCOMP

###########

RUNMOZ=$FX_DIST/bin/run-mozilla.sh
XPCSH=$FX_DIST/bin/xpcshell

$RUNMOZ -g -d "valgrind --leak-check=full" $XPCSH $SCRIPT
#$RUNMOZ -g -d gdb $XPCSH

#$RUNMOZ $XPCSH $SCRIPT

exit;

