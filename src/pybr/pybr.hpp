// -*-Mode: C++;-*-
//
// Python bridge library
//

#ifndef PYBR_HPP_INCLUDED__
#define PYBR_HPP_INCLUDED__

#ifdef PYMODULE_EXPORTS
#define PYBR_EXPORTS
#else
#undef PYBR_EXPORTS
#endif

#ifdef WIN32

// for MS-Windows
#ifdef PYBR_EXPORTS
#define PYBR_API __declspec(dllexport)
#else
#define PYBR_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef PYBR_EXPORTS
#    define PYBR_API __attribute__ ((visibility ("default")))
#  else
#    define PYBR_API
#  endif

#else

// for non-MS platforms (without visattr)
#define PYBR_API

#endif // WIN32

//////////////////////////////

namespace qlib {
  class LString;
}

namespace pybr {

  class Interp;

  /** Initialize the qlib library */
  PYBR_API bool init();

  /** Cleanup the qlib library */
  PYBR_API void fini();

  /** run python script file */
  PYBR_API bool runFile(const qlib::LString &path);
}

#endif // PYBR_DLL_H__

