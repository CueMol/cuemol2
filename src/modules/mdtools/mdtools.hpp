// -*-Mode: C++;-*-
//
// MD tools module
//

#ifndef MDTOOLS_HPP_INCLUDED
#define MDTOOLS_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef MDTOOLS_EXPORTS
# define MDTOOLS_API __declspec(dllexport)
#else
# define MDTOOLS_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef MDTOOLS_EXPORTS
#    define MDTOOLS_API __attribute__ ((visibility ("default")))
#  else
#    define MDTOOLS_API
#  endif

#else

// for non-MS platforms (without visattr)
#define MDTOOLS_API

#endif // WIN32

#include <qlib/LScrSmartPtr.hpp>

namespace mdtools {

  /// Common Initialization for the mdtools library
  MDTOOLS_API bool init();
  
  /// Common Finalization for the mdtools library
  MDTOOLS_API void fini();
  
  MC_DECL_SCRSP(TrajBlock);
  MC_DECL_SCRSP(Trajectory);
}



#endif

