// -*-Mode: C++;-*-
//
// Python object wrapper
//

#ifndef PYBR_WRAPPER_HPP_INCLUDED__
#define PYBR_WRAPPER_HPP_INCLUDED__

#include <Python.h>

#include <qlib/LScriptable.hpp>
#include <qlib/LString.hpp>

#include "pybr.hpp"

namespace pybr {

/// wrapper instance type
typedef struct
{
    PyObject_HEAD;

    /// wrapped object
    qlib::LScriptable *m_pObj;

} QpyWrapObj;

using qlib::LString;

/// wrapper utility methods
class PYBR_API Wrapper
{
public:
    /// initialize wrapper
    static PyObject *init();

    //////////////////////////////////////////
    // cuemol_internal.* service methods implementation

    /// get cuemol service object
    static PyObject *getService(PyObject *self, PyObject *args);

    /// create new cuemol object
    static PyObject *createObj(PyObject *self, PyObject *args);

    /// get class names
    static PyObject *getAllClassNamesJSON(PyObject *self, PyObject *args);

    static PyObject *getAbiClassName(PyObject *self, PyObject *args);
    static PyObject *getClassName(PyObject *self, PyObject *args);
    static PyObject *isInstanceOf(PyObject *self, PyObject *args);

    //////////
    // Property operations

    static PyObject *setProp(PyObject *self, PyObject *args);

    static PyObject *getProp(PyObject *self, PyObject *args);

    /// Get property's default flag
    ///  args: object, propname
    ///  retval: bool
    static PyObject *isPropDefault(PyObject *self, PyObject *args);

    /// Get property's default flag
    ///  args: object, propname
    ///  retval: bool
    static PyObject *hasPropDefault(PyObject *self, PyObject *args);

    /// Reset property value to default
    ///  args: object, propname
    static PyObject *resetProp(PyObject *self, PyObject *args);

    /// Get properties' structure in JSON format(for UI)
    static PyObject *getPropsJSON(PyObject *self, PyObject *args);

    /// Get enum type definition in JSON format
    static PyObject *getEnumDefsJSON(PyObject *self, PyObject *args);

    /// Get enum type definition (integer ID)
    static PyObject *getEnumDef(PyObject *self, PyObject *args);

    /// Invoke native method
    static PyObject *invokeMethod(PyObject *self, PyObject *args);

    /// convert bytes to bytearray obj
    static PyObject *createBAryFromBytes(PyObject *self, PyObject *args);

    /// print log
    static PyObject *print(PyObject *self, PyObject *args);

#ifdef HAVE_NUMPY
    static PyObject *numpychk(PyObject *self, PyObject *args);
    static PyObject *tondarray(PyObject *self, PyObject *args);
#endif

    //////////

    /// create wrapper object
    static PyObject *createWrapper(qlib::LScriptable *pObj);

    /// get wrapped scriptable obj if pObj is cuemol object
    static qlib::LScriptable *getWrapped(PyObject *pObj);

    /// create python function object for native methods
    static PyObject *createMethodObj(PyObject *pObj, const char *mthname);

    static PyObject *getattr(QpyWrapObj *pSelf, const char *name);

    static PyObject *invokeMethodImpl(qlib::LScriptable *pScrObj, const char *mthname,
                                      PyObject *arg, int nb);

    //////////
    // conversion methods

    /// convert LVariant to PyObject
    static PyObject *lvarToPyObj(qlib::LVariant &lvar);

    /// convert PyObject to LVariant
    static void pyObjToLVar(PyObject *pPyObj, qlib::LVariant &rval);

    static int setPropImpl(qlib::LScriptable *pObj, const LString &name,
                           PyObject *pValue);

    static PyObject *getPropImpl(qlib::LScriptable *pObj, const LString &name);

private:
    static bool setupMethObj();
};

}  // namespace pybr

#endif
