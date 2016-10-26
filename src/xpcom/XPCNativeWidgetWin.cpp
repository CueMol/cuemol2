//
// XPCOM native window Win32 implementation
//
// $Id: XPCNativeWidgetWin.cpp,v 1.11 2011/02/20 09:34:26 rishitani Exp $
//

#include "xpcom.hpp"

#include "XPCNativeWidgetWin.hpp"

#include "xpcom.hpp"

#include <qsys/InDevEvent.hpp>
#include <sysdep/WglView.hpp>
#include <sysdep/WglDisplayContext.hpp>

using namespace xpcom;
using gfx::DisplayContext;
using sysdep::WglDisplayContext;

XPCNativeWidgetWin::XPCNativeWidgetWin()
{
  MB_DPRINTLN("!! XPCNativeWidgetWin (%p) ctor called.", this);
  m_hParWnd = NULL;
  m_hWnd = NULL;
  // mGC = nullptr;
  m_hDC = NULL; 
  m_bCursorIn = false;
  mPosX = 0;
  mPosY = 0;
  m_sclX = 1.0;
  m_sclY = 1.0;
}

XPCNativeWidgetWin::~XPCNativeWidgetWin()
{
  MB_DPRINTLN("!! XPCNativeWidgetWin (%p) dtor called.", this);
}

// entry stub
static
LRESULT CALLBACK sHandleWin32Event(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
  // get our plugin instance object and ask it for the version string
#ifdef _WIN64
  LONG_PTR ldata = GetWindowLongPtr(hWnd, GWLP_USERDATA);
#else
  LONG ldata = GetWindowLong(hWnd, GWL_USERDATA);
#endif
  XPCNativeWidgetWin *ppn = reinterpret_cast<XPCNativeWidgetWin *>(ldata);
  
  if (ppn)
    return ppn->handleEvent(hWnd, msg, wParam, lParam);

  return ::DefWindowProc(hWnd, msg, wParam, lParam);
}

HWND XPCNativeWidgetWin::createNativeChildWnd()
{
  WNDCLASSEX wc;
  wc.cbSize = sizeof wc;
  // wc.style         = CS_HREDRAW|CS_VREDRAW|CS_DBLCLKS;
  wc.style         = CS_HREDRAW|CS_VREDRAW;
  wc.lpfnWndProc   = sHandleWin32Event;
  wc.cbClsExtra    = 0;
  wc.cbWndExtra    = 0;
  wc.hInstance     = NULL;
  wc.hIcon         = NULL; //::LoadIcon(::GetModuleHandle(NULL), IDI_APPLICATION);
  wc.hCursor       = NULL;
  wc.hbrBackground = (HBRUSH)::GetStockObject(NULL_BRUSH);
  wc.lpszMenuName  = NULL;
  wc.lpszClassName = L"CueMol2NativeWidget";
  wc.hIconSm = NULL;

  if (::RegisterClassEx(&wc)==0) {
    DWORD nerr = GetLastError();
    if (nerr!=ERROR_CLASS_ALREADY_EXISTS) {
      LOG_DPRINTLN("XPCNativeWidgetWin> FATAL ERROR, Cannot register window class!!");
      return NULL;
    }
  }

  MB_DPRINTLN("XPCNativeWidgetWin> Register window class: OK");

  int width = getWidth(), height=getHeight();
  if (width<0) width = 0;
  if (height<0) height = 0;

  HWND wnd = CreateWindow(wc.lpszClassName,
                          L"native view",
                          WS_CHILD|WS_VISIBLE|WS_CLIPSIBLINGS|WS_CLIPCHILDREN,
                          0, 0, width, height,
                          m_hParWnd,
                          NULL,
                          NULL,
                          NULL);
  return wnd;
}

