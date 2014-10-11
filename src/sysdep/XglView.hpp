// -*-Mode: C++;-*-
//
// XGL View implementation
//
// $Id: XglView.hpp,v 1.7 2009/08/22 11:10:46 rishitani Exp $
//

#ifndef XGL_VIEW_HPP_INCLUDE_
#define XGL_VIEW_HPP_INCLUDE_

#include <X11/Xlib.h>
#include <X11/Intrinsic.h>
#include <GL/gl.h>
#include <GL/glu.h>
#include <GL/glx.h>

#include "OglView.hpp"

namespace sysdep {

  class XglDisplayContext;
  using gfx::DisplayContext;

  class SYSDEP_API XglView : public OglView
  {
  public:
    Display *m_pDisplay;
    Window m_xwin;

    XglDisplayContext *m_pCtxt;

  public:

    XglView();

    virtual ~XglView();
  
    //////////
  
  public:
    virtual LString toString() const;

    virtual DisplayContext *getDisplayContext();

    virtual void swapBuffers();

    virtual void unloading();

    ////
    // framebuffer operations
    
    // void readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize);
    
    // /** setup the projection matrix for hit-testing */
    // void setUpHitProjMat(int x, int y);
    
    // virtual Hittest *hitTest(int x, int y);
    
    // virtual void readObj(qlib::ObjInStream &dis);
    
    ///////////////////////////////
    // System dependent implementations

    bool setup(Display *pDsp, Window xwin);

    void handleEvent(XEvent *xevent, Boolean *b);

  private:
    void setUpMouseEvent(unsigned int mask,
			 int x, int y, int rtx, int rty,
			 qsys::InDevEvent &ev);

    /** for mouse drag event generation */
    int m_prevPt_x, m_prevPt_y;
    int m_startPt_x, m_startPt_y;
    
    /** mouse dragging start */
    bool m_fDragStart;
    

  };

  // typedef qlib::LScrSp<XglView> XglViewPtr;
}

#endif
