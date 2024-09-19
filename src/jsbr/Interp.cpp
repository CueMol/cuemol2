//
//
// $Id: Interp.cpp,v 1.17 2010/12/31 12:01:26 rishitani Exp $

#include <common.h>
#include <qlib/qlib.hpp>

#ifdef USE_INTERNAL_JS
#  include <js/src/jsapi.h>
#else
#  include <jsapi.h>
#endif

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

#include "jsbr.hpp"
#include "Interp.hpp"
#include "ObjWrapper.hpp"
//#include "AutoJSRequest.hpp"

#include <qlib/LVarArgs.hpp>

namespace fs = boost::filesystem;

using namespace jsbr;
using qlib::LString;

static JSClass global_class = {
  "CueMol2 global class", JSCLASS_GLOBAL_FLAGS,
  JS_PropertyStub, JS_PropertyStub,
  JS_PropertyStub,
#ifdef USE_INTERNAL_JS
  JS_PropertyStub,
#else
  JS_StrictPropertyStub,
#endif
  JS_EnumerateStub,
  JS_ResolveStub,
  JS_ConvertStub,
  JS_FinalizeStub,
  NULL, NULL,
  NULL,
  NULL, NULL, NULL
};

static void
errorReporterFunc(JSContext *cx, const char *message, JSErrorReport *report)
{
  if (!report) {
    LOG_DPRINTLN("%s", message);
    return;
  }

  LString prefix;
  if (report->lineno) {
    prefix = LString::format("%s %u:",
			     (report->filename)?(report->filename):"(unknown)",
			     report->lineno);
  }
  else if (report->filename) {
    prefix = LString::format("%s:",
			     report->filename);
  }

  if (JSREPORT_IS_WARNING(report->flags)) {
    prefix += LString::format("%swarning: ",
			      JSREPORT_IS_STRICT(report->flags) ? "strict " : "");
  }

  LOG_DPRINTLN("%s %s", prefix.c_str(), message);
  return;
}

////////////////////////////////////////////////////////////

Interp::~Interp()
{
  // cleanup related callback obj to this context
  ObjWrapper::invalidateCallbackObj(this);

  JSContext *pcx = (JSContext *)m_pdata;
  JS_DestroyContext(pcx);
}

bool Interp::init(qlib::LScriptable *pMainObj)
{
  JSContext *pcx = (JSContext *)m_pdata;

#ifdef USE_INTERNAL_JS
#else
  JSAutoRequest ar(pcx);
#endif

  JS_SetErrorReporter(pcx, errorReporterFunc);

  JSObject *pJsGlob;
#ifdef USE_INTERNAL_JS
  pJsGlob = JS_NewObject(pcx, &global_class, NULL, NULL);
#else
  pJsGlob = JS_NewCompartmentAndGlobalObject(pcx, &global_class, NULL);
#endif
  if (!pJsGlob)
    return false;

  JSBool res = JS_InitStandardClasses(pcx, pJsGlob);
  if (!res)
    return false;

  if (pMainObj) {
    JSObject *pJsObj = ObjWrapper::makeWrapper(pcx, pMainObj);

    res = JS_DefineProperty(pcx, pJsGlob, "scene", OBJECT_TO_JSVAL(pJsObj),
                            NULL, NULL, JSPROP_ENUMERATE|JSPROP_PERMANENT|JSPROP_READONLY);
    // res = JS_SetParent(pcx, pMainObj, ppar);
    if (!res) return false;
  }

  m_pGlob = pJsGlob;

  // Define "createObject" method
  JSFunction *pfun = JS_DefineFunction(pcx, pJsGlob, "newObj",
                                       ObjWrapper::createObject,
                                       1, 0);
  if (pfun==NULL) {
    LOG_DPRINTLN("JS_deffun failed!!");
  }

  // Define "getService" method
  pfun = JS_DefineFunction(pcx, pJsGlob, "getService",
                           ObjWrapper::getService,
                           1, 0);
  if (pfun==NULL) {
    LOG_DPRINTLN("JS_deffun failed!!");
  }

  // Define "print" method
  pfun = JS_DefineFunction(pcx, pJsGlob, "print",
                           ObjWrapper::printLog,
                           1, 0);
  if (pfun==NULL) {
    LOG_DPRINTLN("JS_deffun failed!!");
  }

  // Define "exec" method
  pfun = JS_DefineFunction(pcx, pJsGlob, "exec",
                           ObjWrapper::execFile, 1, 0);
  if (pfun==NULL) {
    LOG_DPRINTLN("JS_deffun failed!!");
  }

  // Define "callGC" method
  pfun = JS_DefineFunction(pcx, pJsGlob, "callGC",
                           ObjWrapper::callGC, 0, 0);
  if (pfun==NULL) {
    LOG_DPRINTLN("JS_deffun failed!!");
  }

  // Define "getAllClassNamesJSON" method
  pfun = JS_DefineFunction(pcx, pJsGlob, "getAllClassNamesJSON",
                           ObjWrapper::getAllClassNamesJSON, 0, 0);
  if (pfun==NULL) {
    LOG_DPRINTLN("JS_deffun failed!!");
  }

  // Define "getCmdArgs" method
  pfun = JS_DefineFunction(pcx, pJsGlob, "getCmdArgs",
                           ObjWrapper::getCmdArgs, 0, 0);
  if (pfun==NULL) {
    LOG_DPRINTLN("JS_deffun failed!!");
  }

  // set private data
  JS_SetContextPrivate(pcx, this);

  return true;
}

