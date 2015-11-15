# Process this file with autoconf to produce a configure script.

AC_INIT(cuemol2, 2.2.0, [http://www.cuemol.org/])
AM_INIT_AUTOMAKE([subdir-objects foreign])

# Initialize with some random file to ensure the source is here.
AC_CONFIG_SRCDIR(qlib/LString.cpp)

AM_CONFIG_HEADER(config.h)
AM_CONFIG_HEADER(expat/expat_config.h)

sinclude(conftools/ac_c_bigendian_cross.m4)
sinclude(conftools/ac_c_float_format.m4)

sinclude(conftools/ax_check_compile_flag.m4)

sinclude(conftools/ax_boost_base.m4)
sinclude(conftools/ax_boost_thread.m4)
sinclude(conftools/ax_boost_system.m4)
sinclude(conftools/ax_boost_filesystem.m4)
dnl sinclude(conftools/ax_boost_iostreams.m4)
sinclude(conftools/ax_cxx_compile_stdcxx_0x.m4)
sinclude(conftools/ax_cxx_compile_stdcxx_11.m4)

sinclude(conftools/ax_have_qt.m4)
dnl sinclude(conftools/bnv_have_qt.m4)

#######################################################
# LIBTOOL

LT_INIT

#######################################################
# Checks for programs.
#
AC_PROG_CC
AC_PROG_CPP
AC_PROG_CXX
AC_PROG_CXXCPP
# AC_PROG_RANLIB
AC_PROG_MAKE_SET
AC_PROG_INSTALL
AC_PROG_YACC
AM_PROG_LEX

# check perl
AC_CHECK_PROG(HAVE_PERL, perl, yes)
if test x$HAVE_PERL = x ; then
  AC_MSG_ERROR(require perl interpreter)
fi

# this program requires C++ compiler
if test x$CXX = x ; then
  AC_MSG_ERROR(require C++ compiler)
fi

AC_LANG_CPLUSPLUS

AC_CHECK_SIZEOF(char)
AC_CHECK_SIZEOF(short)
AC_CHECK_SIZEOF(int)
AC_CHECK_SIZEOF(long)
AC_CHECK_SIZEOF(long long)
AC_CHECK_SIZEOF(float)
AC_CHECK_SIZEOF(double)
AC_CHECK_SIZEOF(void*)

AC_C_BIGENDIAN_CROSS
gcc_AC_C_FLOAT_FORMAT

# Checks for compiler feature (visibility attr support)

CFLAGS_VIS_HIDDEN=
CXXFLAGS_VIS_HIDDEN=

AC_ARG_ENABLE(gccvisattr,
    [--enable-gccvisattr         Use gcc-style visibility attr],
    [AX_CHECK_COMPILE_FLAG([-fvisibility=hidden],
                           [CFLAGS_VIS_HIDDEN="-fvisibility=hidden"
                            AC_DEFINE(MB_HAVE_GCC_VIS_ATTR, [1], [Use gcc-style visibility attr])],
                           [])
     AX_CHECK_COMPILE_FLAG([-fvisibility-inlines-hidden],
                           [CXXFLAGS_VIS_HIDDEN="-fvisibility-inlines-hidden"],
                           [])],
    [])

AC_SUBST(CFLAGS_VIS_HIDDEN)
AC_SUBST(CXXFLAGS_VIS_HIDDEN)

##########################################################
#
# Checks for common functions
#

AC_CHECK_FUNCS(strdup strstr strcasecmp strncasecmp)
AC_CHECK_FUNCS(strerror select signal)
AC_CHECK_FUNCS(vsnprintf newlocale freelocale vsnprintf_l strtod_l)
AC_CHECK_FUNCS(memmove bcopy)

AC_CHECK_LIB([m],[cos])
AC_CHECK_FUNCS(isfinite)
AC_CHECK_FUNCS(finite)

AC_CHECK_HEADERS(stdarg.h)
AC_CHECK_HEADERS(dirent.h)
AC_CHECK_HEADERS(fcntl.h unistd.h sys/wait.h spawn.h)
AC_CHECK_HEADERS(locale.h xlocale.h)

#######################################################
#
# check for build type (full editor/lw viewer)
#

BUILD_LW=
AC_ARG_ENABLE(lightweight,
    [--enable-lightweight         build lightweight version],
    [if test $enableval = yes ; then
	AC_DEFINE(QM_BUILD_LW, [], [Enable lightweight version build])
	BUILD_LW=yes
     fi],
    [])

AM_CONDITIONAL(COND_BUILD_LW, test x$BUILD_LW = xyes)

#######################################################
#
# check for debug flags
#

AC_ARG_ENABLE(debug,
    [--disable-debug         disable debug],
    [if test $enableval = yes ; then
	AC_DEFINE(MB_DEBUG, [], [Enable debug code/verbose log display])
     fi],
    [AC_DEFINE(MB_DEBUG, [], [Enable debug code/verbose log display])
    ])

if test x$enable_shared = xyes ; then
    LIBQLIB_LIBADD="\$(top_builddir)/pcre/libpcre.a \$(top_builddir)/expat/libexpat.a"
    AC_SUBST(LIBQLIB_LIBADD)
fi

#######################################################
#
# check for OS type
#

echo "host_os: $host_os"
echo "target_os: $target_os"

BUILD_UI=
BUILD_OSDEP=
BUILD_BIT=

dnl Whether 32- or 64-bit build?
case "$host_cpu" in
i?86 | x86_64)
    AC_ARG_ENABLE(m64,
        [--enable-m64         enable 64-bit build],
        [if test $enableval = yes ; then
            BUILD_BIT=64
         else
            BUILD_BIT=32
            CFLAGS="$CFLAGS -m32"
            CXXFLAGS="$CXXFLAGS -m32"
         fi],
         [
            BUILD_BIT=32
            CFLAGS="$CFLAGS -m32"
            CXXFLAGS="$CXXFLAGS -m32"
         ])
    AC_MSG_RESULT(${BUILD_BIT}-bit build)
    ;;
esac

#######################################################
#
# for expat XML parser (local)
#

dnl Some basic configuration:
AC_DEFINE([XML_NS], 1,
          [Define to make XML Namespaces functionality available.])
AC_DEFINE([XML_DTD], 1,
          [Define to make parameter entity parsing functionality available.])
AC_DEFINE([XML_CONTEXT_BYTES], 1024,
          [Define to specify how much context to retain around the current parse point.])

#######################################################
#
# check for PNG location (local)
#

PNG_CPPFLAGS=""
PNG_LDFLAGS=""
PNG_LIBADD=""
AC_SUBST(PNG_CPPFLAGS)
AC_SUBST(PNG_LDFLAGS)
AC_SUBST(PNG_LIBADD)

#######################################################
#
# check for BOOST C++ library
#

AX_BOOST_BASE
AX_BOOST_SYSTEM

# Code trying to link with -lboost_thread (newer than 1.56?) in AX_BOOST_THREAD requires -lboost_system!!
_tmp_save_libs="${LIBS}"
LIBS="${BOOST_SYSTEM_LIB} ${LIBS}"
AX_BOOST_THREAD
LIBS=${_tmp_libs}

AX_BOOST_FILESYSTEM
dnl AX_BOOST_IOSTREAMS

echo ==== BOOST library config ====
echo BOOST_CPPFLAGS: $BOOST_CPPFLAGS
echo BOOST_SYSTEM_LIB: $BOOST_SYSTEM_LIB
echo BOOST_FILESYSTEM_LIB: $BOOST_FILESYSTEM_LIB
echo BOOST_THREAD_LIB: $BOOST_THREAD_LIB
echo BOOST_LDFLAGS: $BOOST_LDFLAGS
echo ax_cv_boost_thread: $ax_cv_boost_thread
echo ax_cv_boost_filesystem: $ax_cv_boost_filesystem
echo ==============================

if test x$ax_cv_boost_thread != xyes ; then
   AC_MSG_ERROR(requires boost::thread library)
fi

if test x$ax_cv_boost_filesystem != xyes ; then
   AC_MSG_ERROR(requires boost::filesystem library)
fi

AC_SUBST(BOOST_LDFLAGS)
AC_SUBST(BOOST_CPPFLAGS)

#######################################################
#
# check for OpenGL (CGL for mac; XGL for unix)
#

USE_OPENGL=

if test x$GUI_ARCH != xCLI ; then
# GL is only checked in non-CLI builds
GL_CPPFLAGS=
GL_LDFLAGS=
GL_LIBADD=

AC_CHECK_HEADERS([GL/gl.h OpenGL/gl.h])
AC_CHECK_HEADERS([GL/glu.h OpenGL/glu.h])
AC_CHECK_HEADERS([GL/glext.h OpenGL/glext.h],[],[],
[
# ifdef HAVE_GL_GL_H
#   include <GL/gl.h>
# elif defined(HAVE_OPENGL_GL_H)
#   include <OpenGL/gl.h>
# else
#   error no gl.h
# endif
])

# Define the OpenGL check program source
m4_define([CHECK_GL_PROGRAM],
          [AC_LANG_PROGRAM([[
# ifdef HAVE_GL_GL_H
#   include <GL/gl.h>
# elif defined(HAVE_OPENGL_GL_H)
#   include <OpenGL/gl.h>
# else
#   error no gl.h
# endif
# ifdef HAVE_GL_GLU_H
#   include <GL/glu.h>
# elif defined(HAVE_OPENGL_GLU_H)
#   include <OpenGL/glu.h>
# else
#   error no glu.h
# endif]],
[[glBegin(0);gluBeginCurve(0)]])])

gl_save_LIBS="${LIBS}"

case $host_os in
     darwin*)
       # Check OpenGL/GLU functions
       LIBS="-framework OpenGL ${gl_save_LIBS}"
       AC_LINK_IFELSE([CHECK_GL_PROGRAM],
		[
       GL_CPPFLAGS=
       GL_LDFLAGS="-framework OpenGL"
       GL_LIBADD=
		],
		[
       GL_CPPFLAGS=
       GL_LDFLAGS=
       GL_LIBADD=
		])

       LIBS=${gl_save_LIBS}
       USE_OPENGL=yes
     ;;
     *)
       # TO DO: Check OpenGL/GLU, and XGL functions HERE!!
       GL_CPPFLAGS=
       GL_LDFLAGS=
       GL_LIBADD="-lGLU -lGL"
       USE_OPENGL=yes
     ;;
esac

AC_SUBST(GL_CPPFLAGS)
AC_SUBST(GL_LIBADD)
AC_SUBST(GL_LDFLAGS)

fi

if test x$USE_OPENGL = xyes ; then
    AC_DEFINE([USE_OPENGL], [1], [Use OpenGL])
fi
AM_CONDITIONAL(COND_USE_OPENGL, test x$USE_OPENGL = xyes)

#
#  GLEW library
#
GLEW_PATH=
GLEW_CPPFLAGS=
GLEW_LIBADD=
GLEW_LDFLAGS=
test "${with_glew+set}" != "set" && with_glew=no
AC_MSG_CHECKING(GLew location)
AC_ARG_WITH(glew,
[  --with-glew[=DIR]      Look for GLew in DIR (default=no) ],
[  case "$with_glew" in
  no)
    AC_MSG_RESULT($with_glew)
    ;;
  *)
    AC_MSG_RESULT($with_glew)
    _cppflags=${CPPFLAGS}
    CPPFLAGS="-I$with_glew/include $CPPFLAGS"
    AC_CHECK_HEADERS(GL/glew.h, [ GLEW_PATH=$with_glew
    				  AC_DEFINE(HAVE_GLEW,[1],[Use GLew]) ],,)
    CPPFLAGS=$_cppflags
    if test x$GLEW_PATH = x ; then
      AC_MSG_ERROR(incorrect GLew location)
    fi
    GLEW_CPPFLAGS=-I${GLEW_PATH}/include
    GLEW_LDFLAGS=-L${GLEW_PATH}/lib
    GLEW_LIBADD=-lGLEW
    ;;
  esac]
)
AC_SUBST(GLEW_CPPFLAGS)
AC_SUBST(GLEW_LDFLAGS)
AC_SUBST(GLEW_LIBADD)

