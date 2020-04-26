//
// Object wrapper for PyObject
//

#include <common.h>

#include "wrapper.hpp"

#include <Python.h>

#include <qlib/ClassRegistry.hpp>
#include <qlib/LByteArray.hpp>
#include <qlib/LString.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/PropSpec.hpp>

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
    //  PyObject_HEAD_INIT(NULL)
    //  0,                         /*ob_size*/
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
    if (Py_TYPE(pPyObj) != &gWrapperType) return NULL;

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
        MB_DPRINTLN("QpyWrapObj destruct: %p", pSelf->m_pObj);
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

#if PY_MAJOR_VERSION >= 3
    // return PyBytes_FromString(str);
    return PyUnicode_FromString(str);
#else
    return PyString_FromString(str);
#endif
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

    MB_DPRINTLN("getService(%s) called, result=%p!!", clsname, pObj);

    return createWrapper((qlib::LScriptable *)pObj);
    // QpyWrapObj *pNewObj = PyObject_New(QpyWrapObj, &gWrapperType);
    // pNewObj->m_pObj = (qlib::LScriptable *) pObj;
    // return (PyObject *) pNewObj;
}

// static
PyObject *Wrapper::createObj(PyObject *self, PyObject *args)
{
    const char *clsname;

    if (!PyArg_ParseTuple(args, "s", &clsname)) return NULL;

    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    MB_ASSERT(pMgr != NULL);

    qlib::LClass *pCls = NULL;
    try {
        pCls = pMgr->getClassObj(clsname);
        MB_DPRINTLN("!!! CreateObj, LClass for %s: %p", clsname, pCls);
    } catch (...) {
        LString msg = LString::format("createObj class %s not found", clsname);
        PyErr_SetString(PyExc_RuntimeError, msg);
        return NULL;
    }

    qlib::LDynamic *pDyn = pCls->createScrObj();
    // MB_DPRINTLN("createScrObj returned: %p (%s)", pDyn, typeid(*pDyn).name());

    // XXX: dynamic_cast<> returns NULL for LScriptable derived class's objects,
    //   in some situations (Apple LLVM version 5.0??).
    //   Old-type type cast is used to avoid this problem.
    // LScriptable *pNewObj = dynamic_cast<LScriptable *>(pDyn);
    LScriptable *pNewObj = (LScriptable *)(pDyn);

    if (pNewObj == NULL) {
        LString msg = LString::format(
            "createObj %s failed (class.createScrObj returned NULL)", clsname);
        PyErr_SetString(PyExc_RuntimeError, msg);
        return NULL;
    }

    MB_DPRINTLN("createObj(%s) OK, result=%p!!", clsname, pNewObj);

    return createWrapper(pNewObj);
}

// static
PyObject *Wrapper::getAllClassNamesJSON(PyObject *self, PyObject *args)
{
    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    MB_ASSERT(pMgr != NULL);

    std::list<qlib::LString> ls;
    pMgr->getAllClassNames(ls);

    LString rstr = "[";
    bool ffirst = true;
    BOOST_FOREACH (const LString &str, ls) {
        MB_DPRINTLN("GACNJSON> class %s", str.c_str());
        if (!ffirst) rstr += ",";
        rstr += "\"" + str + "\"";
        ffirst = false;
    }
    rstr += "]";

    return Py_BuildValue("s", rstr.c_str());
}

// static
PyObject *Wrapper::getAbiClassName(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) return NULL;

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) return NULL;

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
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
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
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
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
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
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
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
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
    if (pScObj == NULL) return NULL;

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
        PyErr_SetString(PyExc_RuntimeError, "Wrapper not found");
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
        PyErr_SetString(PyExc_RuntimeError, "Wrapper not found");
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
    if (pScObj == NULL) return NULL;

    LString str;

    try {
        str = qlib::getPropsJSONImpl(pScObj);
    } catch (qlib::LException &e) {
        LString errmsg = LString::format("Exception occured in getPropsJSON: %s",
                                         e.getFmtMsg().c_str());
        LOG_DPRINTLN(errmsg);
        PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
        return NULL;
    } catch (...) {
        LString errmsg = LString::format("Unknown Exception occured in getPropsJSON");
        LOG_DPRINTLN(errmsg);
        PyErr_SetString(PyExc_RuntimeError, errmsg.c_str());
        return NULL;
    }

