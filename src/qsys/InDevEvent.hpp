// -*-Mode: C++;-*-
//
//  System-independent input device events
//

#ifndef QSYS_IN_DEV_EVENT_HPP_INCLUDED
#define QSYS_IN_DEV_EVENT_HPP_INCLUDED

#include "qsys.hpp"
#include <qlib/LEvent.hpp>
#include <qlib/EventCaster.hpp>

namespace qsys {

  class View;
  using qlib::LString;

  /**
     Input device related events
  */
  class QSYS_API InDevEvent : public qlib::LEvent
  {
  private:
    View *m_pSource;
    int m_nType;
    int m_nModifier;

  public:
    /// Event types
    enum {
      INDEV_NONE,
      INDEV_LBTN_CLICK,
      INDEV_RBTN_CLICK,
      INDEV_MBTN_CLICK,
      INDEV_LBTN_DBLCLICK,
      INDEV_RBTN_DBLCLICK,
      INDEV_MBTN_DBLCLICK,
      INDEV_DRAG_START,
      INDEV_DRAG_MOVE,
      INDEV_DRAG_END,
      INDEV_WHEEL,
      INDEV_MOUSE_DOWN,
      INDEV_MOUSE_ENTER,
    };

    /// Event modifiers
    enum {
      INDEV_SHIFT= (1 << 0),
      INDEV_CTRL = (1 << 1),
      INDEV_ALT  = (1 << 2),
      INDEV_LBTN = (1 << 3),
      INDEV_MBTN = (1 << 4),
      INDEV_RBTN = (1 << 5)
    };
  
    bool m_fConsumed;

    int m_x, m_y;
    int m_rootx, m_rooty;
    int m_deltax, m_deltay;
    int m_movex, m_movey;
  
    /// velocity in the X and Y directions (pixels per sec)
    double m_velox, m_veloy;
    
  public:
    InDevEvent()
      : m_pSource(NULL), m_nType(INDEV_NONE),
	m_nModifier(0), m_fConsumed(false),
	m_x(0), m_y(0), m_deltax(0), m_deltay(0),
	m_movex(0), m_movey(0),
        m_velox(0.0), m_veloy(0.0)
    {}

    InDevEvent(const InDevEvent &arg)
    {
      copyFrom(arg);
    }

    virtual ~InDevEvent();

    virtual LCloneableObject *clone() const;

    ////////////////////////////////////////////

    void copyFrom(const InDevEvent &arg);

    void setSource(View *p) { m_pSource = p; }
    View *getSource() { return m_pSource; }

    void setType(int n) { m_nType = n; }
    int getType() const { return m_nType; }

    // modifire-related methods
    void setModifier(int n) { m_nModifier = n; }
    int getModifier() const { return m_nModifier; }

    bool isShiftOn() const   { return ((m_nModifier & INDEV_SHIFT)!=0); }
    bool isCtrlOn() const    { return ((m_nModifier & INDEV_CTRL)!=0); }
    bool isAltOn() const     { return ((m_nModifier & INDEV_ALT )!=0); }
    bool isLButtonOn() const { return ((m_nModifier & INDEV_LBTN)!=0); }
    bool isRButtonOn() const { return ((m_nModifier & INDEV_RBTN)!=0); }
    bool isMButtonOn() const { return ((m_nModifier & INDEV_MBTN)!=0); }

    void setConsumed(bool f) { m_fConsumed = f; }
    bool isConsumed() const { return m_fConsumed; }

    // coordinate-related methods
    int getX() const { return m_x; }
    void setX(int x) { m_x = x; }
    int getY() const { return m_y; }
    void setY(int y) { m_y = y; }

    int getRootX() const { return m_rootx; }
    void setRootX(int x) { m_rootx = x; }
    int getRootY() const { return m_rooty; }
    void setRootY(int y) { m_rooty = y; }
  
    int getDeltaX() const { return m_deltax; }
    void setDeltaX(int x) { m_deltax = x; }
    int getDeltaY() const { return m_deltay; }
    void setDeltaY(int y) { m_deltay = y; }

    int getMoveX() const { return m_movex; }
    void setMoveX(int x) { m_movex = x; }
    int getMoveY() const { return m_movey; }
    void setMoveY(int y) { m_movey = y; }

