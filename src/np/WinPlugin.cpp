//
// CueMol2 plugin class with Win32 implementation
//
// $Id: WinPlugin.cpp,v 1.11 2009/08/01 16:30:53 rishitani Exp $

#include <common.h>

#include <windowsx.h>
#include <gl/gl.h>
#include <gl/glu.h>

#include "npcommon.h"
#include <qsys/sysdep/WglView.hpp>
#include <qsys/sysdep/WglDisplayContext.hpp>
#include "WinPlugin.hpp"

#include <qsys/SceneManager.hpp>

using namespace np;
using gfx::DisplayContext;
using sysdep::WglDisplayContext;

WinPlugin::WinPlugin(NPP pNPInstance)
     : Plugin(pNPInstance), m_hWnd(NULL)
{
  m_pCachedView=NULL;
}

WinPlugin::~WinPlugin()
{
}

bool WinPlugin::setupOpenGL()
{
  PIXELFORMATDESCRIPTOR pfd;
  int format;
  
  // get the device context (DC)
  m_hDC = GetDC( m_hWnd );
  
  // set the pixel format for the DC
  ZeroMemory( &pfd, sizeof( pfd ) );
  pfd.nSize = sizeof( pfd );
  pfd.nVersion = 1;
  pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
  pfd.iPixelType = PFD_TYPE_RGBA;
  pfd.cColorBits = 24;
  pfd.cDepthBits = 16;
  pfd.iLayerType = PFD_MAIN_PLANE;
  format = ChoosePixelFormat( m_hDC, &pfd );
  SetPixelFormat( m_hDC, format, &pfd );
  
  // create and enable the render context (RC)
  m_hGL = wglCreateContext( m_hDC );
  // wglMakeCurrent( *hDC, *hRC );

  return true;
}

/**
  Setup OpenGL (stage 2)
 */
bool WinPlugin::setupOpenGL2()
{
  if (m_pCachedView==NULL)
    return false;
  DisplayContext *pShare = m_pCachedView->getSiblingCtxt();
  WglDisplayContext *pwshcx = dynamic_cast<WglDisplayContext *>(pShare);
  if (pwshcx==NULL) return true;
  HGLRC shcx = pwshcx->getHGLRC();
  ::wglShareLists(shcx, m_hGL);
  return true;
}

void WinPlugin::cleanupOpenGL()
{
  wglMakeCurrent( NULL, NULL );
  wglDeleteContext( m_hGL );
  ReleaseDC( m_hWnd, m_hDC );
}

bool WinPlugin::init(NPWindow* pNPWindow)
{
  if (isInitialized())
    return true;
  
  if (pNPWindow==NULL)
    return false;

  m_hWnd = (HWND) pNPWindow->window;
  if (m_hWnd==NULL)
    return false;

  if (!setupOpenGL()) {
    LOG_DPRINTLN("NPWin> setupOpenGL() failed!!");
    return false;
  }

  if (m_pCachedView==NULL) {
    bindImpl();
  }

  // associate window with our nsPluginInstance object so we can access 
  // it in the window procedure
  SetWindowLong(m_hWnd, GWL_USERDATA, (LONG)this);

  // subclass window so we can intercept window messages and
  // do our drawing to it
  // SubclassWindow is a macro defined in windowsx.h
  m_lpOldProc = SubclassWindow(m_hWnd, (WNDPROC)PluginWinProc);

  // m_Initialized = TRUE;
  if (!Plugin::init(pNPWindow))
    return false;
  
  return true;
}

void WinPlugin::fini()
{
  Plugin::fini();

  cleanupOpenGL();

  // subclass it back
  SubclassWindow(m_hWnd, m_lpOldProc);
  m_hWnd = NULL;
  // mInitialized = FALSE;
}

bool WinPlugin::bind(int nSceneID, int nViewID)
{
  if (!Plugin::bindCommon(nSceneID, nViewID))
    return false;

  if (!isInitialized()) {
    // bind later
    MB_DPRINTLN("WinPlugin> bind(): binding deferred.");
    return true;
  }

  return bindImpl();
}

bool WinPlugin::bindImpl()
{
  qsys::View *ptmp = Plugin::getViewPtr().get();
  if (ptmp==NULL) return false;
  
  MB_DPRINTLN("Win bind: view %p type=%s", ptmp, typeid(*ptmp).name());
  sysdep::WglView *pWglView = dynamic_cast<sysdep::WglView *>(ptmp);
  if (pWglView==NULL) {
    MB_DPRINTLN("NPWin> Invalid view %p, bind failed !!", ptmp);
    return false;
  }

  bool res = pWglView->attach(m_hWnd, m_hDC, m_hGL);
  MB_DPRINTLN("Win bind: %s", res?"OK":"NG");
  if (!res) {
    m_pCachedView = NULL;
    return false;
  }

  m_pCachedView=pWglView;

  if (!setupOpenGL2()) {
    LOG_DPRINTLN("NPWin> setupOpenGL2() failed!!");
    return false;
  }

  return true;
}