#
#  Check GLES1/GLES2 (usually for mobile device)
#
AC_ARG_ENABLE(gles2,
    [--enable-gles2         Use GLES2 API],
    [if test $enableval = yes ; then
	AC_DEFINE(USE_GLES2, [1], [Use GLES2 API],,)
     fi],
    [])

#########################################
#
# Check for scripting/rmi interfaces
#

#
# Javascript supports (internal JS)
#

BUILD_SCR=
JS_CPPFLAGS=
JS_LDADD=
JS_LDFLAGS=
SCR_CPPFLAGS=
SCR_LDADD=
SCR_LDFLAGS=

dnl if test x$GUI_ARCH = xCLI ; then
    # Use internal js impl in the standalone CLI build
    BUILD_SCR="$BUILD_SCR js jsbr"
    # overall settings
    SCR_CPPFLAGS="-DHAVE_JAVASCRIPT"
    SCR_LDADD="-ljsbr"
    SCR_LDFLAGS="-L\$(top_builddir)/jsbr"
    # jsbr module settings
    JS_CPPFLAGS="-I../js/src/ -DUSE_INTERNAL_JS"
    JS_LDADD="-ljs"
    JS_LDFLAGS="-L\$(top_builddir)/js"
    AC_CONFIG_SUBDIRS([js])

