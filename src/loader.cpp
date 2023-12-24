
#include <common.h>

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
#endif

#ifdef HAVE_JAVASCRIPT
#  include <jsbr/jsbr.hpp>
#  include <jsbr/Interp.hpp>
#endif

#ifdef HAVE_PYTHON
#  include <pybr/pybr.hpp>
#  include <pybr/PythonBridge.hpp>
#endif

#ifdef USE_XMLRPC
#  include <xmlrpc_bridge/xrbr.hpp>
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

#if (GUI_ARCH == MB_GUI_ARCH_OSX)
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
#else
#endif

using qlib::LString;

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

namespace cuemol2 {

int init_cuemol2(const LString &confpath)
{
  if (qlib::init())
    LOG_DPRINTLN("qlib::init() OK.");
  else {
    LOG_DPRINTLN("Init: ERROR!!");
    return -1;
  }

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

  registerViewFactory();

  return 0;
}

int cuemol2_fini()
{
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
  gfx::TextRenderImpl *pTR = (gfx::TextRenderImpl *) sysdep::createTextRender();
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  pTRM->setImpl(pTR);
  return pTR;
}

void finiTextRender(gfx::TextRenderImpl *pTR)
{
  sysdep::destroyTextRender(pTR);
}

#endif

} // namespace cuemol2
