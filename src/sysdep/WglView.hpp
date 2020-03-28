// -*-Mode: C++;-*-
//
// WGL View implementation
//
// $Id: WglView.hpp,v 1.13 2011/03/15 16:21:38 rishitani Exp $
//

#ifndef WGL_VIEW_HPP_INCLUDE_
#define WGL_VIEW_HPP_INCLUDE_

#include "sysdep.hpp"
#include "OglView.hpp"

namespace sysdep {

  class WglDisplayContext;
  using gfx::DisplayContext;

  class SYSDEP_API WglView : public OglView
  {
  private:
    typedef OglView super_t;

    WglDisplayContext *m_pCtxt;

    /// Window handle to which this view is attached
    HWND m_hWnd;
    
    /// GDI display context
    HDC m_hDC;

    /// Main GL rendering context
    HGLRC m_hGL;

    PIXELFORMATDESCRIPTOR m_pfd;

    /// For mouse drag event generation
    POINTS m_prevPt;
    POINTS m_startPt;
    
    /// Mouse dragging start
    int m_nDragStart;
    enum {
      DRAG_NONE,
      DRAG_CHECK,
      DRAG_DRAG
    };
    
    bool m_bCursorIn;

    WglView(const WglView &) {}

  public:

    WglView();

    virtual ~WglView();
  
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

    bool attach(HWND hWnd, HDC hDC);

    // LRESULT handleEvent(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

    HDC getDC() const { return m_hDC; }
    HWND getHWND() const { return m_hWnd; }

  private:
    bool m_bHasQuadBuffer;

    bool setupShareList();

    bool setupPixelFormat();
    int choosePixFmt(int nColorBits, bool bStereo);
    bool setPixFmt(int);

    // void setUpMouseEvent(UINT nFlags, POINTS point, qsys::InDevEvent &ev);

  };

}

#endif