nsresult XPCNativeWidgetWin::setupImpl(nativeWindow widget)
{
  // get display scaling factors
  HDC screen = GetDC(0);
  m_sclX = GetDeviceCaps(screen, LOGPIXELSX) / 96.0;
  m_sclY = GetDeviceCaps(screen, LOGPIXELSY) / 96.0;
  LOG_DPRINTLN("Display sclfac= (%f,%f)", m_sclX, m_sclY);

  HWND hwnd = (HWND)widget;
  //hwnd = selectParentWindow(hwnd);
  MB_DPRINT("native win: %p\n", hwnd);
  m_hParWnd = hwnd;

  HWND wnd = createNativeChildWnd();

  if (!wnd) {
    LOG_DPRINTLN("XPCNativeWidgetWin> FATAL ERROR, Cannot create window!!");
    return NS_ERROR_INVALID_POINTER;
  }

  m_hWnd = wnd;

  // associate window with our nsPluginInstance object so we can access
  // it in the window procedure
#ifdef _WIN64
  SetWindowLongPtr(m_hWnd, GWLP_USERDATA, (LONG_PTR)this);
#else
  SetWindowLong(m_hWnd, GWL_USERDATA, (LONG)this);
#endif

  // ::ShowWindow( m_hWnd, SW_SHOW );
  // ::UpdateWindow( m_hWnd );

  return NS_OK;
}

nsresult XPCNativeWidgetWin::attachImpl()
{
  if (!m_hWnd) {
    MB_DPRINT("XPCNativeWidgetWin::attachImpl mView is not initialized!!\n");
    return NS_ERROR_FAILURE;
  }

  // get the device context (DC)
  m_hDC = ::GetDC( m_hWnd );
  if (!m_hDC) {
    MB_DPRINT("XPCNativeWidgetWin::attachImpl cannot create device context!!\n");
    return NS_ERROR_FAILURE;
  }
  
  qsys::View *ptmp = getQmView().get();
  NS_ENSURE_TRUE(ptmp, NS_ERROR_FAILURE);
  
  MB_DPRINT("Win bind: view %p type=%s\n", ptmp, typeid(*ptmp).name());

  sysdep::WglView *pWglView = dynamic_cast<sysdep::WglView *>(ptmp);
  if (pWglView==NULL) {
    m_pWglView = NULL;
    LOG_DPRINTLN("WIN32 bind failed: invalid view type %p !!", ptmp);
    return NS_ERROR_FAILURE;
  }
  
  pWglView->setUseGlShader(m_bUseGlShader);
  pWglView->setSclFac(m_sclX, m_sclY);

  // set cached view ptr
  m_pWglView = pWglView;

  bool res = pWglView->attach(m_hWnd, m_hDC);
  MB_DPRINTLN("Win bind: %s", res?"OK":"NG");
  if (!res) {
    m_pWglView = NULL;
    return NS_ERROR_FAILURE;
  }

  m_pWglView->sizeChanged(getWidth(), getHeight());

  MB_DPRINT("XPCNativeWidgetWin::attachImpl OK\n");
  return NS_OK;
}

//void XPCNativeWidgetWin::unloadImpl()
NS_IMETHODIMP XPCNativeWidgetWin::Unload()
{
  XPCNativeWidget::Unload();

  if (m_hWnd) {
    ::ShowWindow( m_hWnd, SW_HIDE );
    ::SetParent( m_hWnd, NULL );
    ::DestroyWindow(m_hWnd);
    m_hWnd = NULL;
  }

  m_hParWnd = NULL;
  return NS_OK;
}

#define SCALEX(argX) ((int) ((argX) * m_sclX))
#define SCALEY(argY) ((int) ((argY) * m_sclY))
#define UNSCALEX(argX) ((int) ((argX) / m_sclX))
#define UNSCALEY(argY) ((int) ((argY) / m_sclY))