AC_SUBST(JS_CPPFLAGS)
AC_SUBST(JS_LDADD)
AC_SUBST(JS_LDFLAGS)

#
# Python supports
#

# embedding type support
AC_ARG_ENABLE(python,
    [--enable-python         Enable python embedding support],
    [
if test $enableval = yes ; then
   dnl check python inc/lib
   AM_PATH_PYTHON(2.7.0)
   PY_PREFIX=`$PYTHON -c 'import sys ; print sys.prefix'`
   PYTHON_CPPFLAGS="-I$PY_PREFIX/include/python$PYTHON_VERSION"
   PYTHON_LDADD="-lpython$PYTHON_VERSION"
   PYTHON_LDFLAGS="-L$PY_PREFIX/lib"
   echo "Python prefix: " $PY_PREFIX ", version: " $PYTHON_VERSION
   AC_SUBST([PYTHON_CPPFLAGS])
   AC_SUBST([PYTHON_LDADD])
   AC_SUBST([PYTHON_LDFLAGS])
   BUILD_SCR="$BUILD_SCR pybr"
   SCR_CPPFLAGS="$SCR_CPPFLAGS -DHAVE_PYTHON"
   SCR_LDADD="$SCR_LDADD -lpybr $PYTHON_LDADD"
   SCR_LDFLAGS="$SCR_LDFLAGS -L\$(top_builddir)/pybr"
fi
    ],
    [])

