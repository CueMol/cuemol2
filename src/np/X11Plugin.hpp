//
// CueMol2 plugin class with X11 implementation
//
// $Id: X11Plugin.hpp,v 1.9 2009/08/13 08:46:06 rishitani Exp $

#ifndef NP_X11_PLUGIN_HPP_INCLUDED
#define NP_X11_PLUGIN_HPP_INCLUDED

#include "Plugin.hpp"

#include <X11/Xlib.h>
#include <X11/Intrinsic.h>
#include <X11/cursorfont.h>

#include <GL/gl.h>
#include <GL/glx.h>

namespace np {

  class X11Plugin : public Plugin
  {
  private:
    Display *m_pDisplay;
    Window m_xwin;
    Widget m_xtwgt;
    // XVisualInfo *m_pvi;
    GLXContext m_glcx;

    qsys::ViewPtr m_rview;
    sysdep::XglView *m_pCachedView;

  public:
    X11Plugin(NPP pNPInstance);

    virtual ~X11Plugin();

    virtual bool init(NPWindow* pNPWindow);

    virtual void fini();

    virtual void windowResized(NPWindow* pNPWindow);

    virtual bool bind(int nSceneID, int nViewID);

    /////////////////////////////

    void handleEvent(XEvent *xevent, Boolean *b);

    static void xt_event_handler(Widget xt_w, void *ptr, XEvent *xevent, Boolean *b);

  private:
    bool setupOpenGL();

    bool bindImpl();

  };

}

#endif // NP_X11_PLUGIN_HPP_INCLUDED
