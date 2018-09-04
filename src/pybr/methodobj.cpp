//
// Method object routines
//

#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/ClassRegistry.hpp>

#include <Python.h>

#include "wrapper.hpp"

using namespace pybr;
using qlib::LScriptable;


/////////////////////////////////
//  method object definition

typedef struct {
  PyObject_HEAD

  /// 'self' object bound to this method obj
  PyObject *m_self;

  /// Name of the method bound to this obj
  LString *m_pName;

} QpyMethObj;

static void meth_dealloc(QpyMethObj *m);
static int meth_traverse(QpyMethObj *m, visitproc visit, void *arg);
static PyObject *meth_call(PyObject *func, PyObject *arg, PyObject *kw);

/// method object type table
/// type table for the MethodObj
PyTypeObject gMethObjType = {
  PyVarObject_HEAD_INIT(&PyType_Type, 0)
  "builtin_function_or_method",
  sizeof(QpyMethObj),
  0,
  (destructor)meth_dealloc,                   /* tp_dealloc */
  0,                                          /* tp_print */
  0,                                          /* tp_getattr */
  0,                                          /* tp_setattr */
  0,                      /* tp_compare */
  0,                        /* tp_repr */
  0,                                          /* tp_as_number */
  0,                                          /* tp_as_sequence */
  0,                                          /* tp_as_mapping */
  0,                        /* tp_hash */
  meth_call,                                  /* tp_call */
  0,                                          /* tp_str */
  0,                    /* tp_getattro */
  0,                                          /* tp_setattro */
  0,                                          /* tp_as_buffer */
  Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC,    /* tp_flags */
  0,                                          /* tp_doc */
  (traverseproc)meth_traverse,                /* tp_traverse */
  0,                                          /* tp_clear */
  0,                                          /* tp_richcompare */
  0,                                          /* tp_weaklistoffset */
  0,                                          /* tp_iter */
  0,                                          /* tp_iternext */
  0,                                          /* tp_methods */
  0,                               /* tp_members */
  0,                               /* tp_getset */
  0,                                          /* tp_base */
  0,                                          /* tp_dict */
};

/////////////////////////////////
// type methods

/* Free list for method objects to safe malloc/free overhead
 * The m_self element is used to chain the objects.
 */
static QpyMethObj *free_list = NULL;
static int numfree = 0;
#ifndef PYBR_MTHOBJ_MAXFREELIST
#define PYBR_MTHOBJ_MAXFREELIST 256
#endif

/// ctor for method object
static PyObject *meth_alloc(const char *name, PyObject *self)
{
  QpyMethObj *op;
  op = free_list;

  MB_DPRINTLN("meth_alloc: numfree=%d", numfree);

  if (op != NULL) {
    free_list = (QpyMethObj *)(op->m_self);
    PyObject_INIT(op, &gMethObjType);
    numfree--;
  }
  else {
    op = PyObject_GC_New(QpyMethObj, &gMethObjType);
    if (op == NULL)
      return NULL;
  }

  Py_XINCREF(self);
  op->m_self = self;

  op->m_pName = new LString(name);

  //_PyObject_GC_TRACK(op);
  PyObject_GC_Track(op);

  return (PyObject *)op;
}

/// dtor for method object
static void meth_dealloc(QpyMethObj *m)
{
  PyObject_GC_UnTrack(m);
  Py_XDECREF(m->m_self);

  MB_DPRINTLN("meth_dealloc: numfree=%d", numfree);

  if (m->m_pName!=NULL)
    delete m->m_pName;
  m->m_pName = NULL;

  // Py_XDECREF(m->m_module);
  if (numfree < PYBR_MTHOBJ_MAXFREELIST) {
    m->m_self = (PyObject *)free_list;
    free_list = m;
    numfree++;
  }
  else {
    PyObject_GC_Del(m);
  }
}

/// GC support
static int meth_traverse(QpyMethObj *m, visitproc visit, void *arg)
{
  Py_VISIT(m->m_self);
  // Py_VISIT(m->m_module);
  return 0;
}

