// -*-Mode: C++;-*-
//
// Molecular symmetry module
//  module loader/common definitions
//

#ifndef SYMM_HPP_INCLUDED
#define SYMM_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef SYMM_EXPORTS
# define SYMM_API __declspec(dllexport)
#else
# define SYMM_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef SYMM_EXPORTS
#    define SYMM_API __attribute__ ((visibility ("default")))
#  else
#    define SYMM_API
#  endif

#else

// for non-MS platforms (without visattr)
#define SYMM_API

#endif // WIN32


#include <qlib/LScrSmartPtr.hpp>

namespace symm {

  /// Common Initialization for the symm library
  SYMM_API bool init();
  
  /// Common Finalization for the symm library
  SYMM_API void fini();
  
  class CrystalInfo;
  typedef qlib::LScrSp<CrystalInfo> CrystalInfoPtr;
}

#endif

