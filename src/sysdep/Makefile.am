######################################################
#
# cuemol2 sysdem dependent library
#

######################################################

# Common C++ source files
CPP_SRC = \
sysdep.cpp \
MouseEventHandler.cpp \
$(NULL)

######################################################
# UN*X/XGL Build definitions

if COND_BUILD_X11
DEP_SRC = \
XglView.cpp \
XglDisplayContext.cpp \
OglView.cpp \
OglDisplayList.cpp \
OglDisplayContext.cpp \
OglFBOView.cpp \
OglProgramObject.cpp \
Canvas2DTextRender2.cpp \
$(NULL)
endif

######################################################
# MacOS X/CGL Build definitions

if COND_BUILD_OSX
DEP_SRC = \
CglView.cpp \
CglDisplayContext.cpp \
OglView.cpp \
OglDisplayList.cpp \
OglDisplayContext.cpp \
OglFBOView.cpp \
OglProgramObject.cpp \
Canvas2DTextRender2.cpp \
$(NULL)
endif

######################################################
# iOS Build definitions

if COND_BUILD_IPHONEOS
DEP_SRC = \
GLESView.cpp \
GLES1View.cpp \
GLES1DisplayContext.cpp \
GLES1DisplayList.cpp \
GLES2View.cpp \
GLES2DisplayContext.cpp \
OglProgramObject.cpp \
$(NULL)
endif

######################################################
# GLSL shader files

shaderdir = $(prefix)/data/shaders/

shader_DATA = \
lib_common.glsl \
default_vert.glsl \
default_frag.glsl \
edge_vert.glsl \
edge_frag.glsl \
silh_vert.glsl \
silh_frag.glsl \
es2_default_vert.glsl \
es2_default_frag.glsl \
$(NULL)

######################################################
# sysdep libtool library

lib_LTLIBRARIES = libsysdep.la

libsysdep_la_SOURCES = \
$(CPP_SRC) \
$(DEP_SRC) \
$(NULL)

libsysdep_la_CXXFLAGS = \
  @CFLAGS_VIS_HIDDEN@ \
  @CXXFLAGS_VIS_HIDDEN@ \
  -DSYSDEP_EXPORTS=1 \
  -I$(top_srcdir) -I$(srcdir) \
  @BOOST_CPPFLAGS@ \
  @GLEW_CPPFLAGS@ \
  $(NULL)

libsysdep_la_LIBADD = -lqlib @GLEW_LIBADD@

libsysdep_la_LDFLAGS = -L../qlib @GLEW_LDFLAGS@

#####################################

include $(top_srcdir)/mcwgen_footer.am

