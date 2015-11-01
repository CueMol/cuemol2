//
//  Qt GUI module routines
//

#ifndef QTGUI_DLL_H__
#define QTGUI_DLL_H__

#ifdef WIN32

// for MS-Windows
#ifdef QTGUI_EXPORTS
# define QTGUI_API __declspec(dllexport)
#else
# define QTGUI_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef QTGUI_EXPORTS
#    define QTGUI_API __attribute__ ((visibility ("default")))
#  else
#    define QTGUI_API
#  endif

#else
// for non-MS platforms (without visattr)
#define QTGUI_API

#endif // WIN32

namespace qtgui {

  /// Initialize the qtgui library
  QTGUI_API bool init();

  /// Cleanup the qtgui library
  QTGUI_API void fini();

  // QTGUI_API void *createTextRender();
  // QTGUI_API void destroyTextRender(void *pTR);

}


#endif // QTGUI_DLL_H__



