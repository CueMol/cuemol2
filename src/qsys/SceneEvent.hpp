// -*-Mode: C++;-*-
//
// Scene related events
//

#ifndef QSYS_SCENE_EVENT_HPP_
#define QSYS_SCENE_EVENT_HPP_

#include "qsys.hpp"
#include "QsysEvent.hpp"

namespace qlib {
  class LPropEvent;
}

namespace qsys {

  using qlib::LString;

  /// Scene-related event
  class QSYS_API SceneEvent : public QsysEvent
  {
  public:
    enum {
      SCE_SCENE_REMOVING = 1,
      SCE_SCENE_PROPCHG = 2,
      SCE_SCENE_UNDOINFO = 3,
      SCE_SCENE_ONLOADED = 4,
      SCE_SCENE_CLEARALL = 5,

      SCE_OBJ_ADDED = 11,
      SCE_OBJ_REMOVING = 12,
      // SCE_OBJ_CHANGED = 13,
      // SCE_OBJ_PROPCHG = 14,

      SCE_REND_ADDED = 21,
      SCE_REND_REMOVING = 22,
      // SCE_REND_CHANGED = 23,
      // SCE_REND_PROPCHG = 24,
      
      SCE_VIEW_ADDED = 31,
      SCE_VIEW_REMOVING = 32,
      // SCE_VIEW_PROPCHG = 33,
      // SCE_VIEW_PROPCHG_DRG = 34,
      // SCE_VIEW_ACTIVATED = 35,
      // SCE_VIEW_SIZECHG = 36,

      SCE_STYLE_ADDED = 41,
      SCE_STYLE_REMOVING = 42,

      //SCE_ANIM_ADDED = 51,
      //SCE_ANIM_REMOVING = 52,
    };

    //////////

  public:
    SceneEvent()
         : QsysEvent()
      {}

    SceneEvent(const SceneEvent &ev)
         : QsysEvent(ev)
      {}
  
    virtual ~SceneEvent();

    virtual LCloneableObject *clone() const;

    //////////

    // void setObj(qlib::uid_t uid) { m_nObjID = uid; }
    // qlib::uid_t getObj() const { return m_nObjID; }

    virtual LString getJSON() const;

    virtual bool getCategory(LString &category, int &nSrcType, int &nEvtType) const;

    //void setSubEvt(qlib::LEvent *uid) { m_pSubEvt = uid; }
    //qlib::LEvent *getSubEvt() const { return m_pSubEvt; }

  };

  /** interface of the SceneEvent listener */
  class SceneEventListener
  {
  public:
    virtual void sceneChanged(SceneEvent &) =0;
  };


} // namespace

#endif