# module type support
BUILD_PYMODULE=
AC_ARG_ENABLE(pymodule,
    [--enable-pymodule         Enable python module support],
    [
if test $enableval = yes ; then
   if test x$PYTHON_CPPFLAGS != x ; then
      AC_MSG_ERROR(--enable-python and --enable-pymodule are exclusive)
   fi
   dnl check python inc/lib
   AM_PATH_PYTHON(2.7.0)
   PY_PREFIX=`$PYTHON -c 'import sys ; print sys.prefix'`
   PYTHON_CPPFLAGS="-I$PY_PREFIX/include/python$PYTHON_VERSION"
   PYTHON_LDFLAGS="-L$PY_PREFIX/lib"
   PYTHON_LDADD="-lpython$PYTHON_VERSION"
   echo "Python prefix: " $PY_PREFIX ", version: " $PYTHON_VERSION
   AC_SUBST([PYTHON_CPPFLAGS])
   AC_SUBST([PYTHON_LDADD])
   AC_SUBST([PYTHON_LDFLAGS])
   BUILD_PYMODULE=yes
   BUILD_UI="$BUILD_UI pybr"
fi
    ],
    [])

AM_CONDITIONAL(COND_BUILD_PYMODULE, test x$BUILD_PYMODULE = xyes)

#
# XML-RPC supports
#

XMLRPC_CPPFLAGS=
XMLRPC_LIBADD=
XMLRPC_LDFLAGS=

