#!/bin/sh

GECKO_SDK=$1
MODULE_NAME=$2
shift 2
XPT_FILES=$*

cat > run_test.sh <<EOF
#!/bin/sh

if test \$# -ne 0;
then
  SCRIPT=\$1
fi

GECKO_SDK=$GECKO_SDK
MODULE_NAME=$MODULE_NAME
XPT_FILES='$XPT_FILES'

FX_DIST=\$GECKO_SDK/..
FX_SDK_INCLUDE1=\$FX_DIST/sdk/include
XPIDL=\$GECKO_SDK/bin/xpidl
XPIDL_INCLUDE=\$GECKO_SDK/idl/

REGCOMP="\$FX_DIST/bin/run-mozilla.sh \$FX_DIST/bin/regxpcom"
COMPONENT_LOCATION=\$FX_DIST/bin/components/

cp \$XPT_FILES \$COMPONENT_LOCATION
cp .libs/\$MODULE_NAME.so.0.0.0 \$COMPONENT_LOCATION/\$MODULE_NAME.so

\$REGCOMP

###########

RUNMOZ=\$FX_DIST/bin/run-mozilla.sh
XPCSH=\$FX_DIST/bin/xpcshell

#\$RUNMOZ -g -d valgrind \$XPCSH
#\$RUNMOZ -g -d gdb \$XPCSH

\$RUNMOZ \$XPCSH \$SCRIPT

exit;

EOF
