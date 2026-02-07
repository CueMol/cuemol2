//
// Object wrapper for PyObject
//

#include <common.h>
#include <libcuemol2_api/binding.hpp>

#include "wrapper.hpp"

#include <Python.h>

#include <qlib/ClassRegistry.hpp>
#include <qlib/LByteArray.hpp>
#include <qlib/LString.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/PropSpec.hpp>
#include <qlib/LScrSmartPtr.hpp>

using namespace pybr;
using qlib::LScriptable;

//////////
// wrapper object type/instance definition

// prototype declarations
static void wr_dealloc(QpyWrapObj *pSelf);
// static PyObject *wr_getattr(QpyWrapObj *pSelf, const char *name);
static int wr_setattr(QpyWrapObj *pSelf, const char *name, PyObject *pValue);
static PyObject *wr_str(QpyWrapObj *pSelf);

/// wrapper class type definition
static PyTypeObject gWrapperType = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "cuemol.Wrapper",                         /*tp_name*/
    sizeof(QpyWrapObj),                       /*tp_basicsize*/
    0,                                        /*tp_itemsize*/
    (destructor)wr_dealloc,                   /*tp_dealloc*/
    0,                                        /*tp_print*/
    (getattrfunc)Wrapper::getattr,            /*tp_getattr*/
    (setattrfunc)wr_setattr,                  /*tp_setattr*/
    0,                                        /*tp_compare*/
    0,                                        /*tp_repr*/
    0,                                        /*tp_as_number*/
    0,                                        /*tp_as_sequence*/
    0,                                        /*tp_as_mapping*/
    0,                                        /*tp_hash */
    0,                                        /*tp_call*/
    (reprfunc)wr_str,                         /*tp_str*/
    0,                                        /*tp_getattro*/
    0,                                        /*tp_setattro*/
    0,                                        /*tp_as_buffer*/
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE, /*tp_flags*/
    "CueMol wrapper objects",                 /* tp_doc */
    //  0,                         /* tp_traverse */
    //  0,                         /* tp_clear */
    //  0,                         /* tp_richcompare */
    //  0,                         /* tp_weaklistoffset */
    //  0,                         /* tp_iter */
    //  0,                         /* tp_iternext */
    //  0,                         /* tp_methods */
    //  0,                         /* tp_members */
    //  0,                         /* tp_getset */
    //  0,                         /* tp_base */
    //  0,                         /* tp_dict */
};

/// get the wrapped object ptr
// static
qlib::LScriptable *Wrapper::getWrapped(PyObject *pPyObj)
{
    if (Py_TYPE(pPyObj) != &gWrapperType) {
        LOG_DPRINTLN("Wrapper::getWrapped> ERROR pPyObj %p is not a wrapper.");
        return NULL;
    }

    QpyWrapObj *pObj = (QpyWrapObj *)pPyObj;
    return pObj->m_pObj;
}

/// create wrapper object
///   TO DO: reuse wrapper object (as in methodobj.cpp)
PyObject *Wrapper::createWrapper(qlib::LScriptable *pObj)
{
    QpyWrapObj *pPyObj = PyObject_New(QpyWrapObj, &gWrapperType);
    pPyObj->m_pObj = pObj;
    return (PyObject *)pPyObj;
}

/// cleanup wrapper object
static void wr_dealloc(QpyWrapObj *pSelf)
{
    if (pSelf->m_pObj != NULL) {
        // MB_DPRINTLN("QpyWrapObj destruct: %p", pSelf->m_pObj);
        pSelf->m_pObj->destruct();
        pSelf->m_pObj = NULL;
    }
}

/// getter (method/property)
PyObject *Wrapper::getattr(QpyWrapObj *pSelf, const char *name)
{
    LOG_DPRINTLN("Wrapper::getattr(%s) called!!", name);

    if (LString(name).equals("__getattr__")) {
        return Wrapper::createMethodObj((PyObject *)pSelf, "__getattr__");
    }

    qlib::LScriptable *pObj = pSelf->m_pObj;
    if (pObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapped obj is null");
        return NULL;
    }

    PyObject *pRes = Wrapper::getPropImpl(pObj, name);

    if (pRes != NULL) return pRes;

    if (pObj->hasMethod(name)) {
        // name is method
        //  --> create and return method object
        return Wrapper::createMethodObj((PyObject *)pSelf, name);
    }

    // prop not found
    LString msg = LString::format("GetProp: property \"%s\" not found.", name);
    PyErr_SetString(PyExc_RuntimeError, msg);
    return NULL;
}

