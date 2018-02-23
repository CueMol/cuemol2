// -*-Mode: C++;-*-
//
//  XGL display context implementation
//
//  $Id: XglDisplayContext.hpp,v 1.7 2009/08/22 11:10:46 rishitani Exp $

#ifndef GFX_XGL_DISPLAY_CONTEXT_HPP_
#define GFX_XGL_DISPLAY_CONTEXT_HPP_

#include <GL/glx.h>
#include <X11/Xlib.h>

#include "OglDisplayContext.hpp"
#include "XglView.hpp"

namespace sysdep {

  class XglDisplayContext : public OglDisplayContext
  {
  private:
    Display *m_pDisplay;
    Window m_xwin;
    GLXContext m_glcx;

    // XglView *m_pTargetView;

  public:
    // XglDisplayContext(int sceneid, XglView *pView);

    XglDisplayContext();

    virtual ~XglDisplayContext();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    /*
    virtual qsys::View *getTargetView() const {
      return m_pTargetView;
    }
    */

    ///////////////

    bool setup(Display *pDsp, Window xwin, DisplayContext *pShareCtxt);

    GLXContext getGLXContext() const { return m_glcx; }
  };

}

#endif
