#!/bin/sh

FX_DIST=/home/ishitani/proj/firefox_20071123/mozilla/fx-shared/dist

FX_SDK_INCLUDE1=$FX_DIST/sdk/include

XPIDL=$FX_DIST/sdk/bin/xpidl
XPIDL_INCLUDE=$FX_DIST/sdk/idl/

REGCOMP="$FX_DIST/bin/run-mozilla.sh $FX_DIST/bin/regxpcom"
COMPONENT_LOCATION=$FX_DIST/bin/components/

cp qIObjWrapper.xpt qIClassA.xpt qIClassB.xpt $COMPONENT_LOCATION
cp .libs/libxpcqlib.so.0.0.0 $COMPONENT_LOCATION/libxpcqlib.so

$REGCOMP

exit;

const ClassA = new Components.Constructor("@cuemol.org/ClassA", "qIClassA");
const ClassB = new Components.Constructor("@cuemol.org/ClassB", "qIClassB");
var a = new ClassA;
var b = new ClassB;
a.prop3 = b;
a.foo(123, "hoge", b);
