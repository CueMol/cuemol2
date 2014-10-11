//
// Javascript object wrapper
//
// $Id: ObjWrapper.cpp,v 1.25 2010/12/31 12:01:26 rishitani Exp $

#include <common.h>

#include <qlib/LUnicode.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/ClassRegistry.hpp>

#ifdef USE_INTERNAL_JS
#  include <js/src/jsapi.h>
#  include <js/src/jsprvtd.h>
#  include <js/src/jsatom.h>
#else
#  include <jsapi.h>
#endif

#include "Interp.hpp"
#include "ObjWrapper.hpp"
#include "JSCallBackObj.hpp"
//#include "AutoJSRequest.hpp"

using namespace jsbr;
using qlib::LString;
using qlib::LScriptable;
using qlib::LVarArray;

////////////////////////////////////////////////////////////

//static
LScriptable *ObjWrapper::getQLibObj(JSContext *cx, JSObject *pobj)
{
  JSObject *pnobj = pobj;
  while (JS_GET_CLASS(cx, pnobj) != &wrapper_class) {
    pnobj = ::JS_GetPrototype(cx, pnobj);
  }

  if (pnobj==NULL) {
    LOG_DPRINTLN("getQLibObj: JSObject %p is not ObjWrapper.", pobj);
    return NULL;
  }

  LScriptable *pqobj = (LScriptable *)::JS_GetPrivate(cx, pnobj);
  // LScriptable *pqobj = dynamic_cast<LScriptable *>(::JS_GetPrivate(cx, pnobj));
  // LOG_DPRINTLN("JS_GetPrivate ctx: %p, js:%p, qlib:%p", cx, pnobj, pqobj);
  // LOG_DPRINTLN("getQLibObj: LScriptable %p.", pqobj);
  return pqobj;
}

JSObject *ObjWrapper::makeWrapper(JSContext *pcx, LScriptable *pnewobj)
{
  // TO DO: reuse wrapper object !!
#ifdef USE_INTERNAL_JS
  // XXX
#else
  JSAutoRequest ar(pcx);
#endif
  
  JSObject *pjsobj = JS_NewObject(pcx, &wrapper_class, NULL, NULL);
  if (pjsobj==NULL)
    return JS_FALSE;

  if (!JS_SetPrivate(pcx, pjsobj, pnewobj))
    return JS_FALSE;

  // MB_DPRINTLN("JS_SetPrivate cx:%p, js:%p, qlib:%p", pcx, pjsobj, pnewobj);
  return pjsobj;
}


JSBool ObjWrapper::throwError(JSContext* cx, const char *pmsg)
{
  LOG_DPRINTLN(pmsg);
  ::JS_ReportError(cx, pmsg);
  return JS_FALSE;
}

LString convJSStr2LStr(JSContext* cx, JSString *jsstr)
{
  LString retval;

#ifdef USE_INTERNAL_JS
  retval = LString( JS_GetStringBytes(jsstr) );
#else
  const jschar *ucs16;
  size_t nlen;
  JS::Anchor<JSString *> a_str(jsstr);
  
  ucs16 = ::JS_GetStringCharsAndLength(cx, jsstr, &nlen);
  qlib::UCS16toUTF8((const U16Char *)ucs16, nlen, retval);
#endif

  return retval;
}

/*
LString convID2Str(jsval id)
{
  if (JSVAL_IS_STRING(id)) {
    JSString *str = JSVAL_TO_STRING(id);
    jschar *ucs16 = ::JS_GetStringChars(str);
    int nlen = ::JS_GetStringLength(str);
    LString retval;
    qlib::UCS16toUTF8((const U16Char *)ucs16, nlen, retval);
    return retval;
  }

  return LString();
}
*/

LString convID2Str(JSContext *pcx, jsid id)
{
  jsval jv;

  if (!JS_IdToValue(pcx, id, &jv))
    return LString();
  
  if (JSVAL_IS_STRING(jv)) {
    JSString *str = JSVAL_TO_STRING(jv);
    return convJSStr2LStr(pcx, str);
  }
  else {
    MB_DPRINTLN("convID2Str ID %d is not string", JSVAL_TAG(jv));
  }
  return LString();
}

LString convJsval2Str(JSContext *pcx, jsval id)
{
  if (JSVAL_IS_STRING(id)) {
    JSString *str = JSVAL_TO_STRING(id);
    if (str!=NULL)
      return convJSStr2LStr(pcx, str);
    //else
    //return LString("(null)");
  }
  //else {
  //return LString::format("[%d]", JSVAL_TO_INT(id));
  //}
  return LString();
}


