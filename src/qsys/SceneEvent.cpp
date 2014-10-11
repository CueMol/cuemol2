// -*-Mode: C++;-*-
//
// Scene related events
//
// $Id: SceneEvent.cpp,v 1.4 2011/03/10 13:11:55 rishitani Exp $

#include <common.h>

#include "SceneEvent.hpp"
#include "ScrEventManager.hpp"
#include <qlib/LPropEvent.hpp>

using namespace qsys;

SceneEvent::~SceneEvent()
{
}

qlib::LCloneableObject *SceneEvent::clone() const
{
  return MB_NEW SceneEvent(*this);
}

LString SceneEvent::getJSON() const
{
  LString json = "{";
  if (getType()==SCE_SCENE_PROPCHG) {
    qlib::LPropEvent *pev = getPropEvent();
    if (pev!=NULL) {
      json += "\"propname\": \"" + pev->getName().escapeQuots() + "\", ";
    }
  }
  json += LString::format("\"target_uid\": %d,", getTarget());
  json += "\"descr\": \"" + getDescr().escapeQuots() + "\" ";
  json += "}";
  return json;
}

bool SceneEvent::getCategory(LString &category, int &nSrcType, int &nEvtType) const
{
  const int nev = getType();
  switch (nev) {
  case SceneEvent::SCE_SCENE_REMOVING:
    nEvtType = ScrEventManager::SEM_REMOVING;
    nSrcType = ScrEventManager::SEM_SCENE;
    category = "sceneRemoving";
    break;
  case SceneEvent::SCE_SCENE_PROPCHG:
    nEvtType = ScrEventManager::SEM_PROPCHG;
    nSrcType = ScrEventManager::SEM_SCENE;
    category = "scenePropChanged";
    break;
  case SceneEvent::SCE_SCENE_UNDOINFO:
    nEvtType = ScrEventManager::SEM_CHANGED;
    nSrcType = ScrEventManager::SEM_SCENE;
    category = "sceneUndoInfo";
    break;
  case SceneEvent::SCE_SCENE_ONLOADED:
    nEvtType = ScrEventManager::SEM_CHANGED;
    nSrcType = ScrEventManager::SEM_SCENE;
    category = "sceneLoaded";
    break;
  case SceneEvent::SCE_SCENE_CLEARALL:
    nEvtType = ScrEventManager::SEM_CHANGED;
    nSrcType = ScrEventManager::SEM_SCENE;
    category = "sceneAllCleared";
    break;
  
  case SceneEvent::SCE_OBJ_ADDED:
    nEvtType = ScrEventManager::SEM_ADDED;
    nSrcType = ScrEventManager::SEM_OBJECT;
    category = "objectAdded";
    break;
  case SceneEvent::SCE_OBJ_REMOVING:
    nEvtType = ScrEventManager::SEM_REMOVING;
    nSrcType = ScrEventManager::SEM_OBJECT;
    category = "objectRemoving";
    break;
    
  case SceneEvent::SCE_REND_ADDED:
    nEvtType = ScrEventManager::SEM_ADDED;
    nSrcType = ScrEventManager::SEM_RENDERER;
    category = "rendererAdded";
    break;
  case SceneEvent::SCE_REND_REMOVING:
    nEvtType = ScrEventManager::SEM_REMOVING;
    nSrcType = ScrEventManager::SEM_RENDERER;
    category = "rendererRemoving";
    break;

  case SceneEvent::SCE_VIEW_ADDED:
    nEvtType = ScrEventManager::SEM_ADDED;
    nSrcType = ScrEventManager::SEM_VIEW;
    category = "viewAdded";
    break;
  case SceneEvent::SCE_VIEW_REMOVING:
    nEvtType = ScrEventManager::SEM_REMOVING;
    nSrcType = ScrEventManager::SEM_VIEW;
    category = "viewRemoving";
    break;

  case SceneEvent::SCE_STYLE_ADDED:
    nEvtType = ScrEventManager::SEM_ADDED;
    nSrcType = ScrEventManager::SEM_STYLE;
    category = "styleAdded";
    break;
  case SceneEvent::SCE_STYLE_REMOVING:
    nEvtType = ScrEventManager::SEM_REMOVING;
    nSrcType = ScrEventManager::SEM_STYLE;
    category = "styleRemoving";
    break;

  default:
    MB_DPRINTLN("FATAL ERROR: unknown event type");
    return false;
  }

  return true;
}