bool Interp::defineVar(const LString &varnm, qlib::LScriptable *pvalue)
{
  JSBool res;
  JSContext *pcx = (JSContext *)m_pdata;
  JSObject *pJsGlob = (JSObject *)m_pGlob;

  JSObject *pJsObj = ObjWrapper::makeWrapper(pcx, pvalue);

  res = JS_DefineProperty(pcx, pJsGlob, varnm, OBJECT_TO_JSVAL(pJsObj),
			  NULL, NULL, JSPROP_ENUMERATE|JSPROP_PERMANENT|JSPROP_READONLY);

  // res = JS_SetParent(pcx, pMainObj, ppar);
  if (!res) return false;

  return true;
}

bool Interp::invokeMethod(const LString &mthnm, qlib::LVarArgs &args, qlib::LScriptable *pobj)
{
  JSBool res;
  JSContext *pcx = (JSContext *)m_pdata;
  JSObject *pJsGlob = (JSObject *)m_pGlob;

  JSObject *pJsObj = pJsGlob;
  if (pobj!=NULL)
    pJsObj = ObjWrapper::makeWrapper(pcx, pobj);

  int argc = args.getSize();
  jsval *argv = MB_NEW jsval[argc];
  jsval rval;

  for (int i=0; i<argc; ++i) {
    argv[i] = ObjWrapper::LVarToJSVal(pcx, args.at(i));
  }

  res = JS_CallFunctionName(pcx, pJsObj, mthnm.c_str(),
			    argc, argv, &rval);
  delete [] argv;
  if (!res) return false;

  ObjWrapper::JSValToLVar(pcx, rval, args.retval());

  return true;
}

void Interp::eval(const qlib::LString &scr)
{
  JSContext *pcx = (JSContext *)m_pdata;
  JSObject *pJsGlob = (JSObject *)m_pGlob;

  const char *script = scr.c_str();
  const char *filename = "(none)";
  int lineno = 0;
  jsval rval;
  JSString *str;
  JSBool ok;

  MB_DPRINTLN("JSEval> scr=%s", scr.c_str());

  ok = JS_EvaluateScript(pcx, pJsGlob, script, strlen(script),
			 filename, lineno, &rval);

  /*
  if (ok) {
    str = JS_ValueToString(cx, rval);
    printf("script result: %s\n", JS_GetStringBytes(str));
  }
  else {
    printf("err\n");
    }*/

}

bool Interp::execFile(const qlib::LString &fname)
{
  JSContext *pcx = (JSContext *)m_pdata;
  JSObject *pJsGlob = (JSObject *)m_pGlob;

  JSBool res = ObjWrapper::execFileImpl(pcx, pJsGlob, fname, true);

  return res;
}

LString Interp::resolvePath(const LString &fname) const
{
  fs::path inpath(fname.c_str());

#if (BOOST_FILESYSTEM_VERSION==2)
  if (inpath.is_absolute())
    return inpath.file_string();
#else
  if (inpath.is_absolute())
    return inpath.string();
#endif

  qlib::MapTable<LString>::const_iterator iter = m_pathTab.begin();
  qlib::MapTable<LString>::const_iterator eiter = m_pathTab.end();
  for (; iter!=eiter; ++iter) {
    const LString &path = iter->second;
    fs::path base_path(path.c_str());
    fs::path test_path = fs::complete(inpath, base_path);

#if (BOOST_FILESYSTEM_VERSION==2)
    if (is_regular_file(test_path))
      return test_path.file_string();
#else
    if (is_regular_file(test_path))
      return test_path.string();
#endif
  }

  return fname;
}

