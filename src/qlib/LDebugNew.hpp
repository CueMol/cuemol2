// -*-Mode: C++;-*-
//
// LDebugNew.hpp
// Debug new op macro
//

#ifndef QLIB_DEBUG_NEW_HPP
#define QLIB_DEBUG_NEW_HPP

// MB_NEW
#ifdef WIN32

// WIN32
#if defined(MB_DEBUG)
#  include <crtdbg.h>
#  define MB_NEW  new( _CLIENT_BLOCK, __FILE__, __LINE__)
#else
#  define MB_NEW  new
#endif

#else

// Others
#  define MB_NEW  new

#endif


#endif
