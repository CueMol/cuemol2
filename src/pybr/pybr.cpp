//
// pybr: python bridge module
//

#ifdef HAVE_PYTHON
#include <Python.h>
#endif

#include <common.h>
#include <qlib/LString.hpp>

#ifdef HAVE_PYTHON
#include "pybr.hpp"
#include "wrapper.hpp"
#include "PythonBridge.hpp"

extern void pybr_regClasses();

namespace pybr {

  bool init()
  {
    pybr_regClasses();
    //Py_SetProgramName("cuemol2");
    Py_SetPythonHome(Py_DecodeLocale("D:\\proj64\\Python-3.6.1\\",NULL));

    PyImport_AppendInittab("cuemol", &Wrapper::init);

    Py_Initialize();

    //bool res = Wrapper::setup();
    //Wrapper::init();

	return true;
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

#else

namespace pybr {

  bool init()
  {
    return true;
  }
  
  void fini()
  {
  }

  bool runFile(const qlib::LString &path)
  {
    return true;
  }

}

#endif

