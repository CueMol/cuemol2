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
sinclude(conftools/ax_boost_chrono.m4)
dnl sinclude(conftools/ax_boost_timer.m4)
dnl sinclude(conftools/ax_boost_iostreams.m4)
sinclude(conftools/ax_cxx_compile_stdcxx_0x.m4)
sinclude(conftools/ax_cxx_compile_stdcxx_11.m4)
sinclude(conftools/ax_cxx_header_unordered_map.m4)

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
AC_CHECK_FUNCS(fseeko ftello)

AC_CHECK_LIB([m],[cos])
AC_CHECK_FUNCS(isfinite)
AC_CHECK_FUNCS(finite)

AC_CHECK_HEADERS(stdarg.h)
AC_CHECK_HEADERS(dirent.h)
AC_CHECK_HEADERS(fcntl.h unistd.h sys/wait.h spawn.h)
AC_CHECK_HEADERS(locale.h xlocale.h)

AX_CXX_HEADER_UNORDERED_MAP

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
    LIBQLIB_LIBADD="../pcre/libpcre.a ../expat/libexpat.a"
    AC_SUBST(LIBQLIB_LIBADD)
fi

#######################################################
#
# check for OS type
#

echo "host_os: $host_os"
echo "target_os: $target_os"

BUILD_CLI=
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

dnl Check iOS build flag
AC_ARG_ENABLE(iphoneos,
    [--enable-iphoneos         enable iOS support],
    [if test $enableval = yes ; then
	GUI_ARCH=MB_GUI_ARCH_IPHONEOS
        BUILD_OSDEP=sysdep
     fi],
[])

dnl Check CLI/GUI build
AC_ARG_ENABLE(cli,
    [--enable-cli         enable command line interface],
    [
dnl CLI option supplied --> enable CLI build
if test $enableval = yes ; then
    GUI_ARCH=MB_GUI_ARCH_CLI
    BUILD_OSDEP=
    BUILD_CLI=cli
fi],
    [
dnl no option --> use GUI (X11/OSX)
if test x$GUI_ARCH = x ; then
case $host_os in
     darwin*)
	GUI_ARCH=MB_GUI_ARCH_OSX
	AC_DEFINE([GUI_ARCH_OSX],[1],[GUI Arch OSX])
	BUILD_OSDEP="sysdep osxbuild stub"

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
	#echo "$CXXFLAGS, $HAVE_CXX11, $CXX11_CXXFLAGS"
     ;;
     *)
	GUI_ARCH=MB_GUI_ARCH_X11
	AC_DEFINE([GUI_ARCH_X11],[1],[GUI Arch X11])
	BUILD_OSDEP="sysdep uxdist"
        dnl Linux/Gecko23 build requires std=c++0x feature (char16_t)
        AX_CXX_COMPILE_STDCXX_0X
	if test $ax_cv_cxx_compile_cxx0x_cxx = yes ; then
	   CXXFLAGS="$CXXFLAGS -std=c++0x"
	else
	   AC_MSG_ERROR(requires c++ with -std=c++0x support)
	fi
     ;;
esac
fi])


AM_CONDITIONAL(COND_BUILD_OSX, test x$GUI_ARCH = xMB_GUI_ARCH_OSX)
AM_CONDITIONAL(COND_BUILD_X11, test x$GUI_ARCH = xMB_GUI_ARCH_X11)
AM_CONDITIONAL(COND_BUILD_IPHONEOS, test x$GUI_ARCH = xMB_GUI_ARCH_IPHONEOS)
AC_SUBST(BUILD_OSDEP)
AC_SUBST(BUILD_CLI)

echo GUI_ARCH: $GUI_ARCH
AC_DEFINE_UNQUOTED([GUI_ARCH], [${GUI_ARCH}], [Name of the GUI archtecture])

if test x$GUI_ARCH == xMB_GUI_ARCH_CLI ; then
  AC_DEFINE_UNQUOTED([STR_GUI_ARCH], ["CLI"], [Name of the GUI archtecture])
elif test x$GUI_ARCH == xMB_GUI_ARCH_OSX ; then
  AC_DEFINE_UNQUOTED([STR_GUI_ARCH], ["OSX"], [Name of the GUI archtecture])
