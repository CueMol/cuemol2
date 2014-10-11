# Process this file with automake to produce Makefile.in.
# $Id$

AUTOMAKE_OPTIONS = 1.4 foreign

bin_PROGRAMS = blendpng

blendpng_SOURCES   = blendpng.cpp

blendpng_CXXFLAGS = \
  -I$(top_srcdir) -I$(srcdir) \
$(NULL)

blendpng_LDADD = ../libpng/libqmpng.la ../zlib/libqmzlib.la


