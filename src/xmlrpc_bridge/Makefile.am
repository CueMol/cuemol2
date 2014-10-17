######################################################
#
# xmlrpc bridge module makefile
#

######################################################
# C++ mcinfo generation rule
# include $(top_srcdir)/mcwgen.am

######################################################

lib_LTLIBRARIES = libxrbr.la

libxrbr_la_SOURCES = \
xrbr.cpp \
XmlRpcMgr.cpp \
$(NULL)

libxrbr_la_CXXFLAGS = \
  @CFLAGS_VIS_HIDDEN@ \
  @CXXFLAGS_VIS_HIDDEN@ \
  -DXRBR_EXPORTS=1 \
 -I$(top_srcdir) -I$(srcdir) \
 @XMLRPC_CPPFLAGS@ \
 @BOOST_CPPFLAGS@ \
 $(NULL)

libxrbr_la_LIBADD = @XMLRPC_LIBADD@

libxrbr_la_LDFLAGS = @XMLRPC_LDFLAGS@
