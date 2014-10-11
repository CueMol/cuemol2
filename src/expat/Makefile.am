# Process this file with automake to produce Makefile.in.
# $Id: Makefile.am,v 1.1 2007/12/31 19:24:35 rishitani Exp $

AUTOMAKE_OPTIONS = 1.4 foreign

AM_CPPFLAGS = -DHAVE_EXPAT_CONFIG_H
AM_CFLAGS = -fPIC -DPIC @CFLAGS_VIS_HIDDEN@

lib_LIBRARIES = libexpat.a
libexpat_a_SOURCES = \
	xmlparse.c \
	xmlrole.c \
	xmltok.c \
	xmltok_impl.c

