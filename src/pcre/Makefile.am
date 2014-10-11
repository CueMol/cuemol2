#######################################################
##
##  $Id: Makefile.am,v 1.1 2008/04/12 14:57:19 rishitani Exp $
##

AUTOMAKE_OPTIONS = foreign

INCLUDES = -I.

#######################################################

lib_LIBRARIES = libpcre.a

AM_CPPFLAGS = -DPOSIX_MALLOC_THRESHOLD=10
AM_CFLAGS = -fPIC -DPIC @CFLAGS_VIS_HIDDEN@

libpcre_a_SOURCES = \
get.c  maketables.c  pcre.c  study.c

