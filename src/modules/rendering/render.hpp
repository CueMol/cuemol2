// -*-Mode: C++;-*-
//
// Scene rendering module
//

#ifndef RENDER_HPP_INCLUDED
#define RENDER_HPP_INCLUDED

#ifdef WIN32

// for MS-Windows
#define DLLEXPORT __declspec(dllexport)

#ifdef RENDER_EXPORTS
# define RENDER_API __declspec(dllexport)
#else
# define RENDER_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef RENDER_EXPORTS
#    define RENDER_API __attribute__ ((visibility ("default")))
#  else
#    define RENDER_API
#  endif

#else

// for non-MS platforms (without visattr)
#define RENDER_API

#endif // WIN32


namespace render {

  /// Common Initialization for the symm library
  RENDER_API bool init();
  
  /// Common Finalization for the symm library
  RENDER_API void fini();
  
}

#endif