/// Conversion from LVariant to jsval
//static
jsval ObjWrapper::LVarToJSVal(JSContext *cx, qlib::LVariant &variant)
{
  JSBool res;

  switch (variant.getTypeID()) {
  case qlib::LVariant::LT_NULL:
    MB_DPRINTLN("LVar: null");
    return JSVAL_NULL;

  case qlib::LVariant::LT_BOOLEAN:
    MB_DPRINTLN("LVar: boolean(%d)", variant.getBoolValue());
    return BOOLEAN_TO_JSVAL(variant.getBoolValue());

  case qlib::LVariant::LT_INTEGER:
    MB_DPRINTLN("LVar: integer(%d)", variant.getIntValue());
    return INT_TO_JSVAL(variant.getIntValue());

  case qlib::LVariant::LT_REAL: {
    MB_DPRINTLN("LVar: real(%f)", variant.getRealValue());
    jsval val;
    if (::JS_NewNumberValue(cx, variant.getRealValue(), &val)) {
      return val;
    }
    break;
  }

  case qlib::LVariant::LT_STRING: {
    LString str = variant.getStringValue();
    MB_DPRINTLN("LVar: string(%s)", str.c_str());
    int ucs16len;
    U16Char *pucs16 = qlib::UTF8toUCS16(str, &ucs16len);
    JSString *pjsstr = ::JS_NewUCStringCopyN(cx, (const jschar *)pucs16, ucs16len);
    //JSString *pjsstr = ::JS_NewString(cx, (char *)str.c_str(), str.length());
    delete [] pucs16;
    if (pjsstr!=NULL)
      return STRING_TO_JSVAL(pjsstr);

    break;
  }

  case qlib::LVariant::LT_OBJECT: {
    MB_DPRINTLN("LVar: object(%p)", variant.getObjectPtr());
    JSObject *obj = makeWrapper(cx, variant.getObjectPtr());
    if (obj!=NULL) {
      // Now the ownership of value is passed to jsval.
      // (Below avoids deleting the ptr transferred to jsval *vp)
      variant.forget();
      return OBJECT_TO_JSVAL(obj);
    }
    break;
  }
    
  case qlib::LVariant::LT_ARRAY: {
    LVarArray *pLArray = variant.getArrayPtr();
    int nCount = pLArray->getSize();
    MB_DPRINTLN("LVar: array(%d)", nCount);

    JSObject *pret = JS_NewArrayObject(cx, nCount, NULL);
    if (pret==NULL) {
      break;
    }
    
    for (int i=0; i<nCount; ++i) {
      jsval pelem = LVarToJSVal(cx, pLArray->at(i));
      res = JS_SetElement(cx, pret, i, &pelem);
      MB_ASSERT(res);
    }

    return OBJECT_TO_JSVAL(pret);
  }

  default:
    LOG_DPRINTLN("ObjWrapper::LVarToJSVal> Unknown LVariant type!");
    break;
  }

  LOG_DPRINTLN("ObjWrapper::LVarToJSVal> Unable to convert LVariant to jsval!");
  return JSVAL_VOID;
}

