#include <common.h>

#include "gui.hpp"

#include <gfx/TextRenderManager.hpp>

#ifdef BUILD_OPENGL_SYSDEP
#include <sysdep/sysdep.hpp>
#include <qsys/qsys.hpp>
#include <qsys/MouseEventHandler.hpp>
#endif

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
#ifdef BUILD_OPENGL_SYSDEP
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
#endif

#ifdef BUILD_OPENGL_SYSDEP
  qsys::MouseEventHandler *createMouseEventHander() {
    return new qsys::MouseEventHandler();
  }
#endif
}
