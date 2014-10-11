// -*-Mode: C++;-*-
//
// Undo/Redo information for properties
//
// $Id: PropEditInfo.hpp,v 1.8 2010/09/26 15:17:44 rishitani Exp $

#ifndef QSYS_PROP_EDIT_INFO_HPP_INCLUDED
#define QSYS_PROP_EDIT_INFO_HPP_INCLUDED

#include "qsys.hpp"

#include "EditInfo.hpp"
#include "UndoManager.hpp"
#include "Scene.hpp"
#include <qlib/LVariant.hpp>
#include <qlib/ObjectManager.hpp>
#include <qlib/NestedPropHandler.hpp>

namespace qsys {

  class QSYS_API PropEditInfoBase : public EditInfo
  {
  private:
    qlib::uid_t m_nTgtUID;
    qlib::LString m_propname;

  public:
    PropEditInfoBase() : m_nTgtUID(qlib::invalid_uid)
    {
    }

    virtual ~PropEditInfoBase() {}

    void setTargetUID(qlib::uid_t uid) { m_nTgtUID = uid; }
    qlib::uid_t getTargetUID() const { return m_nTgtUID; }

    qlib::LPropSupport *getTarget() const {
      return qlib::ObjectManager::sGetObj<qlib::LPropSupport>(getTargetUID());
    }

    void setPropName(const LString &name) { m_propname = name; }
    const LString &getPropName() const { return m_propname; }

    void setup(qlib::LScrObjBase *pThis)
    {
      qlib::uid_t rootuid = pThis->getRootUID();
      setTargetUID(rootuid);
      setPropName(pThis->getThisName());
    }

  };

  class PropEditInfo : public PropEditInfoBase
  {
  private:
    qlib::LVariant m_newvalue;
    qlib::LVariant m_oldvalue;

    bool m_bNewDef;
    bool m_bOldDef;

  public:
    PropEditInfo() : PropEditInfoBase(), m_bNewDef(false), m_bOldDef(false)
    {
    }

    virtual ~PropEditInfo() {
      m_newvalue.cleanup();
      m_oldvalue.cleanup();
    }

    /// Setup edit info from old and new values of the property
    void setup(qlib::uid_t uid, const LString &propnm,
               const qlib::LVariant &ov, const qlib::LVariant &nv) {
      setTargetUID(uid);
      setPropName(propnm);
      m_oldvalue = ov;
      m_newvalue = nv;
      m_bNewDef = m_bOldDef = false;
    }

    /// Setup edit info from the property event
    void setup(qlib::uid_t uid,
               const LString &propnm,
               const qlib::LPropEvent &ev)
    {
      setTargetUID(uid);
      setPropName(propnm);
      m_oldvalue = ev.getOldValue();
      m_newvalue = ev.getNewValue();
      m_bOldDef = ev.isOldDefault();
      m_bNewDef = ev.isNewDefault();
    }

    /// Setup edit info from the property event (2)
    void setup(qlib::uid_t uid,
               const qlib::LPropEvent &ev)
    {
      LString propnm = ev.getName();
      if (!ev.getParentName().isEmpty())
        propnm = ev.getParentName() + "." + propnm;
      setup(uid, propnm, ev);
    }

    ////////////////////////////////////////////////////////////////////

    /// Perform undo
    virtual bool undo();

    /// Perform redo
    virtual bool redo();

    virtual bool isUndoable() const;

    virtual bool isRedoable() const;

  };

}

#endif
