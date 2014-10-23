######################################################
#
# $Id: Makefile.am,v 1.22 2010/12/27 04:54:39 rishitani Exp $
#

######################################################
# XPCOM type library creation rule

#XPIDL = @XULRUNNER_SDK_PATH@/sdk/bin/xpidl

XPIDL_HEADER = python @XULRUNNER_SDK_PATH@/sdk/bin/header.py
XPIDL_TYPELIB = python @XULRUNNER_SDK_PATH@/sdk/bin/typelib.py

XPIDL_INCLUDES = \
 -I@XULRUNNER_SDK_PATH@/sdk/idl \
 -I@XULRUNNER_SDK_PATH@/idl \
 -I$(top_srcdir)/qlib \
 -I$(srcdir)

xpcomdir=${prefix}/components
xptdir=${prefix}/components

#%.xpt: %.idl
#	$(XPIDL) $(XPIDL_INCLUDES) -m typelib -e $@ $<
#%.h: %.idl
#	$(XPIDL) $(XPIDL_INCLUDES) -m header -e $@ $<

%.xpt: %.idl
	$(XPIDL_TYPELIB) $(XPIDL_INCLUDES) --cachedir=. -o $@ $<

%.h: %.idl
	$(XPIDL_HEADER) $(XPIDL_INCLUDES) --cachedir=. -o $@ $<

######################################################
# XPCOM support

IDL_SRC = qIObjWrapper.idl qICueMol.idl qINativeWidget.idl
IDL_HDR = $(IDL_SRC:%.idl=%.h)
IDL_XPT = $(IDL_SRC:%.idl=%.xpt)

######################################################
# Main library definition

xpcom_LTLIBRARIES = libxpcqm.la

libxpcqm_la_SOURCES = \
$(IDL_SRC) \
XPCCueMol.cpp \
XPCObjWrapper.cpp \
XPCNativeWidget.cpp \
XPCTimerImpl.cpp \
Canvas2DTextRender2.cpp \
xpc_main.cpp

# @XULRUNNER_SDK_PATH@/sdk/lib/libxpcomglue_s.a
#  -no-undefined 


############################
# MacOS X Build definitions

if COND_BUILD_OSX

#  -isysroot /Developer/SDKs/MacOSX10.5.sdk
#-fno-exceptions
# -fno-rtti

libxpcqm_la_EXTRA_CXXFLAGS = \
-Wall -Wpointer-arith -Woverloaded-virtual -Wsynth -Wno-ctor-dtor-privacy -Wno-non-virtual-dtor \
 -Wcast-align -Wno-invalid-offsetof -Wno-variadic-macros -Werror=return-type  \
-fno-strict-aliasing -fpascal-strings -fno-common -fshort-wchar -pthread \
  -Wmost -Wno-four-char-constants -Wno-unknown-pragmas \
  -DXP_MACOSX=1 -DNO_X11=1 -DUSE_SYSTEM_CONSOLE=1 \
  -pipe -fmessage-length=0
libxpcqm_la_EXTRA_LDFLAGS = \
  -shrext .dylib -Wl,-framework,Carbon -Wl,-framework,System \
  -Wl,-framework,XUL
libxpcqm_la_EXTRA_LIBS = libxpcqmobjc.a

noinst_LIBRARIES = libxpcqmobjc.a
libxpcqmobjc_a_SOURCES = XPCNativeWidgetCocoa.cpp
libxpcqmobjc_a_CXXFLAGS = -ObjC++ $(libxpcqm_la_CXXFLAGS)


else

############################
# Other UNIX Build definitions

libxpcqm_la_EXTRA_CXXFLAGS = -DXP_UNIX -DMOZ_X11 @GTK2_CFLAGS@ -D__STDC_LIMIT_MACROS
libxpcqm_la_EXTRA_LDFLAGS =
libxpcqm_la_EXTRA_LIBS = @GTK2_LIBS@
libxpcqm_la_SOURCES += XPCNativeWidgetGDK.cpp

endif

############################
# common definitions

libxpcqm_la_CXXFLAGS = \
  -DXPCQM_EXPORTS=1 \
  @MODULES_CXXFLAGS@ \
  @BOOST_CPPFLAGS@ \
  @SCR_CPPFLAGS@ \
  @XPCOM_CPPFLAGS@ \
  $(libxpcqm_la_EXTRA_CXXFLAGS) \
  -DUSE_XPCOM -DMOZ_NO_MOZALLOC -Wall -Wno-non-virtual-dtor \
  -I$(top_srcdir) -I$(srcdir) \
  @XPCOM_CPPFLAGS@ \
  $(NULL)

libxpcqm_la_LDFLAGS = \
  @MODULES_LDFLAGS@ \
  -L../sysdep \
  -L../qsys \
  @SCR_LDFLAGS@ \
  -L../qlib \
  -L@XULRUNNER_SDK_PATH@/sdk/lib/ \
  -L@XULRUNNER_SDK_PATH@/lib/ \
  @JS_LDFLAGS@ \
  @BOOST_LDFLAGS@ \
  @CGAL_LDFLAGS@ \
  $(libxpcqm_la_EXTRA_LDFLAGS)

libxpcqm_la_LIBADD = \
 $(libxpcqm_la_EXTRA_LIBS) \
  @MODULES_LDADD@ \
 -lsysdep \
 -lqsys \
 @SCR_LDADD@ \
 -lqlib \
 -lxpcomglue_s_nomozalloc \
@JS_LDADD@ \
@CGAL_LIBADD@ \
@BOOST_THREAD_LIB@ \
$(NULL)

############################

xpcom_DATA = $(IDL_XPT)

BUILT_SOURCES=\
$(IDL_HDR) $(IDL_XPT)

CLEANFILES=\
$(IDL_HDR) $(IDL_XPT)

