//
// javascript bridge module jsbr
//

#include <common.h>
#include <qlib/qlib.hpp>

#ifdef USE_INTERNAL_JS
#  include <js/src/jsapi.h>
#else
#  include <jsapi.h>
#endif

#include "jsbr.hpp"
#include "Interp.hpp"
#include "ObjWrapper.hpp"

// using namespace jsbr;

namespace {
  JSRuntime *g_rt = NULL;
}

namespace jsbr {

bool init()
{
  // MB_DPRINTLN("JSBR: init() called!!");
  // initialize wrapper's JSClass
  ObjWrapper::init();

  if (g_rt) {
    LOG_DPRINTLN("JSBR: JSRuntime is already initialized!!");
    return false;
  }

  // initialize the JS run time, and return result in rt
  g_rt = JS_NewRuntime(8L * 1024L * 1024L);

  // if rt does not have a value, end the program here
  if (!g_rt) {
    LOG_DPRINTLN("JSBR: cannot create JSRuntime object!!");
    return false;
  }

  MB_DPRINTLN("JSBR: init() OK, runtime=%p", g_rt);
  return true;
}

Interp *createInterp(qlib::LScriptable *pObj)
{
  if (!g_rt) {
    LOG_DPRINTLN("JSBR: JSRuntime is not initialized!!");
    return NULL;
  }

  // create a context and associate it with the JS runtime
  JSContext *cx = JS_NewContext(g_rt, 8192);
  if (cx==NULL) {
    LOG_DPRINTLN("JSBR: create context failed!!");
    return NULL;
  }

  // set ctxt options
  JS_SetOptions(cx, JSOPTION_VAROBJFIX
#if !defined(USE_INTERNAL_JS)
                | JSOPTION_JIT | JSOPTION_METHODJIT
#endif
                );

#if !defined(USE_INTERNAL_JS)
  JS_SetVersion(cx, JSVERSION_LATEST);
#endif

  jsbr::Interp *pNewInterp = new jsbr::Interp(cx);
  if (!pNewInterp)
    return NULL;

  if (!pNewInterp->init(pObj)) {
    delete pNewInterp;
    return NULL;
  }

  return pNewInterp;
}

void fini()
{
  if (g_rt)
    JS_DestroyRuntime(g_rt);
  g_rt = NULL;

  ObjWrapper::fini();
}

} // namespace jsbr