elif test x$GUI_ARCH == xMB_GUI_ARCH_X11 ; then
  AC_DEFINE_UNQUOTED([STR_GUI_ARCH], ["X11"], [Name of the GUI archtecture])
elif test x$GUI_ARCH == xMB_GUI_ARCH_IPHONEOS ; then
  AC_DEFINE_UNQUOTED([STR_GUI_ARCH], ["IPHONEOS"], [Name of the GUI archtecture])
fi

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
# check for XZ
#

USE_XZ=
XZ_CPPFLAGS=
XZ_LDFLAGS=
XZ_LIBADD=
AC_MSG_CHECKING(XZ library location)
AC_ARG_WITH(xz,
[  --with-xz[=DIR]      Look for XZ library in DIR (default=no) ],
[ case "$with_xz" in
  no)
    AC_MSG_RESULT($with_xz)
    USE_XZ=no
    ;;

  yes)
    AC_MSG_RESULT($with_xz)

    AC_CHECK_HEADERS([lzma.h],,[AC_MSG_ERROR(lzma.h not found)],[])
    AC_CHECK_DECLS(lzma_version_number,
                   [],
		   [AC_MSG_ERROR(lzma_version_number() not found)],
		   [#include <lzma.h>])
    AC_CHECK_LIB(lzma, lzma_version_number,
                 [XZ_LIBADD=" -llzma"],
		 [AC_MSG_ERROR(lzma_version_number() not found)],
		 [])
    USE_XZ=yes
    ;;

  *)
    AC_MSG_RESULT($with_xz)
    _cppflags=${CPPFLAGS}
    CPPFLAGS="-I$with_xz/include $CPPFLAGS"
    AC_CHECK_HEADERS([lzma.h],,[AC_MSG_ERROR(lzma.h not found)],[])

    AC_CHECK_DECLS(lzma_version_number,
                   [XZ_CPPFLAGS="-I$with_xz/include"],
		   [AC_MSG_ERROR(lzma_version_number() not found)],
		   [#include <lzma.h>])

    CPPFLAGS=$_cppflags

    _ldflags=${LDFLAGS}
    _libs=${LIBS}
    LDFLAGS="-L$with_xz/lib $LDFLAGS"
    LIBS="-llzma $LIBS"
    AC_CHECK_LIB(lzma, lzma_version_number,
                 [XZ_LDFLAGS="-L$with_xz/lib"
		 XZ_LIBADD=" -llzma"],
		 [AC_MSG_ERROR(lzma_version_number() not found)],
		 [])
    LDFLAGS=$_ldflags
    LIBS=$_libs

    USE_XZ=yes
    ;;
  esac ],
[
    AC_MSG_RESULT(no)
    USE_XZ=no
])

AC_SUBST(XZ_CPPFLAGS)
AC_SUBST(XZ_LDFLAGS)
AC_SUBST(XZ_LIBADD)
AM_CONDITIONAL(COND_USE_XZ, test x$USE_XZ = xyes)

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
# check for LittleCMS location
#

LCMS_CPPFLAGS=
LCMS_LDFLAGS=
LCMS_LIBADD=

AC_MSG_CHECKING(LittleCMS library location)
AC_ARG_WITH(lcms,
[  --with-lcms[=DIR]      Look for LittleCMS library in DIR (default=no) ],
[ case "$with_lcms" in
  no)
    AC_MSG_RESULT(no)
    ;;

  yes)
    dnl default LCMS2 location (/usr, etc)
    AC_MSG_RESULT(yes)
    AC_CHECK_HEADERS([lcms2.h],,[AC_MSG_ERROR(lcms2.h not found)],[])
    AC_CHECK_DECLS(cmsOpenProfileFromFile,
                   [],
		   [AC_MSG_ERROR(cmsOpenProfileFromFile() not found)],
		   [#include <lcms2.h>])
    AC_CHECK_LIB(lcms2, cmsOpenProfileFromFile,
                 [LCMS_LIBADD=" -llcms2"],
		 [AC_MSG_ERROR(cmsOpenProfileFromFile() not found)],
		 [])

    ;;

  *)
    dnl LCMS2 location specified
    AC_MSG_RESULT($with_lcms)
    _cppflags=${CPPFLAGS}
    CPPFLAGS="-I$with_lcms/include $CPPFLAGS"
    AC_CHECK_HEADERS([lcms2.h],,[AC_MSG_ERROR(lcms2.h not found)],[])

    AC_CHECK_DECLS(cmsOpenProfileFromFile,
                   [LCMS_CPPFLAGS="-I$with_lcms/include"],
		   [AC_MSG_ERROR(cmsOpenProfileFromFile() not found)],
		   [#include <lcms2.h>])
    CPPFLAGS=$_cppflags

    _ldflags=${LDFLAGS}
    _libs=${LIBS}
    LDFLAGS="-L$with_lcms/lib $LDFLAGS"
    LIBS="-llcms2 $LIBS"
    AC_CHECK_LIB(lcms2, cmsOpenProfileFromFile,
                 [LCMS_LDFLAGS="-L$with_lcms/lib"
		  LCMS_LIBADD=" -llcms2"],
		 [AC_MSG_ERROR(cmsOpenProfileFromFile() not found)],
		 [])
    LDFLAGS=$_ldflags
    LIBS=$_libs

    ;;
  esac ],
[
    AC_MSG_RESULT(no)
])

AC_SUBST(LCMS_CPPFLAGS)
AC_SUBST(LCMS_LDFLAGS)
AC_SUBST(LCMS_LIBADD)

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
dnl AX_BOOST_TIMER
AX_BOOST_CHRONO

echo ==== BOOST library config ====
echo BOOST_CPPFLAGS: $BOOST_CPPFLAGS
echo BOOST_SYSTEM_LIB: $BOOST_SYSTEM_LIB
echo BOOST_FILESYSTEM_LIB: $BOOST_FILESYSTEM_LIB
echo BOOST_THREAD_LIB: $BOOST_THREAD_LIB
echo BOOST_TIMER_LIB: $BOOST_TIMER_LIB
echo BOOST_CHRONO_LIB: $BOOST_CHRONO_LIB
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

# Check for boost_timer library
USE_BOOST_TIMER=
AC_ARG_ENABLE(boosttimer,
    [--enable-boosttimer     Enable performance measurement using boost_timer (boost_timer required)],
    [
if test $enableval = yes ; then
BOOST_TIMER_LIB=-lboost_timer
USE_BOOST_TIMER=yes
AC_SUBST([BOOST_TIMER_LIB])
AC_DEFINE([USE_BOOST_TIMER], [1], [Use boost_timer])
fi
    ],
    [])
AC_SUBST([USE_BOOST_TIMER])

#####

if test x$GUI_ARCH != xMB_GUI_ARCH_CLI ; then

#######################################################
#
# check for XULRUNNER SDK location
#
XULRUNNER_SDK_PATH=
BUILD_XULGUI=
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
	 BUILD_XULGUI="xpcom xul_gui"],,
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
	

AC_SUBST(BUILD_XULGUI)
AC_SUBST(XULRUNNER_SDK_PATH)
AC_SUBST(XPCOM_CPPFLAGS)
AC_SUBST(XPCOM_LDFLAGS)

fi

#######################################################
#
# check for libjs (SpiderMonkey) location
#

BUILD_SCR=
JS_CPPFLAGS=
JS_LDADD=
JS_LDFLAGS=
SCR_CPPFLAGS=
SCR_LDADD=
SCR_LDFLAGS=

AC_SUBST(JS_CPPFLAGS)
AC_SUBST(JS_LDADD)
AC_SUBST(JS_LDFLAGS)

#######################################################
# Python supports

AC_ARG_WITH(python,
[  --with-python[=DIR]      Look for python in DIR (default=no) ],
[ case "$with_python" in
  no)
    AC_MSG_RESULT($with_python)
    ;;

  yes)
   AC_MSG_RESULT($with_python)
   dnl check python inc/lib
   AM_PATH_PYTHON(3.4.0)
   PY_PREFIX=`$PYTHON -c 'import sys ; print(sys.prefix)'`
   PYTHON_LDADD="-lpython${PYTHON_VERSION}m"
   PYTHON_LDFLAGS="-L$PY_PREFIX/lib"
   PYTHON_CPPFLAGS="-I$PY_PREFIX/include/python${PYTHON_VERSION}m"
   echo "Python prefix: " $PY_PREFIX ", version: " $PYTHON_VERSION
   AC_SUBST([PYTHON_LDADD])
   AC_SUBST([PYTHON_LDFLAGS])
   AC_SUBST([PYTHON_CPPFLAGS])
   AC_SUBST([PY_PREFIX])
   BUILD_SCR="$BUILD_SCR pybr"
   SCR_CPPFLAGS="$SCR_CPPFLAGS"
   SCR_LDADD="$SCR_LDADD -lpybr $PYTHON_LDADD"
   SCR_LDFLAGS="$SCR_LDFLAGS -L../pybr/ $PYTHON_LDFLAGS"

   HAVE_PYTHON=yes
   AC_SUBST([HAVE_PYTHON])
   AC_DEFINE([HAVE_PYTHON], [1], [Define to 1 if you have python3])
   ;;

  *)
    AC_MSG_RESULT($with_python)
    PYTHON=$with_python/bin/python3
   dnl check python inc/lib
   AM_PATH_PYTHON(3.4.0)
   PY_PREFIX=`$PYTHON -c 'import sys ; print(sys.prefix)'`
   PYTHON_LDADD="-lpython${PYTHON_VERSION}m"
   PYTHON_LDFLAGS="-L$PY_PREFIX/lib"
   PYTHON_CPPFLAGS="-I$PY_PREFIX/include/python${PYTHON_VERSION}m"
   echo "Python prefix: " $PY_PREFIX ", version: " $PYTHON_VERSION
   AC_SUBST([PYTHON_LDADD])
   AC_SUBST([PYTHON_LDFLAGS])
   AC_SUBST([PYTHON_CPPFLAGS])
   AC_SUBST([PY_PREFIX])
   BUILD_SCR="$BUILD_SCR pybr"
   SCR_CPPFLAGS="$SCR_CPPFLAGS"
   SCR_LDADD="$SCR_LDADD -lpybr $PYTHON_LDADD"
   SCR_LDFLAGS="$SCR_LDFLAGS -L../pybr/ $PYTHON_LDFLAGS"

   HAVE_PYTHON=yes
   AC_SUBST([HAVE_PYTHON])
   AC_DEFINE([HAVE_PYTHON], [1], [Define to 1 if you have python3])
    ;;
  esac ],