// static
PyObject *Wrapper::getPropImpl(qlib::LScriptable *pObj, const LString &name)
{
    if (!pObj->hasNestedProperty(name)) {
        LString msg = LString::format("GetProp: property \"%s\") not found.", name.c_str());
        PyErr_SetString(PyExc_RuntimeError, msg);
        return NULL;
    }
    
    // name is prop
    qlib::LVariant lvar;
    if (!pObj->getNestedProperty(name, lvar)) {
        LString msg = LString::format("GetProp: getProperty(\"%s\") call failed.",
                                      name.c_str());
        PyErr_SetString(PyExc_RuntimeError, msg);
        return NULL;
    }
    
    return Wrapper::lvarToPyObj(lvar);
}

// static
int Wrapper::setPropImpl(qlib::LScriptable *pObj, const LString &name, PyObject *pValue)
{
    // qlib::NestedPropHandler nph(name, pRootObj);
    // qlib::LPropSupport *pObj = nph.apply();

    if (!pObj->hasNestedWritableProperty(name)) {
        // writable prop not found
        LString msg = LString::format("SetProp: property \"%s\" not found or readonly.",
                                      name.c_str());
        PyErr_SetString(PyExc_RuntimeError, msg);
        return -1;
    }

    if (pValue == NULL) {
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
    } catch (const qlib::LException &e) {
        errmsg = LString::format("SetProp(%s) cannot converting PyObj to LVariant: %s",
                                 name.c_str(), e.getMsg().c_str());
        MB_DPRINTLN("Err: %s", errmsg.c_str());
    } catch (...) {
        errmsg = LString::format("SetProp(%s): Cannot converting PyObj to LVariant.",
                                 name.c_str());
        MB_DPRINTLN("Err: %s", errmsg.c_str());
    }

    if (!ok) {
        // LOG_DPRINTLN("Error %s", msg.c_str());
        PyErr_SetString(PyExc_RuntimeError, errmsg);
        return -1;
    }

    //////////
    // perform setProperty

    // pobj possibly owns the copy of lvar's content
    ok = false;
    errmsg = LString();
    try {
        ok = pObj->setNestedProperty(name, lvar);
    } catch (const qlib::LException &e) {
        errmsg =
            LString::format("SetProp(%s) failed: %s", name.c_str(), e.getMsg().c_str());
        MB_DPRINTLN("Err: %s", errmsg.c_str());
    } catch (...) {
        errmsg = LString::format("SetProp(%s) failed.", name.c_str());
        MB_DPRINTLN("Err: %s", errmsg.c_str());
    }

    if (!ok) {
        PyErr_SetString(PyExc_RuntimeError, errmsg);
        return -1;
    }

    // OK
    return 0;
}

/// setter (writable property)
static int wr_setattr(QpyWrapObj *pSelf, const char *name, PyObject *pValue)
{
    qlib::LScriptable *pObj = pSelf->m_pObj;
    if (pObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapped obj is null");
        return -1;
    }

    return Wrapper::setPropImpl(pObj, name, pValue);
}

/// stringify object
static PyObject *wr_str(QpyWrapObj *pSelf)
{
    qlib::LScriptable *pObj = pSelf->m_pObj;
    if (pObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapped obj is null");
        return NULL;
    }

    LString str = pObj->toString();

    return PyUnicode_FromString(str);
}

//////////////////////////////////////////////////////////////////////
// cuemol services

// static
PyObject *Wrapper::getService(PyObject *self, PyObject *args)
{
    const char *clsname;

    if (!PyArg_ParseTuple(args, "s", &clsname)) return NULL;

    qlib::LDynamic *pObj = NULL;
    try {
        qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
        MB_ASSERT(pMgr != NULL);
        pObj = pMgr->getSingletonObj(clsname);
    } catch (...) {
        LString msg = LString::format("getService(%s) failed", clsname);
        // LOG_DPRINTLN(msg);
        PyErr_SetString(PyExc_RuntimeError, msg);
        return NULL;
    }

    if (pObj == nullptr) {
        LString msg = LString::format("getService(%s) returned nullptr", clsname);
        PyErr_SetString(PyExc_RuntimeError, msg);
        return NULL;
    }
    // MB_DPRINTLN("getService(%s) called, result=%p!!", clsname, pObj);

    return createWrapper(static_cast<qlib::LScriptable *>(pObj));
}