# AC_MSG_CHECKING(XML-RPC-C library location)
AC_ARG_WITH(xmlrpc,
[  --with-xmlrpc[=DIR]      Look for XML-RPC-C library in DIR (default=no) ],
[ case "$with_xmlrpc" in
  no)
    
    ;;
  *)
    AC_MSG_RESULT($with_xmlrpc)
    _cppflags=${CPPFLAGS}
    CPPFLAGS="-I$with_xmlrpc/include $CPPFLAGS"
    AC_CHECK_HEADERS([xmlrpc-c/base.h],,[AC_MSG_ERROR(xmlrpc-c/base.h not found)],[])

    AC_CHECK_DECLS(xmlrpc_version,
                   [XMLRPC_CPPFLAGS="-I$with_xmlrpc/include"],
		   [AC_MSG_ERROR(xmlrpc_version() not found)],
		   [#include <xmlrpc-c/base.h>])
    CPPFLAGS=$_cppflags

    _ldflags=${LDFLAGS}
    _libs=${LIBS}
    LDFLAGS="-L$with_xmlrpc/lib $LDFLAGS"
    LIBS="-lxmlrpc_server_abyss++ -lxmlrpc_server++ -lxmlrpc_server_abyss -lxmlrpc_server -lxmlrpc_abyss -lpthread -lxmlrpc++ -lxmlrpc -lxmlrpc_util -lxmlrpc_xmlparse -lxmlrpc_xmltok $LIBS"
    AC_CHECK_LIB(xmlrpc, xmlrpc_version,
                 [XMLRPC_LDFLAGS="-L$with_xmlrpc/lib"
		  XMLRPC_LIBADD=" -lxmlrpc_server_abyss++ -lxmlrpc_server++ -lxmlrpc_server_abyss -lxmlrpc_server -lxmlrpc_abyss -lpthread -lxmlrpc++ -lxmlrpc -lxmlrpc_util -lxmlrpc_xmlparse -lxmlrpc_xmltok"],
		 [AC_MSG_ERROR(xmlrpc_version() not found)],
		 [])
    LDFLAGS=$_ldflags
    LIBS=$_libs

    ;;
  esac ],
[   AC_CHECK_HEADERS([xmlrpc-c/base.h],,[AC_MSG_ERROR(xmlrpc-c/base.h not found)],[])
    AC_CHECK_DECLS(xmlrpc_version,
                   [],
		   [AC_MSG_ERROR(xmlrpc_version() not found)],
		   [#include <xmlrpc-c/base.h>])
    AC_CHECK_LIB(xmlrpc, xmlrpc_version,
                 [XMLRPC_LIBADD=" -lxmlrpc_server_abyss++ -lxmlrpc_server++ -lxmlrpc_server_abyss -lxmlrpc_server -lxmlrpc_abyss -lpthread -lxmlrpc++ -lxmlrpc -lxmlrpc_util -lxmlrpc_xmlparse -lxmlrpc_xmltok"],
		 [AC_MSG_ERROR(xmlrpc_version() not found)],
		 [])
])

if test x$with_xmlrpc != xno ; then
  BUILD_SCR="$BUILD_SCR xmlrpc_bridge"
  SCR_LDADD="$SCR_LDADD -lxrbr"
  SCR_LDFLAGS="$SCR_LDFLAGS -L\$(top_builddir)/xmlrpc_bridge $XMLRPC_LDFLAGS"
  AC_DEFINE([USE_XMLRPC], [1], [Use XML-RPC service])
fi

AC_SUBST(XMLRPC_CPPFLAGS)
AC_SUBST(XMLRPC_LIBADD)
AC_SUBST(XMLRPC_LDFLAGS)

##

AC_SUBST(BUILD_SCR)
AC_SUBST(SCR_CPPFLAGS)
AC_SUBST(SCR_LDADD)
AC_SUBST(SCR_LDFLAGS)

#######################################################
#
# check for GUI plathome
#

AC_ARG_WITH(ui,
[  --with-ui[=UI_type]      Set build UI type (default=cli) ],
[ case "$with_ui" in
  no)
    AC_MSG_ERROR(requires --with-ui option)
    ;;

  cli)
    AC_MSG_RESULT($with_ui)
    GUI_ARCH=CLI
    BUILD_OSDEP=
    BUILD_UI=cli
    ;;

  xul)
    AC_MSG_RESULT($with_ui)
dnl XUL GUI (X11/OSX)
case $host_os in
     darwin*)
	GUI_ARCH=XUL_OSX
	BUILD_OSDEP="sysdep osxbuild utils stub"

        # make_distr.pl substitutions
        OSXDISTR_ARCH=MacOSX-Intel$BUILD_BIT
        AC_SUBST(OSXDISTR_ARCH)
	if test x$BUILD_BIT = x32 ; then
	    OSXDISTR_LSAP=i386
	else
	    OSXDISTR_LSAP=x86_64
	fi    
        AC_SUBST(OSXDISTR_LSAP)

        dnl OSX/Gecko39 build requires std=c++11 feature (char16_t, etc...)
	_cxxflags=${CXXFLAGS}
        AX_CXX_COMPILE_STDCXX_11(noext,optional)
	if test x$HAVE_CXX11 = x1 ; then
	    dnl if cxx has c++11 feature, save the cxxflags enabling the feature
	    CXX11_CXXFLAGS=${CXXFLAGS}
	fi
	CXXFLAGS=${_cxxflags}
	echo "XXX $CXXFLAGS, $HAVE_CXX11, $CXX11_CXXFLAGS"
     ;;
     *)
	GUI_ARCH=XUL_X11
	BUILD_OSDEP="sysdep uxdist utils"
        dnl Linux/Gecko39 build requires std=c++0x feature (char16_t)
        AX_CXX_COMPILE_STDCXX_0X
	if test $ax_cv_cxx_compile_cxx0x_cxx = yes ; then
	   CXXFLAGS="$CXXFLAGS -std=c++0x"
	else
	   AC_MSG_ERROR(requires c++ with -std=c++0x support)
	fi