[
    AC_MSG_RESULT(no)
])

AC_ARG_ENABLE(numpy,
    [--enable-numpy     Enable numpy support (python3 required)],
    [
if test $enableval = yes ; then
if test x$HAVE_PYTHON != xyes ; then
AC_MSG_ERROR(python3 required)
fi
NUMPY_INC=`$PYTHON -c 'from numpy.distutils.misc_util import get_numpy_include_dirs ; print(" ".join(get_numpy_include_dirs()))'`
#echo $NUMPY_INC
  for i in $NUMPY_INC; do
      echo "numpy incdir = $i"
      PYTHON_CPPFLAGS="$PYTHON_CPPFLAGS -I$i" 
  done
#/usr/local/lib/python3.6/site-packages/numpy/core/include
  PYTHON_CPPFLAGS="$PYTHON_CPPFLAGS -DHAVE_NUMPY=1" 
  AC_SUBST([PYTHON_CPPFLAGS])
#   AC_DEFINE([HAVE_NUMPY], [1], [Define to 1 if you have numpy])
fi
    ],
    [])

ENABLE_PYMODULE=
AC_ARG_ENABLE(pymodule,
    [--enable-pymodule     Build as python module (python3 required)],
    [
if test $enableval = yes ; then
if test x$HAVE_PYTHON != xyes ; then
AC_MSG_ERROR(python3 required)
fi
    AC_MSG_RESULT($enableval)
    AC_DEFINE([ENABLE_PYMODULE], [1], [Define to 1 if you enable python module build])
ENABLE_PYMODULE=yes
fi
    ],
    [])