// static
PyObject *Wrapper::createObj(PyObject *self, PyObject *args)
{
    const char *clsname;
    const char *strval = "";

    int nargs = PyTuple_GET_SIZE(args);
    if (nargs == 1) {
      if (!PyArg_ParseTuple(args, "s", &clsname)) return NULL;
    }
    else if (nargs == 2) {
      if (!PyArg_ParseTuple(args, "ss", &clsname, &strval)) return NULL;
    }

    LScriptable *pNewObj;
    LString errmsg;
    bool ok = cuemol2::createObj(clsname, strval, &pNewObj, errmsg);
    
    if (!ok) {
        LString msg = LString::format("createObj %s failed (reason: %s)", clsname, errmsg.c_str());
        PyErr_SetString(PyExc_RuntimeError, msg);
        return NULL;
    }

    MB_DPRINTLN("createObj(%s) OK, result=%p!!", clsname, pNewObj);

    return createWrapper(pNewObj);
}

// static
PyObject *Wrapper::copyObj(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }
    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return NULL;
    }

    LScriptable *pNewObj = pScObj->copy();
    return createWrapper(pNewObj);
}

// static
PyObject *Wrapper::getAllClassNamesJSON(PyObject *self, PyObject *args)
{
    LString rstr, errmsg;
    cuemol2::getAllClassNamesJSON(rstr, errmsg);
    return Py_BuildValue("s", rstr.c_str());
}

// static
PyObject *Wrapper::getAbiClassName(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) return NULL;

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return NULL;
    }

    LString str;
    if (pScObj != NULL) {
        qlib::LClass *pCls = pScObj->getClassObj();
        if (pCls != NULL) {
            str = pCls->getAbiClassName();
        }
    } else {
        str = "(null)";
    }

    return Py_BuildValue("s", str.c_str());
}

// static
PyObject *Wrapper::getClassName(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return NULL;
    }

    LString str;
    if (pScObj != NULL) {
        qlib::LClass *pCls = pScObj->getClassObj();
        if (pCls != NULL) {
            str = pCls->getClassName();
        }
    } else {
        str = "(null)";
    }

    return Py_BuildValue("s", str.c_str());
}

// static
PyObject *Wrapper::isInstanceOf(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;
    const char *chkclsnm;

    if (!PyArg_ParseTuple(args, "Os", &pPyObj, &chkclsnm)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return NULL;
    }

    if (pScObj->implements(chkclsnm)) {
        Py_RETURN_TRUE;
    } else {
        Py_RETURN_FALSE;
    }

    return NULL;
}

// static
PyObject *Wrapper::setProp(PyObject *self, PyObject *args)
{
    const char *propname;
    PyObject *pPyObj, *pPyVal;

    if (!PyArg_ParseTuple(args, "OsO", &pPyObj, &propname, &pPyVal)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return NULL;
    }

    int res = setPropImpl(pScObj, propname, pPyVal);
    if (res < 0) return NULL;

    Py_RETURN_NONE;
}

// static
PyObject *Wrapper::isPropDefault(PyObject *self, PyObject *args)
{
    const char *propname;
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "Os", &pPyObj, &propname)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return NULL;
    }

    bool ok = true;
    int result;
    LString errmsg;

    try {
        if (!pScObj->hasNestedPropDefault(propname))
            result = 0;  // no default value
        else if (!pScObj->isNestedPropDefault(propname))
            result = 1;  // has default but not default now
        else
            result = 2;  // has default and now is default
    } catch (qlib::LException &e) {
        ok = false;
        errmsg = LString::format("Exception occured in isPropDef for %s: %s", propname,
                                 e.getFmtMsg().c_str());
    } catch (...) {
        ok = false;
        errmsg =
            LString::format("Unknown Exception occured in isPropDef for %s", propname);
    }

    if (!ok) {
        LOG_DPRINTLN("Error: isPropDef for property \"%s\" failed.", propname);
        if (!errmsg.isEmpty()) {
            LOG_DPRINTLN("Reason: %s", errmsg.c_str());
        }
        PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
        return NULL;
    }

    return Py_BuildValue("i", result);
}