//static
bool ObjWrapper::JSValToLVar(JSContext *cx, jsval val, qlib::LVariant &variant)
{
  if (JSVAL_IS_PRIMITIVE(val)) {

    //if (val == JSVAL_VOID) {
    //VOID_TO_NPVARIANT(*variant);
    //}

    if (JSVAL_IS_NULL(val) || JSVAL_IS_VOID(val)) {
      variant.setNull();
    }

    else if (JSVAL_IS_BOOLEAN(val)) {
      variant.setBoolValue(JSVAL_TO_BOOLEAN(val));
    }

    else if (JSVAL_IS_INT(val)) {
      variant.setIntValue(JSVAL_TO_INT(val));
    }

    else if (JSVAL_IS_DOUBLE(val)) {
#if (JS_VERSION>180)
      variant.setRealValue(JSVAL_TO_DOUBLE(val));
#else
      variant.setRealValue(*JSVAL_TO_DOUBLE(val));
#endif
    }

    else if (JSVAL_IS_STRING(val)) {
      JSString *jsstr = JSVAL_TO_STRING(val);
      variant.setStringValue(convJSStr2LStr(cx, jsstr));
      //MB_DPRINTLN("JSVal->LVar(%p) setString(%p)", &variant, variant.value.pStrValue);
    }

    else {
      LOG_DPRINTLN("Unknown primitive type!");
      return false;
    }

    return true;
  }
  else {
    JSObject *pjsobj = JSVAL_TO_OBJECT(val);

    if (JS_ObjectIsFunction(cx, pjsobj)) {
      //LOG_DPRINTLN("JS> ERROR, Conversion of Function is unsupported.");
      Interp *pInterp = reinterpret_cast<Interp *>(JS_GetContextPrivate(cx));
      MB_ASSERT(pInterp!=NULL);
      JSCallBackObj *pJSCB = new JSCallBackObj(cx, val, pInterp);
      qlib::LSCBPtr *ppCB = new qlib::LSCBPtr(pJSCB);
      //variant.shareObjectPtr(ppCB);
      variant.setObjectPtr(ppCB);
      return true;
    }
    else if (JS_IsArrayObject(cx, pjsobj)) {
      LOG_DPRINTLN("JS> ERROR, Conversion of Array is unsupported.");
      return false;
    }
    else {
      LScriptable *pobj = getQLibObj(cx, pjsobj);
      if (pobj==NULL)
      return false;
      // pobj is owned by jsval
      // (variant share the ptr and don't have an ownership)
      variant.shareObjectPtr(pobj);
      return true;
    }

  }
}

// static
JSBool ObjWrapper::addProperty(JSContext *cx, JSObject *obj, jsid id, jsval *vp)
{
  MB_DPRINTLN("Wrap: AddProperty(%s)", convJsval2Str(cx, id).c_str());
  return JS_PropertyStub(cx, obj, id, vp);
}

JSBool ObjWrapper::delProperty(JSContext *cx, JSObject *obj, jsid id, jsval *vp)
{
  // TO DO: ???
  MB_DPRINTLN("Wrap: DelProperty(%s)", convJsval2Str(cx, id).c_str());
  return JS_PropertyStub(cx, obj, id, vp);
}

#ifdef USE_INTERNAL_JS
JSBool ObjWrapper::setProperty(JSContext *cx, JSObject *obj, jsid id, jsval *vp)
#else
JSBool ObjWrapper::setProperty(JSContext *cx, JSObject *obj, jsid id, JSBool, jsval *vp)
#endif
{
//MB_DPRINTLN("Wrap: SetProperty(%s)", convJsval2Str(cx, id).c_str());

  qlib::LPropSupport *pobj = 
    dynamic_cast<qlib::LPropSupport *>(getQLibObj(cx, obj));

  if (pobj==NULL) {
    LString msg = "SetProp: object is not PropSupport.";
    LOG_DPRINTLN(msg);
    return throwError(cx, msg);
  }

  // convert id to string
  LString propname;
#ifdef USE_INTERNAL_JS
  // before JSAPI_18 id is jsval
  propname = convJsval2Str(cx, id);
#else
  // after JSAPI_181 id is jsid
  propname = convID2Str(cx, id);
#endif
  if (propname.isEmpty()) {
    LString msg = "SetProp: non string property is not supported.";
    LOG_DPRINTLN("Error %s", msg.c_str());
    return throwError(cx, msg);
  }

  if (!pobj->hasWritableProperty(propname)) {
    LString msg =
      LString::format("SetProp: writable property \"%s\" does not exist.",
		      propname.c_str());
    LOG_DPRINTLN("Error %s", msg.c_str());
    return throwError(cx, msg);
  }

  // vp owns the object,
  // and this variant (lvar) doesn't have ownership of its content
  qlib::LVariant lvar;
  if (!JSValToLVar(cx, *vp, lvar)) {
    LString msg =
      LString::format("SetProp(%s): Error converting jsval to LVariant.",
		      propname.c_str());
    LOG_DPRINTLN("Error %s", msg.c_str());
    return throwError(cx, msg);
  }

  // pobj possibly own the copy of lvar's content
  bool ok = pobj->setProperty(propname, lvar);

  if (!ok) {
    LString msg =
      LString::format("SetProp: property \"%s\" failed.", propname.c_str());
    LOG_DPRINTLN("Error %s", msg.c_str());
    return throwError(cx, msg);
  }

  return JS_TRUE;
}


