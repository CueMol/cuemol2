
#include <common.h>

#include "loader.hpp"

#include <iostream>
#include "boost/filesystem/path.hpp"
#include "boost/filesystem/operations.hpp"

#include <qlib/qlib.hpp>
#include <qlib/FileStream.hpp>

#include <gfx/TextRenderManager.hpp>

#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SysConfig.hpp>

#ifdef BUILD_OPENGL_SYSDEP
#include <sysdep/sysdep.hpp>
#include <sysdep/MouseEventHandler.hpp>
#endif

#ifdef HAVE_JAVASCRIPT
#  include <jsbr/jsbr.hpp>
#  include <jsbr/Interp.hpp>
#endif

#ifdef BUILD_PYTHON_BINDINGS
#  include <pybr/pybr.hpp>
#  include <pybr/PythonBridge.hpp>
#endif

#if !defined(QM_BUILD_LW)

namespace importers {
  extern bool init();
  extern void fini();
}

namespace mdtools {
  extern bool init();
  extern void fini();
}

namespace render {
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

namespace surface {
  extern bool init();
  extern void fini();
}

namespace symm {
  extern bool init();
  extern void fini();
}

namespace molanl {
  extern bool init();
  extern void fini();
}

#endif

namespace molstr {
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

#if (GUI_ARCH == MB_GUI_ARCH_WIN)
// Win32
#include <sysdep/WglView.hpp>
namespace {
  class WglViewFactory : public qsys::ViewFactory
  {
  public:
    WglViewFactory() {}
    virtual ~WglViewFactory() {}
    virtual qsys::View* create() {
      return new sysdep::WglView();
    }
  };
  void registerViewFactory()
  {
    qsys::View::setViewFactory(new WglViewFactory);
  }
}
#elif (GUI_ARCH == MB_GUI_ARCH_OSX)
// MacOS
#include <OpenGL/OpenGL.h>
#include <sysdep/CglView.hpp>
namespace {
  class CglViewFactory : public qsys::ViewFactory
  {
  public:
    CglViewFactory() {}
    virtual ~CglViewFactory() {}
    virtual qsys::View* create() {
      return new sysdep::CglView();
    }
  };
  void registerViewFactory()
  {
    qsys::View::setViewFactory(new CglViewFactory);
  }
}
#elif (GUI_ARCH == MB_GUI_ARCH_X11)
#include <sysdep/XglView.hpp>
namespace {
  class XglViewFactory : public qsys::ViewFactory
  {
  public:
    XglViewFactory() {}
    virtual ~XglViewFactory() {}
    virtual qsys::View* create() {
      return new sysdep::XglView();
    }
  };
  void registerViewFactory()
  {
    qsys::View::setViewFactory(new XglViewFactory);
  }
}
#else
#error "No suitable view impl found for current environment"
#endif

using qlib::LString;

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

namespace cuemol2 {

  int init_qlib() noexcept
  {
    try {
      return qlib::init();
    }
    catch (const qlib::LException &e) {
      LOG_DPRINTLN("Loader.init_qlib> Caught exception <%s>", typeid(e).name());
      LOG_DPRINTLN("Loader.init_qlib> Reason: %s", e.getMsg().c_str());
    }
    catch (...) {
      LOG_DPRINTLN("Loader.init_qlib> Caught unknown exception");
    }
    return -1;
  }

  int init(const LString &confpath, bool reg_view) noexcept
  {
    try {
      // if (confpath.isEmpty()) {
      //   confpath = LString(DEFAULT_CONFIG);
      // }

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

#ifdef HAVE_JAVASCRIPT
      // load internal JS module
      jsbr::init();
#endif

#ifdef BUILD_PYTHON_BINDINGS
      // load python module
      pybr::init(confpath);
#endif

      if (reg_view) {
#ifdef BUILD_OPENGL_SYSDEP
        registerViewFactory();
#endif
      }

    }
    catch (const qlib::LException &e) {
      LOG_DPRINTLN("Loader.init> Caught exception <%s>", typeid(e).name());
      LOG_DPRINTLN("Loader.init> Reason: %s", e.getMsg().c_str());
      return -1;
    }
    catch (...) {
      LOG_DPRINTLN("Loader.init> Caught unknown exception");
      return -1;
    }
    
    return 0;
  }

  int fini()
  {
#ifdef BUILD_PYTHON_BINDINGS
  // unload python module
  pybr::fini();
  MB_DPRINTLN("=== pybr::fini() OK ===");
#endif

#ifdef HAVE_JAVASCRIPT
  jsbr::fini();
  MB_DPRINTLN("=== jsbr::fini() OK ===");
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

    qlib::fini();

    std::cerr << "=== Terminated normaly ===" << std::endl;
    return 0;
  }

#ifdef BUILD_OPENGL_SYSDEP
  gfx::TextRenderImpl *initTextRender()
  {
    try {
      gfx::TextRenderImpl *pTR = (gfx::TextRenderImpl *) sysdep::createTextRender();
      gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
      pTRM->setImpl(pTR);
      return pTR;
    }
    catch (const qlib::LException &e) {
      LOG_DPRINTLN("Loader.initTextRender> Caught exception <%s>", typeid(e).name());
      LOG_DPRINTLN("Loader.initTextRender> Reason: %s", e.getMsg().c_str());
    }
    catch (...) {
      LOG_DPRINTLN("Loader.initTextRender> Caught unknown exception");
    }
    
    return NULL;
  }

  void finiTextRender(gfx::TextRenderImpl *pTR)
  {
    sysdep::destroyTextRender(pTR);
  }

#endif

#ifdef BUILD_OPENGL_SYSDEP
  sysdep::MouseEventHandler *createMouseEventHander() {
    return new sysdep::MouseEventHandler();
  }
#endif

} // namespace cuemol2
