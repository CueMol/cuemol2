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

    ~AnimObjEvent() override;

    LCloneableObject *clone() const override;

    //////////

    void setIndex(int n) { m_nIndex = n; }
    int getIndex() const { return m_nIndex; }

    LString getJSON() const override;
    bool getCategory(LString &category, int &nSrcType, int &nEvtType) const override;

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

    ~AnimObjEditInfo() override;

    ////////////////////////////////////////

    /// Perform undo
    bool undo() override;

    /// Perform redo
    bool redo() override;

    bool isUndoable() const override;

    bool isRedoable() const override;

  private:
    AnimMgrPtr getTgtMgr() const;
    bool addEntry();
    bool removeEntry();
    
  };


}


#endif

