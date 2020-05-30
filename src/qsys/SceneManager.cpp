//
// Scene manager singleton class
//
// $Id: SceneManager.cpp,v 1.24 2010/10/12 14:20:14 rishitani Exp $
//

#include <common.h>

#include <version.hpp>
#include <qlib/LPerfMeas.hpp>

#include "SceneManager.hpp"

using namespace qsys;

SINGLETON_BASE_IMPL(SceneManager);

// automatic initialization by ClassRegistry
bool SceneManager::initClass(qlib::LClass *pcls)
{
  return qlib::SingletonBase<SceneManager>::init();
}

// automatic finalization by ClassRegistry (not used!!)
void SceneManager::finiClass(qlib::LClass *pcls)
{
  qlib::SingletonBase<SceneManager>::fini();
}

///////////////

SceneManager::SceneManager()
{
  MB_DPRINTLN("SceneManager(%p) created", this);

  // initialize version info
  m_verInfo.set(PRODUCTVER, STRBUILD_ID);
  m_strVerInfo = LString::format("%d.%d.%d.%d",
                                 m_verInfo.major_version,
                                 m_verInfo.minor_version,
                                 m_verInfo.revision,
                                 m_verInfo.build_no);

  // register to idle task list
  qlib::EventManager *pEM = qlib::EventManager::getInstance();
  pEM->addIdleTask(this);

  m_nActiveSceneID = qlib::invalid_uid;
}

SceneManager::~SceneManager()
{
  dump();
  m_data.clear();
  MB_DPRINTLN("SceneManager(%p) destructed", this);
}

void SceneManager::destroyAllScenes()
{
  while (m_data.size()>0) {
    data_t::const_iterator iter = m_data.begin();
    destroyScene(iter->first);
  }
}

ScenePtr SceneManager::createScene()
{
  ScenePtr pScene(MB_NEW Scene);
  
  if (!registScene(pScene)) {
    MB_DPRINTLN("SceneManager: cannot create new scene!!");
    return ScenePtr();
  }

  pScene->init();
  return pScene;
}

ScenePtr SceneManager::getScene(qlib::uid_t uid) const
{
    if (uid == qlib::invalid_uid)
        return ScenePtr();

  data_t::const_iterator iter = m_data.find(uid);

  if (iter==m_data.end())
    return ScenePtr();
  return iter->second;
}

ScenePtr SceneManager::getSceneByName(const LString &name) const
{
  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    if (name.equals(iter->second->getName()))
      return iter->second;
  }

  return ScenePtr();
}

bool SceneManager::destroyScene(qlib::uid_t uid)
{
  data_t::iterator iter = m_data.find(uid);

  if (iter==m_data.end())
    return false;

  ScenePtr scene = iter->second;

  // notify unloading (and release view resources)
  scene->unloading();

  // destroy all objects (and renderers)
  scene->destroyAllObjects();

  // remove from scene database
  m_data.erase(iter);

  return true;
}

LString SceneManager::getSceneUIDList() const
{
  LString res;
  bool bfirst=true;
  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    qlib::uid_t uid = iter->first;
    //ScenePtr pScene = iter->second;
    if (bfirst) {
      res += LString::format("%d", int(uid));
      bfirst = false;
    }
    else {
      res += LString::format(",%d", int(uid));
    }
  }
  return res;
}

void SceneManager::checkAndUpdateScenes() const
{
  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    //ScenePtr pScene = iter->second;
    //pScene->checkAndUpdate();

    iter->second->checkAndUpdate();

    //Scene::ViewIter viter = pScene->beginView();
    //for (; viter!=pScene->endView(); ++viter) {
    //ViewPtr pView = viter->second;
    //pView->purge();
    //}
  }
}

void SceneManager::dump() const
{
  MB_DPRINTLN("SCENE DUMP:");
  MB_DPRINTLN("SceneManager : {");
  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    MB_DPRINT("%p/%d (nref=%d): ",
	      iter->second.get(),
	      iter->second->getUID(),
	      iter->second.use_count());
    iter->second->dump();
  }
  MB_DPRINTLN("}");
  MB_DPRINTLN("SCENEMANAGER DUMP END.");
}

//static
ScenePtr SceneManager::getSceneS(qlib::uid_t uid)
{
  SceneManager *pMgr = getInstance();
  return pMgr->getScene(uid);
}

//

qlib::LScrSp<qlib::LScrObjBase> SceneManager::getUIDObj(qlib::uid_t uid) const
{
  qlib::ObjectManager *pMgr = qlib::ObjectManager::getInstance();
  qlib::LScrObjBase *pObj = dynamic_cast<qlib::LScrObjBase *>(pMgr->getObjectByUID(uid));
  return qlib::LScrSp<qlib::LScrObjBase>(pObj);
}

ObjectPtr SceneManager::getObject(qlib::uid_t uid) const
{
  qlib::ObjectManager *pMgr = qlib::ObjectManager::getInstance();
  Object *pObj = dynamic_cast<Object *>(pMgr->getObjectByUID(uid));
  return ObjectPtr(pObj);
}

//static
ObjectPtr SceneManager::getObjectS(qlib::uid_t uid)
{
  SceneManager *pMgr = getInstance();
  return pMgr->getObject(uid);
}

//
#include "Renderer.hpp"

RendererPtr SceneManager::getRenderer(qlib::uid_t uid) const
{
  qlib::ObjectManager *pMgr = qlib::ObjectManager::getInstance();
  Renderer *pObj = dynamic_cast<Renderer *>(pMgr->getObjectByUID(uid));
  return RendererPtr(pObj);
}

//static
RendererPtr SceneManager::getRendererS(qlib::uid_t uid)
{
  SceneManager *pMgr = getInstance();
  return pMgr->getRenderer(uid);
}

//
#include "View.hpp"

ViewPtr SceneManager::getView(qlib::uid_t uid) const
{
  qlib::ObjectManager *pMgr = qlib::ObjectManager::getInstance();
  View *pObj = dynamic_cast<View *>(pMgr->getObjectByUID(uid));
  return ViewPtr(pObj);
}

//static
ViewPtr SceneManager::getViewS(qlib::uid_t uid)
{
  SceneManager *pMgr = getInstance();
  return pMgr->getView(uid);
}


void SceneManager::setActiveSceneID(qlib::uid_t uid)
{
  // check the validity of UID
  data_t::const_iterator iter = m_data.find(uid);
  if (iter==m_data.end()) {
    LString msg = LString::format("Cannot activate unknown scene ID: %d", uid);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
    
  m_nActiveSceneID = uid;
}

void SceneManager::enablePerfMeas(int nID)
{
  qlib::PerfMeasManager *pPM = qlib::PerfMeasManager::getInstance();
  if (pPM==NULL)
    return;
  
  pPM->enable(nID);
  
  //m_bPerfMeas = true;
  //m_busytimes.resize(naver);
  //m_nBusyTimeIndex = 0;
}

void SceneManager::disablePerfMeas()
{
  qlib::PerfMeasManager *pPM = qlib::PerfMeasManager::getInstance();
  if (pPM==NULL)
    return;

  pPM->disable();

  //m_bPerfMeas = false;
}

LString SceneManager::getVerArchName() const
{
  int nbit = (SIZEOF_VOIDP) * 8;
  
  LString plf;
  plf = STR_GUI_ARCH;

  return LString::format("%s%d", plf.toLowerCase().c_str(), nbit);
}

void SceneManager::doIdleTask()
{
  checkAndUpdateScenes();
}
