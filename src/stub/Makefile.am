# Process this file with automake to produce Makefile.in.

# AUTOMAKE_OPTIONS = 1.4 foreign

bin_PROGRAMS = cuemol

cuemol_SOURCES = osx_stub.cpp

cuemol_CXXFLAGS = \
-pthread -DXP_MACOSX=1 -DNO_X11=1 -DUSE_SYSTEM_CONSOLE=1 \
@XPCOM_CPPFLAGS@ \
$(libxpcqm_la_EXTRA_CXXFLAGS) \
-DUSE_XPCOM -DMOZ_NO_MOZALLOC -Wall -Wno-non-virtual-dtor \
-I$(top_srcdir) -I$(srcdir) \
@XPCOM_CPPFLAGS@ \
-std=c++11 \
$(NULL)

cuemol_LDFLAGS = \
 -L@XULRUNNER_SDK_PATH@/sdk/lib/ \
 -L@XULRUNNER_SDK_PATH@/lib/ \
 -lxpcomglue \
 -Wl,-framework,Carbon -Wl,-framework,System \
$(NULL)