AM_CONDITIONAL(COND_BUILD_PYMODULE, test x$ENABLE_PYMODULE = xyes)

#######################################################
# XML-RPC supports

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
  SCR_LDFLAGS="$SCR_LDFLAGS -L../xmlrpc_bridge/ $XMLRPC_LDFLAGS"
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
# pkg-config (for Linux & X11 & gtk2)
#

m4_ifdef([PKG_CHECK_MODULES], [], [define(PKG_CHECK_MODULES)])

if test x$GUI_ARCH = xMB_GUI_ARCH_X11 ; then
    echo
    PKG_CHECK_MODULES(GTK2, gtk+-2.0 >= 2.10.0 glib-2.0 gobject-2.0 gdk-x11-2.0)
fi

#######################################################
#
# check for OpenGL (CGL for mac; XGL for unix)
#
USE_OPENGL=

if test x$GUI_ARCH != xMB_GUI_ARCH_CLI ; then
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
#  Check GLES1/GLES2 (for mobile device version)
#
# if test x$BUILD_LW == xyes ; then
AC_ARG_ENABLE(gles2,
    [--enable-gles2         Use GLES2 API],
    [if test $enableval = yes ; then
	AC_DEFINE(USE_GLES2, [1], [Use GLES2 API],,)
     fi],
    [])
