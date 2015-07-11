// -*-Mode: C++;-*-
//
// Biomolecule analysis module
//  module loader/common impl
//

#ifndef SURFACE_HPP_INCLUDED
#define SURFACE_HPP_INCLUDED

#include <qlib/LString.hpp>
#include <qlib/LScrSmartPtr.hpp>

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef SURFACE_EXPORTS
# define SURFACE_API __declspec(dllexport)
#else
# define SURFACE_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef SURFACE_EXPORTS
#    define SURFACE_API __attribute__ ((visibility ("default")))
#  else
#    define SURFACE_API
#  endif

#else

// for non-MS platforms (without visattr)
#define SURFACE_API

#endif // WIN32


namespace surface {

  /// Common Initialization for the molanl library
  SURFACE_API bool init();
  
  /// Common Finalization for the molanl library
  SURFACE_API void fini();

  // declare MolSurfObjPtr typedef
  MC_DECL_SCRSP(MolSurfObj);

}

// #define SURF_BUILDER_TEST 1

#endif

