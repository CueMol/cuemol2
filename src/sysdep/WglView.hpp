// -*-Mode: C++;-*-
//
// WGL View implementation
//
// $Id: WglView.hpp,v 1.13 2011/03/15 16:21:38 rishitani Exp $
//

#ifndef WGL_VIEW_HPP_INCLUDE_
#define WGL_VIEW_HPP_INCLUDE_

#include "sysdep.hpp"
#include "ogl_core/OcView.hpp"

#ifdef WIN32
#  include <windows.h>
#endif

namespace sysdep {

  class WglDisplayContext;
  using gfx::DisplayContext;

  class SYSDEP_API WglView : public OcView
  {
  private:
    typedef OcView super_t;

    WglDisplayContext *m_pCtxt;

    /// Window handle to which this view is attached
    HWND m_hWnd;
    
    /// GDI display context
    HDC m_hDC;

    /// Main GL rendering context
    HGLRC m_hGL;

    PIXELFORMATDESCRIPTOR m_pfd;

    bool m_bCursorIn;

    // MSAA support
    int m_nMultiSamples;
    bool m_bHasMultisample;


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

    bool initializeGLEW();

    void setMultisample(int samples) {
      if (samples == 0) {
        m_nMultiSamples = 0;
      } else if (samples > 4) {
        m_nMultiSamples = 1 << 4;
      } else {
        m_nMultiSamples = (1 << samples);
      }
      LOG_DPRINTLN("Set MSAA %d --> nsamples=%d", samples, m_nMultiSamples);
    }

  private:
    bool m_bHasQuadBuffer;

    bool setupShareList();

    bool setupPixelFormat();
    int choosePixFmt(bool bStereo);
    bool setPixFmt(int);

    // void setUpMouseEvent(UINT nFlags, POINTS point, qsys::InDevEvent &ev);

    bool tryLegacyPixelFormat();
#ifdef HAVE_GLEW
    int choosePixFmtARB(bool bStereo, int nMultiSamples);
    bool tryMSAAPixelFormat(bool stereo, int& pixelFormat);
    bool tryAdvancedPixelFormat();
#endif
    
  };

}

#endif
