//
// Mouse event handling helper class
//

#include <common.h>
#include "MouseEventHandler.hpp"

using namespace sysdep;

MouseEventHandler::MouseEventHandler()
     : m_prevPt_x(0), m_prevPt_y(0), m_startPt_x(0), m_startPt_y(0),
       m_prevClickTime(0),
       m_nState(DRAG_NONE)
{
  m_cbuf.set_capacity(EVENTBUF_SIZE);
}

MouseEventHandler::~MouseEventHandler()
{
}

void MouseEventHandler::buttonDown(InDevEvent &ev)
{
  // Ignore mousedown event, when drag is already initiated.
  if (m_nState==DRAG_NONE) {
    m_startPt_x = m_prevPt_x = ev.getX();
    m_startPt_y = m_prevPt_y = ev.getY();
    m_nState = DRAG_CHECK;
  }
  else {
    MB_DPRINTLN("buttonDown> drag is already initiated. %d", m_nState);
  }

  ev.setType(InDevEvent::INDEV_MOUSE_DOWN);
  ev.setDeltaX(0);
  ev.setDeltaY(0);
  ev.setMoveX(0);
  ev.setMoveY(0);
}

bool MouseEventHandler::move(InDevEvent &ev)
{
  const int xx = ev.getX();
  const int yy = ev.getY();

  // check drag start
  // TO DO : make the "Drag Start Range" configureable
  if (m_nState==DRAG_CHECK) {
    if (qlib::abs<int>(xx-m_prevPt_x)<2 &&
        qlib::abs<int>(yy-m_prevPt_y)<2 ) {
      // pointer is still in chkdrag range --> do nothing
      return false;
    }

    // pointer is out from chkdrag range --> enter to dragging mode
    m_nState = DRAG_DRAG;
    ev.setType(InDevEvent::INDEV_DRAG_START);
    m_prevPt_x = xx;
    m_prevPt_y = yy;
    const qlib::time_value tt = qlib::EventManager::sGetCurrentTime();
    m_cbuf.clear();
    m_cbuf.push_back(EventEnt(tt, xx, yy));
    return true;
  }
  else if (m_nState==DRAG_NONE) {
    // ignore invalid move() call
    // LOG_DPRINTLN(">>>>> MEH ERROR!! move() called in invalid(NONE) state!!");
    return false;
  }

  ev.setType(InDevEvent::INDEV_DRAG_MOVE);
  ev.setDeltaX(xx - m_prevPt_x);
  ev.setDeltaY(yy - m_prevPt_y);
  ev.setMoveX(xx - m_startPt_x);
  ev.setMoveY(yy - m_startPt_y);

  //MB_DPRINTLN("MEH del= (%d, %d)", ev.getDeltaX(), ev.getDeltaY());
  const qlib::time_value tt = qlib::EventManager::sGetCurrentTime();

  m_prevPt_x = xx;
  m_prevPt_y = yy;

  m_cbuf.push_back(EventEnt(tt, xx, yy));
  return true;
}

bool MouseEventHandler::buttonUp(InDevEvent &ev)
{
  if (m_nState==DRAG_CHECK) {
    const qlib::time_value currt = qlib::EventManager::sGetCurrentTime();
    const qlib::time_value del_t = currt - m_prevClickTime;
    MB_DPRINTLN("prev %f currt %f del_t %f", double(m_prevClickTime), double(currt), double(del_t));
    
    if (del_t<qlib::time_value(DBLCLICK_TIME)) {
      MB_DPRINTLN("del_t %f < DBLCLICK_TIME %f", double(del_t), double(DBLCLICK_TIME));

      // Mouse button doubleclicked
      if (ev.isLButtonOn())
        ev.setType(InDevEvent::INDEV_LBTN_DBLCLICK);
      else if (ev.isRButtonOn())
        ev.setType(InDevEvent::INDEV_RBTN_DBLCLICK);
      else if (ev.isMButtonOn())
        ev.setType(InDevEvent::INDEV_MBTN_DBLCLICK);
      else {
        LOG_DPRINTLN("buttonUp dblclk> ERROR: unknown btnclick (%d)", ev.getModifier());
        ev.setType(InDevEvent::INDEV_LBTN_DBLCLICK);
      }
    }
    else {
      // Mouse button clicked
      if (ev.isLButtonOn())
        ev.setType(InDevEvent::INDEV_LBTN_CLICK);
      else if (ev.isRButtonOn())
        ev.setType(InDevEvent::INDEV_RBTN_CLICK);
      else if (ev.isMButtonOn())
        ev.setType(InDevEvent::INDEV_MBTN_CLICK);
      else {
        LOG_DPRINTLN("buttonUp> ERROR: unknown btnclick (%d)", ev.getModifier());
        ev.setType(InDevEvent::INDEV_LBTN_CLICK);
      }
    }
    m_prevClickTime = currt;
  }
  else if (m_nState == DRAG_DRAG) {
    // mouse drag has been initiated
    // --> end of drag
    ev.setType(InDevEvent::INDEV_DRAG_END);

    const int xx = ev.getX();
    const int yy = ev.getY();
    const qlib::time_value currt = qlib::EventManager::sGetCurrentTime();
    m_cbuf.push_back(EventEnt(currt, xx, yy));

    calcVelocity(ev, currt);
    MB_DPRINTLN("buttonUp> drag end");
    //MB_DPRINTLN("MEH velo= (%f, %f)", ev.getVeloX(), ev.getVeloY());
  }
  else {
    // unknown state --> ignore event
    return false;
  }

  m_nState = DRAG_NONE;
  m_cbuf.clear();
  return true;
}