#
# pkg-config (for XUL & Linux & X11 & gtk2)
#

m4_ifdef([PKG_CHECK_MODULES], [], [define(PKG_CHECK_MODULES)])

if test x$GUI_ARCH = xXUL_X11 ; then
    echo
    PKG_CHECK_MODULES(GTK2, gtk+-2.0 >= 2.10.0 glib-2.0 gobject-2.0 gdk-x11-2.0)
fi

     ;;
esac
    ;;

  iphoneos)
    AC_MSG_RESULT($with_ui)
    GUI_ARCH=IPHONEOS
    BUILD_OSDEP=sysdep
    ;;

  qt)
    AC_MSG_RESULT(User interface: $with_ui)
    GUI_ARCH=QT
    # BUILD_OSDEP="sysdep utils"
    BUILD_OSDEP="sysdep utils qt_gui"
    BUILD_UI="qt_gui"
    ;;

  *)
    AC_MSG_ERROR(requires valid --with-ui option)
    ;;

  esac],
[
    dnl No --with-ui flag
    AC_MSG_ERROR(requires --with-ui option)
]
)

echo GUI_ARCH: $GUI_ARCH

AC_DEFINE([GUI_ARCH], [$GUI_ARCH], [GUI archtecture])
AM_CONDITIONAL(COND_BUILD_QT, test x$GUI_ARCH = xQT)
AM_CONDITIONAL(COND_BUILD_XULOSX, test x$GUI_ARCH = xXUL_OSX)
AM_CONDITIONAL(COND_BUILD_XULX11, test x$GUI_ARCH = xXUL_X11)
AM_CONDITIONAL(COND_BUILD_IPHONEOS, test x$GUI_ARCH = xIPHONEOS)
AC_SUBST(BUILD_OSDEP)

#######################################################
#
# check for QT
#

if test x$GUI_ARCH == xQT ; then
AC_ARG_WITH(qtdir,
[  --with-qtdir=DIR        Look for QT in DIR ],
[
  QTDIR=$with_qtdir
  QTMOC=$QTDIR/bin/moc

    _cppflags=${CPPFLAGS}
    _cxxflags=${CXXFLAGS}
    CPPFLAGS="-I$with_qtdir/include $CPPFLAGS"
    AC_CHECK_HEADERS(QtCore/QObject)

    AC_CHECK_DECLS(QT_VERSION,
                   [],
		   ,
		   [#include <QtCore/QtGlobal>])

    CPPFLAGS=$_cppflags
    CXXFLAGS=$_cxxflags

if test "x$ac_cv_header_QtCore_QObject" = xyes -a  "x$ac_cv_have_decl_QT_VERSION" = xyes ; then :

fi
    QT_CPPFLAGS="-I$with_qtdir/include -I$with_qtdir/include/QtCore -I$with_qtdir/include/QtGui  -I$with_qtdir/include/QtOpenGL  -I$with_qtdir/include/QtWidgets"

case $host_os in
     darwin*)
     QT_LDFLAGS="-F$with_qtdir/lib"
     QT_LDADD="-framework QtCore -framework QtGui -framework QtOpenGL -framework QtWidgets"
     ;;
     *)
     QT_LDFLAGS="-L$with_qtdir/lib"
     QT_LDADD="-lQtCore -lQtGui -lQtOpenGL -lQtWidgets"
     ;;
esac
],
[
  # No --with-qtdir flag
  QTMOC=moc
  QT_CPPFLAGS=
  QT_LDFLAGS=
  QT_LDADD=
]
)

AC_SUBST(QT_CPPFLAGS)
AC_SUBST(QT_LDADD)
AC_SUBST(QT_LDFLAGS)
AC_SUBST(QTMOC)

SIPFLAGS=`$PYTHON -c 'import PyQt5.QtCore; print PyQt5.QtCore.PYQT_CONFIGURATION[["sip_flags"]]'`

AC_ARG_WITH(pyqtdir,
[  --with-pyqtdir=DIR        Look for PyQT in DIR ],
[
  SIP=sip
  SIPFLAGS="$SIPFLAGS -I $with_pyqtdir/share/sip/Qt5"
],
[
  # No --with-pyqtdir flag
  SIP=sip
]
)