// static
PyObject *Wrapper::hasPropDefault(PyObject *self, PyObject *args)
{
    const char *propname;
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "Os", &pPyObj, &propname)) return NULL;

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return NULL;
    }

    bool ok = true;
    bool result;
    LString errmsg;

    try {
        result = pScObj->hasNestedPropDefault(propname);
    } catch (qlib::LException &e) {
        ok = false;
        errmsg = LString::format("Exception occured in hasPropDef for %s: %s", propname,
                                 e.getFmtMsg().c_str());
    } catch (...) {
        ok = false;
        errmsg =
            LString::format("Unknown Exception occured in hasPropDef for %s", propname);
    }

    if (!ok) {
        LOG_DPRINTLN("Error: hasPropDef for property \"%s\" failed.", propname);
        if (!errmsg.isEmpty()) {
            LOG_DPRINTLN("Reason: %s", errmsg.c_str());
        }
        PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
        return NULL;
    }

    if (result)
        Py_RETURN_TRUE;
    else
        Py_RETURN_FALSE;
}

// static
PyObject *Wrapper::getProp(PyObject *self, PyObject *args)
{
    const char *propname;
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "Os", &pPyObj, &propname)) {
        PyErr_SetString(PyExc_RuntimeError, "Invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg is not a wrapper obj");
        return NULL;
    }

    PyObject *pRes = Wrapper::getPropImpl(pScObj, propname);
    if (pRes == NULL) {
        LString errmsg = LString::format("GetProp <%s> failed", propname);
        PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
        return NULL;
    }

    return pRes;
}

// static
PyObject *Wrapper::resetProp(PyObject *self, PyObject *args)
{
    const char *propname;
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "Os", &pPyObj, &propname)) {
        PyErr_SetString(PyExc_RuntimeError, "Invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "arg is not a wrapper obj");
        return NULL;
    }

    bool ok;
    LString errmsg;

    try {
        if (pScObj->hasNestedProperty(propname)) {
            ok = pScObj->resetNestedProperty(propname);
        } else {
            ok = false;
            errmsg = LString::format("Prop <%s> not found in resetProp", propname);
        }
    } catch (qlib::LException &e) {
        ok = false;
        errmsg = LString::format("Exception occured in resetProp for %s: %s", propname,
                                 e.getFmtMsg().c_str());
    } catch (...) {
        ok = false;
        errmsg =
            LString::format("Unknown Exception occured in resetProp for %s", propname);
    }

    if (!ok) {
        LOG_DPRINTLN("Error: ReSetProp for property \"%s\" failed.", propname);
        if (!errmsg.isEmpty()) {
            LOG_DPRINTLN("Reason: %s", errmsg.c_str());
        }
        PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
        return NULL;
    }

    Py_RETURN_NONE;
}

// static
PyObject *Wrapper::getPropsJSON(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) return NULL;

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    LString str, errmsg;
    if (!cuemol2::getPropsJSON(pScObj, str, errmsg)) {
      LOG_DPRINTLN(errmsg);
      PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
      return NULL;
    }

    return PyBytes_FromString(str.c_str());
}

// static
PyObject *Wrapper::getEnumDefsJSON(PyObject *self, PyObject *args)
{
    const char *propname;
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "Os", &pPyObj, &propname)) return NULL;

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) return NULL;

    qlib::PropSpec spec;
    if (!pScObj->getPropSpecImpl(propname, &spec)) {
        LString errmsg =
            LString::format("getEnumDefsJSON: prop %s is not found", propname);
        LOG_DPRINTLN(errmsg);
        PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
        return NULL;
    }

    LString rval;

    rval += "{";
    if (spec.pEnumDef) {
        int i = 0;
        BOOST_FOREACH (qlib::EnumDef::value_type ii, *(spec.pEnumDef)) {
            if (i != 0) rval += ",";
            rval += LString::format("\"%s\": %d", ii.first.c_str(), ii.second);
            ++i;
        }
    }
    rval += "}";

    return PyBytes_FromString(rval.c_str());
}

// static
PyObject *Wrapper::getEnumDef(PyObject *self, PyObject *args)
{
    PyErr_SetString(PyExc_RuntimeError, "Not implemented");
    return NULL;
}

// static
PyObject *Wrapper::invokeMethod(PyObject *self, PyObject *arg)
{
    LString mthname;
    PyObject *pPySelf;

    if (PyTuple_GET_SIZE(arg) < 2) {
        PyErr_SetString(PyExc_RuntimeError, "invokeMethod called without self/propnm");
        return NULL;
    }

    pPySelf = PyTuple_GET_ITEM(arg, 0);
    qlib::LScriptable *pScrObj = Wrapper::getWrapped(pPySelf);
    if (pScrObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapped obj is NULL!!");
        return NULL;
    }

    PyObject *pPyObj = PyTuple_GET_ITEM(arg, 1);
    bool bOK = false;
    // string
    if (PyBytes_Check(pPyObj)) {
        const char *pstr = PyBytes_AsString(pPyObj);
        mthname = pstr;
        bOK = true;
    }

    // string (unicode)
    if (!bOK && PyUnicode_Check(pPyObj)) {
        // TO DO: debug
        PyObject *pUTF8Obj = PyUnicode_AsUTF8String(pPyObj);
        const char *pstr = PyBytes_AsString(pUTF8Obj);
        mthname = pstr;
        bOK = true;
        Py_DECREF(pUTF8Obj);
    }

    if (mthname.isEmpty() || !bOK) {
        PyErr_SetString(PyExc_RuntimeError, "invokeMethod called without propnm");
        return NULL;
    }

    return Wrapper::invokeMethodImpl(pScrObj, mthname.c_str(), arg, 2);
}

