// -*-Mode: C++;-*-
//
// XML-RPC bridge library
//

#ifndef XRBR_HPP_INCLUDED__
#define XRBR_HPP_INCLUDED__

#ifdef WIN32

// for MS-Windows
#ifdef XRBR_EXPORTS
#define XRBR_API __declspec(dllexport)
#else
#define XRBR_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef XRBR_EXPORTS
#    define XRBR_API __attribute__ ((visibility ("default")))
#  else
#    define XRBR_API
#  endif

#else

// for non-MS platforms (without visattr)
#define XRBR_API

#endif // WIN32

//////////////////////////////

namespace qlib {
  class LString;
}

namespace xrbr {

  /// Initialize the xrbr library
  XRBR_API bool init();

  /// Cleanup the xrbr library
  XRBR_API void fini();

}

#include <qlib/LString.hpp>

#endif // XRBR_DLL_H__