#if PY_MAJOR_VERSION >= 3
    return PyBytes_FromString(str.c_str());
#else
    return PyString_FromString(str.c_str());
#endif
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

#if PY_MAJOR_VERSION >= 3
    return PyBytes_FromString(rval.c_str());
#else
    return PyString_FromString(rval.c_str());
#endif
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
#if PY_MAJOR_VERSION >= 3
    if (PyBytes_Check(pPyObj)) {
        const char *pstr = PyBytes_AsString(pPyObj);
        mthname = pstr;
        bOK = true;
    }
#else
    if (PyString_Check(pPyObj)) {
        const char *pstr = PyString_AsString(pPyObj);
        mthname = pstr;
        bOK = true;
    }
#endif

    // string (unicode)
    if (!bOK && PyUnicode_Check(pPyObj)) {
        // TO DO: debug
        PyObject *pUTF8Obj = PyUnicode_AsUTF8String(pPyObj);
#if PY_MAJOR_VERSION >= 3
        const char *pstr = PyBytes_AsString(pUTF8Obj);
#else
        const char *pstr = PyString_AsString(pUTF8Obj);
#endif
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

    MB_DPRINTLN("invoke method %s nargs=%d", mthname, nargs);

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

    return createWrapper(pNewObj);
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

namespace pybr {
PyObject *initCueMol(PyObject *self, PyObject *args);
PyObject *finiCueMol(PyObject *self, PyObject *args);
PyObject *isInitialized(PyObject *self, PyObject *args);
}  // namespace pybr

static PyMethodDef cuemol_methods[] = {
    {"getService", (PyCFunction)Wrapper::getService, METH_VARARGS,
     "get CueMol service object.\n"},
    {"createObj", (PyCFunction)Wrapper::createObj, METH_VARARGS,
     "create CueMol object.\n"},
    {"getAllClassNamesJSON", (PyCFunction)Wrapper::getAllClassNamesJSON, METH_VARARGS,
     "get all class names in JSON format.\n"},

    {"getAbiClassName", (PyCFunction)Wrapper::getAbiClassName, METH_VARARGS,
     "get C++ABI class name.\n"},
    {"getClassName", (PyCFunction)Wrapper::getClassName, METH_VARARGS,
     "get class name.\n"},
    {"isInstanceOf", (PyCFunction)Wrapper::isInstanceOf, METH_VARARGS,
     "check object type\n"},

    {"setProp", (PyCFunction)Wrapper::setProp, METH_VARARGS, "\n"},
    {"getProp", (PyCFunction)Wrapper::getProp, METH_VARARGS, "\n"},
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

    {"initCueMol", (PyCFunction)initCueMol, METH_VARARGS,
     "initialize CueMol system.\n"},
    {"finiCueMol", (PyCFunction)finiCueMol, METH_VARARGS, "finalize CueMol system.\n"},
    {"isInitialized", (PyCFunction)isInitialized, METH_VARARGS,
     "check initialization.\n"},

#ifdef HAVE_NUMPY
    {"numpychk", (PyCFunction)Wrapper::numpychk, METH_VARARGS, "numpychk.\n"},
    {"tondarray", (PyCFunction)Wrapper::tondarray, METH_VARARGS,
     "conv to numpy ndarray.\n"},
#endif
    {NULL} /* Sentinel */
};

//////////////////////////////////////////////////////////////////////
// Dummy initialization methods (for embedded python)

#ifndef BUILD_PYMODULE
namespace pybr {

PyObject *initCueMol(PyObject *self, PyObject *args)
{
    return Py_BuildValue("");
}

PyObject *finiCueMol(PyObject *self, PyObject *args)
{
    return Py_BuildValue("");
}

PyObject *isInitialized(PyObject *self, PyObject *args)
{
    Py_RETURN_TRUE;
}

}  // namespace pybr
#endif

//////////////////////////////////////////////////////////////////////
// initialization

struct module_state
{
    PyObject *error;
};

#if PY_MAJOR_VERSION >= 3
#define GETSTATE(m) ((struct module_state *)PyModule_GetState(m))
#endif

#if PY_MAJOR_VERSION >= 3

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

static struct PyModuleDef moduledef = {PyModuleDef_HEAD_INIT,
                                       "cuemol_internal",
                                       NULL,
                                       sizeof(struct module_state),
                                       cuemol_methods,
                                       NULL,
                                       cuemol_traverse,
                                       cuemol_clear,
                                       NULL};
#endif

#ifdef HAVE_NUMPY
#include <numpy/arrayobject.h>
#endif

// static
PyObject *Wrapper::init()
{
    PyObject *m;

    gWrapperType.tp_new = PyType_GenericNew;
    gWrapperType.tp_base = &PyBaseObject_Type;
    if (PyType_Ready(&gWrapperType) < 0) return NULL;

#if PY_MAJOR_VERSION >= 3
    m = PyModule_Create(&moduledef);
#else
    m = Py_InitModule3("cuemol_internal", cuemol_methods, "CueMol internal module.");
#endif

    Py_INCREF(&gWrapperType);
    PyModule_AddObject(m, "Wrapper", (PyObject *)&gWrapperType);

    setupMethObj();

#ifdef HAVE_NUMPY
    import_array();
#endif

    return m;
}

#ifdef HAVE_NUMPY

// static
PyObject *Wrapper::numpychk(PyObject *self, PyObject *args)
{
    npy_intp i, ndim, stride;
    // npy_intp *dim1, *dim2, *dim;
    PyObject *array1, *array2, *array;

    npy_intp dim[1] = {10};

    array = PyArray_SimpleNew(1, dim, NPY_FLOAT);
    if (array == NULL) return NULL;

    return array;

    /*
    const char *msg;

    if (!PyArg_ParseTuple(args, "s", &msg))
      return NULL;

    LOG_DPRINT("%s", msg);

    return Py_BuildValue("");
    */
}

#include <qlib/LByteArray.hpp>

// static
PyObject *Wrapper::tondarray(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
        return NULL;
    }

    // LOG_DPRINTLN("type of arg: %s", typeid(*pScObj).name());
    qlib::LScrSp<qlib::LByteArray> *pba =
        dynamic_cast<qlib::LScrSp<qlib::LByteArray> *>(pScObj);
    if (pba == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
        return NULL;
    }

    npy_intp dim[1] = {10};

    int ntypeid = (*pba)->getElemType();
    int nelems = (*pba)->getElemCount();

    PyObject *array;
    dim[0] = nelems;

    if (ntypeid == qlib::type_consts::QTC_INT32) {
        array = PyArray_SimpleNew(1, dim, NPY_INT32);
        if (array == NULL) return NULL;
        qint32 *pdat = (qint32 *)((*pba)->data());
        for (int i = 0; i < nelems; ++i) {
            dim[0] = i;
            qint32 *p = (qint32 *)PyArray_GetPtr((PyArrayObject *)array, dim);
            *p = pdat[i];
        }
    } else if (ntypeid == qlib::type_consts::QTC_FLOAT32) {
        array = PyArray_SimpleNew(1, dim, NPY_FLOAT);
        if (array == NULL) return NULL;
        float *pdat = (float *)((*pba)->data());
        for (int i = 0; i < nelems; ++i) {
            dim[0] = i;
            float *p = (float *)PyArray_GetPtr((PyArrayObject *)array, dim);
            *p = pdat[i];
        }
    } else if (ntypeid == qlib::type_consts::QTC_FLOAT64) {
        array = PyArray_SimpleNew(1, dim, NPY_DOUBLE);
        if (array == NULL) return NULL;
        double *pdat = (double *)((*pba)->data());
        for (int i = 0; i < nelems; ++i) {
            dim[0] = i;
            double *p = (double *)PyArray_GetPtr((PyArrayObject *)array, dim);
            *p = pdat[i];
        }
    } else {
        PyErr_SetString(PyExc_RuntimeError, "unknown bytearray type");
        return NULL;
    }

    return array;
}

#endif
