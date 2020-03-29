//
//  Qt5 GUI module routines
//

#pragma once

// #ifdef WIN32
// // for MS-Windows
// #ifdef QT5GUI_EXPORTS
// # define QT5GUI_API __declspec(dllexport)
// #else
// # define QT5GUI_API __declspec(dllimport)
// #endif

// #elif defined(MB_HAVE_GCC_VIS_ATTR)

// // for non-MS platforms (gcc4)
// #  ifdef QT5GUI_EXPORTS
// #    define QT5GUI_API __attribute__ ((visibility ("default")))
// #  else
// #    define QT5GUI_API
// #  endif

// #else
// // for non-MS platforms (without visattr)
// #define QT5GUI_API
// #endif // WIN32

#define QT5GUI_API

namespace qt5_gui {

  /// Initialize the qt5_gui library
  QT5GUI_API bool init();

  /// Cleanup the qt5_gui library
  QT5GUI_API void fini();
}

