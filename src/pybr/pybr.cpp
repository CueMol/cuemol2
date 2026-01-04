//
// pybr: python bridge module
//

#include <common.h>

#include <qlib/LString.hpp>
#include <boost/filesystem/path.hpp>
#include <boost/filesystem.hpp>
namespace fs = boost::filesystem;

#include <Python.h>
#include "pybr.hpp"
#include "wrapper.hpp"
#include "PythonBridge.hpp"

extern void pybr_regClasses();

// internal dummy module functions
namespace {
PyObject *initCueMol(PyObject *self, PyObject *args)
{
    return Py_BuildValue("");
}

PyObject *finiCueMol(PyObject *self, PyObject *args)
{
    return Py_BuildValue("");
}

PyObject *isInitialized(PyObject *self, PyObject *args)
{
    Py_RETURN_TRUE;
}
}  // namespace

static PyMethodDef module_methods[] = {
    {"initCueMol", (PyCFunction)initCueMol, METH_VARARGS,
     "initialize CueMol system.\n"},
    {"finiCueMol", (PyCFunction)finiCueMol, METH_VARARGS, "finalize CueMol system.\n"},
    {"isInitialized", (PyCFunction)isInitialized, METH_VARARGS,
     "check initialization.\n"},
    {NULL, NULL, 0, NULL}};

namespace pybr {

PyObject *initModuleFunc(void)
{
    auto m = Wrapper::init();
    PyModule_AddFunctions(m, module_methods);
    return m;
}

bool init(const char *szConfPath)
{
    pybr_regClasses();

    Py_SetProgramName(Py_DecodeLocale("cuemol2", NULL));

    PyImport_AppendInittab("_cuemol_internal", &initModuleFunc);

#ifdef HAVE_LOCAL_PYTHON
    // Case: GUI application with local python installation
    //   --> Set local python path as PYTHONHOME
    if (szConfPath != NULL) {
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

    // LOG_DPRINTLN("Python> PythonHome=%s", Py_EncodeLocale(Py_GetPythonHome(), NULL));

    // Append local python script path to sys.path
    if (szConfPath != NULL) {
        fs::path confpath(szConfPath);
        confpath = confpath.parent_path();
        confpath /= "python";
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

    // Redirect stdout/err to the logwindow
    PyRun_SimpleString(
        "import sys\n"
        "import _cuemol_internal as ci\n"
        "class CatchOutErr:\n"
        "    def __init__(self):\n"
        "        self.value = ''\n"
        "    def write(self, txt):\n"
        "        ci.print(txt)\n"
        "    def flush(self):\n"
        "        pass\n"
        "catchOutErr = CatchOutErr()\n"
        "sys.stdout = catchOutErr\n"
        "sys.stderr = catchOutErr\n");

    LOG_DPRINTLN("Python> initialize OK.");
    LOG_DPRINTLN("Python> %s.", Py_GetVersion());

    return true;
}

void fini()
{
    Py_Finalize();
}
}  // namespace pybr