NS_IMETHODIMP XPCNativeWidgetWin::Resize(PRInt32 ax, PRInt32 ay, PRInt32 aw, PRInt32 ah)
{
  NS_ENSURE_TRUE(m_hWnd, NS_ERROR_FAILURE);

  int x = SCALEX(ax);
  int y = SCALEY(ay);
  int w = SCALEX(aw);
  int h = SCALEY(ah);

  setSize(aw, ah);

  BOOL res = ::SetWindowPos(m_hWnd, HWND_TOP, x, y, w, h, 0);
  RECT rc;
  rc.left = 0;
  rc.right = w;
  rc.top = 0;
  rc.bottom = h;
  ::InvalidateRect(m_hWnd, &rc, FALSE);

  m_pWglView->sizeChanged(aw, ah);

  mPosX = ax;
  mPosY = ay;

  return NS_OK;
}

/* void show (); */
NS_IMETHODIMP XPCNativeWidgetWin::Show()
{
  NS_ENSURE_TRUE(m_hWnd, NS_ERROR_FAILURE);
  //::ShowWindow( m_hWnd, SW_SHOW );
  BOOL res = ::SetWindowPos(m_hWnd, HWND_TOP, 0, 0, 0, 0,
                            SWP_SHOWWINDOW|SWP_NOMOVE|SWP_NOSIZE);
  //printf("XPCNativeWindowWin32::Show() called\n");
  return NS_OK;
}

/* void hide (); */
NS_IMETHODIMP XPCNativeWidgetWin::Hide()
{
  if (m_hWnd==NULL) return NS_OK;
  //::ShowWindow( m_hWnd, SW_HIDE );
  BOOL res = ::SetWindowPos(m_hWnd, HWND_BOTTOM, 0, 0, 0, 0,
                            SWP_HIDEWINDOW|SWP_NOMOVE|SWP_NOSIZE);
  //printf("XPCNativeWindowWin32::Show() called\n");
  return NS_OK;
}

HWND XPCNativeWidgetWin::selectParentWindow(HWND hWnd)
{
  // Select Parent Window attempts to select the best parent for the video
  // window so that all events get propagated through the various WindowProcs
  // as expected.

  HWND retWnd = NULL;
  HWND firstChildWnd = ::GetWindow(hWnd, GW_CHILD);

  if(firstChildWnd != NULL) {
    retWnd = ::GetWindow(firstChildWnd, GW_HWNDLAST);
  }

  if(!retWnd) {
    retWnd = hWnd;
  }

  return retWnd;
}

