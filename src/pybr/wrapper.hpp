// -*-Mode: C++;-*-
//
// Python object wrapper
//

#ifndef PYBR_WRAPPER_HPP_INCLUDED__
#define PYBR_WRAPPER_HPP_INCLUDED__

#include "pybr.hpp"
#include <qlib/LString.hpp>
#include <qlib/LScriptable.hpp>

namespace pybr {

  using qlib::LString;

  /// wrapper utility methods
  class PYBR_API Wrapper
  {
  public:
    /// initialize wrapper
    static PyObject *init();

    /// get cuemol service object
    static PyObject *getService(PyObject *self, PyObject *args);

    /// create new cuemol object
    static PyObject *createObj(PyObject *self, PyObject *args);

    /// get class names
    static PyObject *getAllClassNamesJSON(PyObject *self, PyObject *args);

    /// print log
    static PyObject *print(PyObject *self, PyObject *args);

    //////////

    /// create wrapper object
    static PyObject *createWrapper(qlib::LScriptable *pObj);

    /// get wrapped scriptable obj if pObj is cuemol object
    static qlib::LScriptable *getWrapped(PyObject *pObj);

    /// create python function object for native methods
    static PyObject *createMethodObj(PyObject *pObj, const char *mthname);
    
    //////////
    // conversion methods

    /// convert LVariant to PyObject
    static PyObject *lvarToPyObj(qlib::LVariant &lvar);

    /// convert PyObject to LVariant
    static void pyObjToLVar(PyObject *pPyObj, qlib::LVariant &rval);


  private:
    static bool setupMethObj();

  };

}

#endif
