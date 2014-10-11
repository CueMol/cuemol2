//
// pybr: python bridge module
//

#include <Python.h>

#include <common.h>
#include <qlib/LString.hpp>

#include "pybr.hpp"
#include "wrapper.hpp"

namespace pybr {

  bool init()
  {
    Py_Initialize();
    return Wrapper::setup();
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
    
    int res = PyRun_SimpleFile(fp, path.c_str());

    fclose(fp);
    
    if (res<0)
      return false;
    return true;
  }
}
