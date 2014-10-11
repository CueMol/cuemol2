// -*-Mode: C++;-*-
//
//  Animation object event/edit info
//

#ifndef ANIM_OBJ_EVENT_HPP_INCLUDED
#define ANIM_OBJ_EVENT_HPP_INCLUDED

#include <qsys/qsys.hpp>
#include <qlib/LPropEvent.hpp>
#include <qsys/PropEditInfo.hpp>
#include "AnimObj.hpp"

namespace qsys {

  ///
  /// Animation-related event
  ///
  class QSYS_API AnimObjEvent : public QsysEvent
  {
  private:
    typedef QsysEvent super_t;

    //////////

    /// target index (for added/removing events)
    int m_nIndex;

  public:
    AnimObjEvent() : super_t(), m_nIndex(-1) {}

    AnimObjEvent(const AnimObjEvent &ev) : super_t(ev), m_nIndex(ev.m_nIndex) {}

    virtual ~AnimObjEvent();

    virtual LCloneableObject *clone() const;

    //////////

    void setIndex(int n) { m_nIndex = n; }
    int getIndex() const { return m_nIndex; }

    virtual LString getJSON() const;
    virtual bool getCategory(LString &category, int &nSrcType, int &nEvtType) const;

  };

  ///
  /// Animation object editinfo
  ///
  class QSYS_API AnimObjEditInfo : public qsys::PropEditInfoBase
  {
  public:

    /// Target scene ID
    qlib::uid_t m_nTgtSceID;

    /// Edit mode ID definition
    enum {
      AOE_ADD,
      AOE_REMOVE,
      AOE_CHANGE,
      AOE_REMOVE_ALL
    };

    /// Edit mode ID
    int m_nMode;

    /// index of the target (add/remove)
    int m_nIndex;

    /// target object
    AnimObjPtr m_pAnimObj;

    ////////////////////////////////////////

    AnimObjEditInfo();

    virtual ~AnimObjEditInfo();

    ////////////////////////////////////////

    /// Perform undo
    virtual bool undo();

    /// Perform redo
    virtual bool redo();

    virtual bool isUndoable() const;

    virtual bool isRedoable() const;

  private:
    AnimMgrPtr getTgtMgr() const;
    bool addEntry();
    bool removeEntry();
    
  };


}


#endif