JSBool ObjWrapper::getProperty(JSContext *cx, JSObject *obj, jsid id, jsval *vp)
{
  //MB_DPRINTLN("Wrap: GetProperty(%s)", convJsval2Str(cx, id).c_str());

  LScriptable *pscrobj = getQLibObj(cx, obj);

  // XXX: This dyncast is strange, since LScriptable inherits LPropSupport interface...
  // TO DO: remove pscrobj/pobj conversion (and error check code...)
  qlib::LPropSupport *pobj = 
    dynamic_cast<qlib::LPropSupport *>(pscrobj);

  if (pobj==NULL) {
    LOG_DPRINTLN("GetProp: object is not PropSupport.");
    return JS_FALSE;
  }

  // convert id to string
  LString propname;
#ifdef USE_INTERNAL_JS
  // before JSAPI_18 id is jsval
  propname = convJsval2Str(cx, id);
#else
  // after JSAPI_181 id is jsid
  propname = convID2Str(cx, id);
#endif
  if (propname.isEmpty()) {
    return throwError(cx, "GetProp: Non-string property is not supported.");
  }

  bool hasProperty = pobj->hasProperty(propname);

  if (!hasProperty) {
    if (pscrobj->hasMethod(propname)) {
      return JS_TRUE;
    }

    LString msg =
      LString::format("GetProp: property \"%s\" not found.", propname.c_str());
    return throwError(cx, msg);
  }

  qlib::LVariant lvar;

  if (!pobj->getProperty(propname, lvar)) {
    LString msg =
      LString::format("GetProp: getProperty(\"%s\") call failed.", propname.c_str());
    return throwError(cx, msg);
  }

  *vp = LVarToJSVal(cx, lvar);

  //MB_DPRINTLN("GetProp: getProperty\(\"%s\") OK.", propname.c_str());
  return JS_TRUE;
}

JSBool ObjWrapper::resolve2(JSContext *cx, JSObject *obj, jsval id, uintN flags,
			   JSObject **objp)
{
  JSBool ok;
  //MB_DPRINTLN("Resolve2(%s)", convJsval2Str(cx, id).c_str());

  LScriptable *pobj = getQLibObj(cx, obj);
  //MB_DPRINTLN("Resolve2: LScriptable(%p).", pobj);

  if (pobj==NULL) {
    LString msg =
      LString::format("Resolve2: object(%p) is not LScriptable.", obj);
    return throwError(cx, msg);
  }

  // convert id to string or number
  LString propname;
  if (JSVAL_IS_STRING(id)) {
    propname = convJsval2Str(cx, id);
  }
  //else if (JSVAL_IS_INT(id)) {
  //}
  else {
    return throwError(cx, "Resolve2: invalid prop/meth name type");
  }

  MB_DPRINTLN("Resolve2: propname(%s).", propname.c_str());

  if (pobj->hasProperty(propname)) {
    int attr = JSPROP_ENUMERATE|JSPROP_PERMANENT;
    if (!pobj->hasWritableProperty(propname))
      attr |= JSPROP_READONLY;
    
    MB_DPRINTLN("Resolve2 %s: property (OK).", propname.c_str());
    ok = ::JS_DefineProperty(cx, obj, propname.c_str(),
                             JSVAL_VOID, NULL, NULL, attr);

    // number property (=array) is not supported in cuemol
    // ok = ::JS_DefineElement(cx, obj, JSVAL_TO_INT(id), JSVAL_VOID, NULL,
    // NULL, attr);

    if (!ok)
      return JS_FALSE;

    *objp = obj;
    return JS_TRUE;
  }

  if (propname.equals("toString") ||
      pobj->hasMethod(propname)) {
    //MB_DPRINTLN("Resolve %s: method", propname.c_str());
    JSFunction *fnc =
      ::JS_DefineFunction(cx, obj, propname.c_str(),
                          callNativeMethod, 0, JSPROP_ENUMERATE);
    *objp = obj;
    return fnc != NULL;
  }

  return JS_TRUE;
}

void ObjWrapper::finalize(JSContext *cx, JSObject *obj)
{
  LScriptable *pobj = getQLibObj(cx, obj);
  MB_DPRINTLN("Wrap: Finalize js:%p / q:%p", obj, pobj);

  if (pobj!=NULL)
    pobj->destruct();

  return;
}

//JSBool ObjWrapper::call(JSContext *cx, JSObject *obj, uintN argc, jsval *argv,jsval *rval)
JSBool ObjWrapper::JSNATIVE_PROTO(call)
{
  MB_DPRINTLN("Wrap: Call");
  return JS_TRUE;
}

//static
JSClass ObjWrapper::wrapper_class;

//static
CallBackMgr *ObjWrapper::m_pCbMgr;

