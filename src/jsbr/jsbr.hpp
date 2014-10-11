// -*-Mode: C++;-*-
//
// JS bridge library
//
// $Id: jsbr.hpp,v 1.2 2009/08/28 17:40:35 rishitani Exp $

#ifndef JSBR_HPP_INCLUDED__
#define JSBR_HPP_INCLUDED__

#ifdef WIN32

// for MS-Windows
#ifdef JSBR_EXPORTS
#define JSBR_API __declspec(dllexport)
#else
#define JSBR_API __declspec(dllimport)
#endif

#elif defined(MB_HAVE_GCC_VIS_ATTR)

// for non-MS platforms (gcc4)
#  ifdef JSBR_EXPORTS
#    define JSBR_API __attribute__ ((visibility ("default")))
#  else
#    define JSBR_API
#  endif

#else

// for non-MS platforms (without visattr)
#define JSBR_API

#endif // WIN32

//////////////////////////////

namespace qlib { class LScriptable; }

namespace jsbr {

  class Interp;

  /** Initialize the qlib library */
  JSBR_API bool init();

  /** create a new interpreter object (with specified gloabl object) */
  JSBR_API Interp *createInterp(qlib::LScriptable *pObj);

  /** Cleanup the qlib library */
  JSBR_API void fini();
}

#if (JS_VERSION>180)
#define USE_JSNATIVE_JS180
#endif


#ifdef USE_JSNATIVE_JS180

// new (js180) native function prototype
#define JSNATIVE_PROTO(FUNCNAME) \
  FUNCNAME(JSContext *pcx, uintN argc, jsval *vp)

#else

// old type native function prototype
#define JSNATIVE_PROTO(FUNCNAME) \
  FUNCNAME(JSContext *pcx, JSObject *pobj,\
           unsigned int argc, jsval *pargv, jsval *prval)

#endif

#endif // JSBR_DLL_H__

