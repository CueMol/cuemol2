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

  PyModuleDef DummyPkg = {
    PyModuleDef_HEAD_INIT, "cuemol", NULL, -1, NULL,
    NULL, NULL, NULL, NULL
  };
  PyObject* initDummyPkg(void)
  {
    PyObject *mod = PyModule_Create(&DummyPkg);
    PyModule_AddObject(mod, "__path__", Py_BuildValue("()"));
    return mod;
  }

  bool init(const char *szConfPath)
  {
    pybr_regClasses();
    Py_SetProgramName(Py_DecodeLocale("cuemol2", NULL));

    // PyImport_AppendInittab("cuemol", &initDummyPkg);
    PyImport_AppendInittab("cuemol._internal", &Wrapper::init);

#ifdef HAVE_LOCAL_PYTHON
    // Case: GUI application with local python installation
    //   --> Set local python path as PYTHONHOME
    if (szConfPath!=NULL) {
      fs::path confpath(szConfPath);
      confpath = confpath.parent_path();
      confpath /= "Python";
      if (fs::exists(confpath) && fs::is_directory(confpath)) {
        LString strpath = confpath.string();
        strpath = strpath.escapeQuots();
        Py_SetPythonHome(Py_DecodeLocale(strpath.c_str(), NULL));
	LOG_DPRINTLN("Python> SetPythonHome=%s", strpath.c_str());
      }
    }
#endif

    Py_Initialize();

    // hook import to import cuemol._internal
    PyRun_SimpleString("import importlib.abc\n"
		       "import importlib.machinery\n"
		       "import sys\n"
		       "class Finder(importlib.abc.MetaPathFinder):\n"
		       "    def find_spec(self, fullname, path, target=None):\n"
		       "        if fullname in sys.builtin_module_names:\n"
		       "            return importlib.machinery.ModuleSpec(\n"
		       "                fullname,\n"
		       "                importlib.machinery.BuiltinImporter,\n"
		       "            )\n"
		       "sys.meta_path.append(Finder())\n");

    //LOG_DPRINTLN("Python> PythonHome=%s", Py_EncodeLocale(Py_GetPythonHome(), NULL));

    // Append local python script path to sys.path
    if (szConfPath!=NULL) {
      fs::path confpath(szConfPath);
      confpath = confpath.parent_path();
#ifdef WIN32
      confpath /= "scripts";
#else
      confpath /= "python";
#endif
      LString strpath = confpath.string();
      strpath = strpath.escapeQuots();
      
      LString src = LString::format(
        "import sys\n"
        "sys.path.append('%s')\n",
        //"print(sys.path)\n",
        strpath.c_str());

      PyRun_SimpleString(src.c_str());
      LOG_DPRINTLN("Python> local script path=%s added", strpath.c_str());
    }

    //bool res = Wrapper::setup();
    //Wrapper::init();

    // Redirect stdout/err to the logwindow
    PyRun_SimpleString(
"import sys\n"
"import cuemol._internal as cuemol_internal\n"
"class CatchOutErr:\n"
"    def __init__(self):\n"
"        self.value = ''\n"
"    def write(self, txt):\n"
"        cuemol_internal.print(txt)\n"
"    def flush(self):\n"
"        pass\n"
"catchOutErr = CatchOutErr()\n"
"sys.stdout = catchOutErr\n"
"sys.stderr = catchOutErr\n"
);

    LOG_DPRINTLN("Python> initialize OK.");
    LOG_DPRINTLN("Python> %s.", Py_GetVersion());

    return true;
  }

  void fini()
  {
    Py_Finalize();
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

}

#endif

