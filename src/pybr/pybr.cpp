//
// pybr: python bridge module
//

#include <Python.h>

#include <common.h>
#include <qlib/LString.hpp>

#include "pybr.hpp"
#include "wrapper.hpp"
#include "PythonBridge.hpp"

extern void pybr_regClasses();

namespace pybr {

  bool init()
  {
    pybr_regClasses();
    Py_SetProgramName("cuemol2");
    Py_Initialize();
    bool res = Wrapper::setup();
    return res;
  }

  void fini()
  {
    Py_Finalize();
  }

  bool runFile(const qlib::LString &path)
  {
    FILE *fp = fopen(path.c_str(), "r");
    if (fp==NULL) {
      LOG_DPRINTLN("cannot open file: %s", path.c_str());
      return false;
    }
    
    PythonBridge *pSvc = PythonBridge::getInstance();

    bool res = true;
    try {
      pSvc->runFile(path);
    }
    catch (...) {
      res = false;
    }

    fclose(fp);
    
    return res;
  }
}
