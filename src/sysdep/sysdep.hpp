//
//  system-dependent module routines
//

#ifndef SYSDEP_DLL_H__
#define SYSDEP_DLL_H__

#ifdef WIN32

// for MS-Windows
#ifdef SYSDEP_EXPORTS
# define SYSDEP_API __declspec(dllexport)
#else
# define SYSDEP_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef SYSDEP_EXPORTS
#    define SYSDEP_API __attribute__ ((visibility ("default")))
#  else
#    define SYSDEP_API
#  endif

#else
// for non-MS platforms (without visattr)
#define SYSDEP_API

#endif // WIN32

namespace sysdep {

  /// Initialize the sysdep library
  SYSDEP_API bool init();

  /// Cleanup the sysdep library
  SYSDEP_API void fini();

}


#endif // SYSDEP_DLL_H__

