//
// Object wrapper for PyObject
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

//////////
// wrapper object type/instance definition

/// wrapper instance type
typedef struct {
  PyObject_HEAD

  /// wrapped object
  qlib::LScriptable *m_pObj;

} QpyWrapObj;

// prototype declarations
static void wr_dealloc(QpyWrapObj *pSelf);
static PyObject *wr_getattr(QpyWrapObj *pSelf, const char *name);
static int wr_setattr(QpyWrapObj *pSelf, const char *name, PyObject *pValue);
static PyObject *wr_str(QpyWrapObj *pSelf);

/// wrapper class type definition
static PyTypeObject gWrapperType = {
  PyObject_HEAD_INIT(NULL)
  0,                         /*ob_size*/
  "cuemol.Wrapper",             /*tp_name*/
  sizeof(QpyWrapObj), /*tp_basicsize*/
  0,                         /*tp_itemsize*/
  (destructor) wr_dealloc,   /*tp_dealloc*/
  0,                         /*tp_print*/
  (getattrfunc) wr_getattr,  /*tp_getattr*/
  (setattrfunc) wr_setattr,  /*tp_setattr*/
  0,                         /*tp_compare*/
  0,                         /*tp_repr*/
  0,                         /*tp_as_number*/
  0,                         /*tp_as_sequence*/
  0,                         /*tp_as_mapping*/
  0,                         /*tp_hash */
  0,                         /*tp_call*/
  (reprfunc) wr_str,         /*tp_str*/
  0,                         /*tp_getattro*/
  0,                         /*tp_setattro*/
  0,                         /*tp_as_buffer*/
  Py_TPFLAGS_DEFAULT,        /*tp_flags*/
  "CueMol wrapper objects",  /* tp_doc */
  0,                         /* tp_traverse */
  0,                         /* tp_clear */
  0,                         /* tp_richcompare */
  0,                         /* tp_weaklistoffset */
  0,                         /* tp_iter */
  0,                         /* tp_iternext */
  0,                         /* tp_methods */
  0,                         /* tp_members */
  0,                         /* tp_getset */
  0,                         /* tp_base */
  0,                         /* tp_dict */
};

/// get the wrapped object ptr
qlib::LScriptable *Wrapper::getWrapped(PyObject *pPyObj)
{
  if (Py_TYPE(pPyObj) != &gWrapperType)
    return NULL;
  
  QpyWrapObj *pObj = (QpyWrapObj *)pPyObj;
  return pObj->m_pObj;
}

/// create wrapper object
///   TO DO: reuse wrapper object (as in methodobj.cpp)
PyObject *Wrapper::createWrapper(qlib::LScriptable *pObj)
{
  QpyWrapObj *pPyObj = PyObject_New(QpyWrapObj, &gWrapperType);
  pPyObj->m_pObj = pObj;
  return (PyObject *) pPyObj;
}

/// cleanup wrapper object
static void wr_dealloc(QpyWrapObj *pSelf)
{
  if (pSelf->m_pObj!=NULL) {
    LOG_DPRINTLN("QpyWrapObj destruct: %p", pSelf->m_pObj);
    pSelf->m_pObj->destruct();
    pSelf->m_pObj = NULL;
  }
}

/// getter (method/property)
static PyObject *wr_getattr(QpyWrapObj *pSelf, const char *name)
{
  qlib::LScriptable *pObj = pSelf->m_pObj;
  if (pObj==NULL) {
    PyErr_SetString(PyExc_RuntimeError, "wrapped obj is null");
    return NULL;
  }

  if (pObj->hasProperty(name)) {
    // name is prop
    qlib::LVariant lvar;
    if (!pObj->getProperty(name, lvar)) {
      LString msg =
	LString::format("GetProp: getProperty(\"%s\") call failed.", name);
      PyErr_SetString(PyExc_RuntimeError, msg);
      return NULL;
    }

    return Wrapper::lvarToPyObj(lvar);
  }
  else if (pObj->hasMethod(name)) {
    // name is method
    //  --> create and return method object
    return Wrapper::createMethodObj((PyObject *)pSelf, name);
  }

  // prop not found
  LString msg =
    LString::format("GetProp: property \"%s\" not found.", name);
  PyErr_SetString(PyExc_RuntimeError, msg);
  return NULL;
}

/// setter (writable property)
static int wr_setattr(QpyWrapObj *pSelf, const char *name, PyObject *pValue)
{
  qlib::LScriptable *pObj = pSelf->m_pObj;
  if (pObj==NULL) {
    PyErr_SetString(PyExc_RuntimeError, "wrapped obj is null");
    return -1;
  }

  if (!pObj->hasWritableProperty(name)) {
    // writable prop not found
    LString msg =
      LString::format("SetProp: property \"%s\" not found or readonly.", name);
    PyErr_SetString(PyExc_RuntimeError, msg);
    return -1;
  }

  if (pValue==NULL) {
    PyErr_SetString(PyExc_RuntimeError, "remove property is not supported");
    return -1;
  }

  //////////
  // convert to LVariant

  // variant (lvar) doesn't have ownership of its content
  qlib::LVariant lvar;
  bool ok = false;
  LString errmsg;
  try {
    Wrapper::pyObjToLVar(pValue, lvar);
    ok = true;
  }
  catch (const qlib::LException &e) {
    errmsg = 
      LString::format("SetProp(%s) cannot converting PyObj to LVariant: %s",
		      name, e.getMsg().c_str());
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }
  catch (...) {
    errmsg = 
      LString::format("SetProp(%s): Cannot converting PyObj to LVariant.", name);
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }

  if (!ok) {
    //LOG_DPRINTLN("Error %s", msg.c_str());
    PyErr_SetString(PyExc_RuntimeError, errmsg);
    return -1;
  }

  //////////
  // perform setProperty

  // pobj possibly owns the copy of lvar's content
  ok = false;
  errmsg = LString();
  try {
    ok = pObj->setProperty(name, lvar);
  }
  catch (const qlib::LException &e) {
    errmsg = 
      LString::format("SetProp(%s) failed: %s", name, e.getMsg().c_str());
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }
  catch (...) {
    errmsg = 
      LString::format("SetProp(%s) failed.", name);
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }

  if (!ok) {
    PyErr_SetString(PyExc_RuntimeError, errmsg);
    return -1;
  }

  // OK
  return 0;
}

