//
// Python CueMol module initialization
//
#include <common.h>

#ifdef HAVE_PYTHON
#include <Python.h>

#include <qlib/EventManager.hpp>
#include <qlib/LProcMgr.hpp>
#include <qlib/qlib.hpp>

#ifndef PYBR_MINIMUM_MODULES
#include <qsys/SceneManager.hpp>
#include <qsys/qsys.hpp>
#endif

#if (GUI_ARCH != MB_GUI_ARCH_CLI)
#include <sysdep/sysdep.hpp>
#endif

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

#include "wrapper.hpp"

using namespace pybr;

/// DLL entrance routine for pymodule

PyMODINIT_FUNC
#if PY_MAJOR_VERSION >= 3
PyInit__cuemol_internal()
#else
init_internal()
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

#ifndef PYBR_MINIMUM_MODULES
namespace render {
extern bool init();
extern void fini();
}  // namespace render
namespace molstr {
extern bool init();
extern void fini();
}  // namespace molstr
namespace molvis {
extern bool init();
extern void fini();
}  // namespace molvis
namespace xtal {
extern bool init();
extern void fini();
}  // namespace xtal
namespace molanl {
extern bool init();
extern void fini();
}  // namespace molanl
namespace surface {
extern bool init();
extern void fini();
}  // namespace surface
namespace symm {
extern bool init();
extern void fini();
}  // namespace symm
namespace lwview {
extern bool init();
extern void fini();
}  // namespace lwview
namespace anim {
extern bool init();
extern void fini();
}  // namespace anim
namespace mdtools {
extern bool init();
extern void fini();
}  // namespace mdtools
namespace importers {
extern bool init();
extern void fini();
}  // namespace importers

#include <qsys/TTYView.hpp>

namespace pybr {
class TTYViewFactory : public qsys::ViewFactory
{
public:
    TTYViewFactory() {}
    virtual ~TTYViewFactory() {}
    virtual qsys::View *create()
    {
        return MB_NEW qsys::TTYView();
    }
};
void registerViewFactory()
{
    qsys::View::setViewFactory(MB_NEW TTYViewFactory());
}
}  // namespace pybr
#endif

namespace pybr {

bool g_bInitOK = false;

PyObject *isInitialized(PyObject *self, PyObject *args)
{
    if (g_bInitOK)
        Py_RETURN_TRUE;
    else
        Py_RETURN_FALSE;
}

/// CueMol initialization routine
PyObject *initCueMol(PyObject *self, PyObject *args)
{
    if (g_bInitOK) return Py_BuildValue("");

    const char *config;
    if (!PyArg_ParseTuple(args, "s", &config)) return NULL;

    LString confpath(config);

    printf("initCueMol(%s) called.\n", config);

    try {

#ifndef PYBR_MINIMUM_MODULES
        if (confpath.isEmpty()) {
            confpath = DEFAULT_CONFIG;
        }
        qsys::init(confpath);

#if (GUI_ARCH != MB_GUI_ARCH_CLI)
        sysdep::init();
#endif

        pybr::registerViewFactory();

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
#endif

#ifdef USE_XMLRPC
        // load python module
        xrbr::init();
        MB_DPRINTLN("---------- setup XRBR OK");
#endif

        // initTextRender();
        // MB_DPRINTLN("---------- initTextRender() OK");
        MB_DPRINTLN("CueMol> initialized.");
        g_bInitOK = true;
    } catch (const qlib::LException &e) {
        LOG_DPRINTLN("Init> Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("Init> Reason: %s", e.getMsg().c_str());
        // return NS_ERROR_NOT_IMPLEMENTED;
    } catch (...) {
        LOG_DPRINTLN("Init> Caught unknown exception");
        // return NS_ERROR_NOT_IMPLEMENTED;
    }

    return Py_BuildValue("");
}

//////////

/// CueMol finalization routine
PyObject *finiCueMol(PyObject *self, PyObject *args)
{
    if (!g_bInitOK) {
        LOG_DPRINTLN("CueMol> CueMol not initialized!!");
        return Py_BuildValue("");
    }

#ifdef USE_XMLRPC
    // unload XMLRPC module
    xrbr::fini();
    MB_DPRINTLN("=== xrbr::fini() OK ===");
#endif

    // cleanup timer
    qlib::EventManager::getInstance()->finiTimer();

#ifndef PYBR_MINIMUM_MODULES
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
#if (GUI_ARCH != MB_GUI_ARCH_CLI)
    sysdep::fini();
#endif

    qsys::fini();
#endif

    g_bInitOK = false;
    MB_DPRINTLN("CueMol> CueMol finalized.");

    return Py_BuildValue("");
}
}

#endif
