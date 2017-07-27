//
// Python CueMol module initialization
//

#include <Python.h>

#include <common.h>
#include <qlib/qlib.hpp>
#include <qlib/LProcMgr.hpp>
#include <qlib/EventManager.hpp>
#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>
//#include <sysdep/sysdep.hpp>

#include "wrapper.hpp"

using namespace pybr;

/// DLL entrance routine for pymodule

PyMODINIT_FUNC PyInit_cuemol_internal()
{
  qlib::init();
  MB_DPRINTLN("CueMol2 pymodule : INITIALIZED");
  PyObject *module = Wrapper::init();

  return module;
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

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG ""
#endif

namespace pybr {
  /// CueMol initialization routine
  PyObject *initCueMol(PyObject *self, PyObject *args)
  {
    const char *config;

    if (!PyArg_ParseTuple(args, "s", &config))
      return NULL;
  
    LString confpath(config);
    if (confpath.isEmpty())
      confpath = DEFAULT_CONFIG;

    MB_DPRINTLN("PyModule> confpath: %s", confpath.c_str());

    qsys::init(confpath);
    //sysdep::init();

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

    // TO DO: setup timer
    // qlib::EventManager *pEM = qlib::EventManager::getInstance();
    // pEM->addIdleTask(new ProcMgrChkQueue, false);
    // pEM->addIdleTask(new SceneMgrChkUpdate, true);

    return Py_BuildValue("");
  }
}

//////////

#include <qsys/TTYView.hpp>

namespace qsys {
  //static
  qsys::View *View::createView()
  {
    qsys::View *pret = MB_NEW TTYView();
    MB_DPRINTLN("TTYView created (%p, ID=%d)", pret, pret->getUID());
    return pret;
  }
}
