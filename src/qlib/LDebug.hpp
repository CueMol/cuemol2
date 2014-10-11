// -*-Mode: C++;-*-
//
// Debug.h
// debug macros
//
// $Id: LDebug.hpp,v 1.4 2009/03/26 06:26:50 rishitani Exp $

#ifndef QLIB_DEBUG_HPP__
#define QLIB_DEBUG_HPP__

#include "qlib.hpp"
#include "LDebugAssert.hpp"
#include "LDebugNew.hpp"

//////////////////////////////////////////////////////////
// Debug Logging Macros

namespace qlib {
  inline void printfdummy(int n, const char *msg, ...) {
  }

  QLIB_API void LOG_verb_printfmt(const char *msg, ...);
  QLIB_API void LOG_verb_printlnfmt(const char *msg, ...);

  QLIB_API void LOG_err_printfmt(const char *msg, ...);
  QLIB_API void LOG_err_printlnfmt(const char *msg, ...);

  QLIB_API void LOG_printfmt(int nlev, const char *msg, ...);
  QLIB_API void LOG_printlnfmt(int nlev, const char *msg, ...);
}


#ifdef USE_LOG_STDIO
//
// Debug log output using simple stdio
//
# ifdef MB_DEBUG
#  define MB_DPRINTLN (void)printf
#  define MB_DPRINT (void)printf
# else
#  define MB_DPRINTLN (1) ? (void)0 : (void)::printf
#  define MB_DPRINT (1) ? (void)0 : (void)::printf
# endif

# define LOG_DPRINTLN (void)printf
# define LOG_DPRINT (void)printf

// show message with loglevel (not supported)
# define DPRINTLN (1) ? (void)0 : (void)qlib::printfdummy
# define DPRINT (1) ? (void)0 : (void)qlib::printfdummy

#else // USE_LOG_STDIO

//
// Debug log output using LMsgLog system
//

// verbose message for debug
# ifdef MB_DEBUG
#  define MB_DPRINTLN (void)qlib::LOG_verb_printlnfmt
#  define MB_DPRINT (void)qlib::LOG_verb_printfmt
# else
#  define MB_DPRINTLN (1) ? (void)0 : (void)::printf
#  define MB_DPRINT (1) ? (void)0 : (void)::printf
# endif

// fatal error message
# define LOG_DPRINTLN (void)qlib::LOG_err_printlnfmt
# define LOG_DPRINT (void)qlib::LOG_err_printfmt

// show message with loglevel
# define DPRINTLN (void)qlib::LOG_printlnfmt
# define DPRINT (void)qlib::LOG_printfmt

#endif // USE_LOG_STDIO

#endif //QLIB_DEBUG_HPP__
