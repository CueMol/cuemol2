//
// CueMol2 plugin class with MacOSX implementation
//
// $Id: OSXPlugin.hpp,v 1.4 2009/08/13 08:46:06 rishitani Exp $

#ifndef NP_OSX_PLUGIN_HPP_INCLUDED
#define NP_OSX_PLUGIN_HPP_INCLUDED

#include "Plugin.hpp"

/*
#include <X11/Xlib.h>
#include <X11/Intrinsic.h>
#include <X11/cursorfont.h>

#include <GL/gl.h>
#include <GL/glx.h>
*/

namespace np {

  class OSXPlugin : public Plugin
  {
  private:
    qsys::ViewPtr m_rview;
    sysdep::AglView *m_pCachedView;

    AGLContext m_ctx;

  public:
    OSXPlugin(NPP pNPInstance);

    virtual ~OSXPlugin();

    virtual bool init(NPWindow* pNPWindow);

    virtual void fini();

    virtual bool bind(int nSceneID, int nViewID);

    virtual int handleEvent(void *pev);
    virtual void windowResized(NPWindow* pNPWindow);

    /////////////////////////////
    
  private:
    bool setupOpenGL(sysdep::AglView *pView);
    void cleanupOpenGL();

    GrafPtr getGrafPort() const {
      NP_Port* npport = (NP_Port*) m_pWindow->window;
      return npport->port;
    }

    bool bindImpl();
    void setupAglViewport();

    //void Draw(/*HiliteState hilite*/);
    //    bool FocusDraw();
    //    void RestoreDraw();

    GrafPtr fSavePort;
    RgnHandle fSaveClip;
    Rect fRevealedRect;
    short fSavePortTop;
    short fSavePortLeft;
    Boolean fUserInstalledPlugin;
    Boolean fHiddenPlugin;
    Boolean fAskedLoadURL;

  };

}

#endif // NP_X11_PLUGIN_HPP_INCLUDED
