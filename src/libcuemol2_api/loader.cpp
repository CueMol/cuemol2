
#include <common.h>

#include "loader.hpp"
#include "gui.hpp"

#include <iostream>
#include "boost/filesystem/path.hpp"
#include "boost/filesystem/operations.hpp"

#include <qlib/qlib.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/ClassRegistry.hpp>

#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SysConfig.hpp>

#ifdef BUILD_OPENGL_SYSDEP
#include <sysdep/sysdep.hpp>
#endif

#ifdef ENABLE_PYTHON_EMBED
#include <pybr/pybr.hpp>
#endif

#if !defined(QM_BUILD_LW)
namespace importers {
extern bool init();
extern void fini();
}  // namespace importers

namespace mdtools {
extern bool init();
extern void fini();
}  // namespace mdtools

namespace render {
extern bool init();
extern void fini();
}  // namespace render

namespace molvis {
extern bool init();
extern void fini();
}  // namespace molvis

namespace xtal {
extern bool init();
extern void fini();
}  // namespace xtal

namespace surface {
extern bool init();
extern void fini();
}  // namespace surface

namespace symm {
extern bool init();
extern void fini();
}  // namespace symm

namespace molanl {
extern bool init();
extern void fini();
}  // namespace molanl
#endif

#ifdef BUILD_MOLCLIENT
namespace molclient {
extern bool init();
extern void fini();
}  // namespace molclient
#endif

namespace molstr {
extern bool init();
extern void fini();
}  // namespace molstr
namespace lwview {
extern bool init();
extern void fini();
}  // namespace lwview
namespace anim {
extern bool init();
extern void fini();
}  // namespace anim

#ifdef ENABLE_PYTHON_EMBED
namespace pybr {
extern bool init(const char *confpath /* = nullptr */);
extern void fini();
}  // namespace pybr
#endif

namespace cuemol2 {

using qlib::LString;

int init_qlib() noexcept
{
    try {
        return qlib::init();
    } catch (const qlib::LException &e) {
        LOG_DPRINTLN("Loader.init_qlib> Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("Loader.init_qlib> Reason: %s", e.getMsg().c_str());
    } catch (...) {
        LOG_DPRINTLN("Loader.init_qlib> Caught unknown exception");
    }
    return -1;
}

int init(const LString &confpath, bool reg_view, bool use_pybr) noexcept
{
    try {
        if (!qsys::init(confpath)) {
            LOG_DPRINTLN("Qsys Init (%s): ERROR!!", confpath.c_str());
            return -1;
        }
#ifdef BUILD_OPENGL_SYSDEP
        sysdep::init();
#endif

        LOG_DPRINTLN("main> confpath=%s", confpath.c_str());

        // load molstr/lwview module
        molstr::init();
        lwview::init();
        anim::init();

        // load other modules
        render::init();
        molvis::init();
        xtal::init();
        symm::init();
        surface::init();
        molanl::init();
        mdtools::init();
        importers::init();

#ifdef BUILD_MOLCLIENT
        molclient::init();
#endif

#ifdef ENABLE_PYTHON_EMBED
        if (use_pybr) {
            pybr::init(confpath.c_str());
        }
#endif

        if (reg_view) {
            registerViewFactory();
        }

    } catch (const qlib::LException &e) {
        LOG_DPRINTLN("Loader.init> Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("Loader.init> Reason: %s", e.getMsg().c_str());
        return -1;
    } catch (...) {
        LOG_DPRINTLN("Loader.init> Caught unknown exception");
        return -1;
    }

    return 0;
}

int fini() noexcept
{
    try {
#ifdef ENABLE_PYTHON_EMBED
        pybr::fini();
#endif

#ifdef BUILD_MOLCLIENT
        molclient::fini();
#endif

        // load other modules
        render::fini();
        molvis::fini();
        xtal::fini();
        symm::fini();
        surface::fini();
        molanl::fini();

        anim::fini();
        lwview::fini();
        molstr::fini();
        MB_DPRINTLN("=== molstr::fini() OK ===");

#ifdef BUILD_OPENGL_SYSDEP
        sysdep::fini();
#endif
        qsys::fini();
        MB_DPRINTLN("=== qsys::fini() OK ===");
    } catch (const qlib::LException &e) {
        LOG_DPRINTLN("fini> Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("fini> Reason: %s", e.getMsg().c_str());
        return -1;
    } catch (...) {
        LOG_DPRINTLN("fini> Caught unknown exception");
        return -1;
    }

    return 0;
}

int fini_qlib() noexcept
{
    try {
        qlib::fini();
        std::cerr << "=== Terminated normaly ===" << std::endl;
    } catch (const qlib::LException &e) {
        LOG_DPRINTLN("fini_qlib> Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("fini_qlib> Reason: %s", e.getMsg().c_str());
        return -1;
    } catch (...) {
        LOG_DPRINTLN("fini_qlib> Caught unknown exception");
        return -1;
    }
    return 0;
}

int init_timer(qlib::TimerImpl *pTimer) noexcept
{
    try {
        // setup timer
        qlib::EventManager::getInstance()->initTimer(pTimer);
    } catch (const qlib::LException &e) {
        LOG_DPRINTLN("Init> Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("Init> Reason: %s", e.getMsg().c_str());
        return -1;
    } catch (...) {
        LOG_DPRINTLN("Init> Caught unknown exception");
        return -1;
    }

    return 0;
}

}  // namespace cuemol2
