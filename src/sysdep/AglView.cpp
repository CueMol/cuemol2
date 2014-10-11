// -*-Mode: C++;-*-
//
//  AGL dependent molecular viewer implementation
//
//  $Id: AglView.cpp,v 1.14 2009/09/12 12:23:39 rishitani Exp $

#include <common.h>

#include <OpenGL/gl.h>
#include <OpenGL/glu.h>

#include <AGL/agl.h>
#include <Carbon/Carbon.h>

#include "AglView.hpp"
#include "AglDisplayContext.hpp"

#include <qlib/Utils.hpp>

// #include "UpdateEvent.hpp"
// #define HITBUF_SIZE (64*1024)

enum NPEventType {
  NPEventType_GetFocusEvent = (osEvt + 16),
  NPEventType_LoseFocusEvent,
  NPEventType_AdjustCursorEvent,
  NPEventType_MenuCommandEvent,
  NPEventType_ClippingChangedEvent,
  NPEventType_ScrollingBeginsEvent = 1000,
  NPEventType_ScrollingEndsEvent
};

using qsys::InDevEvent;
using namespace sysdep;

AglView::AglView()
{
  // m_pHitBuf = new GLuint[HITBUF_SIZE];
  m_bInitOK = false;
  // m_cx = 0;
  m_pCtxt = NULL;

  // m_pDisplay = NULL;
  // m_xwin = 0;
}

AglView::~AglView()
{
  MB_DPRINTLN("AglView (ctxt=%p) destructing.", m_pCtxt);
  // delete [] m_pHitBuf;
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
}

LString AglView::toString() const
{
  return LString::format("AGL/OpenGL View(%p)", this);
}

void AglView::unloading()
{
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
  m_pCtxt = NULL;
  m_win = 0;
}

bool AglView::attach(AGLContext ctx, WindowRef win)
{
  if (m_pCtxt!=NULL) {
    LOG_DPRINTLN("ERROR!! AglView::attach(%p): already initialized with (%p)",
		 ctx, m_pCtxt);
    return false;
  }

  AglDisplayContext *pCtxt = MB_NEW AglDisplayContext(getSceneID(), this);
  if (!pCtxt->attach(ctx)) {
    delete pCtxt;
    return false;
  }

  // OK
  m_win = win;
  m_pCtxt = pCtxt;

  OglView::setup();

  m_bInitOK = true;
  MB_DPRINTLN("AglView::attach() OK.");

  return true;
}

void AglView::swapBuffers()
{
  aglSwapBuffers(m_pCtxt->getAGLContext());

  // MB_DPRINTLN("SwapBuffers");
}

DisplayContext *AglView::getDisplayContext()
{
  return m_pCtxt;
}

/** helper function for mouse event generation */
void AglView::setUpMouseEvent(UInt32 msg, UInt16 mods,
			      int rtx, int rty,
			      qsys::InDevEvent &ev)
{
  Rect drt;
  GetWindowBounds(m_win, kWindowContentRgn, &drt);
  // MB_DPRINTLN("(%d,%d)",drt.left + m_nViewX, drt.top + m_nViewY);
  int xx = rtx - (drt.left + m_nViewX);
  int yy = rty - (drt.top + m_nViewY);

  ev.setSource(this);
  ev.setX(xx);
  ev.setY(yy);

  ev.setRootX(rtx);
  ev.setRootY(rty);

  int modif = 0;

  bool bActive = mods & (1<<activeFlagBit);
  bool bBtn = mods & (1<<btnStateBit);
  bool bCmd = mods & (1<<cmdKeyBit);
  bool bShift = mods & (1<<shiftKeyBit);
  bool bAlpha = mods & (1<<alphaLockBit);
  bool bOpt = mods & (1<<optionKeyBit);
  bool bCtrl = mods & (1<<controlKeyBit);
  bool bRShift = mods & (1<<rightShiftKeyBit);
  bool bROpt = mods & (1<<rightOptionKeyBit);
  bool bRCtrl = mods & (1<<rightControlKeyBit);

  /*
  MB_DPRINTLN("Modif=%X", mods);
  MB_DPRINTLN("Msg=%X", msg);
  MB_DPRINTLN("");
  MB_DPRINTLN("bActive=%d", bActive);
  MB_DPRINTLN("bBtn=%d", bBtn);
  MB_DPRINTLN("bCmd=%d", bCmd);
  MB_DPRINTLN("bShift=%d", bShift);
  MB_DPRINTLN("bAlpha=%d", bAlpha);
  MB_DPRINTLN("bOpt=%d", bOpt);
  MB_DPRINTLN("bCtrl=%d", bCtrl);
  */
  //MB_DPRINTLN("bRShift=%d", bRShift);
  //MB_DPRINTLN("bROpt=%d", bROpt);
  //MB_DPRINTLN("bRCtrl=%d", bRCtrl);

  if (bShift)
    modif |= InDevEvent::INDEV_SHIFT;

  // ??
  if (bOpt)
    modif |= InDevEvent::INDEV_CTRL;

  if (bCtrl)
    modif |= InDevEvent::INDEV_RBTN;
  else
    modif |= InDevEvent::INDEV_LBTN;

  ev.setModifier(modif);

  return;
}

static
OSErr MyDragInputFunction (Point * mouse,
			   SInt16 * modifiers,
			   void * dragInputRefCon,
			   DragRef theDrag)
{
  AglView *pView = (AglView *)dragInputRefCon;
  // MB_DPRINTLN("DragInput: trackdrag %d,%d,%d",mouse->v, mouse->h, *modifiers);
  pView->trackDrag(mouse->h, mouse->v, *modifiers);
  return noErr;
}

