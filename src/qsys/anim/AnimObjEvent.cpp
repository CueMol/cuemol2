// -*-Mode: C++;-*-
//
//  Animation object event/edit info
//

#include <common.h>

#include "AnimObjEvent.hpp"
#include <qsys/ScrEventManager.hpp>
#include <qsys/SceneManager.hpp>
#include "AnimObj.hpp"
#include "AnimMgr.hpp"

using namespace qsys;

AnimObjEvent::~AnimObjEvent()
{
}

qlib::LCloneableObject *AnimObjEvent::clone() const
{
  return MB_NEW AnimObjEvent(*this);
}

LString AnimObjEvent::getJSON() const
{
  if (getType()==ScrEventManager::SEM_PROPCHG) {
    qlib::LPropEvent *pev = getPropEvent();
    if (pev==NULL)
      return super_t::getJSON();
      
    LString json = "{";
    if (m_nIndex>=0)
      json += "\"index\":"+LString::fromInt(m_nIndex)+",";
    json += "\"propname\": \"" + pev->getName().escapeQuots() + "\", ";
    json += "\"parentname\": \"" + pev->getParentName().escapeQuots() + "\"}";
    return json;
  }

  if (m_nIndex<0)
    return super_t::getJSON();
  
  return "{\"index\":"+LString::fromInt(m_nIndex)+"}";
}

bool AnimObjEvent::getCategory(LString &category, int &nSrcType, int &nEvtType) const
{
  category = getDescr();
  nEvtType = getType();
  nSrcType = ScrEventManager::SEM_ANIM;
  return true;
}

/////////////////////////////////

AnimObjEditInfo::AnimObjEditInfo()
{
}

AnimObjEditInfo::~AnimObjEditInfo()
{
}

/// Perform undo
bool AnimObjEditInfo::undo()
{
  switch (m_nMode) {
  case AOE_ADD:
    /// undo add (==> remove)
    return removeEntry();
  case AOE_REMOVE:
    return addEntry();
  case AOE_CHANGE:
    break;
  case AOE_REMOVE_ALL:
    break;
  default:
    break;
  }
  return false;
}

/// Perform redo
bool AnimObjEditInfo::redo()
{
  switch (m_nMode) {
  case AOE_ADD:
    /// redo add (==> add)
    return addEntry();
  case AOE_REMOVE:
    return removeEntry();
  case AOE_CHANGE:
    break;
  case AOE_REMOVE_ALL:
    break;
  default:
    break;
  }
  return false;
}

AnimMgrPtr AnimObjEditInfo::getTgtMgr() const
{
  ScenePtr pScene = SceneManager::getSceneS(m_nTgtSceID);
  if (pScene.isnull()) return AnimMgrPtr();
  return pScene->getAnimMgr();
}

bool AnimObjEditInfo::removeEntry()
{
  AnimMgrPtr pMgr = getTgtMgr();
  if (pMgr.isnull()) return false;
  pMgr->removeAt(m_nIndex);
  return true;
}

bool AnimObjEditInfo::addEntry()
{
  AnimMgrPtr pMgr = getTgtMgr();
  if (pMgr.isnull()) return false;
  if (m_pAnimObj.isnull()) return false;
  pMgr->insertBefore(m_nIndex, m_pAnimObj);
  return true;
}

bool AnimObjEditInfo::isUndoable() const
{
  return true;
}

bool AnimObjEditInfo::isRedoable() const
{
  return true;
}

