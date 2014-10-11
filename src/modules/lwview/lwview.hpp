// -*-Mode: C++;-*-
//
// Light-weight viewer module
//

#ifndef LWVIEW_HPP_INCLUDED
#define LWVIEW_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef LWVIEW_EXPORTS
# define LWVIEW_API __declspec(dllexport)
#else
# define LWVIEW_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef LWVIEW_EXPORTS
#    define LWVIEW_API __attribute__ ((visibility ("default")))
#  else
#    define LWVIEW_API
#  endif

#else

// for non-MS platforms (without visattr)
#define LWVIEW_API

#endif // WIN32

#include <qlib/LScrSmartPtr.hpp>

namespace lwview {

  /// Common Initialization for the symm library
  LWVIEW_API bool init();
  
  /// Common Finalization for the symm library
  LWVIEW_API void fini();
  
  class LWRenderer;
  typedef qlib::LScrSp<LWRenderer> LWRendPtr;

  class LWObject;
  typedef qlib::LScrSp<LWObject> LWObjPtr;
}

#endif

