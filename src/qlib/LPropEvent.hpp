// -*-Mode: C++;-*-
//
// Property event
//
// $Id: LPropEvent.hpp,v 1.14 2010/09/25 12:02:28 rishitani Exp $

#ifndef QLIB_PROP_EVENT_HPP_
#define QLIB_PROP_EVENT_HPP_

#include "qlib.hpp"
#include "LString.hpp"
#include "LEvent.hpp"
#include "EventCaster.hpp"
#include "LVariant.hpp"

namespace qlib {

  class LPropSupport;
  
  class QLIB_API LPropEvent : public LEvent
  {
  private:
    LPropSupport *m_pTarg;
    LString m_parentName;
    LString m_name;

    LVariant m_newvalue;
    LVariant m_oldvalue;

    bool m_bNewDef;
    bool m_bOldDef;

  public:
    // default ctor
    LPropEvent() : m_pTarg(NULL), m_bNewDef(false), m_bOldDef(false) {}

    // copy ctor
    LPropEvent(const LPropEvent &r)
      : m_pTarg(r.m_pTarg), m_name(r.m_name),
	m_newvalue(r.m_newvalue), m_oldvalue(r.m_oldvalue),
	m_bNewDef(r.m_bNewDef), m_bOldDef(r.m_bOldDef){}

    LPropEvent(const LString &name)
      : m_pTarg(NULL), m_name(name), m_bNewDef(false), m_bOldDef(false) {}

    virtual ~LPropEvent() {}

    virtual LCloneableObject *clone() const {
      // Making the copy of the variants may not be safe (???)
      MB_ASSERT(false);
      return MB_NEW LPropEvent(*this);
    }

    //////////

    const LString &getName() const { return m_name; }
    void setName(const LString &r) { m_name = r; }

    const LString &getParentName() const { return m_parentName; }
    void setParentName(const LString &r) { m_parentName = r; }

    const LVariant &getNewValue() const { return m_newvalue; }
    void setNewValue(const LVariant &r) { m_newvalue = r; }

    const LVariant &getOldValue() const { return m_oldvalue; }
    void setOldValue(const LVariant &r) {
      // !! CAUTION !!
      // Old value should be owned by event object,
      //  because the unreferenced old value of property is possibly deleted!!
      // m_oldvalue.copyAndOwn(r);
      m_oldvalue = r;
    }

    LPropSupport *getTarget() const { return m_pTarg; }
    void setTarget(LPropSupport *pt) { m_pTarg = pt; }

    bool isNewDefault() const { return m_bNewDef; }
    void setNewDefault(bool a) { m_bNewDef = a; }

    bool isOldDefault() const { return m_bOldDef; }
    void setOldDefault(bool a) { m_bOldDef = a; }

    /// Internal data structure is changed by non-setter method(s)
    virtual bool isIntrDataChanged() const { return false; }

  };

  /////////////////////

  //
  // Interface for property event listeners
  //
  class QLIB_API LPropEventListener
  {
  public:
    virtual void propChanged(LPropEvent &) =0;
  };

  /////////////////////

  class LPropEventCaster
       : public LEventCaster<LPropEvent, LPropEventListener>
  {
    virtual void execute(LPropEvent &ev, LPropEventListener *p)
    {
      p->propChanged(ev);
    }
  };

}

#endif

