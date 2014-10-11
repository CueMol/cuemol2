// -*-Mode: C++;-*-
//
// Animation module
//

#ifndef ANIM_HPP_INCLUDED
#define ANIM_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef ANIM_EXPORTS
# define ANIM_API __declspec(dllexport)
#else
# define ANIM_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef ANIM_EXPORTS
#    define ANIM_API __attribute__ ((visibility ("default")))
#  else
#    define ANIM_API
#  endif

#else

// for non-MS platforms (without visattr)
#define ANIM_API

#endif // WIN32

namespace anim {

  /// Common Initialization for the anim module
  ANIM_API bool init();
  
  /// Common Finalization for the anim module
  ANIM_API void fini();
  
}

#endif