LRESULT
XPCNativeWidgetWin::handleEvent(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
  switch (msg) {
  case WM_PAINT: {
    // redraw the OpenGL window
    PAINTSTRUCT ps;
    HDC hdc = BeginPaint(hWnd, &ps);
    m_pWglView->forceRedraw();
    EndPaint(hWnd, &ps);
    return 0;
    //break;
  }

    // WM_SIZE will be handled in DOM event listener
  /*case WM_SIZE: {
    int cx = LOWORD(lParam);
    int cy = HIWORD(lParam);
    sizeChanged(cx, cy);
    return 0;
    //break;
  }*/

  case WM_LBUTTONDOWN: 
  case WM_MBUTTONDOWN: 
  case WM_RBUTTONDOWN: {
    {
      // Generate DOM mousemove event
      // by resending msg to the parent iframe window.
      POINTS pt = MAKEPOINTS(lParam);
      pt.x += SCALEX(mPosX);
      pt.y += SCALEY(mPosY);
      ::SendMessage(m_hParWnd, msg, wParam, MAKELPARAM(pt.x, pt.y));
    }

    //MB_DPRINTLN("****** WM_MOUSE LR DOWN");
    qsys::InDevEvent ev;
    setupWinMouseEvent(msg, wParam, lParam, ev);
    dispatchMouseEvent(DME_MOUSE_DOWN, ev);
    ::SetCapture(hWnd);

    return 0;
    //break;
  }

  case WM_MOUSEMOVE: {

    /*if (!m_bCursorIn) {
      //MB_DPRINTLN("****** Mouse Enter ??? ");
      TRACKMOUSEEVENT tme;
      tme.cbSize = sizeof tme;
      tme.dwFlags = TME_LEAVE;
      tme.hwndTrack = m_hWnd;
      ::TrackMouseEvent(&tme);
      m_bCursorIn = true;

      resetCursor();

      // // TO DO: impl
      //InDevEvent ev;
      //ev.setType(InDevEvent::INDEV_MOUSE_ENTER);
      //ev.setModifier(0);
      //ev.setSource(this);
      //fireInDevEvent(ev);
    }*/

    //MB_DPRINTLN("****** WM_MOUSE MOVE %p", lParam);
    if ((wParam & MK_LBUTTON) ||
        (wParam & MK_MBUTTON) ||
        (wParam & MK_RBUTTON)) {
      // mouse button is pressed --> fire indev event
      //MB_DPRINTLN("****** WM_MOUSE MOVE %p", lParam);
      qsys::InDevEvent ev;
      setupWinMouseEvent(msg, wParam, lParam, ev);
      dispatchMouseEvent(DME_MOUSE_MOVE, ev);
    }

    {
      // Generate DOM mousemove event
      // by resending msg to the parent iframe window.
      POINTS pt = MAKEPOINTS(lParam);
      pt.x += mPosX;
      pt.y += mPosY;
      ::SendMessage(m_hParWnd, msg, wParam, MAKELPARAM(pt.x, pt.y));
    }
    return 0;
  }

/*  case WM_MOUSELEAVE: {
    //MB_DPRINTLN("****** WM_MOUSE LEAVE");
    m_bCursorIn = false;
    TRACKMOUSEEVENT tme;
    tme.cbSize = sizeof tme;
    tme.dwFlags = TME_CANCEL|TME_LEAVE;
    tme.hwndTrack = m_hWnd;
    ::TrackMouseEvent(&tme);

    // // TO DO: impl
    //n InDevEvent ev;
    // ev.setType(InDevEvent::INDEV_MOUSE_ENTER);
    // ev.setModifier(1); // leave flag
    //ev.setSource(this);
    //fireInDevEvent(ev);
    //break;
  }
*/

  case WM_LBUTTONUP:
  case WM_MBUTTONUP:
  case WM_RBUTTONUP: {
    ::ReleaseCapture();

    //MB_DPRINTLN("****** WM_MOUSE LR UP");
    UINT nFlags = wParam;

    nFlags &= ~(MK_LBUTTON|MK_RBUTTON|MK_MBUTTON);
    if (msg==WM_LBUTTONUP)
      nFlags |= MK_LBUTTON;
    else
      nFlags |= MK_RBUTTON;

    qsys::InDevEvent ev;
    setupWinMouseEvent(msg, nFlags, lParam, ev);
    dispatchMouseEvent(DME_MOUSE_UP, ev);

    {
      // Generate DOM mousemove event
      // by resending msg to the parent iframe window.
      POINTS pt = MAKEPOINTS(lParam);
      pt.x += mPosX;
      pt.y += mPosY;
      ::SendMessage(m_hParWnd, msg, wParam, MAKELPARAM(pt.x, pt.y));
    }
    break;
  }


    
  case WM_LBUTTONDBLCLK: {
    MB_DPRINTLN("Win32 LBTN_DBLCLK");
    break;
    /*
    POINTS point = MAKEPOINTS(lParam);
    UINT nFlags = wParam;
    // windows doesn't set this flag !!
    nFlags |= MK_LBUTTON;

    InDevEvent ev;
    setupWinMouseEvent(nFlags, point, ev);

    ev.setType(InDevEvent::INDEV_LBTN_DBLCLICK);
    fireInDevEvent(ev);
    return 0;
    //break;
     */
  }

  case WM_RBUTTONDBLCLK: {
    MB_DPRINTLN("Win32 RBTN_DBLCLK");
    break;
    /*
    POINTS point = MAKEPOINTS(lParam);
    UINT nFlags = wParam;
    // windows doesn't set this flag !!
    nFlags |= MK_RBUTTON;

    InDevEvent ev;
    setupWinMouseEvent(nFlags, point, ev);

    ev.setType(InDevEvent::INDEV_RBTN_DBLCLICK);
    fireInDevEvent(ev);
    return 0;
    //break;
     */
  }

  case WM_MOUSEWHEEL: {
    short zDelta = GET_WHEEL_DELTA_WPARAM(wParam);
    UINT nFlags = GET_KEYSTATE_WPARAM(wParam);
    
    wParam = 0;

    qsys::InDevEvent ev;
    setupWinMouseEvent(msg, nFlags, lParam, ev);

    ev.setType(qsys::InDevEvent::INDEV_WHEEL);
    ev.setDeltaX((int) zDelta);
    dispatchMouseEvent(DME_WHEEL, ev);

    return 0;
  }


  case WM_DESTROY: {
    break;
  }

  case WM_ERASEBKGND: {
    return 1;
  }

  case WM_SHOWWINDOW: {
    break;
  }

  default:
    break;
  }

  return ::DefWindowProc(hWnd, msg, wParam, lParam);
}

