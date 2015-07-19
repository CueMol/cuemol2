// -*-Mode: C++;-*-
//
// Log event
//
// $Id: LLogEvent.hpp,v 1.4 2010/09/12 12:52:38 rishitani Exp $

#ifndef QLIB_LOG_EVENT_HPP_
#define QLIB_LOG_EVENT_HPP_

#include "qlib.hpp"
#include "LString.hpp"
#include "LEvent.hpp"
#include "EventCaster.hpp"

namespace qlib {

  class QLIB_API LLogEvent : public LEvent
  {
  private:
    qlib::LString m_msg;
    int m_nType;
    bool m_bNL;

  public:
    LLogEvent() : m_nType(0) {}
    LLogEvent(const LLogEvent &src)
         : m_nType(src.m_nType), m_bNL(src.m_bNL), m_msg(src.m_msg) {}
    virtual ~LLogEvent();

    LLogEvent(int n, bool b, const LString &msg)
         : m_nType(n), m_bNL(b), m_msg(msg) {}

    virtual LCloneableObject *clone() const;

    //////////

    void setMessage(const LString &msg) { m_msg = msg; }
    const LString &getMessage() const { return m_msg; }

    void setType(int n) { m_nType = n; }
    int getType() const { return m_nType; }

    bool isNL() const { return m_bNL; }

    virtual LString getJSON() const;

  };

  class QLIB_API LLogEventListener
  {
  public:
    virtual void logAppended(LLogEvent &) =0;
  };

  //

  /*
  class LLogEventCaster
       : public LMthrEventCaster<LLogEvent, LLogEventListener>
  {
    virtual void execute(LLogEvent &ev, LLogEventListener *p)
    {
      p->logAppended(ev);
    }
  };
  */
}

#endif

