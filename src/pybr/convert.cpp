//
// Object conversion routines (qlib::LVariant and PyObject)
//

#include <Python.h>

#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/ClassRegistry.hpp>

#include "wrapper.hpp"

using namespace pybr;
using qlib::LScriptable;

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
    return PyInt_FromLong(variant.getIntValue());

  case qlib::LVariant::LT_REAL: 
    // MB_DPRINTLN("LVar: real(%f)", variant.getRealValue());
    return PyFloat_FromDouble(variant.getRealValue());

  case qlib::LVariant::LT_STRING: {
    //MB_DPRINTLN("LVar: string(%s)", str.c_str());
    return PyString_FromString(variant.getStringValue().c_str());
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
    rvar.setBoolValue((bool)PyInt_AsLong(pPyObj));
    return;
  }

  // plain integer
  if (PyInt_Check(pPyObj)) {
    long tmp = PyInt_AsLong(pPyObj);
    rvar.setIntValue(tmp);
    return;
  }

  // float
  if (PyFloat_Check(pPyObj)) {
    double tmp = PyFloat_AsDouble(pPyObj);
    rvar.setRealValue(tmp);
    return;
  }

  // TO DO: conv long integer

  // string
  if (PyString_Check(pPyObj)) {
    const char *pstr = PyString_AsString(pPyObj);
    rvar.setStringValue(pstr);
    return;
  }

  // none
  if (pPyObj==Py_None) {
    rvar.setNull();
    return;
  }

  // convert object
  //   try to get wrapped scrobj
  qlib::LScriptable *pScr = getWrapped(pPyObj);
  if (pScr!=NULL) {
    // pobj is owned by python interp (?)
    // (variant share the ptr and won't have the ownership!!)
    rvar.shareObjectPtr(pScr);
    return;
  }

  // Error!!
  MB_THROW(qlib::RuntimeException, "unsupported PyObject type");
}
