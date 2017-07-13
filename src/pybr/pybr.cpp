//
// pybr: python bridge module
//

#include <common.h>

#ifdef HAVE_PYTHON
#include <Python.h>
#include <qlib/LString.hpp>
#include "pybr.hpp"
#include "wrapper.hpp"
#include "PythonBridge.hpp"

#include <boost/filesystem/path.hpp>
#include <boost/filesystem.hpp>
namespace fs = boost::filesystem;

extern void pybr_regClasses();

namespace pybr {

  bool init(const char *szConfPath)
  {
    pybr_regClasses();
    Py_SetProgramName(Py_DecodeLocale("cuemol2", NULL));

    PyImport_AppendInittab("cuemol_internal", &Wrapper::init);

    // Append local python script path to sys.path
    if (szConfPath!=NULL) {
      fs::path confpath(szConfPath);
      confpath = confpath.parent_path();
      confpath /= "Python";
      if (fs::exists(confpath) && fs::is_directory(confpath)) {
        LString strpath = confpath.string();
        strpath = strpath.escapeQuots();
        Py_SetPythonHome(Py_DecodeLocale(strpath.c_str(), NULL));
	MB_DPRINTLN("***** SetPythonHome=%s", strpath.c_str());
      }
    }

    Py_Initialize();

    //LOG_DPRINTLN("Python> PythonHome=%s", Py_EncodeLocale(Py_GetPythonHome(), NULL));

    // Append local python script path to sys.path
    if (szConfPath!=NULL) {
      fs::path confpath(szConfPath);
      confpath = confpath.parent_path();
      confpath /= "scripts";
      confpath /= "python";
      LString strpath = confpath.string();
      strpath = strpath.escapeQuots();
      
      LString src = LString::format(
        "import sys\n"
        "sys.path.append('%s')\n",
        //"print(sys.path)\n",
        strpath.c_str());

      PyRun_SimpleString(src.c_str());
    }

    //bool res = Wrapper::setup();
    //Wrapper::init();

    // Redirect stdout/err to the logwindow
    const char *src = 
"import sys\n\
import cuemol_internal\n\
class CatchOutErr:\n\
    def __init__(self):\n\
        self.value = ''\n\
    def write(self, txt):\n\
        cuemol_internal.print(txt)\n\
    def flush(self):\n\
        pass\n\
catchOutErr = CatchOutErr()\n\
sys.stdout = catchOutErr\n\
sys.stderr = catchOutErr\n\
";
    PyRun_SimpleString(src);

    LOG_DPRINTLN("Python> initialize OK.");
    LOG_DPRINTLN("Python> %s.", Py_GetVersion());

    return true;
  }

  void fini()
  {
    Py_Finalize();
  }

/*
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
*/
  
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

/*
  bool runFile(const qlib::LString &path)
  {
    return true;
  }
*/
  
}

#endif