/// setup os dependent mouse event parameters
// lParam should be point
// wParam should be modifier flags
void XPCNativeWidgetWin::setupWinMouseEvent(UINT msg, WPARAM wParam, LPARAM lParam, qsys::InDevEvent &ev)
{
  // setup locations
  POINTS pt = MAKEPOINTS(lParam);

  ev.setX(UNSCALEX(pt.x));
  ev.setY(UNSCALEY(pt.y));

  POINT ptroot = {pt.x, pt.y};
  ::ClientToScreen(m_hWnd, &ptroot);

  ev.setRootX(UNSCALEX(ptroot.x));
  ev.setRootY(UNSCALEY(ptroot.y));

  // set modifier
  int modif = 0;
  UINT nFlags = wParam;

  if (nFlags & MK_CONTROL)
    modif |= qsys::InDevEvent::INDEV_CTRL;
  if (nFlags & MK_SHIFT)
    modif |= qsys::InDevEvent::INDEV_SHIFT;
  if (nFlags & MK_LBUTTON)
    modif |= qsys::InDevEvent::INDEV_LBTN;
  if (nFlags & MK_MBUTTON)
    modif |= qsys::InDevEvent::INDEV_MBTN;
  if (nFlags & MK_RBUTTON)
    modif |= qsys::InDevEvent::INDEV_RBTN;

  // ev.setSource(this);
  ev.setModifier(modif);

  return;
}

/* boolean reload (); */
NS_IMETHODIMP XPCNativeWidgetWin::Reload(bool *_retval )
{
  HWND hOldWnd = m_hWnd;
  //HDC hOldDC = m_hDC;

  // Create new window
  m_hWnd = createNativeChildWnd();
  if (!m_hWnd) {
    *_retval = PR_FALSE;
    return NS_ERROR_FAILURE;
  }
#ifdef _WIN64
  SetWindowLongPtr(m_hWnd, GWLP_USERDATA, (LONG_PTR)this);
#else
  SetWindowLong(m_hWnd, GWL_USERDATA, (LONG)this);
#endif

  m_hDC = ::GetDC(m_hWnd);

  bool res = m_pWglView->attach(m_hWnd, m_hDC);
  if (!res) {
    *_retval = PR_FALSE;
    return NS_ERROR_FAILURE;
  }

  // Destroy old window
  ::ShowWindow( hOldWnd, SW_HIDE );
  ::SetParent( hOldWnd, NULL );
  ::DestroyWindow(hOldWnd);

  // Show the new window
  ::SetWindowPos(m_hWnd, HWND_TOP, mPosX, mPosY, getWidth(), getHeight(), 0);
  ::ShowWindow( m_hWnd, SW_SHOW );
  ::UpdateWindow( m_hWnd );

  *_retval = PR_TRUE;
  return NS_OK;
}

