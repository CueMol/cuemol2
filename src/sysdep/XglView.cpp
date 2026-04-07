// -*-Mode: C++;-*-
//
//  XGL dependent molecular viewer implementation
//
//  $Id: XglView.cpp,v 1.15 2009/08/22 11:10:46 rishitani Exp $

#include <common.h>

#include <GL/gl.h>
#include <GL/glu.h>
#include <qlib/Utils.hpp>

#include "XglView.hpp"
#include "XglDisplayContext.hpp"

// #include "UpdateEvent.hpp"

// #define HITBUF_SIZE (64*1024)

using qsys::InDevEvent;
using namespace sysdep;

XglView::XglView()
  : m_bInitOK(false), m_pDisplay(NULL), m_xwin(0), m_pCtxt(NULL)
{
}

XglView::~XglView()
{
  MB_DPRINTLN("XglView (ctxt=%p) destructing.", m_pCtxt);
  // delete [] m_pHitBuf;
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
}

LString XglView::toString() const
{
  return LString::format("XGL/OpenGL View(%p)", this);
}

void XglView::unloading()
{
    super_t::unloading();

  if (m_pCtxt!=NULL)
    delete m_pCtxt;
  m_pCtxt = NULL;
}

bool XglView::setup(Display *pDsp, Window xwin)
{
  if (m_pCtxt!=NULL) {
    LOG_DPRINTLN("ERROR!! XglView::setup(%p,%p): already initialized with (%p,%p)",
		 pDsp, xwin, m_pDisplay, m_xwin);
    return false;
  }

  //XglDisplayContext *pCtxt = MB_NEW XglDisplayContext(getSceneID(), this);
  XglDisplayContext *pCtxt = MB_NEW XglDisplayContext();
  pCtxt->setTargetView(this);
  if (!pCtxt->setup(pDsp, xwin, getSiblingCtxt())) {
    delete pCtxt;
    return false;
  }

  // OK
  m_pDisplay = pDsp;
  m_xwin = xwin;
  m_pCtxt = pCtxt;

  OglView::setup();

  m_bInitOK = true;
  LOG_DPRINTLN("XglView::setup() OK.");

  return true;
}

void XglView::swapBuffers()
{
  if (m_pDisplay==NULL || m_xwin==0)
    return;
  glXSwapBuffers(m_pDisplay, m_xwin);
}

DisplayContext *XglView::getDisplayContext()
{
  return m_pCtxt;
}

#define zDelta 40

/** helper function for mouse event generation */
void XglView::setUpMouseEvent(unsigned int mask,
			      int x, int y, int rtx, int rty,
			      InDevEvent &ev)
{
  int modif = 0;

  MB_DPRINTLN("setupMouseEv: mask=%X", mask);

  if (mask & ControlMask)
    modif |= InDevEvent::INDEV_CTRL;
  if (mask & ShiftMask)
    modif |= InDevEvent::INDEV_SHIFT;
  if (mask & Button1Mask)
    modif |= InDevEvent::INDEV_LBTN;
  if (mask & Button2Mask)
    modif |= InDevEvent::INDEV_MBTN;
  if (mask & Button3Mask)
    modif |= InDevEvent::INDEV_RBTN;

  ev.setSource(this);
  ev.setModifier(modif);
  ev.setX(x);
  ev.setY(y);

  ev.setRootX(rtx);
  ev.setRootY(rty);

}