//static
void ObjWrapper::init()
{
  ::memset(&wrapper_class, 0, sizeof(JSClass));

  wrapper_class.name = "CueMol2 object wrapper class";
  wrapper_class.flags = JSCLASS_HAS_PRIVATE | JSCLASS_NEW_RESOLVE;
  wrapper_class.addProperty = addProperty;
  wrapper_class.delProperty = delProperty;
  wrapper_class.getProperty = getProperty;
  wrapper_class.setProperty = setProperty;
  wrapper_class.enumerate = JS_EnumerateStub;
  wrapper_class.resolve = (JSResolveOp)resolve2;
  wrapper_class.convert = JS_ConvertStub;
  wrapper_class.finalize = finalize;
  //wrapper_class.getObjectOps = 0;
  wrapper_class.checkAccess = 0;
  wrapper_class.call = call;
  wrapper_class.construct = 0;
  wrapper_class.xdrObject = 0;
  wrapper_class.hasInstance = 0;

  m_pCbMgr = new CallBackMgr();
}

// static
void ObjWrapper::fini()
{
  delete m_pCbMgr;
}

//static
void ObjWrapper::registerCallbackObj(JSCallBackObj *pObj)
{
  m_pCbMgr->registerObj(pObj);
}

//static
void ObjWrapper::unregisterCallbackObj(JSCallBackObj *pObj)
{
  m_pCbMgr->unregisterObj(pObj);
}

//static
void ObjWrapper::invalidateCallbackObj(Interp *pInt)
{
  m_pCbMgr->invalidate(pInt);
}


///////////////////////////////////////////////////////////////

//static
JSBool ObjWrapper::JSNATIVE_PROTO(createObject)
{
#ifdef USE_JSNATIVE_JS180
  JSObject *pobj = JS_THIS_OBJECT(pcx, vp);
  jsval *pargv = JS_ARGV(pcx, vp);
  jsval rval;
  jsval *prval = &rval;
#endif

  if (argc!=1)
    return JS_FALSE;
  if (!JSVAL_IS_STRING(pargv[0]))
    return JS_FALSE;

  JSString *pjsstr = JSVAL_TO_STRING(pargv[0]);
  //const char *parg0 = JS_GetStringBytes(pjsstr);
  LString arg0 = convJSStr2LStr(pcx, pjsstr);

  // LOG_DPRINTLN("createObject(%s) called!!", parg0);

  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);

  qlib::LClass *pcls;
  try {
    pcls = pMgr->getClassObj(arg0);
    MB_DPRINTLN("LClass: %p", pcls);
    // if (pcls==NULL)
    // return JS_FALSE;
  }
  catch (...) {
    LString msg = LString::format("getClassObj(%s) failed.", arg0.c_str());
    return throwError(pcx, msg);
  }

  LScriptable *pnewobj =
    dynamic_cast<LScriptable *>(pcls->createScrObj());
  if (pnewobj==NULL) {
    LString msg = LString::format("createObj(%s) failed.", arg0.c_str());
    return throwError(pcx, msg);
  }

  //  // increment the reference counter, if the object's copy policy is REFCOUNT
  //  if (pnewobj->getCopyPolicy()==LScriptable::CP_REFCOUNT)
  //    pnewobj = pnewobj->copy();

  JSObject *pjsobj = makeWrapper(pcx, pnewobj);
  if (pjsobj==NULL) {
    LString msg = LString::format("createObj(%s) failed.", arg0.c_str());
    return throwError(pcx, msg);
  }

  *prval = OBJECT_TO_JSVAL(pjsobj);

#ifdef USE_JSNATIVE_JS180
  JS_SET_RVAL(pcx, vp, *prval);
#endif

  return JS_TRUE;
}

//static
qlib::LScriptable *ObjWrapper::getServiceImpl(const char *clsname)
{
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);
  qlib::LDynamic *ptmp = pMgr->getSingletonObj(clsname);
  return &dynamic_cast<LScriptable &>(*ptmp);
}

