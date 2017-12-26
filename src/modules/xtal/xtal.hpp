// -*-Mode: C++;-*-
//
// Crystallographic visualization module
//  module loader/common definitions
//

#ifndef XTAL_HPP_INCLUDED
#define XTAL_HPP_INCLUDED

#include <qlib/LString.hpp>

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef XTAL_EXPORTS
# define XTAL_API __declspec(dllexport)
#else
# define XTAL_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef XTAL_EXPORTS
#    define XTAL_API __attribute__ ((visibility ("default")))
#  else
#    define XTAL_API
#  endif

#else

// for non-MS platforms (without visattr)
#define XTAL_API

#endif // WIN32

#include <qlib/LScrSmartPtr.hpp>

namespace xtal {

  /// Common Initialization for the xtal library
  XTAL_API bool init();

  /// Common Finalization for the xtal library
  XTAL_API void fini();

  MC_DECL_SCRSP(DensityMap);
}

#endif

