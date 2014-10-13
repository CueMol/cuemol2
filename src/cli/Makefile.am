##
## $Id: Makefile.am,v 1.15 2009/12/23 10:04:04 rishitani Exp $
##

pkgdata_DATA = \
$(top_srcdir)/xul_gui/sysconfig.xml \
$(NULL)

mydatadir = $(pkgdatadir)/data/
mydata_DATA = \
$(top_srcdir)/xul_gui/data/prot_top.xml \
$(top_srcdir)/xul_gui/data/prot_props.xml \
$(top_srcdir)/xul_gui/data/nucl_top.xml \
$(top_srcdir)/xul_gui/data/nucl_props.xml \
$(top_srcdir)/xul_gui/data/sugar_top.xml \
$(top_srcdir)/xul_gui/data/mono_top.xml \
$(top_srcdir)/xul_gui/data/default_params.xml \
$(top_srcdir)/xul_gui/data/symop.dat \
$(top_srcdir)/xul_gui/data/default_style.xml \
$(NULL)

scriptdir = $(pkgdatadir)/scripts/
script_DATA = \
$(top_srcdir)/xul_gui/scripts/startup.js \
$(top_srcdir)/xul_gui/scripts/utils.js \
$(NULL)

##########

bin_PROGRAMS = cuetty

cuetty_SOURCES = \
TTYView.cpp \
cli_main.cpp

cuetty_CXXFLAGS = \
  @BOOST_CPPFLAGS@ \
  -I$(top_srcdir) \
  -I$(srcdir) \
  -DDEFAULT_CONFIG=\"$(pkgdatadir)/sysconfig.xml\"

cuetty_LDADD = \
  @MODULES_LDADD@ \
  @SCR_LDADD@ \
  -lqsys \
  -lgfx \
  -lqlib \
  -lpcre \
  -lexpat \
  @JS_LDADD@ \
  @XMLRPC_LIBADD@ \
  @BOOST_FILESYSTEM_LIB@ \
  @BOOST_SYSTEM_LIB@ \
  @BOOST_THREAD_LIB@ \
  @CGAL_LIBADD@ \
$(NULL)

#  -static
cuetty_LDFLAGS= \
  @MODULES_LDFLAGS@ \
  @SCR_LDFLAGS@ \
  -L../qsys \
  -L../gfx \
  -L../qlib \
  -L../pcre \
  -L../expat \
  @JS_LDFLAGS@ \
  @XMLRPC_LDFLAGS@ \
  @BOOST_LDFLAGS@ \
  @CGAL_LDFLAGS@ \
$(NULL)


