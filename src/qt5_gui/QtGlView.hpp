// -*-Mode: C++;-*-
//
// Qt OGL View implementation
//

#ifndef QTGL_VIEW_HPP_INCLUDE_
#define QTGL_VIEW_HPP_INCLUDE_

#include "qt5_gui.hpp"
#include <sysdep/OglView.hpp>

namespace qt5_gui {

  class QtGlDisplayContext;
  using gfx::DisplayContext;

  class QT5GUI_API QtGlView : public sysdep::OglView
  {
  private:
    typedef sysdep::OglView super_t;

    QtGlDisplayContext *m_pCtxt;

    /// Mouse dragging start
    int m_nDragStart;
    enum {
      DRAG_NONE,
      DRAG_CHECK,
      DRAG_DRAG
    };
    
    bool m_bCursorIn;

    QtGlView(const QtGlView &) {}

  public:

    QtGlView();

    virtual ~QtGlView();
  
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

