// -*-Mode: C++;-*-
//
// Object related events
//

#ifndef QSYS_OBJECT_EVENT_HPP_
#define QSYS_OBJECT_EVENT_HPP_

#include "qsys.hpp"
#include "QsysEvent.hpp"
#include <qlib/EventCaster.hpp>

namespace qsys {

  using qlib::LString;

  /// Object-related event
  /// (Object events mainly received by renderes to update their displays)
  class QSYS_API ObjectEvent : public QsysEvent
  {
  private:

  public:
    /// Object-changed event with normal-update request
    static const int OBE_CHANGED = 2;

    /// Object's property changed event
    static const int OBE_PROPCHG = 3;

    /// Object-changed event with dynamic-update request.
    /// (Renderes receive this event should perform dynamic update if possible)
    static const int OBE_CHANGED_DYNAMIC = 4;
    
    /// Object-changed event after fixing the dynamic update(s)
    /// (Renderes receive this event can perform slow and fancy updates)
    static const int OBE_CHANGED_FIXDYN = 5;

    //////////

  public:
    ObjectEvent()
         : QsysEvent()
    {}

    ObjectEvent(const ObjectEvent &ev)
         : QsysEvent(ev)
    {}

    virtual ~ObjectEvent();

    virtual LCloneableObject *clone() const;

    //////////

    virtual LString getJSON() const;
    virtual bool getCategory(LString &category, int &nSrcType, int &nEvtType) const;
  };

  /////////////////////////////

  /// Interface of the ObjectEvent listener
  class QSYS_API ObjectEventListener
  {
  public:
    virtual void objectChanged(ObjectEvent &) =0;
  };

  /////////////////////////////

  class ObjectEventCaster : public qlib::LEventCaster<ObjectEvent, ObjectEventListener>
  {
  public:
    virtual void execute(ObjectEvent &ev, ObjectEventListener *p)
    {
      p->objectChanged(ev);
    }
  };


} // namespace qsys

#endif

