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
  class QSYS_API ObjectEvent : public QsysEvent
  {
  private:

  public:
    static constexpr int OBE_CHANGED = 2;
    static constexpr int OBE_PROPCHG = 3;

    //////////

  public:
    ObjectEvent()
         : QsysEvent()
    {}

    ObjectEvent(const ObjectEvent &ev)
         : QsysEvent(ev)
    {}

    ~ObjectEvent() override;

    LCloneableObject *clone() const override;

    //////////

    LString getJSON() const override;
    bool getCategory(LString &category, int &nSrcType, int &nEvtType) const override;
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
    void execute(ObjectEvent &ev, ObjectEventListener *p) override
    {
      p->objectChanged(ev);
    }
  };


} // namespace qsys

#endif

