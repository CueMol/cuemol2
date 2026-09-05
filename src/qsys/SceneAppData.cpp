// -*-Mode: C++;-*-
//
// Scene application data: per-application objects stored in the scene file
//

#include <common.h>

#include "SceneAppData.hpp"
#include "Scene.hpp"
#include "SceneManager.hpp"
#include "SceneEvent.hpp"
#include "PropEditInfo.hpp"
#include "UndoManager.hpp"

using namespace qsys;

SceneAppData::SceneAppData()
{
  m_uid = qlib::ObjectManager::sRegObj(this);
  m_nSceneID = qlib::invalid_uid;
  addPropListener(this);
}

SceneAppData::~SceneAppData()
{
  qlib::ObjectManager::sUnregObj(m_uid);
}

ScenePtr SceneAppData::getScene() const
{
  if (m_nSceneID == qlib::invalid_uid) return ScenePtr();
  return SceneManager::getSceneS(m_nSceneID);
}

qlib::uid_t SceneAppData::getRootUID() const
{
  return m_uid;
}

void SceneAppData::propChanged(qlib::LPropEvent &ev)
{
  // Record undo/redo info, if a txn is active (mirrors Object::propChanged)
  if (!ev.isIntrDataChanged()) {
    UndoUtil uu(m_nSceneID);
    if (uu.isOK()) {
      PropEditInfo *pPEI = MB_NEW PropEditInfo;
      pPEI->setup(getUID(), ev);
      uu.add(pPEI);
    }
  }

  // Propagate to the scene event (silent while the scene is loading)
  ScenePtr pScene = getScene();
  if (pScene.isnull() || pScene->isLoading()) return;

  SceneEvent sev;
  sev.setType(SceneEvent::SCE_SCENE_APPDATA_CHG);
  sev.setTarget(pScene->getUID());
  sev.setSource(pScene->getUID());
  sev.setDescr(m_id);
  sev.setPropEvent(&ev);
  pScene->fireSceneEvent(sev);
}