# fi

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
  MODULES_LDFLAGS="-L../modules/anim -L../modules/rendering -L../modules/lwview -L../modules/xtal -L../modules/symm -L../modules/molanl -L../modules/surface -L../modules/molvis -L../modules/molstr"

  # MDTools module
  BUILD_MODULES="$BUILD_MODULES modules/mdtools"
  MODULES_LDADD="-lmdtools $MODULES_LDADD"
  MODULES_LDFLAGS="-L../modules/mdtools $MODULES_LDFLAGS"
  MODULES_CXXFLAGS="-DHAVE_MDTOOLS_MODULE $MODULES_CXXFLAGS"

  # Importers module (experimental)
  BUILD_MODULES="$BUILD_MODULES modules/importers"
  MODULES_LDADD="-limporters $MODULES_LDADD"
  MODULES_LDFLAGS="-L../modules/importers $MODULES_LDFLAGS"
  MODULES_CXXFLAGS="-DHAVE_IMPORTERS_MODULE $MODULES_CXXFLAGS"
else
  # Build light-weight viewer version
  BUILD_MODULES="modules/molstr modules/lwview modules/anim"
  MODULES_LDADD="-lmolstr -llwview -lanim"
  MODULES_LDFLAGS="-L../modules/molstr -L../modules/lwview -L../modules/anim"
fi

AC_SUBST(BUILD_MODULES)
AC_SUBST(MODULES_LDADD)
AC_SUBST(MODULES_LDFLAGS)
AC_SUBST(MODULES_CXXFLAGS)

#
# check for FFTW location  (for xtal module)
#

AC_MSG_CHECKING(FFTW library location)
AC_ARG_WITH(fftw,
[  --with-fftw[=DIR]      Look for FFTW library in DIR (default=no) ],
[ case "$with_fftw" in
  no)
    ;;
  yes)
# Find in default location
    AC_MSG_RESULT($with_fftw)
    AC_CHECK_HEADERS(fftw3.h)
    AC_CHECK_DECLS(fftwf_execute,
                   [],
		   ,
		   [#include <fftw3.h>])

    AC_CHECK_LIB(fftw3f, fftwf_execute,
                 [FFTW_LIBADD="-lfftw3f"],
		 ,
		 [])
    ;;

  yes)
    AC_CHECK_HEADERS(fftw3.h)
    AC_CHECK_DECLS(fftwf_execute,
                   [],
		   ,
		   [#include <fftw3.h>])
    AC_CHECK_LIB(fftw3f, fftwf_execute,
                 [],
		 ,
		 [])
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
[
    AC_MSG_ERROR(Require fftw library)
])

AC_SUBST(FFTW_CPPFLAGS)
AC_SUBST(FFTW_LDFLAGS)
AC_SUBST(FFTW_LIBADD)


#
# check for CGAL location  (for the surface module)
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
