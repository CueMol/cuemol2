//
// Python CueMol module initialization
//
#include <common.h>

#ifdef HAVE_PYTHON
#include <Python.h>

#include <qlib/qlib.hpp>
#include <qlib/LProcMgr.hpp>
#include <qlib/EventManager.hpp>
#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>

#if (GUI_ARCH!=MB_GUI_ARCH_CLI)
#  include <sysdep/sysdep.hpp>
#endif

#include "wrapper.hpp"

using namespace pybr;

/// DLL entrance routine for pymodule

PyMODINIT_FUNC
#if PY_MAJOR_VERSION >= 3
PyInit_cuemol_internal()
#else
initcuemol_internal()
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

#ifdef USE_XMLRPC
#include <xmlrpc_bridge/xrbr.hpp>
#endif

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
  
    try {
      qsys::init(config);

#if (GUI_ARCH!=MB_GUI_ARCH_CLI)
      sysdep::init();
#endif

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

#ifdef USE_XMLRPC
      // load python module
      xrbr::init();
      MB_DPRINTLN("---------- setup XRBR OK");
#endif

      // initTextRender();
      // MB_DPRINTLN("---------- initTextRender() OK");
      MB_DPRINTLN("CueMol> initialized.");
    }
    catch (const qlib::LException &e) {
      LOG_DPRINTLN("Init> Caught exception <%s>", typeid(e).name());
      LOG_DPRINTLN("Init> Reason: %s", e.getMsg().c_str());
      //return NS_ERROR_NOT_IMPLEMENTED;
    }
    catch (...) {
      LOG_DPRINTLN("Init> Caught unknown exception");
      //return NS_ERROR_NOT_IMPLEMENTED;
    }
    
    return Py_BuildValue("");
  }

  //////////

  /// CueMol finalization routine
  PyObject *finiCueMol(PyObject *self, PyObject *args)
  {
#ifdef USE_XMLRPC
    // unload XMLRPC module
    xrbr::fini();
    MB_DPRINTLN("=== xrbr::fini() OK ===");
#endif

    // cleanup timer
    qlib::EventManager::getInstance()->finiTimer();

    importers::fini();
    
    mdtools::fini();
    
    anim::fini();
    lwview::fini();
    molanl::fini();
    surface::fini();
    symm::fini();
    xtal::fini();
    molvis::fini();
    molstr::fini();
    render::fini();
    
    // CueMol-App finalization
#if (GUI_ARCH!=MB_GUI_ARCH_CLI)
    sysdep::fini();
#endif
    
    qsys::fini();
    
    MB_DPRINTLN("CueMol> CueMol finalized.");

    return Py_BuildValue("");
  }

}

#endif
