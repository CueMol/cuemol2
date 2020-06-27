// -*-Mode: C++;-*-
//
// qlib's library-related routines
//
// $Id: qlib.hpp,v 1.10 2010/01/23 14:25:05 rishitani Exp $

#ifndef QLIB_HPP_INCLUDED
#define QLIB_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#ifdef QLIB_EXPORTS
#define QLIB_API __declspec(dllexport)
#else
#define QLIB_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#ifdef QLIB_EXPORTS
#define QLIB_API __attribute__((visibility("default")))
#else
#define QLIB_API
#endif

#else

// for non-MS platforms (without visattr)
#define QLIB_API

#endif  // WIN32

#include <common.h>

/// CueMol base library
namespace qlib {

/// Initialize the qlib library
QLIB_API bool init();

/// Cleanup the qlib library
QLIB_API void fini();

typedef unsigned long uid_t;
const uid_t invalid_uid = 0;

/// list of UID
typedef std::list<qlib::uid_t> UIDList;

namespace detail {
struct no_init_tag
{
};
}  // namespace detail

struct no_throw_tag
{
};

typedef bool LBool;
typedef QUE_INT_32 LInt;
typedef QUE_FLT_64 LReal;

}  // namespace qlib

#include "LDebug.hpp"

#endif  // QLIB_HPP_INCLUDED
