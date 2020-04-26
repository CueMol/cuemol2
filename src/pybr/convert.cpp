//
// Object conversion routines (qlib::LVariant and PyObject)
//

#include <common.h>

#include <Python.h>

#include <qlib/ClassRegistry.hpp>
#include <qlib/LScrCallBack.hpp>
#include <qlib/LString.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/LVarDict.hpp>

#include "wrapper.hpp"

using namespace pybr;
using qlib::LScriptable;

namespace pybr {

/// Callback object
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
        for (int i = 0; i < nargs; ++i) {
            PyObject *pObj = Wrapper::lvarToPyObj(args.at(i));
            PyTuple_SetItem(pPyArgs, i, pObj);
        }

        // call python method/function
        pPyRes = PyObject_CallObject(m_pCB, pPyArgs);

        Py_DECREF(pPyArgs);

        bool bErr = true;
        if (pPyRes != NULL) {
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

    virtual LCloneableObject *clone() const
    {
        MB_ASSERT(false);
        return NULL;
    }
};
}  // namespace pybr

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
            } else {
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
            // MB_DPRINTLN("LVar: string(%s)", str.c_str());
#if PY_MAJOR_VERSION >= 3
            // return PyBytes_FromString(variant.getStringValue().c_str());
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
            auto *pLArray = variant.getArrayPtr();
            int nsize = pLArray->size();
            PyObject *pPyList = PyList_New(nsize);
            // transfer elements
            for (int i=0; i<nsize; ++i) {
                qlib::LVariant &value = pLArray->at(i);
                PyObject *pObjValue = lvarToPyObj(value);
                PyList_SET_ITEM(pPyList, i, pObjValue);
            }
            return pPyList;
        }

        case qlib::LVariant::LT_DICT: {
            PyObject *pPyDict = PyDict_New();
            // transfer elements
            auto *pLDict = variant.getDictPtr();
            for (auto &&elem : *pLDict) {
                const qlib::LString &key = elem.first;
                qlib::LVariant &value = elem.second;
                PyObject *pObjValue = lvarToPyObj(value);
                PyDict_SetItemString(pPyDict, key.c_str(), pObjValue);
            }
            return pPyDict;
        }

        default:
            LOG_DPRINTLN("Unknown LVariant type (%d)", variant.getTypeID());
            break;
    }

    PyErr_SetString(PyExc_RuntimeError, "Unable to convert LVariant to PyObject");
    return NULL;
}

/// convert PyObject to LVariant
void Wrapper::pyObjToLVar(PyObject *pPyObj, qlib::LVariant &rvar)
{
    // boolean
    if (PyBool_Check(pPyObj)) {
        rvar.setBoolValue((bool)PyLong_AsLong(pPyObj));
        return;
    }

    // plain integer
    if (PyLong_Check(pPyObj)) {
        long tmp = PyLong_AsLong(pPyObj);
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
    if (PyBytes_Check(pPyObj)) {
        const char *pstr = PyBytes_AsString(pPyObj);
        rvar.setStringValue(pstr);
        return;
    }
    // string (unicode)
    if (PyUnicode_Check(pPyObj)) {
        // TO DO: debug
        PyObject *pUTF8Obj = PyUnicode_AsUTF8String(pPyObj);
        const char *pstr = PyBytes_AsString(pUTF8Obj);
        rvar.setStringValue(pstr);
        Py_DECREF(pUTF8Obj);
        return;
    }

    // None
    if (pPyObj == Py_None) {
        rvar.setNull();
        return;
    }

    // list
    if (PyList_Check(pPyObj)) {
        int nsize = PyList_Size(pPyObj);
        qlib::LVarArray *pArray = MB_NEW qlib::LVarArray(nsize);
        rvar.setArrayPtr(pArray);
        for (int i=0; i<nsize; ++i) {
            PyObject *value = PyList_GetItem(pPyObj, i);
            pyObjToLVar(value, pArray->at(i));
        }
        return;
    }

    // dict
    if (PyDict_Check(pPyObj)) {
        qlib::LVarDict *pDict = MB_NEW qlib::LVarDict();
        rvar.setDictPtr(pDict);
        PyObject *key, *value;
        Py_ssize_t pos = 0;
        LString strkey;
        while (PyDict_Next(pPyObj, &pos, &key, &value)) {
            if (PyBytes_Check(key)) {
                const char *s = PyBytes_AsString(key);
                strkey = s;
            }
            else if (PyUnicode_Check(key)) {
                PyObject *pUTF8Obj = PyUnicode_AsUTF8String(key);
                const char *s = PyBytes_AsString(pUTF8Obj);
                strkey = s;
            }
            else {
                LOG_DPRINTLN("convert: unsupported key type");
            }
            qlib::LVariant lvar;
            pyObjToLVar(value, lvar);
            pDict->set(strkey, lvar);
        }
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
    if (pScr != NULL) {
        // pobj is owned by the python interpreter (?)
        // (variant share the ptr and won't have the ownership!!)
        rvar.shareObjectPtr(pScr);
        return;
    }

    // Error!!
    MB_THROW(qlib::RuntimeException, "unsupported PyObject type");
}
