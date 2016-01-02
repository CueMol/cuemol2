//
// Object conversion routines (qlib::LVariant and PyObject)
//

#include <Python.h>

#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LScrCallBack.hpp>

#include "wrapper.hpp"

using namespace pybr;
using qlib::LScriptable;

/// Callback object
namespace pybr {
  class QpyCallBackObj : public qlib::LScrCallBack
  {
  private:
    PyObject *m_pCB;

  public:

    QpyCallBackObj(PyObject *p)
    {
      Py_INCREF(p);
      m_pCB = p;
    }

    virtual ~QpyCallBackObj()
    {
      MB_DPRINTLN("~QpyCallBackObj (%p) called", m_pCB);
      Py_DECREF(m_pCB);
    }

    virtual bool invoke(qlib::LVarArgs &args)
    {
      const int nargs = args.getSize();
      PyObject *pPyArgs, *pPyRes;

      PyGILState_STATE gstate = PyGILState_Ensure();

      // conv args
      pPyArgs = PyTuple_New(nargs);
      for (int i=0; i<nargs; ++i) {
        PyObject *pObj = Wrapper::lvarToPyObj(args.at(i));
        PyTuple_SetItem(pPyArgs, i, pObj);
      }

      // call python method/function
      pPyRes = PyObject_CallObject(m_pCB, pPyArgs);

      Py_DECREF(pPyArgs);

      bool bErr = true;
      if (pPyRes!=NULL) {
        Py_DECREF(pPyRes);
        bErr = false;
      }

      PyGILState_Release(gstate);

      if (bErr) {
        // ERROR!!
        return false;
      }

      return true;
    }

    virtual LCloneableObject *clone() const {
      MB_ASSERT(false);
      return NULL;
    }
  };
}

/// convert LVariant to PyObject
PyObject *Wrapper::lvarToPyObj(qlib::LVariant &variant)
{
  switch (variant.getTypeID()) {
  case qlib::LVariant::LT_NULL:
    // MB_DPRINTLN("LVariant: null");
    Py_RETURN_NONE;

  case qlib::LVariant::LT_BOOLEAN:
    if (variant.getBoolValue()) {
      Py_RETURN_TRUE;
    }
    else {
      Py_RETURN_FALSE;
    }

  case qlib::LVariant::LT_INTEGER:
    // MB_DPRINTLN("LVar: integer(%d)", variant.getIntValue());
#if PY_MAJOR_VERSION >= 3
    return PyLong_FromLong(variant.getIntValue());
#else
    return PyInt_FromLong(variant.getIntValue());
#endif

  case qlib::LVariant::LT_REAL: 
    // MB_DPRINTLN("LVar: real(%f)", variant.getRealValue());
    return PyFloat_FromDouble(variant.getRealValue());

  case qlib::LVariant::LT_STRING: {
    //MB_DPRINTLN("LVar: string(%s)", str.c_str());
#if PY_MAJOR_VERSION >= 3
    //return PyBytes_FromString(variant.getStringValue().c_str());
    LString str = variant.getStringValue();
    return PyUnicode_DecodeUTF8(str.c_str(), str.length(), "xxx");
#else
    return PyString_FromString(variant.getStringValue().c_str());
#endif
  }

  case qlib::LVariant::LT_OBJECT: {
    PyObject *pObj = createWrapper(variant.getObjectPtr());

    // At this point, the ownership of value is passed to PyObject
    //  (forget() avoids deleting the ptr transferred to PyObject)
    variant.forget();

    return pObj;
  }
    
  case qlib::LVariant::LT_ARRAY: {
    // TO DO: impl
    break;
  }

  default:
    LOG_DPRINTLN("Unknown LVariant type (%d)", variant.getTypeID());
    break;
  }

  PyErr_SetString(PyExc_RuntimeError, "Unable to convert LVariant to PyObjectl!");
  return NULL;
}

/// convert PyObject to LVariant
void Wrapper::pyObjToLVar(PyObject *pPyObj, qlib::LVariant &rvar)
{
  // boolean
  if (PyBool_Check(pPyObj)) {
#if PY_MAJOR_VERSION >= 3
    rvar.setBoolValue((bool)PyLong_AsLong(pPyObj));
#else
    rvar.setBoolValue((bool)PyInt_AsLong(pPyObj));
#endif
    return;
  }

  // plain integer
#if PY_MAJOR_VERSION >= 3
  if (PyLong_Check(pPyObj)) {
    long tmp = PyLong_AsLong(pPyObj);
#else
  if (PyInt_Check(pPyObj)) {
    long tmp = PyInt_AsLong(pPyObj);
#endif
    rvar.setIntValue(tmp);
    return;
  }

  // float
  if (PyFloat_Check(pPyObj)) {
    double tmp = PyFloat_AsDouble(pPyObj);
    rvar.setRealValue(tmp);
    return;
  }

  // long integer (any precision)
  if (PyLong_Check(pPyObj)) {
    // TO DO: check overflow error
    long tmp = PyLong_AsLong(pPyObj);
    rvar.setIntValue(tmp);
    return;
  }

  // string
#if PY_MAJOR_VERSION >= 3
  if (PyBytes_Check(pPyObj)) {
    const char *pstr = PyBytes_AsString(pPyObj);
#else
  if (PyString_Check(pPyObj)) {
    const char *pstr = PyString_AsString(pPyObj);
#endif
    rvar.setStringValue(pstr);
    return;
  }
  // string (unicode)
  if (PyUnicode_Check(pPyObj)) {
    // TO DO: debug
    PyObject *pUTF8Obj = PyUnicode_AsUTF8String(pPyObj);
#if PY_MAJOR_VERSION >= 3
    const char *pstr = PyBytes_AsString(pUTF8Obj);
#else
    const char *pstr = PyString_AsString(pUTF8Obj);
#endif
    rvar.setStringValue(pstr);
    Py_DECREF(pUTF8Obj);
    return;
  }

  // none
  if (pPyObj==Py_None) {
    rvar.setNull();
    return;
  }

  // callable object
  if (PyCallable_Check(pPyObj)) {
    qlib::LScrCallBack *pCB = new QpyCallBackObj(pPyObj);
    qlib::LSCBPtr *ppCBObj = new qlib::LSCBPtr(pCB);
    // ppCBObj should be freed after the call of CueMol (native) method, etc...
    // --> dtor of LVariant will free ppCBObj
    rvar.setObjectPtr(ppCBObj);
    return;
  }

  // convert object
  //   try to get wrapped scrobj
  qlib::LScriptable *pScr = getWrapped(pPyObj);
  if (pScr!=NULL) {
    // pobj is owned by the python interpreter (?)
    // (variant share the ptr and won't have the ownership!!)
    rvar.shareObjectPtr(pScr);
    return;
  }

  // Error!!
  MB_THROW(qlib::RuntimeException, "unsupported PyObject type");
}
