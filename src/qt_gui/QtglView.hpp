// -*-Mode: C++;-*-
//
// Qt OGL View implementation
//

#ifndef QTGL_VIEW_HPP_INCLUDE_
#define QTGL_VIEW_HPP_INCLUDE_

#include "qtgui.hpp"
#include <sysdep/OglView.hpp>

namespace qtgui {

  class QtglDisplayContext;
  using gfx::DisplayContext;

  class QTGUI_API QtglView : public sysdep::OglView
  {
  private:
    typedef sysdep::OglView super_t;

    QtglDisplayContext *m_pCtxt;

    /// Mouse dragging start
    int m_nDragStart;
    enum {
      DRAG_NONE,
      DRAG_CHECK,
      DRAG_DRAG
    };
    
    bool m_bCursorIn;

    QtglView(const QtglView &) {}

  public:

    QtglView();

    virtual ~QtglView();
  
    //////////
  
  public:
    virtual LString toString() const;

    virtual void unloading();

    virtual DisplayContext *getDisplayContext();

    virtual void swapBuffers();

    /// Query hardware stereo capability
    virtual bool hasHWStereo() const;

    ///////////////////////////////
    // System dependent implementations

    bool initGL(void *pWidget);

  private:
    void *m_pWidget;

    bool m_bHasQuadBuffer;

    // bool setupShareList();
    // void changeBufMode(bool bSte);
    //bool setupPixelFormat();
    //int choosePixFmt(int nColorBits, bool bStereo);
    //bool setPixFmt(int);

  };

}

#endif

