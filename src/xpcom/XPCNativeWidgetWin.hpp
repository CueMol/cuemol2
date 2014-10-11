//
// XPCOM native window Win32 implementation class
//
// $Id: XPCNativeWidgetWin.hpp,v 1.3 2010/12/23 14:34:19 rishitani Exp $
//

#ifndef XPC_NATIVE_WIDGET_WIN_HPP
#define XPC_NATIVE_WIDGET_WIN_HPP

#include "xpcom.hpp"

#include "XPCNativeWidget.hpp"
#include <sysdep/MouseEventHandler.hpp>

#include <windows.h>
#include <windowsx.h>
#include <gl/gl.h>
#include <gl/glu.h>

namespace sysdep { class WglView; }
namespace qsys { class InDevEvent; }

namespace xpcom {

  class XPCNativeWidgetWin : public XPCNativeWidget
  {
  public:
    XPCNativeWidgetWin();
    virtual ~XPCNativeWidgetWin();

     NS_IMETHOD Unload(void);
     NS_IMETHOD Resize(PRInt32 x, PRInt32 y, PRInt32 w, PRInt32 h);
     NS_IMETHOD Show(void);
     NS_IMETHOD Hide(void); 
     NS_IMETHOD Reload(bool *_retval );

  public:
    virtual nsresult setupImpl(nativeWindow widget);
    virtual nsresult attachImpl();

    //virtual void unloadImpl();
    //virtual void resizeImpl(int x, int y, int width, int height);

    /// Native Win32 event handler impl
    LRESULT handleEvent(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

  private:
    /// parent Win32 window object
    HWND m_hParWnd;

    /// child Win32 window object
    HWND m_hWnd;

    /// DC for child window
    HDC m_hDC;

    /// Display scaling factor
    double m_sclX, m_sclY;

    HWND selectParentWindow(HWND hWnd);

    sysdep::WglView *m_pWglView;

    sysdep::MouseEventHandler m_meh;

    bool m_bCursorIn;

    void setupWinMouseEvent(UINT msg, WPARAM wParam, LPARAM lParam, qsys::InDevEvent &ev);
    
    HWND createNativeChildWnd();

  };

}

#endif
