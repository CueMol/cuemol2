#include <common.h>

#include "gui.hpp"

#include <gfx/TextRenderManager.hpp>

#ifdef BUILD_OPENGL_SYSDEP
#include <sysdep/sysdep.hpp>
#endif

#include <qsys/qsys.hpp>
#include <qsys/MouseEventHandler.hpp>

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
      return MB_NEW sysdep::WglView();
    }
  };
}
namespace cuemol2 {
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
      return MB_NEW sysdep::CglView();
    }
  };
}
namespace cuemol2 {
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
      return MB_NEW sysdep::XglView();
    }
  };
}
namespace cuemol2 {
  void registerViewFactory()
  {
    qsys::View::setViewFactory(new XglViewFactory);
  }
}
#else
#include <qsys/TTYView.hpp>
namespace {
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
}
namespace cuemol2 {
  void registerViewFactory()
  {
    qsys::View::setViewFactory(MB_NEW TTYViewFactory());
  }
}
#endif

namespace cuemol2 {

  gfx::TextRenderImpl *initTextRender()
  {
    try {
      gfx::TextRenderImpl *pTR = (gfx::TextRenderImpl *) qsys::createTextRender();
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
    qsys::destroyTextRender(pTR);
  }

  qsys::MouseEventHandler *createMouseEventHander() {
    return new qsys::MouseEventHandler();
  }
}

#if defined(__linux__)
extern "C" void qsys_GUIDisplayContext_anchor();
extern "C" void gfx_ShaderObject_anchor();
namespace {
    [[gnu::used]] void (* volatile keep_qsys_GUIDisplayContext)() = &qsys_GUIDisplayContext_anchor;
    [[gnu::used]] void (* volatile keep_gfx_ShaderObject)() = &gfx_ShaderObject_anchor;
}
#endif
