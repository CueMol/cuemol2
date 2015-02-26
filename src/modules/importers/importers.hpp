// -*-Mode: C++;-*-
//
// PSE loader module
//

#ifndef PSEREAD_HPP_INCLUDED
#define PSEREAD_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef IMPORTERS_EXPORTS
# define IMPORTERS_API __declspec(dllexport)
#else
# define IMPORTERS_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef IMPORTERS_EXPORTS
#    define IMPORTERS_API __attribute__ ((visibility ("default")))
#  else
#    define IMPORTERS_API
#  endif

#else

// for non-MS platforms (without visattr)
#define IMPORTERS_API

#endif // WIN32

#include <qlib/LScrSmartPtr.hpp>

namespace importers {

  /// Common Initialization for the importers library
  IMPORTERS_API bool init();
  
  /// Common Finalization for the importers library
  IMPORTERS_API void fini();
  
}

#endif