/////////////////////////////

LRESULT WinPlugin::handleEvent(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
  if (m_pCachedView) {

    LRESULT res = m_pCachedView->handleEvent(hWnd, msg, wParam, lParam);
    if (res!=0) return ::DefWindowProc(hWnd, msg, wParam, lParam);
    return res;

#if 0
    switch (msg) {
    case WM_DESTROY:
    case WM_SHOWWINDOW:
    case WM_NCHITTEST:
    case WM_SETCURSOR:
      return ::DefWindowProc(hWnd, msg, wParam, lParam);

    case WM_ERASEBKGND:
      return 1;
    }

    LRESULT res = m_pCachedView->handleEvent(hWnd, msg, wParam, lParam);

    if (res!=0) {
      switch (msg) {
      case WM_SYSCHAR:
      case WM_CHAR:
      case WM_SYSKEYUP:
      case WM_KEYUP:
      case WM_SYSKEYDOWN:
      case WM_KEYDOWN:
        MB_DPRINTLN("MSG WHND %X MSG %X W %X L %X", hWnd, msg, wParam, lParam);

      case WM_COMMAND:
      case WM_SYSCOLORCHANGE:
      case WM_NOTIFY:
      //case WM_XP_THEMECHANGED:
      case WM_FONTCHANGE:
      case WM_MOVE:
      case WM_CLOSE:
      case WM_DESTROY:

      case WM_GETDLGCODE:
      case WM_CONTEXTMENU:
      case WM_APPCOMMAND:
      case WM_CTLCOLORLISTBOX:
      case WM_CTLCOLOREDIT:
      case WM_CTLCOLORBTN:
        //case WM_CTLCOLORSCROLLBAR: //XXX causes the scrollbar to be drawn incorrectly
      case WM_CTLCOLORSTATIC:
      case WM_ACTIVATE:
      case WM_MOUSEACTIVATE:
      case WM_SETFOCUS:
      case WM_KILLFOCUS:
      case WM_WINDOWPOSCHANGED:
      case WM_SETTINGCHANGE:
      case WM_PALETTECHANGED:
      case WM_QUERYNEWPALETTE:      // this window is about to become active
      case WM_INPUTLANGCHANGEREQUEST:
      case WM_INPUTLANGCHANGE:
      case WM_IME_STARTCOMPOSITION:
      case WM_IME_COMPOSITION:
      case WM_IME_ENDCOMPOSITION:
      case WM_IME_CHAR:
      case WM_IME_NOTIFY:
      case WM_IME_REQUEST:
      case WM_IME_SELECT:
      case WM_IME_SETCONTEXT:
      case WM_DROPFILES:
      case WM_DESTROYCLIPBOARD:
        HWND hParWnd = ::GetParent(hWnd);
        
        LONG proc = ::GetWindowLongW(hParWnd, GWL_WNDPROC);
        ::CallWindowProc((WNDPROC)proc, hParWnd, msg, wParam, lParam);
        
        //::SendMessageW(hParWnd, msg, wParam, lParam);
        
        return 0;
      }
      //::PostMessage(::GetParent(hWnd), msg, wParam, lParam);
      //return 0;
      //::CallWindowProc(m_lpOldProc,hWnd, msg, wParam, lParam);
      //(*m_lpOldProc)(hWnd, msg, wParam, lParam);
    }

    //if (msg==WM_NCHITTEST) {
    //return ::DefWindowProc(hWnd, msg, wParam, lParam);
    //}
    //if (res==0) return res;
    //if (res==-1) return ::DefWindowProc(hWnd, msg, wParam, lParam);

    return res;
#endif
  }
  else  {

    if (msg==WM_PAINT)
      {
        // draw a frame and display the string
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hWnd, &ps);
        RECT rc;
        GetClientRect(hWnd, &rc);
        FillRect(hdc, &rc, GetStockBrush(BLACK_BRUSH));
        FrameRect(hdc, &rc, GetStockBrush(WHITE_BRUSH));

        char string[] = "CueMol2-plugin: Error occured";
        DrawTextA(hdc, string, strlen(string), &rc, DT_SINGLELINE | DT_CENTER | DT_VCENTER);
        EndPaint(hWnd, &ps);
      }

    return DefWindowProc(hWnd, msg, wParam, lParam);
  }
}

//static
LRESULT CALLBACK WinPlugin::PluginWinProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
  // get our plugin instance object and ask it for the version string
  LONG ldata = GetWindowLong(hWnd, GWL_USERDATA);
  WinPlugin *ppn = reinterpret_cast<WinPlugin *>(ldata);

  if (ppn) {
    return ppn->handleEvent(hWnd, msg, wParam, lParam);
  }
  else {
    // fatal error !!!
  }

  return DefWindowProc(hWnd, msg, wParam, lParam);
}


Plugin *np::createPluginObj(NPP npp)
{
  return new WinPlugin(npp);
}