//static
JSBool ObjWrapper::JSNATIVE_PROTO(getService)
{
#ifdef USE_JSNATIVE_JS180
  JSObject *pobj = JS_THIS_OBJECT(pcx, vp);
  jsval *pargv = JS_ARGV(pcx, vp);
  jsval rval;
  jsval *prval = &rval;
#endif

  if (argc!=1)
    return JS_FALSE;
  if (!JSVAL_IS_STRING(pargv[0]))
    return JS_FALSE;

  JSString *pjsstr = JSVAL_TO_STRING(pargv[0]);
  //const char *parg0 = JS_GetStringBytes(pjsstr);
  LString arg0 = convJSStr2LStr(pcx, pjsstr);

  // LOG_DPRINTLN("getService(%s) called!!", parg0);

  LScriptable *psvc;
  try {
    psvc = getServiceImpl(arg0);
  }
  catch (...) {
    LString msg = LString::format("getSingletonObj(%s) failed.", arg0.c_str());
    return throwError(pcx, msg);
  }

  JSObject *pjsobj = makeWrapper(pcx, psvc);
  if (pjsobj==NULL) {
    LString msg = LString::format("getService(%s) failed.", arg0.c_str());
    return throwError(pcx, msg);
  }

  *prval = OBJECT_TO_JSVAL(pjsobj);

#ifdef USE_JSNATIVE_JS180
  JS_SET_RVAL(pcx, vp, *prval);
#endif

  return JS_TRUE;
}

/////////////////////////////////////////////////////////////////////////////

/**
   The wrapper for all native methods
*/
//static
JSBool ObjWrapper::JSNATIVE_PROTO(callNativeMethod)
{
#ifdef USE_JSNATIVE_JS180
  JSObject *pobj = JS_THIS_OBJECT(pcx, vp);
  jsval *pargv = JS_ARGV(pcx, vp);
  jsval rval;
  jsval *prval = &rval;
#endif

  JSObject *obj = pobj;
  MB_DPRINTLN("CallNativeMethod: called.");

  while (JS_GET_CLASS(pcx, obj) != &wrapper_class) {
    obj = ::JS_GetPrototype(pcx, obj);
  }

  if (!obj) {
    return throwError(pcx, "NativeMethod called on non-QLibObject wrapped JSObject!");
  }

  LScriptable *pscr = getQLibObj(pcx, obj);

  if (pscr==NULL) {
    return throwError(pcx, "CallNativeMethod: Bad QLibObject as private data!");
  }

  qlib::LVarArgs largs(argc);

  // Convert arguments
  // jsval have ownerships,
  // and therefore largs doesn't own its contents.
  int i;
  for (i = 0; i < argc; ++i) {
    if (!JSValToLVar(pcx, pargv[i], largs.at(i))) {
      return throwError(pcx, "CallNativeMethod: Error converting jsvals to LVarArgs!");
    }
  }

  // get the method name
  JSObject *funobj = JSVAL_TO_OBJECT(pargv[-2]);
  JSBool ok = JS_FALSE;
  LString mthnm;
  LString errmsg;

  if (funobj != obj) {
    // A obj.function() style call is made, get the method name from
    // the function object.

    JSFunction *fun = (JSFunction *)::JS_GetPrivate(pcx, funobj);
    JSString *pmthnam = ::JS_GetFunctionId(fun);

    mthnm = convJSStr2LStr(pcx, pmthnam);
    
    MB_DPRINTLN("NativeMethod: invoke %s(argc:%d)", mthnm.c_str(), largs.getSize());

    try {
      ok = pscr->invokeMethod(mthnm, largs);
      if (!ok) {
	errmsg = 
	  LString::format("CallNativeMethod: Error invoking method \"%s\" on object %p!",
			  mthnm.c_str(), pscr);
      }
    }
    catch (qlib::LException &e) {
      ok = JS_FALSE;
      errmsg = 
	LString::format("Exception occured in native method %s: %s",
			mthnm.c_str(), e.getFmtMsg().c_str());
    }
    catch (...) {
      ok = JS_FALSE;
      errmsg = 
	LString::format("Unknown Exception occured in native method %s",
			mthnm.c_str());
    }
  }

  /*
  else {
    // obj is a callable object that is being called, no method name
    // available then. Invoke the default method.
    // ok = npobj->_class->invokeDefault(npobj, npargs, argc, &v);
  }
  */

  if (!ok) {
    return throwError(pcx, errmsg);
  }

  *prval = LVarToJSVal(pcx, largs.retval());

#ifdef USE_JSNATIVE_JS180
  JS_SET_RVAL(pcx, vp, *prval);
#endif

  return JS_TRUE;
}

