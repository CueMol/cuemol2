// -*-Mode: C++;-*-
//
// gfx's library-related routines
//
// $Id: gfx.hpp,v 1.6 2009/09/22 15:59:15 rishitani Exp $

#ifndef GFX_DLL_H__
#define GFX_DLL_H__

#ifdef WIN32

// for MS-Windows
#ifdef GFX_EXPORTS
# define GFX_API __declspec(dllexport)
#else
# define GFX_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef GFX_EXPORTS
#    define GFX_API __attribute__ ((visibility ("default")))
#  else
#    define GFX_API
#  endif

#else

// for non-MS platforms (without visattr)
#define GFX_API

#endif // WIN32

#include <qlib/LScrSmartPtr.hpp>

namespace gfx {

  /// Initialize the gfx library
  GFX_API bool init();
  
  /// Cleanup the gfx library
  GFX_API void fini();

  //class SolidColor;
  //typedef qlib::LScrSp<SolidColor> SolidColorPtr;
  MC_DECL_SCRSP(SolidColor);

  class AbstractColor;
  typedef qlib::LScrSp<AbstractColor> ColorPtr;

}

#endif // GFX_DLL_H__
