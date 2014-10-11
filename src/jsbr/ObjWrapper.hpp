// -*-Mode: C++;-*-
//
// Interpreter class
//
// $Id: ObjWrapper.hpp,v 1.10 2010/12/29 16:39:53 rishitani Exp $


#ifndef JSBR_OBJ_WRAPPER_HPP_INCLUDED__
#define JSBR_OBJ_WRAPPER_HPP_INCLUDED__

#include "jsbr.hpp"
#include <qlib/LString.hpp>
#include <qlib/LScriptable.hpp>

#ifndef JS_STATIC_DLL_CALLBACK
#define JS_STATIC_DLL_CALLBACK(_T) static _T
#endif

namespace jsbr {

  using qlib::LString;

  class JSCallBackObj;
  class CallBackMgr;
  class Interp;

  /// LScriptable object wrapper class for JavaScript interpreter
  class JSBR_API ObjWrapper
  {
  private:
    void *m_pdata;

  public:
    ObjWrapper() : m_pdata(NULL) {}

    ~ObjWrapper();

    //////////////////////////////////////////////////////

    /// Factory method for the wrapper obj construction
    static JSObject *makeWrapper(JSContext *pcx, qlib::LScriptable *pnewobj);

  private:
    static JSClass wrapper_class;

#ifdef USE_INTERNAL_JS
    // JSAPI_18 interface (using jsval)
    JS_STATIC_DLL_CALLBACK(JSBool)
      addProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp);
    
    JS_STATIC_DLL_CALLBACK(JSBool)
      delProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp);

    JS_STATIC_DLL_CALLBACK(JSBool)
      getProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp);

    JS_STATIC_DLL_CALLBACK(JSBool)
      setProperty(JSContext *cx, JSObject *obj, jsval id, jsval *vp);
#else
    // JSAPI_181 interface (using jsid/JSStrictPropertyOp)
    JS_STATIC_DLL_CALLBACK(JSBool)
      addProperty(JSContext *cx, JSObject *obj, jsid id, jsval *vp);

    JS_STATIC_DLL_CALLBACK(JSBool)
      delProperty(JSContext *cx, JSObject *obj, jsid id, jsval *vp);

    JS_STATIC_DLL_CALLBACK(JSBool)
      getProperty(JSContext *cx, JSObject *obj, jsid id, jsval *vp);

    JS_STATIC_DLL_CALLBACK(JSBool)
      setProperty(JSContext *cx, JSObject *obj, jsid id, JSBool, jsval *vp);
#endif

    JS_STATIC_DLL_CALLBACK(JSBool)
      resolve2(JSContext *cx, JSObject *obj, jsval id,
               uintN flags, JSObject **objp);
    
    JS_STATIC_DLL_CALLBACK(void)
      finalize(JSContext *cx, JSObject *obj);

    JS_STATIC_DLL_CALLBACK(JSBool) JSNATIVE_PROTO(call);

  public:

    //////////////////////////////////////////////
    // Utility static method for the wrapper implementation

    static JSBool throwError(JSContext* cx, const char* msg);

    static jsval LVarToJSVal(JSContext *cx, qlib::LVariant &variant);

    static bool JSValToLVar(JSContext *cx, jsval val, qlib::LVariant &variant);

  public:
    static void init();
    static void fini();
    static JSClass *getJSClass();

    static qlib::LScriptable *getQLibObj(JSContext *cx, JSObject *obj);

    //////////////////////////////////////////////
    // Callback (function) object management

  private:
    static CallBackMgr *m_pCbMgr;

  public:
    static void registerCallbackObj(JSCallBackObj *pObj);
    static void unregisterCallbackObj(JSCallBackObj *pObj);
    static void invalidateCallbackObj(Interp *pInt);

    //////////////////////////////////////////////
    // some JS global functions (for debug/test)

    /// Create new object by (system independent) class name
    static JSBool JSNATIVE_PROTO(createObject);
    //static JSBool createObject(JSContext *pcx, JSObject *pobj,
    //uintN argc, jsval *pargv, jsval *prval);

    /// Get singleton object by (system independent) class name
    static JSBool JSNATIVE_PROTO(getService);
    //static JSBool getService(JSContext *pcx, JSObject *pobj,
    //uintN argc, jsval *pargv, jsval *prval);

    /// Print messege to the current log stream
    static JSBool JSNATIVE_PROTO(printLog);
    //static JSBool printLog(JSContext *pcx, JSObject *pobj,
    //uintN argc, jsval *pargv, jsval *prval);

    /// Perform GC
    static JSBool JSNATIVE_PROTO(callGC);
    //static JSBool callGC(JSContext *pcx, uintN argc, jsval *vp);
    
    /// Execute js file
    static JSBool JSNATIVE_PROTO(execFile);
    //static JSBool execFile(JSContext *pcx, uintN argc, jsval *vp);

    static JSBool execFileImpl(JSContext *pcx, JSObject *pobj, const LString &fname, bool bCatchError);

    /// Get all (qif) class names (in JSON array format)
    static JSBool JSNATIVE_PROTO(getAllClassNamesJSON);

    /// Get command line arguments by index (if index<0, then returns num of args)
    static JSBool JSNATIVE_PROTO(getCmdArgs);

  private:
    /// Call native method
    static JSBool JSNATIVE_PROTO(callNativeMethod);

    //static JSBool
    //callNativeMethod(JSContext *cx, JSObject *obj,
    //uintN argc, jsval *argv, jsval *rval);

/*    
#if (JS_VERSION>180)
    static JSBool createObject18(JSContext *cx, uintN argc, jsval *vp);
    static JSBool getService18(JSContext *cx, uintN argc, jsval *vp);
    static JSBool printLog18(JSContext *cx, uintN argc, jsval *vp);
  private:
    static JSBool callNativeMethod18(JSContext *cx, uintN argc, jsval *vp);
  public:
#endif
*/
    static qlib::LScriptable *getServiceImpl(const char *clsname);

  };

}

#endif
