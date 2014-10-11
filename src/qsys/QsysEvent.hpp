// -*-Mode: C++;-*-
//
// Qsys related events
//

#ifndef QSYS_QSYS_EVENT_HPP_
#define QSYS_QSYS_EVENT_HPP_

#include "qsys.hpp"
#include <qlib/LEvent.hpp>

namespace qlib {
  class LPropEvent;
}

namespace qsys {

using qlib::LString;

class QSYS_API QsysEvent : public qlib::LEvent
{
private:
  /// Event type ID (defined in each event classes)
  int m_nTypeID;

  /// Event target UID
  qlib::uid_t m_nUID;

  /// Event source UID
  qlib::uid_t m_nSrcID;

  /// String description of the event (i.e. prop name, etc)
  LString m_descr;

  /// Property description (for prop changed event)
  qlib::LPropEvent *m_pPropEvt;
  
public:
  
  //////////
  
public:
  QsysEvent()
       : m_nTypeID(0),
         m_nUID(qlib::invalid_uid),
         m_nSrcID(qlib::invalid_uid),
         m_pPropEvt(NULL)
    {}

  QsysEvent(const QsysEvent &ev)
       : m_nTypeID(ev.m_nTypeID),
         m_nUID(ev.m_nUID),
         m_nSrcID(ev.m_nSrcID),
         m_descr(ev.m_descr),
         m_pPropEvt(ev.m_pPropEvt)
    {}

  virtual ~QsysEvent() {}

  //////////

  void setType(int uid) { m_nTypeID = uid; }
  int getType() const { return m_nTypeID; }

  void setTarget(qlib::uid_t uid) { m_nUID = uid; }
  qlib::uid_t getTarget() const { return m_nUID; }

  void setSource(qlib::uid_t uid) { m_nSrcID = uid; }
  qlib::uid_t getSource() const { return m_nSrcID; }

  void setDescr(const LString &descr) { m_descr = descr; }
  const LString &getDescr() const { return m_descr; }

  void setPropEvent(qlib::LPropEvent *pEvt) { m_pPropEvt = pEvt; }
  qlib::LPropEvent *getPropEvent() const { return m_pPropEvt; }

  /// Convert this event to script-event attributes
  /// (i.e. category description, src, and event type IDs)
  virtual bool getCategory(LString &category, int &nSrcType, int &nEvtType) const =0;

};

} // namespace qsys

#endif