void XglView::handleEvent(XEvent *xevent, Boolean *b)
{
  switch (xevent->type) {

  case ConfigureNotify: {
    while (XCheckTypedWindowEvent(m_pDisplay, m_xwin, ConfigureNotify, xevent)) {
      //MB_DPRINTLN("Duplicated configure notify event ignored!!");
    }

    MB_DPRINTLN(">>>XEvent: configure (%d,%d)",
		xevent->xconfigure.width, xevent->xconfigure.height);
    sizeChanged(xevent->xconfigure.width, xevent->xconfigure.height);
    break;
  }

  case Expose: {
    /// get rid of all other exposure events
    while (XCheckTypedWindowEvent(m_pDisplay, m_xwin, Expose, xevent)) {
      //MB_DPRINTLN("Duplicated exposure event ignored!!");
    }

    //privatePrintScreenMessage(This);
    //MB_DPRINTLN("XEvent: exposure");

    forceRedraw();
//     UpdateEvent ev;
//     ev.setSource(this);
//     ev.setType(UpdateEvent::UPDATE_UPDATE);
//     // ev.setType(UpdateEvent::UPDATE_INVALIDATE);
//     fireUpdateEvent(ev);
    
    break;
  }

  case ButtonPress: {
    MB_DPRINTLN("XEvent: btn press");

    InDevEvent ev;
    // state before press does not include the pressed button, add it manually
    unsigned int mask = xevent->xbutton.state;
    switch (xevent->xbutton.button) {
    case 1: mask |= Button1Mask; break;
    case 2: mask |= Button2Mask; break;
    case 3: mask |= Button3Mask; break;
    }
    setUpMouseEvent(mask, xevent->xbutton.x, xevent->xbutton.y,
                    xevent->xbutton.x_root, xevent->xbutton.y_root, ev);
    dispatchMouseEvent(DME_MOUSE_DOWN, ev);
    break;
  }

  case ButtonRelease: {
    MB_DPRINTLN("XEvent: btn rlse");

    InDevEvent ev;
    setUpMouseEvent(xevent->xbutton.state,
                    xevent->xbutton.x, xevent->xbutton.y,
                    xevent->xbutton.x_root, xevent->xbutton.y_root, ev);

    // check wheel (usually mapped to btn4&5)
    if (xevent->xbutton.button == 4) {
      MB_DPRINTLN("XEvent: wheel forw");
      ev.setType(qsys::InDevEvent::INDEV_WHEEL);
      ev.setDeltaX(zDelta);
      dispatchMouseEvent(DME_WHEEL, ev);
      return;
    }
    else if (xevent->xbutton.button == 5) {
      MB_DPRINTLN("XEvent: wheel backw");
      ev.setType(qsys::InDevEvent::INDEV_WHEEL);
      ev.setDeltaX(-zDelta);
      dispatchMouseEvent(DME_WHEEL, ev);
      return;
    }

    dispatchMouseEvent(DME_MOUSE_UP, ev);
    break;
  }

  case MotionNotify: {
    unsigned int mask = xevent->xmotion.state;

    if (!(mask & Button1Mask) &&
        !(mask & Button2Mask) &&
        !(mask & Button3Mask))
      break;

    Window root, child;
    int rx, ry, wx, wy;
    XQueryPointer(m_pDisplay, m_xwin, &root, &child, &rx, &ry, &wx, &wy, &mask);

    InDevEvent ev;
    setUpMouseEvent(mask, wx, wy, rx, ry, ev);
    dispatchMouseEvent(DME_MOUSE_MOVE, ev);
    break;
  }

  case EnterNotify: {
    MB_DPRINTLN("****** Mouse Enter ");
    InDevEvent ev;
    ev.setType(InDevEvent::INDEV_MOUSE_ENTER);
    ev.setModifier(0);
    ev.setSource(this);
    fireInDevEvent(ev);
    break;
  }
  case LeaveNotify: {
    MB_DPRINTLN("****** Mouse Leave ");
    InDevEvent ev;
    ev.setType(InDevEvent::INDEV_MOUSE_ENTER);
    ev.setModifier(1); // leave flag
    ev.setSource(this);
    fireInDevEvent(ev);
    break;
  }
  default:
    break;
  }
}

////////////////////////////////////////////

// namespace qsys {
//   //static
//   SYSDEP_API qsys::View *View::createView()
//   {
//     qsys::View *pret = MB_NEW XglView();
//     MB_DPRINTLN("XglView created (%p, ID=%d)", pret, pret->getUID());
//     return pret;
//   }
// }