//static
JSBool ObjWrapper::JSNATIVE_PROTO(printLog)
{
#ifdef USE_JSNATIVE_JS180
  JSObject *pobj = JS_THIS_OBJECT(pcx, vp);
  jsval *pargv = JS_ARGV(pcx, vp);
#endif

  if (argc!=1 || !JSVAL_IS_STRING(pargv[0])) {
    return throwError(pcx, "printLog: invalid arguments");
  }

  JSString *pjsstr = JSVAL_TO_STRING(pargv[0]);
  LString arg0 = convJSStr2LStr(pcx, pjsstr);
  //fprintf(stdout, "%s\n", parg0);
  LOG_DPRINTLN("%s", arg0.c_str());

  return JS_TRUE;
}

//static
JSBool ObjWrapper::JSNATIVE_PROTO(callGC)
{
  if (argc!=0)
    return throwError(pcx, "callGC: invalid arguments");

  JS_GC(pcx);
  return JS_TRUE;
}

static LString getStringProp(JSContext *pcx, JSObject *pJSObj, const char *name)
{
  jsval value;
  JSBool ok;
  
  ok = JS_GetProperty(pcx, pJSObj, name, &value);
  if (!ok)
    return LString();

  JSString *pStr = JS_ValueToString(pcx, value);
  if (pStr==NULL)
    return LString();
  
  return convJSStr2LStr(pcx, pStr);
}

static void formatMozStackTrace(const LString &str)
{
  if (str.isEmpty())
    return;
  
  std::list<LString> line;
  str.split('\n', line);

  if (line.empty())
    return;

  LOG_DPRINTLN("JS> Stack Trace:");

  std::list<LString>::const_iterator i = line.begin();
  std::list<LString>::const_iterator end = line.end();
  for (int ind=0; i!=end; ++i,++ind) {
    const LString &s = *i;
    if (s.isEmpty())
      continue;
    int atIndex = s.indexOf('@');
    int colonIndex = s.lastIndexOf(':');
    LString fname = s.substr(atIndex+1, colonIndex-atIndex-1);
    LString lineno = s.substr(colonIndex+1);
    LString funcSig = s.substr(0, atIndex);
    LString funcName = funcSig.substr(0, funcSig.indexOf('('));

    if (funcSig.isEmpty())
      funcSig = "<global context>";
    else if (funcName.isEmpty())
      funcSig = "<anonfunc>";

    LOG_DPRINTLN(" %d : File \"%s\", line %s, in %s",
                 ind, fname.c_str(), lineno.c_str(), funcSig.c_str());
  }
}


//static
JSBool ObjWrapper::JSNATIVE_PROTO(execFile)
{
#ifdef USE_JSNATIVE_JS180
  JSObject *pobj = JS_THIS_OBJECT(pcx, vp);
  jsval *pargv = JS_ARGV(pcx, vp);
#endif

  if (argc!=1 || !JSVAL_IS_STRING(pargv[0]))
    return throwError(pcx, "execFile: invalid arguments");

  JSString *pjsstr = JSVAL_TO_STRING(pargv[0]);
  LString arg0 = convJSStr2LStr(pcx, pjsstr);

  return execFileImpl(pcx, pobj, arg0, false);
}