void AglView::trackDrag(int x, int y, UInt16 mods)
{
  InDevEvent ev;
  setUpMouseEvent(0, mods, 
		  x, y, ev);
  ev.setType(InDevEvent::INDEV_DRAG_MOVE);

  int wx = x;
  int wy = y;

  ev.setDeltaX(wx - m_prevPt_x);
  ev.setDeltaY(wy - m_prevPt_y);
  ev.setMoveX(wx - m_startPt_x);
  ev.setMoveY(wy - m_startPt_y);

  m_prevPt_x = wx;
  m_prevPt_y = wy;

  fireInDevEvent(ev);
}


Boolean AglView::handleEvent(EventRecord *pev, int w, int h)
{
  Boolean eventHandled = false;
  
  if (pev->what==nullEvent) {
    return true;
  }

  switch (pev->what) {

  case updateEvt: {
    if ( w!=getWidth() || h!=getHeight() )
      sizeChanged(w, h);
    //drawScene();
    forceRedraw();
    eventHandled = true;
    break;
  }

  case ::mouseDown: {
    m_startPt_x = m_prevPt_x = pev->where.h;
    m_startPt_y = m_prevPt_y = pev->where.v;
    m_fDragStart = false;
    MB_DPRINTLN("Event: btn down %d,%d", m_startPt_x, m_startPt_y);

    bool r = WaitMouseMoved(pev->where);
    MB_DPRINTLN("Event: mouse moved %d", r);
    if (r) {
      // Dragging
      m_fDragStart = true;

      InDevEvent ev;
      setUpMouseEvent(pev->message, pev->modifiers,
		      pev->where.h, pev->where.v,
		      ev);
      ev.setType(InDevEvent::INDEV_DRAG_START);
      fireInDevEvent(ev);

      DragReference dref;
      NewDrag(&dref);

      RgnHandle rgn = NewRgn();
      MB_DPRINTLN("Event: trackdrag");
      SetDragInputProc(dref, MyDragInputFunction, this);
      TrackDrag(dref, pev, rgn);
      MB_DPRINTLN("Event: trackdrag end");

      DisposeRgn(rgn);
      DisposeDrag(dref);
      //m_fDragStart = false;

      setUpMouseEvent(pev->message, pev->modifiers,
		      m_prevPt_x, m_prevPt_y,
		      ev);
      ev.setType(InDevEvent::INDEV_DRAG_END);
      fireInDevEvent(ev);
      MB_DPRINTLN("DragEnd event fired.");
    }
    break;
  }

  case mouseUp: {
    InDevEvent ev;

    setUpMouseEvent(pev->message, pev->modifiers,
		    pev->where.h, pev->where.v,
		    ev);

    if (m_fDragStart) {
      // mouse drag is initiated
      // case of the end of drag
      /*
      ev.setType(InDevEvent::INDEV_DRAG_END);
      fireInDevEvent(ev);
      MB_DPRINTLN("DragEnd event fired.");
      */
      m_fDragStart = false;
      break;
    }

    // click event case
    ev.setType(InDevEvent::INDEV_LBTN_CLICK);
    fireInDevEvent(ev);
    m_fDragStart = false;
    break;
  }

  case NPEventType_AdjustCursorEvent: {
    MB_DPRINTLN("######## what: NPEventType_AdjustCursorEvent %x %x",
		pev->message, pev->modifiers);
    return true;
  }

  case NPEventType_GetFocusEvent: {
    MB_DPRINTLN("######## what: NPEventType_GetFocusEvent %x %x",
		pev->message, pev->modifiers);
    return true;
  }

  case NPEventType_LoseFocusEvent: {
    MB_DPRINTLN("######## what: NPEventType_LoseFocusEvent %x %x",
		pev->message, pev->modifiers);
    return true;
  }

#if 0
    //MouseDown();
    eventHandled = true;
    bool r = WaitMouseMoved(pev->where);
    MB_DPRINTLN("Event: mouse moved %d", r);
    if (r) {
      DragReference dref;
      NewDrag(&dref);

      RgnHandle rgn = NewRgn();
      MB_DPRINTLN("Event: trackdrag");
      SetDragInputProc(dref, MyDragInputFunction, this);
      TrackDrag(dref, ev, rgn);
      MB_DPRINTLN("Event: trackdrag end");

      DisposeRgn(rgn);
      DisposeDrag(dref);
    }
    break;
  }
      /*
    case NPEventType_AdjustCursorEvent:
      if (CPlugin::sHandCursor)
        SetCursor(*CPlugin::sHandCursor);
      if (fUserInstalledPlugin) {
        if (CPlugin::sRefreshText)
          NPN_Status(fInstance, CPlugin::sRefreshText);        
      }
      else {
        if (CPlugin::sAltText)
          NPN_Status(fInstance, CPlugin::sAltText);
      }
      eventHandled = true;
      break;
      */

      /*
    case nullEvent:
      // NOTE: We have to wait until idle time
      // to ask the user if they want to visit
      // the URL to avoid reentering XP code.
      if (!fAskedLoadURL) {
        if (CheckMimeTypes())
          AskAndLoadURL();
        fAskedLoadURL = true;
      }
      break;
      */
#endif
    default:
      break;
  }

  return eventHandled;

}

////////////////////////////////////////////

namespace qsys {
  //static
  qsys::View *View::createView()
  {
    qsys::View *pret = MB_NEW AglView();
    MB_DPRINTLN("AglView created (%p, ID=%d)", pret, pret->getUID());
    return pret;
  }
}
