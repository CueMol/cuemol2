// -*-Mode: C++;-*-
//
// WGL View implementation for off-screen image rendering
//

#ifndef WGL_IMG_VIEW_HPP_INCLUDE_
#define WGL_IMG_VIEW_HPP_INCLUDE_

#include "OglView.hpp"

namespace sysdep {

  class WglDisplayContext;
  using gfx::DisplayContext;

  class SYSDEP_API WglImgView : public OglView
  {
  private:
    typedef OglView super_t;

    /// Display contxt for this view
    WglDisplayContext *m_pCtxt;

    /// Window handle to which this view is attached
    HWND m_hWnd;
    
    /// GDI display context
    HDC m_hDC;

    /// Main GL rendering context
    HGLRC m_hGL;

    /// WGL pixel format descriptor data
    PIXELFORMATDESCRIPTOR m_pfd;

    WglImgView(const WglImgView &) {}

  public:

    WglImgView();

    virtual ~WglImgView();
  
    //////////
  
  public:
    virtual LString toString() const;

    // virtual void unloading();

    virtual DisplayContext *getDisplayContext();

    ////
    // framebuffer operations
    
    // void readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize);
    // /** setup the projection matrix for hit-testing */
    // void setUpHitProjMat(int x, int y);
    // virtual Hittest *hitTest(int x, int y);
    // virtual void readObj(qlib::ObjInStream &dis);
    // virtual void setCursor(int nCursorID);

    ///////////////////////////////
    // System dependent implementations

    //bool attach(HWND hWnd, HDC hDC, HGLRC hGL);
    bool attach(HWND hWnd, HDC hDC);

    LRESULT handleEvent(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

  private:
    HGLRC setupWglContext();
    bool setupShareList();

    // void changeBufMode(bool bSte);

    bool setupPixelFormat();
    int choosePixFmt(int nColorBits, bool bStereo);
    bool setPixFmt(int);

  };

}

#endif