//static
JSBool ObjWrapper::execFileImpl(JSContext *pcx, JSObject *pobj, const LString &fname, bool bCatchError)
{
  // check context
  Interp *pInterp = reinterpret_cast<Interp *>(JS_GetContextPrivate(pcx));
  LString scrpath = fname;
  if (pInterp!=NULL)
    scrpath = pInterp->resolvePath(fname);

#ifdef USE_INTERNAL_JS
  JSScript *pscr;
#else
  JSObject *pscr;
#endif
  pscr = JS_CompileFile(pcx, pobj, scrpath);
  if (pscr==NULL) {
    LString msg = LString::format("JS> exec() cannot compile: %s", scrpath.c_str());
    // LOG_DPRINTLN(msg);
    return throwError(pcx, msg);
  }

  /*
  JSObject *pscrObj;
  pscrObj = JS_NewScriptObject(pcx, pscr);
  if (pscrObj == NULL) {
    //JS_DestroyScript(cx, script);
    LString msg = LString::format("JS> exec() cannot compile: %s", scrpath.c_str());
    return throwError(pcx, msg);
  }
  if (!JS_AddNamedObjectRoot(pcx, &pscrObj, "CueMol script object")) {
    LString msg = LString::format("JS> exec() addRoot failed: %s", scrpath.c_str());
    return throwError(pcx, msg);
  }
   */

  jsval rval;
  JS_SetOptions(pcx, JS_GetOptions(pcx) | JSOPTION_DONT_REPORT_UNCAUGHT);
  JSBool ok = JS_ExecuteScript(pcx, pobj, pscr, &rval);
  JS_SetOptions(pcx, JS_GetOptions(pcx) & ~JSOPTION_DONT_REPORT_UNCAUGHT);

  //JS_DestroyScript(pcx, pscr);
  JS_MaybeGC(pcx);

  bool bRet = JS_TRUE;
  if (!ok) {
    if (bCatchError && JS_IsExceptionPending(pcx)) {
      jsval exc;
      if (JS_GetPendingException(pcx, &exc)) {
        LOG_DPRINTLN("JS> Exception: "+getStringProp(pcx, JSVAL_TO_OBJECT(exc), "name"));
        LOG_DPRINTLN("JS> Message: "+getStringProp(pcx, JSVAL_TO_OBJECT(exc), "message"));
        LOG_DPRINTLN("JS> File: \"%s\", line %s",
                     getStringProp(pcx, JSVAL_TO_OBJECT(exc), "fileName").c_str(),
                     getStringProp(pcx, JSVAL_TO_OBJECT(exc), "lineNumber").c_str());
        formatMozStackTrace(getStringProp(pcx, JSVAL_TO_OBJECT(exc), "stack"));
        JS_ClearPendingException(pcx);
        
        LString msg = LString::format("JS> exec() error: %s", scrpath.c_str());
        LOG_DPRINTLN(msg);
        // return throwError(pcx, msg);
        //return JS_TRUE;
      }
      else {
        bRet = JS_FALSE;
        //return JS_FALSE;
      }
    }
    else {
      bRet = JS_FALSE;
      //return JS_FALSE;
    }
  }
  
  // // pscrObj becomes unreachable, and will eventually be collected.
  // JS_RemoveObjectRoot(pcx, &pscrObj);

  return bRet;
}

//static
JSBool ObjWrapper::JSNATIVE_PROTO(getAllClassNamesJSON)
{
#ifdef USE_JSNATIVE_JS180
  jsval rval;
  jsval *prval = &rval;
#endif

  if (argc!=0)
    return throwError(pcx, "getAllClassNamesJSON: invalid arguments");

  //////////

  std::list<qlib::LString> ls;
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);
  pMgr->getAllClassNames(ls);
  
  LString rstr = "[";
  bool ffirst = true;
  BOOST_FOREACH (const LString &str, ls) {
    MB_DPRINTLN("GACNJSON> class %s", str.c_str());
    if (!ffirst)
      rstr += ",";
    rstr += "\"" + str + "\"";
    ffirst = false;
  }
  rstr += "]";

  //////////

  int nlen = rstr.length();
  JSString *pjsstr = ::JS_NewStringCopyN(pcx, rstr.c_str(), nlen);
  if (pjsstr==NULL)
    return throwError(pcx, "getAllClassNamesJSON: cannot create string");
  *prval = STRING_TO_JSVAL(pjsstr);


#ifdef USE_JSNATIVE_JS180
  JS_SET_RVAL(pcx, vp, *prval);
#endif

  return JS_TRUE;
}

//static
JSBool ObjWrapper::JSNATIVE_PROTO(getCmdArgs)
{
#ifdef USE_JSNATIVE_JS180
  JSObject *pobj = JS_THIS_OBJECT(pcx, vp);
  jsval *pargv = JS_ARGV(pcx, vp);
  jsval rval;
  jsval *prval = &rval;
#endif

  if (argc!=1 || !JSVAL_IS_INT(pargv[0]))
    return throwError(pcx, "getCmdArgs: invalid argument 0");

  int n0 = JSVAL_TO_INT(pargv[0]);
  Interp *pInterp = reinterpret_cast<Interp *>(JS_GetContextPrivate(pcx));
  const std::deque<LString> &args = pInterp->getCmdArgs();
  int nargs = args.size();

  if (n0<0 || n0>=nargs) {
    // returns num of args
    *prval = INT_TO_JSVAL(nargs);
  }
  else {
    const LString &rstr = args[n0];
    int nlen = rstr.length();
    JSString *pjsstr = ::JS_NewStringCopyN(pcx, rstr.c_str(), nlen);
    if (pjsstr==NULL)
      return throwError(pcx, "getCmdArgs: cannot create string");
    *prval = STRING_TO_JSVAL(pjsstr);
  }

#ifdef USE_JSNATIVE_JS180
  JS_SET_RVAL(pcx, vp, *prval);
#endif

  return JS_TRUE;
}

