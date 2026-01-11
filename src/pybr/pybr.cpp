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
extern void pybr_unregClasses();

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
    auto m = wrapperInit();
    PyModule_AddFunctions(m, module_methods);
    return m;
}

bool g_bEmbedInit;

void handleError(PyStatus status, PyConfig *config)
{
    if (status.err_msg) {
        fprintf(stderr, "Python config error: %s\n", status.err_msg);
    }
    PyConfig_Clear(config);
}

std::optional<fs::path> findPythonHome(const fs::path &appDir)
{
    // Try to find python home directory relative to the appDir
    auto pythonHome = appDir / ".." / "lib" / "python";
    if (fs::exists(pythonHome) && fs::is_directory(pythonHome)) {
        return pythonHome;
    }
    // pythonHome = appDir / ".." / "Resources" / "python";
    pythonHome = appDir / "python";
    if (fs::exists(pythonHome) && fs::is_directory(pythonHome)) {
        return pythonHome;
    }

    LOG_DPRINTLN("Python> cannot find pythonHome");
    return std::nullopt;
}

bool initEmbedWithPath(const char *szConfPath)
{
    fs::path confpath(szConfPath);
    auto appDir = confpath.parent_path();
    auto pythonHome = findPythonHome(appDir);
    if (!pythonHome.has_value()) {
        return false;
    }
    auto pythonHomePath = pythonHome.value();

    PyConfig config;
    PyConfig_InitIsolatedConfig(&config);

    PyStatus status;
    status = PyConfig_SetString(&config, &config.program_name,
                                Py_DecodeLocale("cuemol2", NULL));
    status = PyConfig_SetString(&config, &config.home,
                                Py_DecodeLocale(pythonHomePath.c_str(), NULL));
    if (PyStatus_Exception(status)) {
        handleError(status, &config);
        return false;
    }

    LOG_DPRINTLN("Python> PythonHome=%s", pythonHomePath.c_str());

    auto libPath = pythonHomePath / "lib" / "python3.12";
    auto sitePath = libPath / "site-packages";
    auto dynloadPath = libPath / "lib-dynload";

    config.module_search_paths_set = 1;
    PyWideStringList_Append(&config.module_search_paths,
                            Py_DecodeLocale(libPath.c_str(), NULL));
    PyWideStringList_Append(&config.module_search_paths,
                            Py_DecodeLocale(dynloadPath.c_str(), NULL));
    PyWideStringList_Append(&config.module_search_paths,
                            Py_DecodeLocale(sitePath.c_str(), NULL));

    status = Py_InitializeFromConfig(&config);
    PyConfig_Clear(&config);

    if (PyStatus_Exception(status)) {
        fprintf(stderr, "Python initialization failed\n");
        Py_ExitStatusException(status);
        return false;
    }

    return true;
    // return !PyStatus_Exception(status);
}

void addPythonPath(const fs::path &pyDir)
{
    LString strpath = pyDir.string();
    strpath = strpath.escapeQuots();

    LString src = LString::format(
        "import sys\n"
        "sys.path.append('%s')\n",
        strpath.c_str());

    PyRun_SimpleString(src.c_str());
    LOG_DPRINTLN("Python> local script path=%s added", strpath.c_str());
}

bool initEmbedPython(const char *szConfPath)
{
    if (Py_IsInitialized()) {
        LOG_DPRINTLN("Python> already initialized.");
        g_bEmbedInit = false;
        return true;
    }

    g_bEmbedInit = true;
    PyImport_AppendInittab("_cuemol_internal", &initModuleFunc);

    if (szConfPath != NULL) {
        if (!initEmbedWithPath(szConfPath)) {
            LOG_DPRINTLN("Python> failed to initialize with custom path.");
            return false;
        }
    } else {
        Py_SetProgramName(Py_DecodeLocale("cuemol2", NULL));
        Py_Initialize();
    }

    // LOG_DPRINTLN("Python> PythonHome=%s", Py_EncodeLocale(Py_GetPythonHome(), NULL));

    // Append local python script path to sys.path
    if (szConfPath != NULL) {
        auto appDir = fs::path(szConfPath).parent_path();
        addPythonPath(appDir / "python");
        addPythonPath(appDir / "data" / "python");
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

bool init(const char *szConfPath)
{
    pybr_regClasses();

    return initEmbedPython(szConfPath);
}

void fini()
{
    if (g_bEmbedInit) {
        pybr_unregClasses();
        Py_Finalize();
    }
}
}  // namespace pybr