// static
PyObject *Wrapper::invokeMethodImpl(qlib::LScriptable *pScrObj, const char *mthname,
                                    PyObject *arg, int nb)
{
    int nargs = PyTuple_GET_SIZE(arg) - nb;

    if (nargs < 0) {
        PyErr_SetString(PyExc_RuntimeError, "invokeMethod called without self/propnm");
        return NULL;
    }

    qlib::LVarArgs largs(nargs);
    int i;
    bool ok;
    LString errmsg;

    for (i = 0; i < nargs; ++i) {
        PyObject *pArg = PyTuple_GET_ITEM(arg, i + nb);
        ok = false;
        errmsg = LString();
        try {
            Wrapper::pyObjToLVar(pArg, largs.at(i));
            ok = true;
        } catch (const qlib::LException &e) {
            errmsg = LString::format("call method %s: cannot convert arg %d, %s",
                                     mthname, i, e.getMsg().c_str());
        } catch (...) {
            errmsg =
                LString::format("call method %s: cannot convert arg %d", mthname, i);
        }
        if (!ok) {
            PyErr_SetString(PyExc_RuntimeError, errmsg);
            return NULL;
        }
    }

    // MB_DPRINTLN("invoke method %s nargs=%d", mthname, nargs);

    // Invoke method

    ok = false;
    errmsg = LString();

    try {
        ok = pScrObj->invokeMethod(mthname, largs);
        if (!ok) errmsg = LString::format("call method %s: failed", mthname);
    } catch (qlib::LException &e) {
        errmsg = LString::format("Exception occured in native method %s: %s", mthname,
                                 e.getMsg().c_str());
    } catch (std::exception &e) {
        errmsg = LString::format("Std::exception occured in native method %s: %s",
                                 mthname, e.what());
    } catch (...) {
        LOG_DPRINTLN("*********");
        errmsg =
            LString::format("Unknown Exception occured in native method %s", mthname);
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
    } catch (const qlib::LException &e) {
        errmsg = LString::format("call method %s: cannot convert rval, %s", mthname,
                                 e.getMsg().c_str());
    } catch (...) {
        errmsg = LString::format("call method %s: cannot convert rval", mthname);
    }
    if (pRVal == NULL) {
        PyErr_SetString(PyExc_RuntimeError, errmsg);
        return NULL;
    }

    return pRVal;
}

// static
PyObject *Wrapper::createBAryFromBytes(PyObject *self, PyObject *args)
{
    // PyObject *pPyObj;
    PyObject *pPyBytes;

    if (!PyArg_ParseTuple(args, "S", &pPyBytes)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    if (!PyBytes_Check(pPyBytes)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    int nlen = PyBytes_Size(pPyBytes);

    qlib::LByteArray *pNewObj = new qlib::LByteArray(nlen);

    if (nlen > 0) {
        const char *ptr = PyBytes_AsString(pPyBytes);
        char *pBuf = (char *)(pNewObj->data());
        for (int i = 0; i < nlen; ++i) pBuf[i] = ptr[i];
    }

    // return shared ptr obj
    auto *pRet = MB_NEW qlib::LByteArrayPtr(pNewObj);

    return createWrapper(pRet);
}

// static
PyObject *Wrapper::getRefCount(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_RuntimeError, "Invalid arguments");
        return nullptr;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == nullptr) {
        PyErr_SetString(PyExc_RuntimeError, "arg is not a wrapper obj");
        return nullptr;
    }

    qlib::LSupScrSp *pssp = dynamic_cast<qlib::LSupScrSp *>(pScObj);
    if (pssp == nullptr) {
        PyErr_SetString(PyExc_RuntimeError, "Not a smart pointer object");
        return nullptr;
    }
    int refcnt = pssp->use_count();

    return Py_BuildValue("i", refcnt);
}

