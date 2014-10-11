// -*-Mode: C++;-*-
//
// AGL View implementation
//
// $Id: AglView.hpp,v 1.5 2009/03/30 05:02:48 rishitani Exp $
//

#ifndef AGL_VIEW_HPP_INCLUDE_
#define AGL_VIEW_HPP_INCLUDE_

#include "OglView.hpp"

namespace sysdep {

  class AglDisplayContext;
  using gfx::DisplayContext;

  class AglView : public OglView
  {
  private:
    WindowRef m_win;
    AglDisplayContext *m_pCtxt;
    int m_nViewX, m_nViewY;

    /** for mouse drag event generation */
    int m_prevPt_x, m_prevPt_y;
    int m_startPt_x, m_startPt_y;
    
    /** mouse dragging start */
    bool m_fDragStart;
    

  public:

    AglView();

    virtual ~AglView();
  
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

    bool attach(AGLContext ctx, WindowRef win);
    Boolean handleEvent(EventRecord *event, int w, int h);
    void trackDrag(int x, int y, UInt16 mods);

    void setViewPos(int x, int y) {
      m_nViewX = x;
      m_nViewY = y;
    }

  private:
    void setUpMouseEvent(UInt32 msg, UInt16,
			 int rtx, int rty,
			 qsys::InDevEvent &ev);


  };

}

#endif