/// stringify object
static PyObject *wr_str(QpyWrapObj *pSelf)
{
  qlib::LScriptable *pObj = pSelf->m_pObj;
  if (pObj==NULL) {
    PyErr_SetString(PyExc_RuntimeError, "wrapped obj is null");
    return NULL;
  }

  LString str = pObj->toString();
  return PyString_FromString(str);
}

//////////////////////////////////////////////////////////////////////
// cuemol services

//static
PyObject *Wrapper::getService(PyObject *self, PyObject *args)
{
  const char *clsname;

  if (!PyArg_ParseTuple(args, "s", &clsname))
    return NULL;

  qlib::LDynamic *pObj = NULL;
  try {
    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    MB_ASSERT(pMgr!=NULL);
    pObj = pMgr->getSingletonObj(clsname);
  }
  catch (...) {
    LString msg = LString::format("getService(%s) failed", clsname);
    // LOG_DPRINTLN(msg);
    PyErr_SetString(PyExc_RuntimeError, msg);
    return NULL;
  }

  MB_DPRINTLN("getService(%s) called, result=%p!!", clsname, pObj);

  return createWrapper((qlib::LScriptable *)pObj);
  //QpyWrapObj *pNewObj = PyObject_New(QpyWrapObj, &gWrapperType);
  //pNewObj->m_pObj = (qlib::LScriptable *) pObj;
  //return (PyObject *) pNewObj;
}

//static
PyObject *Wrapper::createObj(PyObject *self, PyObject *args)
{
  const char *clsname;

  if (!PyArg_ParseTuple(args, "s", &clsname))
    return NULL;

  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);

  qlib::LClass *pCls = NULL;
  try {
    pCls = pMgr->getClassObj(clsname);
    MB_DPRINTLN("!!! CreateObj, LClass for %s: %p", clsname, pCls);
  }
  catch (...) {
    LString msg = LString::format("createObj class %s not found", clsname);
    PyErr_SetString(PyExc_RuntimeError, msg);
    return NULL;
  }

  qlib::LDynamic *pDyn = pCls->createScrObj();
  // MB_DPRINTLN("createScrObj returned: %p (%s)", pDyn, typeid(*pDyn).name());

  // XXX: dynamic_cast<> returns NULL for LScriptable derived class's objects,
  //   in some situations (Apple LLVM version 5.0??).
  //   Old-type type cast is used to avoid this problem.
  //LScriptable *pNewObj = dynamic_cast<LScriptable *>(pDyn);
  LScriptable *pNewObj = (LScriptable *)(pDyn);

  if (pNewObj==NULL) {
    LString msg = LString::format("createObj %s failed (class.createScrObj returned NULL)", clsname);
    PyErr_SetString(PyExc_RuntimeError, msg);
    return NULL;
  }

  MB_DPRINTLN("createObj(%s) OK, result=%p!!", clsname, pNewObj);

  return createWrapper(pNewObj);
}

//static
PyObject *Wrapper::getAllClassNamesJSON(PyObject *self, PyObject *args)
{
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);

  std::list<qlib::LString> ls;
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

  return Py_BuildValue("s", rstr.c_str());
}

//static
PyObject *Wrapper::print(PyObject *self, PyObject *args)
{
  const char *msg;

  if (!PyArg_ParseTuple(args, "s", &msg))
    return NULL;

  LOG_DPRINTLN("%s", msg);

  return Py_BuildValue("");
}

namespace pybr {
#ifndef PYMODULE_EXPORTS
  PyObject *initCueMol(PyObject *self, PyObject *args)
  {
    return Py_BuildValue("");
  }
#else
  PyObject *initCueMol(PyObject *self, PyObject *args);
#endif
}

static PyMethodDef cuemol_methods[] = {
  {"getService", (PyCFunction)Wrapper::getService, METH_VARARGS, "get CueMol service object.\n"},
  {"createObj", (PyCFunction)Wrapper::createObj, METH_VARARGS, "create CueMol object.\n"},
  {"getAllClassNamesJSON", (PyCFunction)Wrapper::getAllClassNamesJSON, METH_VARARGS, "get all class names in JSON format.\n"},
  {"printlog", (PyCFunction)Wrapper::print, METH_VARARGS, "print log message.\n"},
  {"initCueMol", (PyCFunction)initCueMol, METH_VARARGS, "initialize CueMol system.\n"},
  {NULL}  /* Sentinel */
};

//////////////////////////////////////////////////////////////////////
// initialization

//static
bool Wrapper::setup()
{
  PyObject* m;

  gWrapperType.tp_new = PyType_GenericNew;
  if (PyType_Ready(&gWrapperType) < 0)
    return false;

  m = Py_InitModule3("cuemol", cuemol_methods, "CueMol module.");

  Py_INCREF(&gWrapperType);
  PyModule_AddObject(m, "Wrapper", (PyObject *)&gWrapperType);

  return setupMethObj();
}
