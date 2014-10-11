# Process this file with automake to produce Makefile.in.
# $Id: Makefile.am,v 1.4 2009/01/03 04:04:01 rishitani Exp $

AUTOMAKE_OPTIONS = 1.4 foreign subdir-objects

bin_PROGRAMS = js
noinst_PROGRAMS = jskwgen jscpucfg

lib_LIBRARIES = libjs.a
libjs_a_SOURCES = \
src/jsapi.c \
src/jsarena.c \
src/jsarray.c  \
src/jsatom.c  \
src/jsbool.c  \
src/jscntxt.c  \
src/jsdate.c  \
src/jsdbgapi.c  \
src/jsdhash.c  \
src/jsdtoa.c  \
src/jsemit.c  \
src/jsexn.c  \
src/jsfile.c  \
src/jsfun.c  \
src/jsgc.c  \
src/jshash.c  \
src/jsinterp.c  \
src/jsiter.c  \
src/jslock.c  \
src/jslog2.c  \
src/jslong.c  \
src/jsmath.c  \
src/jsnum.c  \
src/jsobj.c  \
src/jsopcode.c \
src/jsparse.c  \
src/jsprf.c  \
src/jsregexp.c \
src/jsscan.c  \
src/jsscope.c  \
src/jsscript.c  \
src/jsstr.c  \
src/jsutil.c  \
src/jsxdrapi.c  \
src/jsxml.c  \
src/prmjtime.c 

##

src/jsautokw.h: jskwgen
	./jskwgen > @srcdir@/src/jsautokw.h

src/jsscan.c: src/jsautokw.h

src/jsautocfg.h: jscpucfg
	./jscpucfg > @srcdir@/src/jsautocfg.h

src/jsapi.c: src/jsautocfg.h

###########################################                   

jskwgen_SOURCES   = src/jskwgen.c

jscpucfg_SOURCES   = src/jscpucfg.c
                   
###########################################                   

js_SOURCES   = src/js.c src/jsshell.msg
js_LDADD     = libjs.a

