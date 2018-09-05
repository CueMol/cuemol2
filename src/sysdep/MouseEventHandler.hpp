//
// Mouse event handling helper class
//
//

#ifndef MOUSE_EVENT_HANDLER_HPP_INCLUDED
#define MOUSE_EVENT_HANDLER_HPP_INCLUDED

#include "sysdep.hpp"

#include <qlib/EventManager.hpp>
#include <qlib/Utils.hpp>

#include <qsys/InDevEvent.hpp>

#include <boost/circular_buffer.hpp>

namespace sysdep {

  using qsys::InDevEvent;

  /// Utility class for seting up mouse event object (for dragging info)
  class SYSDEP_API MouseEventHandler
  {
  private:
    /// for mouse drag event generation
    int m_prevPt_x, m_prevPt_y;
    int m_startPt_x, m_startPt_y;

    qlib::time_value m_prevClickTime;

    /// mouse dragging start flag
    int m_nState;

    struct EventEnt {
      EventEnt(qlib::time_value at, int ax, int ay) : t(at), x(ax), y(ay) {}
      qlib::time_value t;
      int x, y;
    };

    typedef boost::circular_buffer<EventEnt> EventBuf;
    EventBuf  m_cbuf;

    static const int EVENTBUF_SIZE = 16;
    static const int AVER_TIME = 500;
    static const int DBLCLICK_TIME = 500*1000*1000;

    InDevEvent m_lastEvent;

  public:
    enum {
      DRAG_NONE,
      DRAG_CHECK,
      DRAG_DRAG,
    };

    MouseEventHandler();
    ~MouseEventHandler();

    void buttonDown(InDevEvent &ev);

    bool move(InDevEvent &ev);

    bool buttonUp(InDevEvent &ev);

    int getState() const { return m_nState; }
    
  private:
    void calcVelocity(InDevEvent &ev, qlib::time_value);
  };

}

#endif
