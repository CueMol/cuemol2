// -*-Mode: C++;-*-
//
// Object / Renderer loading/unloading edit info
//
// $Id: ObjLoadEditInfo.cpp,v 1.3 2010/09/22 12:41:32 rishitani Exp $
//

#include <common.h>

#include "ObjLoadEditInfo.hpp"
#include "Scene.hpp"
#include "Object.hpp"

using namespace qsys;

ObjLoadEditInfo::ObjLoadEditInfo() : m_nMode(OLEI_OBJ_CREATE)
{
}
ObjLoadEditInfo::~ObjLoadEditInfo()
{
}

void ObjLoadEditInfo::setupObjCreate(qlib::uid_t scid, ObjectPtr pObj)
{
  m_nMode = OLEI_OBJ_CREATE;
  m_nSceneID = scid;
  m_pTgtObj = pObj;
}

void ObjLoadEditInfo::setupObjDestroy(qlib::uid_t scid, ObjectPtr pObj)
{
  m_nMode = OLEI_OBJ_DESTROY;
  m_nSceneID = scid;
  m_pTgtObj = pObj;
}

void ObjLoadEditInfo::setupRendCreate(qlib::uid_t objid, RendererPtr pRend)
{
  m_nMode = OLEI_REND_CREATE;
  m_nObjID = objid;
  m_pTgtRend = pRend;
}

void ObjLoadEditInfo::setupRendDestroy(qlib::uid_t objid, RendererPtr pRend)
{
  m_nMode = OLEI_REND_DESTROY;
  m_nObjID = objid;
  m_pTgtRend = pRend;
}

/// perform undo
bool ObjLoadEditInfo::undo()
{
  Scene *pScene;
  Object *pObj;
  bool res;

  switch (m_nMode) {
  case OLEI_OBJ_CREATE:
    pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
    if (pScene==NULL) return false;
    // re-destroy the object
    res = pScene->destroyObject(m_pTgtObj->getUID());
    //if (res) {
    //pScene->incrModifiedFlag(false);
    //pScene->incrModifiedFlag(false);
    //}
    return res;

  case OLEI_OBJ_DESTROY:
    pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
    if (pScene==NULL) return false;
    // restore from the trash
    res = pScene->registerObjectImpl(m_pTgtObj);
    // if (res) {
    // pScene->incrModifiedFlag(false);
    // pScene->incrModifiedFlag(false);
    // }
    return res;
    
  case OLEI_REND_CREATE:
    pObj = qlib::ObjectManager::sGetObj<Object>(m_nObjID);
    if (pObj==NULL) return false;
    // re-destroy the renderer
    res = pObj->destroyRenderer(m_pTgtRend->getUID());
    return res;
    
  case OLEI_REND_DESTROY:
    pObj = qlib::ObjectManager::sGetObj<Object>(m_nObjID);
    if (pObj==NULL) return false;
    // restore from the trash
    try {
      pObj->registerRendererImpl(m_pTgtRend);
    }
    catch (...) {
      return false;
    }
    return true;

  default:
    break;
  }

  return false;
}

/** perform redo */
bool ObjLoadEditInfo::redo()
{
  Scene *pScene;
  Object *pObj;

  switch (m_nMode) {
  case OLEI_OBJ_CREATE:
    pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
    if (pScene==NULL) return false;
    // restore from the trash
    return pScene->registerObjectImpl(m_pTgtObj);

  case OLEI_OBJ_DESTROY:
    pScene = qlib::ObjectManager::sGetObj<Scene>(m_nSceneID);
    if (pScene==NULL) return false;
    // re-destroy the object
    return pScene->destroyObject(m_pTgtObj->getUID());

  case OLEI_REND_CREATE:
    pObj = qlib::ObjectManager::sGetObj<Object>(m_nObjID);
    if (pObj==NULL) return false;
    // restore from the trash
    try {
      pObj->registerRendererImpl(m_pTgtRend);
    }
    catch (...) {
      return false;
    }
    return true;

  case OLEI_REND_DESTROY:
    pObj = qlib::ObjectManager::sGetObj<Object>(m_nObjID);
    if (pObj==NULL) return false;
    // re-destroy the renderer
    return pObj->destroyRenderer(m_pTgtRend->getUID());

  default:
    break;

  }

  return false;
}

bool ObjLoadEditInfo::isUndoable() const
{
  // XXX
  // TO DO: check actually undoable
  return true;
}

bool ObjLoadEditInfo::isRedoable() const
{
  // XXX
  // TO DO: check actually redoable
  return true;
}