    double getVeloX() const { return m_velox; }
    void setVeloX(double x) { m_velox = x; }
    double getVeloY() const { return m_veloy; }
    void setVeloY(double y) { m_veloy = y; }

    const InDevEvent &operator=(const InDevEvent &arg)
    {
      if(&arg!=this){
        copyFrom(arg);
      }
      return *this;
    }

    virtual LString getJSON() const;
  };

  /////////////////////////////////////////////

  class QSYS_API InDevListener
  {
  public:
    /** mouse click event (L,M,R button)*/
    virtual bool mouseClicked(InDevEvent &) { return false; }

    /** mouse double click event (L,M,R button)*/
    virtual bool mouseDoubleClicked(InDevEvent &) { return false; }

    /** mouse drag start event */
    virtual bool mouseDragStart(InDevEvent &) { return false; }

    /** mouse drag move event */
    virtual bool mouseDragMove(InDevEvent &) { return false; }

    /** mouse drag end event */
    virtual bool mouseDragEnd(InDevEvent &) { return false; }

    virtual bool mouseWheel(InDevEvent &) { return false; }

    virtual bool mouseDown(InDevEvent &) { return false; }
    virtual bool mouseEnter(InDevEvent &) { return false; }
  };

  /////////////////////////////////////////////

  class InDevEventCaster
    : public qlib::LEventCaster<InDevEvent, InDevListener>
  {
  public:
    typedef qlib::LEventCaster<InDevEvent, InDevListener> super_t;

    /*
    void fire(InDevEvent &ev) {
      super_t::data_t::iterator iter = m_listenerList.begin();

      for ( ; iter!=m_listenerList.end(); iter++) {
	execute(ev, *iter);
	if (ev.isConsumed())
	  return;
      }
    }
    */

    virtual void execute(InDevEvent &ev, InDevListener *p)
    {
      bool res = false;
      const int nev = ev.getType();

      switch (nev) {

      case InDevEvent::INDEV_LBTN_CLICK:
      case InDevEvent::INDEV_RBTN_CLICK:
      case InDevEvent::INDEV_MBTN_CLICK:
        res = p->mouseClicked(ev);
        break;
        
      case InDevEvent::INDEV_LBTN_DBLCLICK:
      case InDevEvent::INDEV_RBTN_DBLCLICK:
      case InDevEvent::INDEV_MBTN_DBLCLICK:
	res = p->mouseDoubleClicked(ev);
        break;

      case InDevEvent::INDEV_DRAG_START:
	res = p->mouseDragStart(ev);
        break;

      case InDevEvent::INDEV_DRAG_MOVE:
	res = p->mouseDragMove(ev);
        break;

      case InDevEvent::INDEV_DRAG_END:
        res = p->mouseDragEnd(ev);
        break;

      case InDevEvent::INDEV_WHEEL:
        res = p->mouseWheel(ev);
        break;

      case InDevEvent::INDEV_MOUSE_DOWN:
        res = p->mouseDown(ev);
        break;

      case InDevEvent::INDEV_MOUSE_ENTER:
        res = p->mouseEnter(ev);
        break;

      default:
        MB_ASSERT(false);
        break;
      }
      /*
      if (ev.getType()==InDevEvent::INDEV_LBTN_CLICK ||
	  ev.getType()==InDevEvent::INDEV_RBTN_CLICK ||
	  ev.getType()==InDevEvent::INDEV_MBTN_CLICK)
	res = p->mouseClicked(ev);
      else if (ev.getType()==InDevEvent::INDEV_LBTN_DBLCLICK ||
	       ev.getType()==InDevEvent::INDEV_RBTN_DBLCLICK ||
	       ev.getType()==InDevEvent::INDEV_MBTN_DBLCLICK)
	res = p->mouseDoubleClicked(ev);
      else if (ev.getType()==InDevEvent::INDEV_DRAG_START)
	res = p->mouseDragStart(ev);
      else if (ev.getType()==InDevEvent::INDEV_DRAG_MOVE)
	res = p->mouseDragMove(ev);
      else if (ev.getType()==InDevEvent::INDEV_DRAG_END)
	res = p->mouseDragEnd(ev);
       */

      ev.setConsumed(res);
    }
  };

}

#endif
