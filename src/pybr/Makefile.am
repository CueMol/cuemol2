######################################################
#
# pybr module makefile
#

######################################################
# C++ mcinfo generation rule
# include $(top_srcdir)/mcwgen.am

######################################################

lib_LTLIBRARIES = libpybr.la

libpybr_la_SOURCES = \
pybr.cpp \
wrapper.cpp \
convert.cpp \
methodobj.cpp \
$(NULL)

libpybr_la_CXXFLAGS = \
  @CFLAGS_VIS_HIDDEN@ \
  @CXXFLAGS_VIS_HIDDEN@ \
  -DPYBR_EXPORTS=1 \
 -DXP_UNIX \
 -I$(top_srcdir) -I$(srcdir) \
 @PYTHON_CPPFLAGS@ \
 @BOOST_CPPFLAGS@ \
 $(NULL)