void MouseEventHandler::calcVelocity(InDevEvent &ev, qlib::time_value curr)
{
  int nave = 0;
  double avex=0.0, avey=0.0, avet=0.0;

#ifdef MB_DEBUG
  {
    EventBuf::const_iterator iter = m_cbuf.begin();
    EventBuf::const_iterator eiter = m_cbuf.end();
    for (; iter!=eiter; ++iter) {
      const EventEnt &elem = *iter;
      const qlib::time_value del_t = (elem.t-curr);
      //MB_DPRINT("%d: t=%ld", nave, del_t);
      //MB_DPRINTLN("[%d, %d]", elem.x, elem.y);
    }
  }
#endif
  
  if (m_cbuf.size()>=3) {
    EventBuf::const_reverse_iterator iter = m_cbuf.rbegin();
    const EventEnt &t0 = *iter;
    iter++;
    const EventEnt &t1 = *iter;
    iter++;
    const EventEnt &t2 = *iter;

    if (t0.t-t1.t>50) {
      // no velocity
      return;
    }

    if (qlib::abs(t1.x-t2.x)+qlib::abs(t1.y-t2.y)<=1) {
      // no velocity
      return;
    }
  }
  else {
    //if (m_cbuf.size()<=1)
    // no velocity
    return;
  }
  
  {
    EventBuf::const_iterator iter = m_cbuf.begin();
    EventBuf::const_iterator eiter = m_cbuf.end();
    for (; iter!=eiter; ++iter) {
      const EventEnt &elem = *iter;
      if (elem.t>curr-qlib::time_value(AVER_TIME)) {
        const qlib::time_value del_t = (elem.t-curr);
        //MB_DPRINT("%d: t=%ld", nave, del_t);
        //MB_DPRINTLN("[%d, %d]", elem.x, elem.y);
        avex += elem.x;
        avey += elem.y;
        avet += del_t;
        nave++;
      }
    }
  }

  if (nave<=1) {
    // cannot calculate velocity
    return;
  }

  avex /= double(nave);
  avey /= double(nave);
  avet /= double(nave);

  double xtvar = 0.0, ytvar=0.0, tvar=0.0;
  {
    EventBuf::const_iterator iter = m_cbuf.begin();
    EventBuf::const_iterator eiter = m_cbuf.end();
    for (; iter!=eiter; ++iter) {
      const EventEnt &elem = *iter;
      if (elem.t>curr-qlib::time_value(AVER_TIME)) {
        const double dt = (elem.t-curr)-avet;
        tvar += dt*dt;
        xtvar += (elem.x-avex)*dt;
        ytvar += (elem.y-avey)*dt;
        nave++;
      }
    }
  }

  //MB_DPRINTLN("tvar: %f", tvar);
  //MB_DPRINTLN("xtvar: %f", xtvar);
  //MB_DPRINTLN("ytvar: %f", ytvar);
  if (qlib::isNear4(tvar, 0.0)) {
    // cannot calculate velocity
    return;
  }

  double bx = xtvar/tvar*1000.0;
  double by = ytvar/tvar*1000.0;

  ev.setVeloX(bx);
  ev.setVeloY(by);
}