// static
PyObject *Wrapper::print(PyObject *self, PyObject *args)
{
    const char *msg;

    if (!PyArg_ParseTuple(args, "s", &msg)) return NULL;

    LOG_DPRINT("%s", msg);

    return Py_BuildValue("");
}

//////////////////////////////////////////////////////

// namespace pybr {
//   PyObject *initCueMol(PyObject *self, PyObject *args);
//   PyObject *finiCueMol(PyObject *self, PyObject *args);
//   PyObject *isInitialized(PyObject *self, PyObject *args);
// }  // namespace pybr

//////////////////////////////////////////////////////////////////////
// initialization

struct module_state
{
    PyObject *error;
};

#define GETSTATE(m) ((struct module_state *)PyModule_GetState(m))

static int cuemol_traverse(PyObject *m, visitproc visit, void *arg)
{
    Py_VISIT(GETSTATE(m)->error);
    return 0;
}

static int cuemol_clear(PyObject *m)
{
    Py_CLEAR(GETSTATE(m)->error);
    return 0;
}

static PyMethodDef cuemol_methods[] = {
    {"getService", (PyCFunction)Wrapper::getService, METH_VARARGS,
     "get CueMol service object.\n"},
    {"createObj", (PyCFunction)Wrapper::createObj, METH_VARARGS,
     "create CueMol object.\n"},
    {"copyObj", (PyCFunction)Wrapper::copyObj, METH_VARARGS,
     "copy CueMol object.\n"},
    {"getAllClassNamesJSON", (PyCFunction)Wrapper::getAllClassNamesJSON, METH_VARARGS,
     "get all class names in JSON format.\n"},

    {"getAbiClassName", (PyCFunction)Wrapper::getAbiClassName, METH_VARARGS,
     "get C++ABI class name.\n"},
    {"getClassName", (PyCFunction)Wrapper::getClassName, METH_VARARGS,
     "get class name.\n"},
    {"isInstanceOf", (PyCFunction)Wrapper::isInstanceOf, METH_VARARGS,
     "check object type\n"},

    {"setProp", (PyCFunction)Wrapper::setProp, METH_VARARGS, "set property\n"},
    {"getProp", (PyCFunction)Wrapper::getProp, METH_VARARGS, "get property\n"},
    {"isPropDefault", (PyCFunction)Wrapper::isPropDefault, METH_VARARGS, "\n"},
    {"hasPropDefault", (PyCFunction)Wrapper::hasPropDefault, METH_VARARGS, "\n"},
    {"resetProp", (PyCFunction)Wrapper::resetProp, METH_VARARGS, "\n"},
    {"getPropsJSON", (PyCFunction)Wrapper::getPropsJSON, METH_VARARGS, "\n"},
    {"getEnumDefsJSON", (PyCFunction)Wrapper::getEnumDefsJSON, METH_VARARGS, "\n"},
    {"getEnumDef", (PyCFunction)Wrapper::getEnumDef, METH_VARARGS, "\n"},
    {"invokeMethod", (PyCFunction)Wrapper::invokeMethod, METH_VARARGS, "\n"},
    {"createBAryFromBytes", (PyCFunction)Wrapper::createBAryFromBytes, METH_VARARGS,
     "create ByteArray obj from bytes\n"},

    {"print", (PyCFunction)Wrapper::print, METH_VARARGS, "print log message.\n"},
    {"get_ref_count", (PyCFunction)Wrapper::getRefCount, METH_VARARGS, "get ref count.\n"},

    {NULL} /* Sentinel */
};

static struct PyModuleDef moduledef = {PyModuleDef_HEAD_INIT,
                                       "cuemol_internal",
                                       NULL,
                                       sizeof(struct module_state),
                                       cuemol_methods,
                                       NULL,
                                       cuemol_traverse,
                                       cuemol_clear,
                                       NULL};


namespace pybr {

PyObject *wrapperInit()
{
    gWrapperType.tp_new = PyType_GenericNew;
    gWrapperType.tp_base = &PyBaseObject_Type;
    if (PyType_Ready(&gWrapperType) < 0) return NULL;

    PyObject *m;
    m = PyModule_Create(&moduledef);

    Py_INCREF(&gWrapperType);
    PyModule_AddObject(m, "Wrapper", (PyObject *)&gWrapperType);

    Wrapper::setupMethObj();

#ifdef HAVE_NUMPY
    Wrapper::initNumPy(m);
#endif

    return m;
}

}
