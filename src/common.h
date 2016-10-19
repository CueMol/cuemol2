/*
  common include file
*/

#ifndef __COMMON_H_INCLUDED__
#define __COMMON_H_INCLUDED__

#if defined(HAVE_CONFIG_H)
# include "config.h"
#endif

////////////////////////////////////////////
// for UN*X/MacOS X platforms

// #ifdef QM_UNIX
#ifndef WIN32
#  define MB_PATH_SEPARATOR '/'
#  define fopen_pathconv fopen
// #if __GNUC__>=3 && !defined(__INTEL_COMPILER)
// #define USE_HASH_MAP
// #endif
#endif

#if defined(MB_HAVE_GCC_VIS_ATTR)
#  define MB_PUBLIC __attribute__ ((visibility ("default")))
#else
#  define MB_PUBLIC
#endif

////////////////////////////////////////////
// for Windows platforms

#ifdef WIN32
#  include "win32_config.h"
#endif

////////////////////////////////////////////
// Common include files

#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <errno.h>
#include <limits.h>

#ifdef HAVE_STDARG_H
#  include <stdarg.h>
#endif

#ifdef HAVE_UNISTD_H
#  include <unistd.h>
#endif

#ifdef HAVE_SYS_TIME_H
#  include <sys/time.h>
#endif

#ifdef HAVE_CTYPE_H
#  include <ctype.h>
#endif

#ifdef __cplusplus
#include <typeinfo>
#include <list>
#include <deque>
#include <vector>
#include <valarray>
#include <set>
#include <map>
#include <unordered_map>
#include <functional>
#include <algorithm>
#include <string>
#include <locale>

// c++11 functionality
#if (__cplusplus>=201103L)
#include <cmath>
#endif

#endif



#include "qmtypes.h"

// TO DO: check OGL FBO availability
#define HAVE_OGL_FBO 1

///////////////////////////
// min&max is used in qlib

#ifdef min
# undef min
#endif

#ifdef max
# undef max
#endif

#ifndef M_PI
# define M_PI 3.14159265358979323846
#endif

///////////////////////////
// Multithread support

#ifdef __cplusplus

/*
#  ifdef HAVE_BOOST_THREAD
//#    define BOOST_LIB_DIAGNOSTIC 1
#    define BOOST_ALL_DYN_LINK 1
#    include <boost/thread.hpp>
#  endif  
*/

#define BOOST_ALL_DYN_LINK 1

// TO DO: use conf values
#  include <boost/foreach.hpp>

#endif

#define DEFAULT_SYSCONFIG "sysconfig.xml"

#endif // __COMMON_H__
