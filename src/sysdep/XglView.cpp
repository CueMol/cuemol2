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
{
  // m_pHitBuf = MB_NEW GLuint[HITBUF_SIZE];
  m_bInitOK = false;

  m_pDisplay = NULL;
  m_xwin = 0;
  // m_cx = 0;
  m_pCtxt = NULL;
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

    m_startPt_x = m_prevPt_x = xevent->xbutton.x;
    m_startPt_y = m_prevPt_y = xevent->xbutton.y;
    m_fDragStart = false;

    break;
  }

  case ButtonRelease: {
    MB_DPRINTLN("XEvent: btn rlse");

    InDevEvent ev;

    setUpMouseEvent(xevent->xbutton.state,
		    xevent->xbutton.x, xevent->xbutton.y,
		    xevent->xbutton.x_root, xevent->xbutton.y_root,
		    ev);

    // check wheel (usually mapped to btn4&5)
    if (xevent->xbutton.state & Button4Mask) {
      MB_DPRINTLN("XEvent: wheel forw");
      ev.setType(qsys::InDevEvent::INDEV_WHEEL);
      ev.setDeltaX(zDelta);
      fireInDevEvent(ev);
      return;
    }
    else if (xevent->xbutton.state & Button5Mask) {
      MB_DPRINTLN("XEvent: wheel backw");
      ev.setType(qsys::InDevEvent::INDEV_WHEEL);
      ev.setDeltaX(-zDelta);
      fireInDevEvent(ev);
      return;
    }


    if (m_fDragStart) {
      // mouse drag is initiated
      // case of the end of drag
      ev.setType(InDevEvent::INDEV_DRAG_END);
      fireInDevEvent(ev);
      m_fDragStart = false;
      break;
    }

    // click event case
    ev.setType(InDevEvent::INDEV_LBTN_CLICK);
    fireInDevEvent(ev);
    m_fDragStart = false;
    break;
  }

  case MotionNotify: {
    unsigned int mask = xevent->xmotion.state;

    if (!(mask & Button1Mask) &&
	!(mask & Button2Mask) &&
	!(mask & Button3Mask))
      break;

    Window root,child;
    int rx, ry, wx, wy;
    //MB_DPRINTLN("XEvent: motion");
    XQueryPointer(m_pDisplay, m_xwin, &root, &child, &rx, &ry, &wx, &wy, &mask);

    InDevEvent ev;

    // check drag start
    // TO DO : make the "Drag Start Range" configureable
    if (!m_fDragStart) {
      if (qlib::abs<int>(wx-m_prevPt_x)<2 &&
	  qlib::abs<int>(wy-m_prevPt_y)<2 )
	break;
      m_fDragStart = true;
      
    //ev.setType(InDevEvent::INDEV_DRAG_START);
    //setUpMouseEvent(mask, m_prevPt, ev);
    //fireInDevEvent(ev);

      ev.setType(InDevEvent::INDEV_DRAG_START);
      setUpMouseEvent(mask, wx, wy, rx, ry, ev);
      fireInDevEvent(ev);
      
      m_prevPt_x = wx;
      m_prevPt_y = wy;
      break;
    }
    
    ev.setType(InDevEvent::INDEV_DRAG_MOVE);
    setUpMouseEvent(mask, wx, wy, rx, ry, ev);
    ev.setDeltaX(wx - m_prevPt_x);
    ev.setDeltaY(wy - m_prevPt_y);
    ev.setMoveX(wx - m_startPt_x);
    ev.setMoveY(wy - m_startPt_y);
    
    fireInDevEvent(ev);
    m_prevPt_x = wx;
    m_prevPt_y = wy;

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
