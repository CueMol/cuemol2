//
// Multi-touch event handler class for mobile devices
//
// $Id: TouchEventHandler.hpp,v 1.3 2010/12/04 17:23:19 rishitani Exp $
//

#ifndef TOUCH_EVENT_HANDLER_HPP_INCLUDED
#define TOUCH_EVENT_HANDLER_HPP_INCLUDED

#include "sysdep.hpp"

namespace sysdep {

  using qsys::InDevEvent;

  /// Utility class for seting up mouse event object (for dragging info)
  class TouchEventHandler
  {
  private:
    /// for mouse drag event generation
    int m_prevPt_x, m_prevPt_y;
    int m_startPt_x, m_startPt_y;
    
    /// mouse dragging start flag
    int m_nDragStart;

    enum {
      DRAG_NONE,
      DRAG_CHECK,
      DRAG_DRAG
    };
  
  public:
  
    TouchEventHandler()
      : m_prevPt_x(0), m_prevPt_y(0), m_startPt_x(0), m_startPt_y(0),
	m_nDragStart(DRAG_NONE)
    {
    }

    ~TouchEventHandler()
    {
    }

    void buttonDown(InDevEvent &ev)
    {
      m_startPt_x = m_prevPt_x = ev.getX();
      m_startPt_y = m_prevPt_y = ev.getY();
      ev.setType(InDevEvent::INDEV_DRAG_START);
    }

    qlib::time_value m_tLastMove;

    bool move(InDevEvent &ev)
    {
      const int xx = ev.getX();
      const int yy = ev.getY();

      ev.setType(InDevEvent::INDEV_DRAG_MOVE);
      ev.setDeltaX(xx - m_prevPt_x);
      ev.setDeltaY(yy - m_prevPt_y);
      ev.setMoveX(xx - m_startPt_x);
      ev.setMoveY(yy - m_startPt_y);
    
      m_prevPt_x = xx;
      m_prevPt_y = yy;

      m_tLastMove = qlib::EventManager::sGetCurrentTime();

      return true;
    }

    void buttonUp(InDevEvent &ev)
    {
      qlib::time_value curr = qlib::EventManager::sGetCurrentTime();

      MB_DPRINTLN("deltaT=%d", int(curr-m_tLastMove));
      if (curr-m_tLastMove>60) {
	MB_DPRINTLN("deltaT>60 --> veloX/Y are clamped to 0");
	ev.setVeloX(0);
	ev.setVeloY(0);
      }

      ev.setType(InDevEvent::INDEV_DRAG_END);
      MB_DPRINTLN("buttonUp> drag end (%d,%d), v=(%f,%f)",
		  ev.getX(), ev.getY(), ev.getVeloX(), ev.getVeloY());
    }

  };

}

#endif
