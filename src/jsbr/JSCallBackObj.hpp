// -*-Mode: C++;-*-
//
// Script callback wrapper class
//


#ifndef JSBR_JSSCRCALLBACK_HPP_INCLUDED__
#define JSBR_JSSCRCALLBACK_HPP_INCLUDED__

#include "jsbr.hpp"
#include <qlib/LString.hpp>
#include <qlib/LScriptable.hpp>
#include <qlib/LScrCallBack.hpp>

namespace jsbr {

using qlib::LString;

class JSCallBackObj;

class CallBackMgr
{
private:
  
  typedef std::deque<JSCallBackObj*> data_t;

  data_t m_data;

public:
  CallBackMgr()
  {
  }

  ~CallBackMgr()
  {
  }

  void registerObj(JSCallBackObj *pObj)
  {
    m_data.push_back(pObj);
  }

  void unregisterObj(JSCallBackObj *pObj)
  {
    data_t::iterator i = std::find(m_data.begin(), m_data.end(), pObj);
    if (i==m_data.end()) return;
    m_data.erase(i);
  }

  void invalidate(Interp *pInt);
};

class JSCallBackObj : public qlib::LScrCallBack
{
private:
  JSContext *m_pCx;
  jsval m_func;
  Interp *m_pInterp;

public:

  JSCallBackObj(JSContext *pcx, jsval fval, Interp *pIntp)
  {
    m_pCx = pcx;
    m_func = fval;
    m_pInterp = pIntp;
#ifdef USE_INTERNAL_JS
    JS_AddNamedRoot(pcx, &m_func, "JSCallBackObj");
#else
    JS_AddNamedValueRoot(pcx, &m_func, "JSCallBackObj");
#endif
    ObjWrapper::registerCallbackObj(this);
  }

  virtual ~JSCallBackObj()
  {
    invalidate();
    ObjWrapper::unregisterCallbackObj(this);
  }

  virtual bool invoke(qlib::LVarArgs &args)
  {
    if (m_pCx==NULL) {
      MB_DPRINTLN("JSCallBackObj.invoke> context has been destroyed, and invoke ignored.");
      return true;
    }
      
    const int nargs = args.getSize();
    jsval rval;
    JSBool ok;
    
    if (nargs==0) {
      ok = JS_CallFunctionValue(m_pCx, NULL, m_func, 0, NULL, &rval);
    }
    else {
      jsval *argv = new jsval[nargs];
      for (int i=0; i<nargs; ++i) {
        jsval arg = ObjWrapper::LVarToJSVal(m_pCx, args.at(i));
        if (JSVAL_IS_VOID(arg)) {
          LOG_DPRINTLN("JSCallBackObj.invoke> arg %d conv failed.", i);
          delete [] argv;
          return false;
        }
        argv[i] = arg;
      }
      
      ok = JS_CallFunctionValue(m_pCx, NULL, m_func, nargs, argv, &rval);
      delete [] argv;
    }
    
    if (!ok) {
      LOG_DPRINTLN("JSCallBackObj.invoke> call func failed.");
      return false;
    }

    if (!ObjWrapper::JSValToLVar(m_pCx, rval, args.retval())) {
      LOG_DPRINTLN("JSCallBackObj.invoke> retval conv failed. (ignored)");
    }

    return true;
  }

  virtual LCloneableObject *clone() const
  {
    MB_ASSERT(false);
    return NULL;
  }

  void invalidate()
  {
    if (m_pCx!=NULL) {
#ifdef USE_INTERNAL_JS
      JS_RemoveRoot(m_pCx, &m_func);
#else
      JS_RemoveValueRoot(m_pCx, &m_func);
#endif
      m_func = JSVAL_VOID;
      m_pCx = NULL;
    }
  }

  Interp *getInterp() const {
    return m_pInterp;
  }

};

void CallBackMgr::invalidate(Interp *pInt)
{
  data_t::const_iterator i = m_data.begin();
  data_t::const_iterator end = m_data.end();
  for (; i!=end; ++i) {
    JSCallBackObj *pObj = *i;
    if (pObj==NULL) continue;
    if (pObj->getInterp()==pInt)
      pObj->invalidate();
  }
}

}

#endif


