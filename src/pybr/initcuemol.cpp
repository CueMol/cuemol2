//
// python module initialization
//

#include <Python.h>

#include <common.h>
#include <qlib/qlib.hpp>
#include <qlib/LDebug.hpp>

#include <qsys/qsys.hpp>
#include <sysdep/sysdep.hpp>

#include "wrapper.hpp"

using namespace pybr;

/// DLL entrance routine for pymodule

#if PY_MAJOR_VERSION >= 3
PyObject *
PyInit_initcuemol()
#else
PyMODINIT_FUNC
initcuemol()
#endif
{
  qlib::init();
  MB_DPRINTLN("CueMol2 pymodule : INITIALIZED");
  PyObject *module = Wrapper::init();

#if PY_MAJOR_VERSION >= 3
  return module;
#endif
}

////////////////////////////////////////////////

namespace render {
  extern bool init();
  extern void fini();
}

namespace molstr {
  extern bool init();
  extern void fini();
}

namespace molvis {
  extern bool init();
  extern void fini();
}

namespace xtal {
  extern bool init();
  extern void fini();
}

namespace molanl {
  extern bool init();
  extern void fini();
}

namespace surface {
  extern bool init();
  extern void fini();
}

namespace symm {
  extern bool init();
  extern void fini();
}

namespace lwview {
  extern bool init();
  extern void fini();
}

namespace anim {
  extern bool init();
  extern void fini();
}

namespace mdtools {
  extern bool init();
  extern void fini();
}

namespace importers {
  extern bool init();
  extern void fini();
}


namespace pybr {
  /// CueMol initialization routine
  PyObject *initCueMol(PyObject *self, PyObject *args)
  {
    const char *config;

    if (!PyArg_ParseTuple(args, "s", &config))
      return NULL;
  
    qsys::init(config);
    sysdep::init();

    // load other modules
    render::init();
    molstr::init();
    molvis::init();
    xtal::init();
    symm::init();
    surface::init();
    molanl::init();
    lwview::init();
    anim::init();
    mdtools::init();
    importers::init();

    // initTextRender();
    // MB_DPRINTLN("---------- initTextRender() OK");

    // // setup timer
    // qlib::EventManager::getInstance()->initTimer(new XPCTimerImpl);

    return Py_BuildValue("");
  }
}

