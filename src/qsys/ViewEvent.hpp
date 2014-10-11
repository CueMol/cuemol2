// -*-Mode: C++;-*-
//
// View related events
//

#ifndef QSYS_VIEW_EVENT_HPP_
#define QSYS_VIEW_EVENT_HPP_

#include "qsys.hpp"
#include "QsysEvent.hpp"
#include <qlib/EventCaster.hpp>

namespace qsys {

using qlib::LString;

/// View-related event
class QSYS_API ViewEvent : public QsysEvent
{
private:
  View *m_pTarget;
  
public:
  enum {
    // VWE_CREATE = 0,
    // VWE_DESTROY = 1,
    VWE_PROPCHG = 2,
    VWE_PROPCHG_DRG = 3,
    VWE_ACTIVATED = 4,
    VWE_SIZECHG = 5,
  };
  
  //////////
  
public:
  ViewEvent()
       : QsysEvent(), m_pTarget(NULL)
    {}

  ViewEvent(const ViewEvent &event)
       : QsysEvent(event), m_pTarget(event.m_pTarget)
    {}

  virtual ~ViewEvent();

  virtual LCloneableObject *clone() const;

  //////////

  virtual LString getJSON() const;
  virtual bool getCategory(LString &category, int &nSrcType, int &nEvtType) const;

  void setTargetPtr(View *pView) { m_pTarget = pView; }
  View *getTargetPtr() const { return m_pTarget; }
};

/////////////////////////////

/// Interface of the ViewEvent listener
class QSYS_API ViewEventListener
{
public:
  virtual void viewChanged(ViewEvent &) =0;
};

/////////////////////////////

class ViewEventCaster : public qlib::LEventCaster<ViewEvent, ViewEventListener>
{
public:
  virtual void execute(ViewEvent &ev, ViewEventListener *p)
  {
    p->viewChanged(ev);
  }
};

} // namespace qsys

#endif

