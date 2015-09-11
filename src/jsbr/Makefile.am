######################################################
#
# $Id: Makefile.am,v 1.6 2010/12/27 04:54:39 rishitani Exp $
#

######################################################
# C++ mcinfo generation rule
# include $(top_srcdir)/mcwgen.am

######################################################

# noinst_LTLIBRARIES = libjsbr.la
lib_LTLIBRARIES = libjsbr.la

libjsbr_la_SOURCES = \
jsbr.cpp \
Interp.cpp \
ObjWrapper.cpp

libjsbr_la_CXXFLAGS = \
  @CFLAGS_VIS_HIDDEN@ \
  @CXXFLAGS_VIS_HIDDEN@ \
  -DJSBR_EXPORTS=1 \
 -DXP_UNIX \
 -I$(top_srcdir) -I$(srcdir) \
 @JS_CPPFLAGS@ \
 @BOOST_CPPFLAGS@ \
 $(NULL)

libjsbr_la_LIBADD = \
 @JS_LDADD@ \
 $(NULL)

libjsbr_la_LDFLAGS = \
 @JS_LDFLAGS@ \
 $(NULL)
