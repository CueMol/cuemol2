##
## $Id: Makefile.am,v 1.18 2010/02/12 14:38:53 rishitani Exp $
##

include $(top_srcdir)/mcwgen.am

######################################################

plugin_LTLIBRARIES = npcuemol.la

CPP_SRC = \
  np_entry.cpp \
  npn_gate.cpp \
  npp_gate.cpp \
  Plugin.cpp \
  PluginModule.cpp \
  NP_ScrPluginObj.cpp \
  NP_Wrapper.cpp

if COND_BUILD_OSX

############################
# MacOS X Build definitions

DEP_SRC = OSXPlugin.cpp np_entry_osx.cpp
# plugin_DATA=Info.plist
noinst_DATA = CueMol2Plugin.rsrc 
# plugin_SCRIPTS = CueMol2Plugin.plugin

CueMol2Plugin.rsrc: $(srcdir)/np_osx.r
	/Developer/Tools/Rez -useDF /Developer/Headers/FlatCarbon/Types.r $< -o $@

CueMol2Plugin.plugin: CueMol2Plugin.rsrc $(plugin_LTLIBRARIES)
	rm -Rf "$@"
	$(INSTALL) -d "$@/Contents/MacOS/lib"
	$(INSTALL) -d "$@/Contents/Resources"
	$(INSTALL) -m 644  CueMol2Plugin.rsrc "$@/Contents/Resources/CueMol2Plugin.rsrc"
	$(INSTALL) -m 644  $(srcdir)/Info.plist "$@/Contents/Info.plist"
	echo BUILD_DIR = $(builddir)
	echo SRC_DIR = $(srcdir)
	echo plugin_LTLIBRARIES $(plugin_LTLIBRARIES)
	$(INSTALL) ./.libs/npcuemol.dylib "$@/Contents/MacOS/CueMol2Plugin"

npcuemol_EXTRA_CXXFLAGS = \
  -F/System/Library/Frameworks/CoreFoundation.framework \
  -I/Developer/Headers/FlatCarbon -fno-common -fpascal-strings \
  -Wmost -Wno-four-char-constants -Wno-unknown-pragmas \
  -DUSE_SYSTEM_CONSOLE=1 -pipe -fmessage-length=0

npcuemol_EXTRA_LDFLAGS = \
-no-undefined -bundle -Wl,-read_only_relocs -Wl,suppress \
-Wl,-headerpad_max_install_names -shrext .dylib -Wl,-framework,Carbon -Wl,-framework,System 

install-exec-local: CueMol2Plugin.plugin
	rm -rf $(plugindir)/CueMol2Plugin.plugin
	cp -R $(builddir)/CueMol2Plugin.plugin $(plugindir)

else

############################
# Other UNIX Build definitions

DEP_SRC = X11Plugin.cpp np_entry_unix.cpp
npcuemol_EXTRA_CXXFLAGS = 
npcuemol_EXTRA_LDFLAGS =
endif

npcuemol_la_SOURCES = $(CPP_SRC) $(DEP_SRC)

npcuemol_la_CXXFLAGS = \
@BOOST_CPPFLAGS@ \
$(npcuemol_EXTRA_CXXFLAGS) \
-Wall -I$(top_srcdir) -I$(srcdir) @GL_CPPFLAGS@ @NP_CPPFLAGS@ 

npcuemol_la_LDFLAGS = \
 $(npcuemol_EXTRA_LDFLAGS) \
 -module -avoid-version @GL_LDFLAGS@ @BOOST_LDFLAGS@

npcuemol_la_LIBADD = \
 ../qsys/libqsys.la \
 ../qlib/libqlib.la @GL_LIBADD@ @NP_LIBADD@ @BOOST_THREAD_LIB@

