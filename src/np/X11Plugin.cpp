//
// CueMol2 plugin class with X11 implementation
//
// $Id: X11Plugin.cpp,v 1.18 2009/08/13 08:46:06 rishitani Exp $

#include <common.h>
#include "npcommon.h"
#include <GL/gl.h>
#include <GL/glu.h>
#include <qsys/sysdep/XglView.hpp>
#include "X11Plugin.hpp"

#include <qsys/SceneManager.hpp>

using namespace np;

X11Plugin::X11Plugin(NPP pNPInstance) :
  Plugin(pNPInstance),
  m_pDisplay(NULL), m_xwin(0), m_xtwgt(NULL)
{
  m_pCachedView=NULL;
}

X11Plugin::~X11Plugin()
{
}

bool X11Plugin::setupOpenGL()
{
  return true;
}

bool X11Plugin::init(NPWindow* pNPWindow)
{
  NPSetWindowCallbackStruct *ws_info =
    (NPSetWindowCallbackStruct *)pNPWindow->ws_info;

  m_pDisplay = (Display*) ws_info->display;
  m_xwin = (Window) pNPWindow->window;
  m_xtwgt = XtWindowToWidget(m_pDisplay, m_xwin);
  if (!m_xtwgt) {
    LOG_DPRINTLN("NP> Fatal error: cannot get XtWindow");
    return false;
  }

  /*
  // Setup GLX
  if (!setupOpenGL())
    return false;
  */

  if (m_pCachedView==NULL) {
    bindImpl();
  }

  //long event_mask = ExposureMask | ButtonReleaseMask | ButtonPressMask;
  long event_mask =
    KeyPressMask |
      KeyReleaseMask |
      ButtonPressMask |
      ButtonReleaseMask |
      EnterWindowMask |
      LeaveWindowMask |
      //PointerMotionHintMask |
      ButtonMotionMask |
      KeymapStateMask |
      ExposureMask |
      VisibilityChangeMask |
      StructureNotifyMask |
      FocusChangeMask |
      PropertyChangeMask |
      ColormapChangeMask |
      OwnerGrabButtonMask
      ;

    //Button1MotionMask |
    //Button2MotionMask |
    //Button3MotionMask |
    //Button4MotionMask |
    //Button5MotionMask |
    //PointerMotionMask |
    // ResizeRedirectMask |
    //SubstructureNotifyMask |
    //SubstructureRedirectMask |



    XSelectInput(m_pDisplay, m_xwin, event_mask);
    XtAddEventHandler(m_xtwgt, event_mask, False,
		      (XtEventHandler)xt_event_handler,
		      this);
    
  return Plugin::init(pNPWindow);
}

void X11Plugin::fini()
{
}

void X11Plugin::windowResized(NPWindow* pNPWindow)
{
  // m_pWindow = pNPWindow;
  if (m_pCachedView!=NULL) {
    // setupAglViewport();
    m_pCachedView->sizeChanged(pNPWindow->width, pNPWindow->height);
  }
}

void X11Plugin::handleEvent(XEvent *xevent, Boolean *b)
{
  // MB_DPRINTLN("Plugin X11 event %d", xevent->type);

  if (m_pCachedView)
    m_pCachedView->handleEvent(xevent, b);

  /*
  switch (xevent->type) {
  case Expose:

    //while(XCheckTypedWindowEvent(This->display, This->window, Expose, xevent))
    //privatePrintScreenMessage(This);
    printf("xt event: exposure\n");
    break;
  case ButtonRelease:
    printf("xt event: btn rlse\n");
    break;
  default:
    break;
  }
*/
}

bool X11Plugin::bind(int nSceneID, int nViewID)
{
  if (!Plugin::bindCommon(nSceneID, nViewID))
    return false;

  if (!isInitialized()) {
    // bind later
    return true;
  }

  return bindImpl();
}

bool X11Plugin::bindImpl()
{
  qsys::View *ptmp = Plugin::getViewPtr().get();
  if (ptmp==NULL) return false;
  
  MB_DPRINTLN("X11 bind: view %p type=%s", ptmp, typeid(*ptmp).name());
  sysdep::XglView *pXglView = dynamic_cast<sysdep::XglView *>(ptmp);
  if (pXglView==NULL) {
    MB_DPRINTLN("X11 bind: invalid view %p !!", ptmp);
    return false;
  }

  bool res = pXglView->setup(m_pDisplay, m_xwin);
  MB_DPRINTLN("X11 bind: %s", res?"OK":"NG");
  if (!res) {
    m_pCachedView=NULL;
    return false;
  }

  m_pCachedView=pXglView;
  return true;
}

/////////////////////////////

//static
void X11Plugin::xt_event_handler(Widget xt_w, void *ptr, XEvent *xevent, Boolean *b)
{
  X11Plugin *ppn = static_cast<X11Plugin *>(ptr);
  ppn->handleEvent(xevent, b);
}

Plugin *np::createPluginObj(NPP npp)
{
  return new X11Plugin(npp);
}
