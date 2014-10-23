// -*-Mode: C++;-*-
//
// PSE loader module
//

#ifndef PSEREAD_HPP_INCLUDED
#define PSEREAD_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef PSEREAD_EXPORTS
# define PSEREAD_API __declspec(dllexport)
#else
# define PSEREAD_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef PSEREAD_EXPORTS
#    define PSEREAD_API __attribute__ ((visibility ("default")))
#  else
#    define PSEREAD_API
#  endif

#else

// for non-MS platforms (without visattr)
#define PSEREAD_API

#endif // WIN32

#include <qlib/LScrSmartPtr.hpp>

namespace pseread {

  /// Common Initialization for the pseread library
  PSEREAD_API bool init();
  
  /// Common Finalization for the pseread library
  PSEREAD_API void fini();
  
}

#endif