echo SIPFLAGS=$SIPFLAGS
AC_SUBST(SIP)
AC_SUBST(SIPFLAGS)

fi


#######################################################
#
# check for XULRUNNER SDK location
#

if test x$GUI_ARCH == xXUL_OSX -o x$GUI_ARCH == xXUL_X11 ; then

XULRUNNER_SDK_PATH=
test "${with_xulrunner_sdk+set}" != "set" && with_xulrunner_sdk=no
AC_MSG_CHECKING(XULRUNNER SDK location)
AC_ARG_WITH(xulrunner_sdk,
[  --with-xulrunner-sdk[=DIR]      Look for xulrunner SDK in DIR (default=no) ],
[  case "$with_xulrunner_sdk" in
  no)
    AC_MSG_RESULT($with_xulrunner_sdk)
    ;;
  *)
    AC_MSG_RESULT($with_xulrunner_sdk)
    _cppflags=${CPPFLAGS}
    _cxxflags=${CXXFLAGS}
    CPPFLAGS="-I$with_xulrunner_sdk/include $CPPFLAGS"
    if test x$HAVE_CXX11 = x1 ; then
        CXXFLAGS="$CXX11_CXXFLAGS"
    fi
    AC_CHECK_HEADERS(nsXPCOM.h, XULRUNNER_SDK_PATH=$with_xulrunner_sdk,,[#include <mozilla-config.h>])

    AC_CHECK_DECL(NS_InitXPCOM2,
	[XPCOM_CPPFLAGS="-I$with_xulrunner_sdk/include -I$with_xulrunner_sdk/include/nspr";
	 XPCOM_LDFLAGS="-L$with_xulrunner_sdk/lib";
	 BUILD_UI="$BUILD_UI xpcom xul_gui"],,
	[#include <mozilla-config.h>
	 #include<nsXPCOM.h>])

    CPPFLAGS=$_cppflags
    CXXFLAGS=$_cxxflags
    if test x$XULRUNNER_SDK_PATH = x ; then
      AC_MSG_ERROR(incorrect xulrunner SDK location)
    fi

dnl    CFLAGS="-fshort-wchar $CFLAGS"
dnl    CXXFLAGS="-fshort-wchar $CXXFLAGS"

    ;;
  esac]
)
	

AC_SUBST(XULRUNNER_SDK_PATH)
AC_SUBST(XPCOM_CPPFLAGS)
AC_SUBST(XPCOM_LDFLAGS)

fi

#######################################################
#
#  Module-specific configs
#

BUILD_MODULES=
MODULES_LDADD=
MODULES_LDFLAGS=
MODULES_CXXFLAGS=

if test x$BUILD_LW != xyes ; then
  # Build full-functional editor version
  BUILD_MODULES="modules/molstr modules/molvis modules/surface modules/molanl modules/symm modules/xtal modules/lwview modules/rendering modules/anim"
  MODULES_LDADD="-lanim -lrender -llwview -lxtal -lsymm -lmolanl -lsurface -lmolvis -lmolstr"
  MODULES_LDFLAGS="-L\$(top_builddir)/modules/anim -L\$(top_builddir)/modules/rendering -L\$(top_builddir)/modules/lwview -L\$(top_builddir)/modules/xtal -L\$(top_builddir)/modules/symm -L\$(top_builddir)/modules/molanl -L\$(top_builddir)/modules/surface -L\$(top_builddir)/modules/molvis -L\$(top_builddir)/modules/molstr"

  # MDTools module
  BUILD_MODULES="$BUILD_MODULES modules/mdtools"
  MODULES_LDADD="-lmdtools $MODULES_LDADD"
  MODULES_LDFLAGS="-L\$(top_builddir)/modules/mdtools $MODULES_LDFLAGS"
  MODULES_CXXFLAGS="-DHAVE_MDTOOLS_MODULE $MODULES_CXXFLAGS"

  # Importers module (experimental)
  BUILD_MODULES="$BUILD_MODULES modules/importers"
  MODULES_LDADD="-limporters $MODULES_LDADD"
  MODULES_LDFLAGS="-L\$(top_builddir)/modules/importers $MODULES_LDFLAGS"
  MODULES_CXXFLAGS="-DHAVE_IMPORTERS_MODULE $MODULES_CXXFLAGS"
else
  # Build light-weight viewer version
  BUILD_MODULES="modules/molstr modules/lwview modules/anim"
  MODULES_LDADD="-lmolstr -llwview -lanim"
  MODULES_LDFLAGS="-L\$(top_builddir)/modules/molstr -L\$(top_builddir)/modules/lwview -L\$(top_builddir)/modules/anim"
fi

AC_SUBST(BUILD_MODULES)
AC_SUBST(MODULES_LDADD)
AC_SUBST(MODULES_LDFLAGS)
AC_SUBST(MODULES_CXXFLAGS)

#
# check for FFTW location  (for denmap module)
#

AC_MSG_CHECKING(FFTW library location)
AC_ARG_WITH(fftw,
[  --with-fftw[=DIR]      Look for FFTW library in DIR (default=no) ],
[ case "$with_fftw" in
  no)
    
    ;;
  *)
    AC_MSG_RESULT($with_fftw)
    _cppflags=${CPPFLAGS}
    CPPFLAGS="-I$with_fftw/include $CPPFLAGS"
    AC_CHECK_HEADERS(fftw3.h)
    AC_CHECK_DECLS(fftwf_execute,
                   [FFTW_CPPFLAGS="-I$with_fftw/include"],
		   ,
		   [#include <fftw3.h>])
    CPPFLAGS=$_cppflags

    _ldflags=${LDFLAGS}
    LDFLAGS="-L$with_fftw/lib $LDFLAGS"
    AC_CHECK_LIB(fftw3f, fftwf_execute,
                 [FFTW_LDFLAGS="-L$with_fftw/lib"
		  FFTW_LIBADD="-lfftw3f"],
		 ,
		 [])
    LDFLAGS=$_ldflags
    ;;
  esac ],
[   AC_CHECK_HEADERS(fftw3.h)
    AC_CHECK_DECLS(fftwf_execute,
                   [],
		   ,
		   [#include <fftw3.h>])
    AC_CHECK_LIB(fftw3f, fftwf_execute,
                 [],
		 ,
		 [])
])

dnl [AC_MSG_ERROR(Cannot find fftw library file)]

AC_SUBST(FFTW_CPPFLAGS)
AC_SUBST(FFTW_LDFLAGS)
AC_SUBST(FFTW_LIBADD)


#
# check for CGAL location  (for the surface/rendering module)
#

AC_MSG_CHECKING(CGAL library location)
AC_ARG_WITH(cgal,
[  --with-cgal[=DIR]      Look for CGAL library in DIR (default=no) ],
[ case "$with_cgal" in
  no)
    ;;

  *)
    AC_MSG_RESULT($with_cgal)
    _cppflags=${CPPFLAGS}
    CPPFLAGS="-I$with_cgal/include $CPPFLAGS $BOOST_CPPFLAGS"
    AC_CHECK_HEADERS(CGAL/basic.h)
    CPPFLAGS=$_cppflags

    CGAL_CPPFLAGS="-I$with_cgal/include"
    CGAL_LDFLAGS="-L$with_cgal/lib"
    CGAL_LIBADD="-lCGAL"
    ;;
  esac ],
[])

AC_SUBST(CGAL_CPPFLAGS)
AC_SUBST(CGAL_LDFLAGS)
AC_SUBST(CGAL_LIBADD)

##########################################################

AC_SUBST(INCLTDL)
AC_SUBST(LIBLTDL)
AC_SUBST(BUILD_UI)

LIBS="$LIBS -lm"
CFLAGS="-DQM_UNIX $CFLAGS"

AC_CONFIG_FILES([
	Makefile
	pcre/Makefile
	expat/Makefile
	zlib/Makefile
	libpng/Makefile
	qlib/Makefile
	jsbr/Makefile
	pybr/Makefile
	xmlrpc_bridge/Makefile
	gfx/Makefile
	qsys/Makefile
	cli/Makefile
	xpcom/Makefile
	xul_gui/Makefile
	sysdep/Makefile
	qt_gui/Makefile
 modules/molstr/Makefile
 modules/molvis/Makefile
 modules/surface/Makefile
 modules/molanl/Makefile
 modules/symm/Makefile
 modules/xtal/Makefile
 modules/mdtools/Makefile
 modules/lwview/Makefile
 modules/rendering/Makefile
 modules/anim/Makefile
 modules/importers/Makefile
	utils/Makefile
	osxbuild/Makefile
	osxbuild/make_distr.pl
	osxbuild/add_povray.pl
	osxbuild/Info.plist
	osxbuild/make_appbundle.sh
	uxdist/Makefile
	uxdist/run_cuemol2.sh
	stub/Makefile
])

AC_OUTPUT
