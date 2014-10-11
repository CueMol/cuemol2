// -*- Mode: C++; tab-width: 2; -*-
// vi: set ts=2:
//
// $Id: common.h,v 1.3 2002/02/27 12:18:17 sturm Exp $

// common BALL includes

#ifndef BALL_COMMON_H
#define BALL_COMMON_H

#if defined(HAVE_CONFIG_H)
# include <config.h>
#elif defined(WIN32)
# include <win32_config.h>
#endif

//#define BALL_HAS_SYS_TIME_H
#define BALL_HAS_TIME_H
#define BALL_HAS_SSTREAM
#define BALL_HAS_STDINT_H
#define BALL_HAS_NUMERIC_LIMITS
#define BALL_HAS_LIMITS_H
#define BALL_HAS_FLOAT_H
#define BALL_HAS_VALUES_H

#define BALL_INDEX_TYPE int
#define BALL_SIZE_TYPE unsigned int
#define BALL_LONG64_TYPE long long
#define BALL_ULONG64_TYPE unsigned long long

// #define BALL_POINTERSIZEUINT_TYPE unsigned int
#if (SIZEOF_VOIDP==4)
#  if (SIZEOF_INT==4)
#    define BALL_POINTERSIZEUINT_TYPE unsigned int
#  else
#    error "unsupported system (ptr size)."
#  endif
#elif (SIZEOF_VOIDP==8)
#  if (SIZEOF_LONG==8)
#    define BALL_POINTERSIZEUINT_TYPE unsigned long
#  elif (SIZEOF_LONG_LONG==8)
#    define BALL_POINTERSIZEUINT_TYPE unsigned long long
#  else
#    error "unsupported system (ptr size)."
#  endif
#else
#  error "unsupported system (ptr size)."
#endif


#define BALL_HAS_UNORDERED_MAP
#define BALL_HAS_BOOST_UNORDERED_MAP
#define BALL_MAP_NAME boost::unordered_map<Key, T>

//////////
#ifdef WIN32
# pragma warning( disable : 4290 )
# pragma warning( disable : 4251 ) // Warnings about DLL interface
# pragma warning( disable : 4275 ) // Warnings about DLL interface (we should do something about them, though)
#define BALL_COMPILER_MSVC
#ifndef M_PI
# define M_PI 3.14159265358979323846
#endif
#endif

#ifdef BALL_HAS_SYS_TIME_H
#	include <sys/time.h>
#endif

#ifdef BALL_HAS_TIME_H
#	include <time.h>
#endif

#ifdef BALL_HAS_SSTREAM
# include <sstream>
#else
# include <strstream>
#endif

#include <limits.h>
#include <time.h>

#include <iostream>
#include <list>
#include <vector>
#include <string>
#include <map>
#include <typeinfo>
#include <algorithm>

using std::vector;
using std::list;

#define BALL_INLINE inline

//////////

#include <BALL/COMMON/macros.h>
#include <BALL/COMMON/global.h>
#include <BALL/COMMON/exception.h>

#define BALL_CREATE_DEEP(name)
#define BALL_CREATE(name)

#endif // BALL_COMMON_H