/// call the method
static PyObject *meth_call(PyObject *func, PyObject *arg, PyObject *kw)
{
  QpyMethObj* pFunc = (QpyMethObj*)func;
  PyObject *pSelf = pFunc->m_self;

  if (pFunc->m_pName->equals("__getattr__")) {
    const char *propname;
    PyObject *pPyObj;
    if (!PyArg_ParseTuple(arg, "Os", &pPyObj, &propname)) {
      PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
      return NULL;
    }
    return Wrapper::getattr((QpyWrapObj*)pPyObj, propname);
  }

  const char *name = pFunc->m_pName->c_str();

  qlib::LScriptable *pScrObj = Wrapper::getWrapped(pSelf);
  if (pScrObj==NULL) {
    // error: self is not cuemol wrapper obj
    PyErr_SetString(PyExc_RuntimeError, "internal error; meth_call self is not QpyObj");
    return NULL;
  }

  // keyword-arg invocation is not supported
  if (kw != NULL && PyDict_Size(kw) != 0) {
    PyErr_Format(PyExc_TypeError, "%.200s() takes no keyword arguments", name);
    return NULL;
  }

  return Wrapper::invokeMethodImpl(pScrObj, name, arg, 0);

  /*
  int nargs = PyTuple_GET_SIZE(arg);
  if (nargs<0) {
    PyErr_SetString(PyExc_RuntimeError, "internal error; invalid arg tuple size");
    return NULL;
  }

  // Convert arguments.
  //   TO DO: check the ownership of objects (arg tuple)!!
  //   (In this impl, largs does not own the objects in args)

  qlib::LVarArgs largs(nargs);
  int i;
  bool ok;
  LString errmsg;

  for (i = 0; i < nargs; ++i) {
    PyObject *pArg = PyTuple_GET_ITEM(arg, i);
    ok = false;
    errmsg = LString();
    try {
      Wrapper::pyObjToLVar(pArg, largs.at(i));
      ok = true;
    }
    catch (const qlib::LException &e) {
      errmsg = LString::format("call method %s: cannot convert arg %d, %s",
			       name, i, e.getMsg().c_str());
    }
    catch (...) {
      errmsg = LString::format("call method %s: cannot convert arg %d",
			       name, i);
    }
    if (!ok) {
      PyErr_SetString(PyExc_RuntimeError, errmsg);
      return NULL;
    }
  }

  MB_DPRINTLN("invoke method %s nargs=%d", name, nargs);

  // Invoke method

  ok = false;
  errmsg = LString();

  try {
    ok = pScrObj->invokeMethod(name, largs);
    if (!ok)
      errmsg = LString::format("call method %s: failed", name);
  }
  catch (qlib::LException &e) {
    errmsg = 
      LString::format("Exception occured in native method %s: %s",
		      name, e.getMsg().c_str());
  }
  catch (std::exception &e) {
    errmsg = 
      LString::format("Std::exception occured in native method %s: %s",
		      name, e.what());
  }
  catch (...) {
    errmsg = 
      LString::format("Unknown Exception occured in native method %s",
		      name);
  }

  if (!ok) {
    PyErr_SetString(PyExc_RuntimeError, errmsg);
    return NULL;
  }

  // Convert returned value

  PyObject *pRVal = NULL;
  errmsg = LString();

  try {
    pRVal = Wrapper::lvarToPyObj(largs.retval());
  }
  catch (const qlib::LException &e) {
    errmsg = LString::format("call method %s: cannot convert rval, %s",
			     name, e.getMsg().c_str());
  }
  catch (...) {
    errmsg = LString::format("call method %s: cannot convert rval",
			     name);
  }
  if (pRVal==NULL) {
    PyErr_SetString(PyExc_RuntimeError, errmsg);
    return NULL;
  }

  return pRVal;
  */
}

/*
/// repr() support
static PyObject *meth_repr(QpyMethObj *m)
{
  if (m->m_self == NULL)
    return PyString_FromFormat("<built-in function %s>",
			       m->m_ml->ml_name);
  return PyString_FromFormat("<built-in method %s of %s object at %p>",
			     m->m_ml->ml_name,
			     m->m_self->ob_type->tp_name,
			     m->m_self);
}
*/

/////////////////////////////////

//static
PyObject *Wrapper::createMethodObj(PyObject *pObj, const char *mthname)
{
  return meth_alloc(mthname, pObj);
}

/////////////////////////////////
// initialization

//static
bool Wrapper::setupMethObj()
{
  // gMethObjType.tp_new = PyType_GenericNew;
  if (PyType_Ready(&gMethObjType) < 0)
    return false;

  return true;
}

