// -*-Mode: C++;-*-
//
// Scene: root object of the scene document
//
// $Id: Scene.cpp,v 1.101 2011/04/16 17:30:56 rishitani Exp $
//

#include <common.h>

#include "Scene.hpp"
#include "SceneEventCaster.hpp"
#include "ObjLoadEditInfo.hpp"
#include "ScrEventManager.hpp"
#include "PropEditInfo.hpp"
#include "SysConfig.hpp"
#include "StreamManager.hpp"
#include "style/AutoStyleCtxt.hpp"
#include "CameraEditInfo.hpp"
#include "SceneManager.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LPerfMeas.hpp>

// for serialization
#include <qlib/LDOM2Stream.hpp>
#include <qlib/LByteArray.hpp>

#include <gfx/DisplayContext.hpp>
#include <gfx/ColProfMgr.hpp>
#include "style/StyleMgr.hpp"
#include "style/StyleFile.hpp"
#include "style/StyleSet.hpp"

#include "anim/AnimMgr.hpp"

// #define NO_SCRIPT 1
#ifndef NO_SCRIPT
// for JS interpreter
#include <jsbr/jsbr.hpp>
#include <jsbr/Interp.hpp>
#endif

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

using namespace qsys;
namespace fs = boost::filesystem;

namespace {
  // is this used ???
  class ScrScEvtLsnr : public SceneEventListener
  {
  private:
    //qlib::LScrCallBack *m_pCb;
    qlib::LSCBPtr m_pCb;

  public:
    ScrScEvtLsnr(qlib::LSCBPtr pcb) : m_pCb(pcb) {}

    virtual ~ScrScEvtLsnr()
    {
      MB_DPRINTLN("ScrScEvtLsnr destr %p", this);
      m_pCb = qlib::LSCBPtr();
    }

    void set(qlib::LSCBPtr pcb) { m_pCb = pcb; }

    virtual void sceneChanged(SceneEvent &ev)
    {
      int ntype = ev.getType();

      qlib::uid_t scid = ev.getSource();
      qlib::uid_t objid = ev.getTarget();
      qlib::LVarArgs args(5);

      // Method name
      args.at(0).setStringValue("sceneChanged");
      // type ID of the event
      args.at(1).setIntValue(ntype);
      // target scene ID
      args.at(2).setIntValue(scid);
      // target object/renderer/view ID
      args.at(3).setIntValue(objid);
      // target message/property name
      args.at(4).setStringValue(ev.getDescr());
      // // event object (in JSON format)
      // args.at(5).setStringValue(ev.getJSON());


      m_pCb->invoke(args);
    }
  };
}

Scene::Scene()
{
  m_pQscOpts = NULL;

  m_nUID = qlib::ObjectManager::sRegObj(this);
  m_pEvtCaster = MB_NEW SceneEventCaster;
  m_pStyleMgr = StyleMgr::getInstance();
  m_pInterp = NULL;
  // m_nModified = 0;
  addPropListener(this);

  m_pAnimMgr = qlib::LScrSp<AnimMgr>( MB_NEW AnimMgr() );
  m_pAnimMgr->setTgtSceneID(m_nUID);

  m_pEvtCaster->add(m_pAnimMgr.get());

  m_bLoading = false;

  m_nActiveObjID = qlib::invalid_uid;
  m_nActiveViewID = qlib::invalid_uid;
  m_nActiveRendID = qlib::invalid_uid;

  gfx::ColProfMgr::sRegUID(m_nUID);
  m_bUseColProof = false;

  MB_DPRINTLN("Scene (%d) created.", m_nUID);
}

void Scene::init()
{
  resetAllProps();

#ifndef NO_SCRIPT
  if (m_pInterp!=NULL) delete m_pInterp;
  ScenePtr rThis(this);
  {
    LScriptable *ps = rThis.copy();
    m_pInterp = jsbr::createInterp(ps);
    if (m_pInterp==NULL) {
      ps->destruct();
      return;
    }
  }
  
  // setup system default script path
  SysConfig *pconf = SysConfig::getInstance();
  LString scrdir = pconf->get("script_dir");
  if (!scrdir.isEmpty())
    m_pInterp->setScriptPath("system", pconf->convPathName(scrdir));
#endif

  if (m_pQscOpts!=NULL)
    delete m_pQscOpts;
  m_pQscOpts = NULL;
}

Scene::~Scene()
{
  gfx::ColProfMgr::sUnregUID(m_nUID);

  removePropListener(this);
  clearAll();
  
  m_pAnimMgr = qlib::LScrSp<AnimMgr>();

  delete m_pEvtCaster;
  qlib::ObjectManager::sUnregObj(m_nUID);

  MB_DPRINTLN("Scene (%d/%p) destructed", m_nUID, this);
}

void Scene::dump() const
{
  MB_DPRINTLN("SCENE DUMP:");
  MB_DPRINTLN("Scene : {");
  MB_DPRINTLN("  name = <%s>", m_name.c_str());
  MB_DPRINTLN("  uid = <%d>", m_nUID);

  data_t::const_iterator iter = m_data.begin();
  for (; iter!=m_data.end(); ++iter) {
    MB_DPRINT("%p/%d (nref=%d): ",
	      iter->second.get(),
	      iter->second->getUID(),
	      iter->second.use_count());
    iter->second->dump();
  }

  MB_DPRINTLN("}");
  MB_DPRINTLN("SCENE DUMP END.");

}

void Scene::clearAll()
{
  clearAllData();
  m_viewtab.clear();
}

void Scene::clearAllData()
{
  m_undomgr.clearAllInfo();
  m_rendtab.clear();
  m_data.clear();
  m_camtab.clear();
  m_pStyleMgr->destroyContext(m_nUID);

  if (m_pQscOpts!=NULL)
    delete m_pQscOpts;
  m_pQscOpts = NULL;

  m_pAnimMgr->clear();
}

void Scene::clearAllDataScr()
{
  clearAllData();

  {
    SceneEvent ev;
    ev.setTarget(getUID());
    ev.setType(SceneEvent::SCE_SCENE_CLEARALL);
    fireSceneEvent(ev);
  }
}

void Scene::unloading()
{
  {
    SceneEvent ev;
    ev.setTarget(getUID());
    ev.setType(SceneEvent::SCE_SCENE_REMOVING);
    fireSceneEvent(ev);
  }

  MB_DPRINTLN("Scene.unloading> *** Broadcast unloading ***");
  rendtab_t::const_iterator riter = m_rendtab.begin();
  for (; riter!=m_rendtab.end(); ++riter) {
    RendererPtr prend = riter->second;
    MB_DPRINTLN("Scene.unloading()> prend %d unloading().", riter->first);
    prend->unloading();
  }
  
  data_t::const_iterator oiter = m_data.begin();
  for (; oiter!=m_data.end(); ++oiter) {
    ObjectPtr pobj = oiter->second;
    MB_DPRINTLN("Scene.unloading()> obj %d unloading().", oiter->first);
    pobj->unloading();
  }

  viewtab_t::const_iterator viter = m_viewtab.begin();
  for (; viter!=m_viewtab.end(); ++viter) {
    ViewPtr pview = viter->second;
    MB_DPRINTLN("Scene.unloading()> rview %d unloading().", viter->first);
    pview->unloading();
  }

#ifndef NO_SCRIPT
  delete m_pInterp;
  m_pInterp = NULL;
#endif
}

/// set source path of this scene
void Scene::setSource(const LString &name)
{
  m_source = name;

#ifndef NO_SCRIPT
  if (m_pInterp!=NULL)
    m_pInterp->setScriptPath("scene_base_path", getBasePath());
#endif
}

LString Scene::getBasePath() const
{
  //fs::detail::utf8_codecvt_facet utf8; 
  //fs::path srcpath(m_source.c_str(), utf8);
  
  fs::path srcpath(m_source.c_str());

  fs::path ppath = srcpath.parent_path();

#if (BOOST_FILESYSTEM_VERSION==2)
  return ppath.directory_string();
#else
  //std::string rval = ppath.string(utf8);
  std::string rval = ppath.string();
  return rval;
#endif
}

LString Scene::resolveBasePath(const LString &aLocalFile) const
{
  return qlib::makeAbsolutePath(aLocalFile, getBasePath());
}

//////////////////////////////

bool Scene::addObject(ObjectPtr pobj)
{
  qlib::uid_t uid = pobj->getUID();
  data_t::const_iterator i = m_data.find(uid);
  if (i!=m_data.end()) {
    MB_DPRINTLN("Scene::addObject> object %d is already registered!!", int(uid));
    return false;
  }

  if (!registerObjectImpl(pobj)) {
    MB_THROW(qlib::RuntimeException, "Cannot add new object");
    return false;
  }

  return true;
}

bool Scene::destroyObject(qlib::uid_t uid)
{
  data_t::iterator i = m_data.find(uid);
  if (i==m_data.end()) {
    return false;
  }
  
  ObjectPtr pObj = i->second;
  qlib::ensureNotNull(pObj);

  // Detach this scene from the prop event source
  bool res = pObj->removeListener(this);
  MB_ASSERT(res);

  //
  // purge the rendering cache of this scene
  //
  while (pObj->getRendCount()>0) {
    Object::RendIter ri = pObj->beginRend();
    pObj->destroyRenderer(ri->first);
  }

  //
  // Fire the SCE_OBJ_REMOVING Event, before removing
  //
  {
    MB_DPRINTLN("Scene> Firing SCE_OBJ_REMOVING event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_OBJ_REMOVING);
    ev.setSource(getUID());
    ev.setTarget(pObj->getUID());
    fireSceneEvent(ev);
  }

  // Here, actually remove the item.
  m_data.erase(i);

  {
    // Record undo/redo info
    UndoManager *pUM = getUndoMgr();
    if (pUM->isOK()) {
      ObjLoadEditInfo *pPEI = MB_NEW ObjLoadEditInfo;
      pPEI->setupObjDestroy(getUID(), pObj);
      pUM->addEditInfo(pPEI);
    }
  }

  return true;
}

void Scene::destroyAllObjects()
{
  while (m_data.size()>0) {
    data_t::iterator oiter = m_data.begin();
    qlib::uid_t uid = oiter->first;
    destroyObject(uid);
  }
}


ObjectPtr Scene::getObject(qlib::uid_t uid) const
{
  data_t::const_iterator i = m_data.find(uid);
  if (i==m_data.end()) {
    // LString msg = LString::format("Object %d not found", uid);
    // MB_THROW(qlib::RuntimeException, msg);
    return ObjectPtr();
  }

  return i->second;
}

ObjectPtr Scene::getObjectByName(const LString &name) const
{
  BOOST_FOREACH(const data_t::value_type &i, m_data) {
    // if (pObj.isnull) continue;
    if (i.second->getName().equals(name))
      return i.second;
  }
  return ObjectPtr();
}

namespace {
  bool objsort_less(const ObjectPtr &pObj1, const ObjectPtr &pObj2)
  {
    return (pObj1->getUIOrder()) < (pObj2->getUIOrder());
  }
}

int Scene::getAllObjectUIDs(std::list<qlib::uid_t> &uids) const
{
  if (m_data.empty())
    return 0;

  // sort by ui_order
  std::vector<ObjectPtr> tmpvec;
  {
    BOOST_FOREACH (const data_t::value_type &i, m_data) {
      tmpvec.push_back(i.second);
    }
    std::sort(tmpvec.begin(), tmpvec.end(), objsort_less);
  }

  int nret = 0;
  BOOST_FOREACH (const ObjectPtr &i, tmpvec) {
    uids.push_back(i->getUID());
    ++nret;
  }

  return nret;
}

LString Scene::getObjUIDList() const
{
  LString rval;
  if (m_data.empty())
    return rval;
  
  qlib::UIDList uids;
  getAllObjectUIDs(uids);

  bool bFirst = true;
  BOOST_FOREACH (qlib::uid_t i, uids) {
    if (!bFirst)
      rval += ",";
    rval += LString::format("%d", i);
    bFirst = false;
  }

  return rval;
}

void Scene::setActiveObjID(qlib::uid_t uid)
{
  ObjectPtr pObj = getObject(uid);
  if (pObj.isnull()) {
    MB_THROW(qlib::IllegalArgumentException, "Unknown object ID");
    return;
  }
    
  m_nActiveObjID = uid;

  // set this Scene as active scene to the scene manager.
  // (active view's scene should always be active)
  SceneManager *pMgr = SceneManager::getInstance();
  pMgr->setActiveSceneID(m_nUID);

  // TO DO: fire event? (activeObjChanged??)
}

// private

/// Common implementation for the object registration
bool Scene::registerObjectImpl(ObjectPtr pObj)
{
  pObj->setSceneID(m_nUID);
  bool res = m_data.insert(data_t::value_type(pObj->getUID(), pObj)).second;
  if (!res)
    return false;

  // observe object events from the new object
  pObj->addListener(this);

  //////////////////////////////////////////////
  // Re-setup renderers already attached to pObj
  {
    Object::RendIter ri = pObj->beginRend();
    for (; ri!=pObj->endRend(); ++ri) {
      RendererPtr pRend = ri->second;
      addRendCache(pRend);
      // Update scene ID of the renderer
      pRend->setSceneID(m_nUID);
      // Scene observes events from the renderers
      pRend->addListener(this);
      // Reapply styles
      pRend->reapplyStyle();
    }
  }

  ///////////////////////////////
  // Fire the SCE_OBJ_ADDED Event
  if (!m_bLoading) {
    MB_DPRINTLN("Scene> Firing SCE_OBJ_ADDED event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_OBJ_ADDED);
    ev.setSource(getUID());
    ev.setTarget(pObj->getUID());
    fireSceneEvent(ev);
  }


  {
    // Record undo/redo info
    UndoManager *pUM = getUndoMgr();
    if (!pUM->isOK())
      return true; // undo manager is disabled now.
    
    ObjLoadEditInfo *pPEI = MB_NEW ObjLoadEditInfo;
    pPEI->setupObjCreate(getUID(), pObj);
    pUM->addEditInfo(pPEI);
  }

  return true;
}

///////////////////////////////////////
// renderer cachelist management

bool Scene::addRendCache(RendererPtr prend)
{
  bool res = m_rendtab.insert(rendtab_t::value_type(prend->getUID(), prend)).second;
  if (res) {
    // scene redrawing is required
    setUpdateFlag();
  }
  return res;
}

bool Scene::removeRendCache(RendererPtr prend)
{
  qlib::uid_t uid = prend->getUID();
  rendtab_t::iterator i = m_rendtab.find(uid);
  if (i==m_rendtab.end())
    return false;

  m_rendtab.erase(i);

  // scene redrawing is required
  setUpdateFlag();

  return true;
}

RendererPtr Scene::getRenderer(qlib::uid_t uid) const
{
  rendtab_t::const_iterator i = m_rendtab.find(uid);
  if (i==m_rendtab.end()) {
    return RendererPtr();
  }
  return i->second;
}

RendererPtr Scene::getRendByName(const LString &nm) const
{
  rendtab_t::const_iterator riter = m_rendtab.begin();
  rendtab_t::const_iterator reiter = m_rendtab.end();
  for (; riter!=reiter; ++riter) {
    RendererPtr prend = riter->second;
    if (nm.equals(prend->getName()))
      return prend;
  }

  return RendererPtr();
}

void Scene::setActiveRendID(qlib::uid_t uid)
{
  RendererPtr pRend = getRenderer(uid);
  if (pRend.isnull()) {
    MB_THROW(qlib::IllegalArgumentException, "Unknown renderer ID");
    return;
  }
    
  m_nActiveRendID = uid;

  // set this Scene as active scene to the scene manager.
  // (active view's scene should always be active)
  SceneManager *pMgr = SceneManager::getInstance();
  pMgr->setActiveSceneID(m_nUID);

  // TO DO: fire event? (activeRendChanged??)
}

///////////////////////////////////////
// Rendering of the scene

static
LString makeSectionName(ObjectPtr pObj, RendererPtr prend)
{
/*
  LString name = LString::format("_%s_%d_%s_%d",
                                 pObj->getName().c_str(), pObj->getUID(),
                                 prend->getName().c_str(), prend->getUID());
  name.replace('.', '_');
  name.replace('-', '_');
  name.replace('(', '_');
  name.replace(')', '_');
*/

  LString name = LString::format("_%d_%d", pObj->getUID(), prend->getUID());

  return name;
}

///
/// Display renderers in the scene to the frame buffer
///
void Scene::display(DisplayContext *pdc)
{
  qlib::AutoPerfMeas apm(PM_RENDER_SCENE);

  // StyleMgr is held in the member variable (at the ctor)
  m_pStyleMgr->pushContextID(getUID());
  pdc->startRender();

  std::vector<RendererPtr> transps;
  std::vector<RendererPtr> laters;

  {
    rendtab_t::const_iterator i = m_rendtab.begin();
    rendtab_t::const_iterator ie = m_rendtab.end();
    for (; i!=ie; ++i) {
      RendererPtr pRend = i->second;
      ObjectPtr pObj = pRend->getClientObj();
      if (pObj.isnull() || !pObj->isVisible())
        continue;

      if (!pRend->isVisible())
        continue;

      if (pRend->isDispLater()) {
        laters.push_back(pRend);
        continue;
      }

      if (pRend->isTransp()) {
        transps.push_back(pRend);
        continue;
      }

      displayRendImpl(pdc, pObj, pRend);
    } // for ()
  }

  // Render transparent objects
  if (transps.size()>0) {
    // pdc->enableDepthTest(false);
    std::vector<RendererPtr>::const_iterator i = transps.begin();
    std::vector<RendererPtr>::const_iterator ie = transps.end();
    for (; i!=ie; ++i) {
      RendererPtr pRend = *i;
      ObjectPtr pObj = pRend->getClientObj();
      displayRendImpl(pdc, pObj, pRend);
    }
    // pdc->enableDepthTest(true);
  }

  // Render display-later objects
  if (laters.size()>0) {
    std::vector<RendererPtr>::const_iterator i = laters.begin();
    std::vector<RendererPtr>::const_iterator ie = laters.end();
    for (; i!=ie; ++i) {
      RendererPtr pRend = *i;
      ObjectPtr pObj = pRend->getClientObj();
      displayRendImpl(pdc, pObj, pRend);
    }
  }

  // Display 2D labels (UI elements /w depth)
  {
    bool bmat;
    Matrix4D xform;
    rendtab_t::const_iterator i = m_rendtab.begin();
    rendtab_t::const_iterator ie = m_rendtab.end();
    for (; i!=ie; ++i) {
      RendererPtr prend = i->second;
      ObjectPtr pobj = prend->getClientObj();
      if (!pobj.isnull() &&
          pobj->isVisible() &&
          prend->isVisible()) {
        pdc->setAlpha(prend->getDefaultAlpha());
        
        bmat = false;
        xform = prend->getXformMatrix();
        if (!xform.isIdent()) {
          pdc->pushMatrix();
          pdc->multMatrix(xform);
            bmat = true;
        }
        
        prend->displayLabels(pdc);
        if (bmat)
          pdc->popMatrix();
        
      }
    }
  }

  pdc->endRender();
  m_pStyleMgr->popContextID();
}

void Scene::displayRendImpl(DisplayContext *pdc, ObjectPtr pObj, RendererPtr pRend)
{
  // alpha should be set before startSection,
  // since startSection() refers to the alpha value (in Pov rendering)
  pdc->setAlpha(pRend->getDefaultAlpha());

  pdc->setMaterial(pRend->getDefaultMaterial());
  pdc->setStyleNames(pRend->getStyleNames());
  
  // transfer the edge settings
  int nelt = pRend->getEdgeLineType();
  pdc->setEdgeLineType(nelt);
  pdc->setEdgeLineWidth(pRend->getEdgeLineWidth());
  pdc->setEdgeLineColor(pRend->getEdgeLineColor());
  
  bool bmat = false;
  Matrix4D xform = pRend->getXformMatrix();
  if (!xform.isIdent()) {
    pdc->pushMatrix();
    pdc->multMatrix(xform);
    bmat = true;
  }
  
  if (nelt != DisplayContext::ELT_NONE && !pdc->isFile()) {
    pdc->startEdgeSection();
    pRend->display(pdc);
    pdc->endEdgeSection();
  }
  
  // alpha should be set before startSection,
  // since startSection() refers to the alpha value (in Pov rendering)
  pdc->startSection(makeSectionName(pObj, pRend));
  
  // Do the real tasks
  pRend->display(pdc);

  pdc->endSection();
  
  if (bmat)
    pdc->popMatrix();
}

void Scene::processHit(DisplayContext *pdc)
{
  m_pStyleMgr->pushContextID(getUID());
  pdc->startRender();

  rendtab_t::const_iterator i = m_rendtab.begin();
  for (; i!=m_rendtab.end(); ++i) {
    RendererPtr prend = i->second;
    ObjectPtr pobj = prend->getClientObj();
    if (pobj.isnull() || (pobj->isVisible() && !pobj->isUILocked())) {
      if (prend->isVisible() && !prend->isUILocked()) {
        prend->processHit(pdc);
      }
    }
  }

  pdc->endRender();
  m_pStyleMgr->popContextID();
}

//////////////////////////////

ViewPtr Scene::createView()
{
  ViewPtr pView(View::createView());
  if (pView.isnull()) {
    LOG_DPRINTLN("Fatal error: View::createView() returned NULL!!");
    MB_THROW(qlib::NullPointerException, "");
    return ViewPtr();
  }

  // reset to default values
  pView->resetAllProps();

  pView->setSceneID(m_nUID);
  bool res = m_viewtab.insert(viewtab_t::value_type(pView->getUID(), pView)).second;
  if (!res)
    return ViewPtr();

  {
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_VIEW_ADDED);
    ev.setSource(getUID());
    ev.setTarget(pView->getUID());
    fireSceneEvent(ev);
  }

  return pView;
}

ViewPtr Scene::getView(qlib::uid_t uid) const
{
  viewtab_t::const_iterator i = m_viewtab.find(uid);
  if (i==m_viewtab.end())
    return ViewPtr();

  return i->second;
}

ViewPtr Scene::getViewByName(const LString &name) const
{
  BOOST_FOREACH(const viewtab_t::value_type &i, m_viewtab) {
    if (i.second->getName().equals(name))
      return i.second;
  }

  return ViewPtr();
}

bool Scene::destroyView(qlib::uid_t uid)
{
  viewtab_t::iterator i = m_viewtab.find(uid);
  if (i==m_viewtab.end())
    return false;

  ViewPtr pView = i->second;
  qlib::ensureNotNull(pView);
  
  {
    MB_DPRINTLN("Scenek> Firing SCE_VIEW_REMOVING event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_VIEW_REMOVING);
    ev.setSource(getUID());
    ev.setTarget(pView->getUID());
    fireSceneEvent(ev);
  }

  if (m_viewtab.size()==1) {
    // the last view is destructing...
    //  --> all renderers should detach from view-related resources.
    rendtab_t::const_iterator riter = m_rendtab.begin();
    for (; riter!=m_rendtab.end(); ++riter) {
      RendererPtr pRend = riter->second;
      if (!pRend.isnull())
        pRend->unloading();
    }

    data_t::const_iterator oiter = m_data.begin();
    for (; oiter!=m_data.end(); ++oiter) {
      ObjectPtr pObj = oiter->second;
      if (!pObj.isnull())
        pObj->unloading();
    }
  }

  pView->unloading();

  m_viewtab.erase(i);

  return true;
}

void Scene::setActiveViewID(qlib::uid_t uid)
{
  ViewPtr pView = getView(uid);
  if (pView.isnull()) {
    MB_THROW(qlib::IllegalArgumentException, "Unknown view ID");
    return;
  }
    
  m_nActiveViewID = uid;

  // set this Scene as active scene to the scene manager.
  // (active view's scene should always be active)
  SceneManager *pMgr = SceneManager::getInstance();
  pMgr->setActiveSceneID(m_nUID);

  // TO DO: fire event??
}

void Scene::checkAndUpdate()
{
  // MB_DPRINTLN("scene %d update %d", m_nUID, m_bUpdateRequired);
  if (m_bUpdateRequired) {
    // Force to redraw all views
    viewtab_t::const_iterator viter = m_viewtab.begin();
    for (; viter!=m_viewtab.end(); ++viter) {
      View *pV = viter->second.get();
      if (pV->isActive())
        pV->forceRedraw();
    }
    clearUpdateFlag();
  }
  else {
    // Redraw views if required
    viewtab_t::const_iterator viter = m_viewtab.begin();
    for (; viter!=m_viewtab.end(); ++viter) {
      View *pV = viter->second.get();
      if (pV->getUpdateFlag() && pV->isActive()) {
        //MB_DPRINTLN("Scene::checkAndUpdate() drawScene");
        pV->drawScene();
        pV->clearUpdateFlag();
      }
    }
  }
}

LString Scene::getViewUIDList() const
{
  LString rval;
  if (m_viewtab.empty())
    return rval;
  
  viewtab_t::const_iterator i = m_viewtab.begin();
  viewtab_t::const_iterator end = m_viewtab.end();
  for (int j=0; i!=end; ++i, ++j) {
    if (j>0)
      rval += ",";
    rval += LString::format("%d", i->first);
  }

  return rval;
}

////////////////////////////////////////////////////////////

qlib::uid_t Scene::getRootUID() const
{
  return getUID();
}

bool Scene::isModified() const
{
  StyleMgr *pSM = StyleMgr::getInstance();
  
  if (m_undomgr.getUndoSize()==0 &&
      !pSM->isModified(getUID()))
    return false;
  else
    return true;
}

bool Scene::isJustCreated() const
{
  if (isModified())
    return false;

  // scene is not modified
  
  if (getObjectCount()==0 &&
      getCameraCount()==0) {
      //getCameraCount()==1 &&
      //!getCamera("__current").isnull()) {
    // not modified but just created
    return true;
  }

  return false;
}

void Scene::setName(const LString &name)
{
  // special case; scene's name is readonly property
  // but changing by setName fires propChanged event.
  // (this is required to change UI labels of scene name...)

  // LString oldname = m_name;
  m_name = name;
  
  {
    qlib::LPropEvent ev("name");
    propChanged(ev);
  }
}

int Scene::addListener(SceneEventListener *pL)
{
  return m_pEvtCaster->add(pL);
}

int Scene::addListener(qlib::LSCBPtr scb)
{
  ScrScEvtLsnr *pLn = MB_NEW ScrScEvtLsnr(scb);
  // pLn->m_pCb = scb; // .get();
  return m_pEvtCaster->add(pLn);
}

bool Scene::removeListener(SceneEventListener *pL)
{
  return m_pEvtCaster->remove(pL);
}

bool Scene::removeListener(int nid)
{
  ScrScEvtLsnr *pSLn = dynamic_cast<ScrScEvtLsnr *>(m_pEvtCaster->remove(nid));
  MB_DPRINTLN("Scene::removeListener(%d) remove %p", nid, pSLn);
  if (pSLn==NULL)
    return false;
  delete pSLn;
  return true;
}

void Scene::fireSceneEvent(SceneEvent &ev)
{
  m_pEvtCaster->replicaFire(ev);

  ScrEventManager *pSEM = ScrEventManager::getInstance();
  ev.setSource(m_nUID);
  pSEM->fireEvent(ev);

  if (ev.getType()==SceneEvent::SCE_SCENE_ONLOADED) {

    // notify loaded to the cameras
    camtab_t::const_iterator viter = m_camtab.begin();
    camtab_t::const_iterator eiter = m_camtab.end();
    for (; viter!=eiter; ++viter) {
      CameraPtr obj = viter->second;
      obj->notifyLoaded(ScenePtr(this));
    }

#ifndef NO_SCRIPT
    // call the script event handlers
    if (m_pInterp!=NULL && !m_scrOnLoadEvent.isEmpty())
      m_pInterp->eval(m_scrOnLoadEvent);
#endif
  }
}

void Scene::propChanged(qlib::LPropEvent &ev)
{
  MB_DPRINTLN("!!! Scene::propChanged");

  // record undo/redo info
  if (!ev.isIntrDataChanged()) {
    UndoManager *pUM = getUndoMgr();
    if (pUM->isOK()) {
      // record property changed undo/redo info
      PropEditInfo *pPEI = MB_NEW PropEditInfo;
      pPEI->setup(getUID(), ev);
      pUM->addEditInfo(pPEI);
    }
  }

  // propagate prop event to scene event
  if (!m_bLoading) {
    SceneEvent sev;
    sev.setTarget(getUID());
    sev.setSource(getUID());
    sev.setType(SceneEvent::SCE_SCENE_PROPCHG);
    sev.setDescr(ev.getName());
    sev.setPropEvent(&ev);
    fireSceneEvent(sev);
  }

  // check color profile change
  //  and set update flag to redraw all views
  if (ev.getName()=="icc_filename" ||
      ev.getName()=="use_colproof" ||
      ev.getName()=="icc_intent")
    setUpdateFlag();
    
}

void Scene::objectChanged(ObjectEvent &ev)
{
  if (ev.getType()==ObjectEvent::OBE_CHANGED) {
    // objchg may require redrawing
    setUpdateFlag();
  }
  else if (ev.getType()==ObjectEvent::OBE_PROPCHG) {
    // propchg may require redrawing
    setUpdateFlag();
  }
}

void Scene::rendererChanged(RendererEvent &ev)
{
  if (ev.getType()==RendererEvent::RNE_CHANGED) {
    // objchg may require redrawing
    setUpdateFlag();
  }
  else if (ev.getType()==RendererEvent::RNE_PROPCHG) {
    // propchg may require redrawing
    setUpdateFlag();
  }
}

/////////////////////////////////////////////////

/// Get current data structure in JSON string representation.
// Without renderer group / used from UI&javascript
LString Scene::getObjectTreeJSON() const
{
  return getSceneDataJSON(false);
}

/// Get scene information in JSON format (with renderer groups)
LString Scene::getSceneDataJSON(bool bGroup) const
{
  LString rval = "[\n";

  // this scene
  rval += "{";
  rval += "\"name\":\""+m_name+"\", ";
  rval += "\"parent\": -1, ";
  rval += "\"open\": \"true\", ";
  rval += "\"type\":\"\", ";
  rval += "\"rends\": [],\n";
  rval += LString::format("\"ID\": %d", getUID());
  rval += "}";

  std::list<qlib::uid_t> obj_uids;
  getAllObjectUIDs(obj_uids);

  BOOST_FOREACH (qlib::uid_t objid, obj_uids) {
    // if (iter!=m_data.begin())
    rval += ",\n";
    rval += "{";

    ObjectPtr obj = getObject(objid);
    
    rval += "\"name\":\""+(obj->getName())+"\", ";
    rval += "\"parent\": -1, ";
    //rval += "\"ui_collapsed\": true, ";
    rval += LString("\"ui_collapsed\": ") + LString::fromBool(obj->isUICollapsed()) + ", ";
    rval += LString::format("\"ui_order\": %d, ", obj->getUIOrder());
    rval += LString("\"visible\": ") + LString::fromBool(obj->isVisible()) + ", ";
    rval += LString("\"locked\": ") + LString::fromBool(obj->isUILocked()) + ", ";
    rval += "\"type\":\""+LString(obj->getClassName())+"\", ";
    rval += LString::format("\"ID\": %d, ", objid);

    // Get renderer info
    rval += "\"rends\": \n";
    if (bGroup)
      rval += obj->getGroupedRendListJSON();
    else
      rval += obj->getFlatRendListJSON();
    rval += "\n";
    rval += "}";
  }

  rval += "\n]";

  // MB_DPRINTLN("Scene> built JSON=%s", rval.c_str());
  return rval;
}

////////////////////////////////////////////////////////////
// Camera manager

// private
/// set/overwrite the camera
void Scene::setCameraImpl(const LString &name, CameraPtr r)
{
  r->m_name = name;

  camtab_t::iterator i = m_camtab.find(name);
  if (i!=m_camtab.end()) {
    // remove existing camera with the same name
    m_camtab.erase(i);
  }

  bool res = m_camtab.insert(camtab_t::value_type(name, r)).second;
  MB_ASSERT(res);
}

//////////
// Interfaces

/// Set camera with name (overwrite if the camera with same name exists)
void Scene::setCamera(const LString &name, CameraPtr pCam)
{
  bool bCreate = !hasCamera(name);

  // setup undo txn
  UndoUtil uu(this);
  if (uu.isOK()) {
    if (bCreate) {
      CameraCreateEditInfo *pPEI = MB_NEW CameraCreateEditInfo;
      pPEI->setupCreate(getUID(), pCam);
      uu.add(pPEI);
    }
    else {
      CameraPropEditInfo *pPEI = MB_NEW CameraPropEditInfo;
      CameraPtr pBef = getCameraRef(name);
      pPEI->setup(getUID(), name, pBef, pCam );
      uu.add(pPEI);
    }
  }

  setCameraImpl(name, pCam);

  if (!m_bLoading) {
    CameraEvent ev;
    ev.setSource(m_nUID);
    ev.m_name = name;
    if (bCreate) {
      // fire camera-added event
      ev.setDescr("cameraAdded");
      ev.setType(ScrEventManager::SEM_ADDED);
    }
    else {
      // fire camera-changed event
      ev.setDescr("cameraChanged");
      ev.setType(ScrEventManager::SEM_CHANGED);
    }
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->fireEvent(ev);
  }
}

/// get the reference of the camera by name
CameraPtr Scene::getCameraRef(const LString &name) const
{
  camtab_t::const_iterator i = m_camtab.find(name);
  if (i==m_camtab.end())
    return CameraPtr();
  return i->second;
}

/// get the copy of the camera by name
CameraPtr Scene::getCamera(const LString &name) const
{
  CameraPtr pc = getCameraRef(name);
  if (pc.isnull())
    return pc;

  // return a copy
  return CameraPtr(MB_NEW Camera( *pc.get() ));
}

bool Scene::hasCamera(const LString &name) const
{
  camtab_t::const_iterator i = m_camtab.find(name);
  if (i==m_camtab.end())
    return false;
  return true;
}

bool Scene::destroyCamera(const LString &name)
{
  {
    // fire camera-removing event
    CameraEvent ev;
    ev.setDescr("cameraRemoving");
    ev.setSource(m_nUID);
    //ev.m_nEvtType = ScrEventManager::SEM_REMOVING;
    ev.setType(ScrEventManager::SEM_REMOVING);
    ev.m_name = name;
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->fireEvent(ev);
  }

  camtab_t::iterator i = m_camtab.find(name);
  if (i==m_camtab.end())
    return false;

  UndoUtil uu(this);
  if (uu.isOK()) {
    CameraCreateEditInfo *pPEI = MB_NEW CameraCreateEditInfo;
    pPEI->setupDestroy(getUID(), i->second);
    uu.add(pPEI);
  }

  m_camtab.erase(i);
  return true;
}

/// Load camera from abs path
CameraPtr Scene::loadCamera(const LString &filename) const
{
  LString path = resolveBasePath(filename);

  CameraPtr pCam(MB_NEW Camera);
  pCam->readFromPath(path);

  // set the source property
  pCam->setSource(path);

  return pCam;
}

/// Save camera to the local file
bool Scene::saveCameraTo(const LString &aName, const LString &aLocalFile) const
{
  CameraPtr pCam = getCameraRef(aName);
  if (pCam.isnull())
    return false;

  try {
    LString path = resolveBasePath(aLocalFile);
    pCam->writeFile(path);
  }
  catch (...) {
    LOG_DPRINTLN("Fatal Error: Load camera %s is failed", aLocalFile.c_str());
    return false;
  }

  if (aName.equals("__current"))
    return true;

  // Change file linkage
  // get copy before the change
  CameraPtr pBef = getCamera(aName);

  // convert to file-linked camera
  pCam->setSource(aLocalFile);

  // Setup undo txn
  UndoUtil uu(this);
  if (uu.isOK()) {
    CameraPropEditInfo *pPEI = MB_NEW CameraPropEditInfo;
    CameraPtr pAft = getCameraRef(aName);
    pPEI->setup(getUID(), aName, pBef, pAft );
    uu.add(pPEI);
  }

  return true;
}

/// save from View --> Camera (by name)
bool Scene::saveViewToCam(qlib::uid_t viewid, const LString &name)
{
  CameraPtr pOldCam = getCameraRef(name);
  LString srcpath;

  if (!pOldCam.isnull()) {
    // overwrite existing camera (preserve the srcpath of old one)
    srcpath = pOldCam->getSource();
  }
  
  // Get Copy of view's camera
  ViewPtr pView = getView(viewid);
  if (pView.isnull())
    return false;
  CameraPtr pCam = pView->getCamera();

  // source info shouldn't be overwritten by new value (i.e. empty string)
  pCam->setSource(srcpath);

  setCamera(name, pCam);

  return true;
}

/// Camera --> View restore
void Scene::setCamToViewAnim(qlib::uid_t viewid, const LString &name, bool bAnim)
{
  CameraPtr rc = getCamera(name);
  //ensureNotNull(rc);
  if (rc.isnull()) {
    MB_THROW(qlib::NullPointerException, "camera <"+name+"> not found");
    return;
  }

  /*if (bVisFlags) {
    rc->loadVisSettings(ScenePtr(this));
  }*/

  if (viewid==qlib::invalid_uid) {
    BOOST_FOREACH(const viewtab_t::value_type &i, m_viewtab) {
      qlib::uid_t id = i.first;
      if (id!=qlib::invalid_uid)
        Scene::setCamToViewAnim(id, name, bAnim);
    }
    return;
  }

  ViewPtr rv = getView(viewid);
  ensureNotNull(rv);

  rv->setCameraAnim(rc, bAnim);

  // Redraw of view (rv) is required
  rv->setUpdateFlag();
}

LString Scene::getCameraInfoJSON() const
{
  LString rval = "[";
  
  camtab_t::const_iterator viter = m_camtab.begin();
  camtab_t::const_iterator eiter = m_camtab.end();
  for (; viter!=eiter; ++viter) {
    if (viter!=m_camtab.begin())
      rval += ",";

    CameraPtr obj = viter->second;

    rval += "{\"name\":\""+ viter->first.escapeQuots() +"\",";

    rval += LString::format("\"vis_size\": %d,", obj->getVisSize());

    /*
    if (obj->getVisSize() > 0)
      rval += "\"hasVisSet\": true,";
    else
      rval += "\"hasVisSet\": false,";
     */

    LString src = obj->getSource();
    rval += "\"src\":\""+src.escapeQuots()+"\"}";
  }

  rval += "]";
  return rval;
}

////////////////////////////////////////////////////////////////////
// Undo info

void Scene::commitUndoTxn()
{
  m_undomgr.commitTxn();

  // UndoInfo event
  {
    // Fire the SCE_OBJ_ADDED Event
    MB_DPRINTLN("UndoInfo> Firing SCE_SCENE_UNDOINFO event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_SCENE_UNDOINFO);
    ev.setSource(getUID());
    ev.setTarget(getUID());
    // ev.setTarget(pObj->getUID());
    fireSceneEvent(ev);
  }
}

bool Scene::undo(int n)
{
  return m_undomgr.undo(n);
}

bool Scene::redo(int n)
{
  return m_undomgr.redo(n);
}

void Scene::clearUndoDataScr()
{
  if (m_undomgr.getUndoSize()==0&&
      m_undomgr.getRedoSize()==0)
    return; // --> already empty

  m_undomgr.clearAllInfo();

  // (notify changes of Undo/Redo information)
  {
    // Fire the SCE_SCENE_UNDOINFO event
    MB_DPRINTLN("UndoInfo> Firing SCE_SCENE_UNDOINFO event...");
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_SCENE_UNDOINFO);
    ev.setSource(getUID());
    ev.setTarget(getUID());
    // ev.setTarget(pObj->getUID());
    fireSceneEvent(ev);
  }
}

////////////////////////////////////////////////////////////////////
// Serialization

void Scene::writeTo2(qlib::LDom2Node *pNode) const
{
  // Write properties of the scene
  super_t::writeTo2(pNode);

  // Write reader options
  if (m_pQscOpts!=NULL) {
    qlib::LDom2Node *pChNode = MB_NEW qlib::LDom2Node(*m_pQscOpts);
    pNode->appendChild(pChNode);
  }

  // Write styles of the scene
  stylesWriteTo(pNode);

  // Write objects of the scene
  qlib::UIDList obj_uids;
  getAllObjectUIDs(obj_uids);
  BOOST_FOREACH (qlib::uid_t objid, obj_uids) {
    ObjectPtr obj = getObject(objid);
    qlib::LDom2Node *pChNode = pNode->appendChild();
    pChNode->setTagName("object");
    pChNode->setTypeNameByObj(obj.get());
    obj->writeTo2(pChNode);
  }

  // Write camera of the scene
  camerasWriteTo(pNode);

  // Write animation settings
  if (m_pAnimMgr->getSize()>0 ||
      m_pAnimMgr->getLength()>0) {
    qlib::LDom2Node *pChNode = pNode->appendChild();
    pChNode->setTagName("animation");
    m_pAnimMgr->writeTo2(pChNode);
  }

}

/// WriteTo2() impl for style settings
void Scene::stylesWriteTo(qlib::LDom2Node *pNode) const
{
  qlib::uid_t nScopeID = getUID();
  LString basedir = getBasePath();
  
  StyleList *pSL = m_pStyleMgr->getCreateStyleList(nScopeID);
  if (pSL==NULL || pSL->empty())
    return;

  // Iterate reversed order:
  //  The first node is higest priority, so is defined last in the file!!
  BOOST_REVERSE_FOREACH(StyleList::value_type pSet, *pSL) {

    // make child "styles" node
    qlib::LDom2Node *pChNode = pNode->appendChild();
    pChNode->setTagName("styles");

    // style set name (id)
    LString id = pSet->getName();
    LString src = pSet->getSource();

    if ( src.isEmpty() ) {
      // Internal style description
      pSet->writeToDataNode(pChNode);
      // Reset the modified flag (because the contents was synchronized to the scene file)
      pSet->setModified(false);
    }
    else {
      // External style reference is serialized as external reference node.
      // setup src and altsrc attributes
      std::pair<LString, LString> res =
        setPathsToNode(src, LString(), pChNode);

      if (pSet->isOverrideID()) {
        pChNode->appendStrAttr("id", id);
      }

      bool bReadOnly = pSet->isReadOnly();
      if (bReadOnly)
        pChNode->appendStrAttr("readonly", "true");

      if (!bReadOnly) {
        // Always write style to the external file
        // TO DO: update external source, only when the loaded style is modified.
        LString abspath = qlib::makeAbsolutePath(src, basedir);
        LOG_DPRINTLN("Scene> style %s is saved to external src %s",
                     id.c_str(), abspath.c_str());
        qlib::uid_t nStyleSetID = pSet->getUID();
        bool bRes = m_pStyleMgr->saveStyleSetToFile(nScopeID, nStyleSetID, abspath);
        if (!bRes) {
          LOG_DPRINTLN("Scene> write external style file %s failed.", abspath.c_str());
        }
        // StyleMgr.saveStyleSetToFile() method always reset the modified flag if save is succeeded.
      }
    }

  } // BOOST_FOREACH

}

/// WriteTo2() impl for camera settings
void Scene::camerasWriteTo(qlib::LDom2Node *pNode) const
{
  camtab_t::const_iterator viter = m_camtab.begin();
  camtab_t::const_iterator eiter = m_camtab.end();
  for (; viter!=eiter; ++viter) {
    qlib::LDom2Node *pChNode = pNode->appendChild();
    pChNode->setTagName("camera");

    CameraPtr pCam = viter->second;
    LString src = pCam->getSource();

    if (src.isEmpty()) {
      // Embeded camera
      // --> write all props as is.
      pCam->writeTo2(pChNode);
    }
    else {
      // External file linked camera
      std::pair<LString, LString> res =
        setPathsToNode(src, LString(), pChNode);

      //LString relpath = qlib::makeRelativePath(src, getBasePath());
      //pChNode->appendStrAttr("src", relpath);

      // write to the linked file
      LString abspath = qlib::makeAbsolutePath(src, getBasePath());
      LString camname = viter->first;
      saveCameraTo(camname, abspath);
      LOG_DPRINTLN("Scene> camera %s is saved to external src %s",
                   camname.c_str(), abspath.c_str());
    }
  }
}

void Scene::objectReadFrom(qlib::LDom2Node *pNode)
{
  // create object by node's type name attr
  ObjectPtr pobj = pNode->createObjByTypeNameT<Object>();

  // Object's properties should be built before registration to the scene,
  //   to prevent the event generation
  pobj->readFrom2(pNode);

  // Register the built object
  registerObjectImpl(pobj);
}

void Scene::cameraReadFrom(qlib::LDom2Node *pNode)
{
  CameraPtr pCam;
  
  LString src = pNode->getStrAttr("src");
  LString alt_src = pNode->getStrAttr("alt_src");

  pCam = CameraPtr(MB_NEW Camera);

  if (!src.isEmpty()) {
    // pCam = loadCameraImpl(src);
    bool bAlt = false;
    LString basedir = getBasePath();
    LString abs_path = pCam->readFromSrcAltSrc(src, alt_src, basedir, bAlt);
    pCam->updateSrcPath(abs_path);
  }
  
  // Contents in pNode will overwrite the external source contents
  // (e.g. name attribute)
  pCam->readFrom2(pNode);
  
  if (!pNode->isChildrenConsumed()) {
      // TO DO: report error (unknown element)
    //LOG_DPRINTLN("Scene::readFrom2> Warning: some Camera nodes are not consumed");
    //pNode->dump();
  }
  
  setCamera(pCam->getName(), pCam);
}

void Scene::stylesReadFrom(qlib::LDom2Node *pNode)
{
  StyleFile sfile;

  LString src = pNode->getStrAttr("src");
  LString id = pNode->getStrAttr("id");
  LString sreadonly = pNode->getStrAttr("readonly");

  if (!src.isEmpty()) {

    //LString path = resolveBasePath(src);
    //qlib::uid_t setid = sfile.loadFile(path, getUID(), id);

    LString alt_src = pNode->getStrAttr("alt_src");
    LString base_path = getBasePath();
    bool bAlt;
    LString abs_path = qlib::LDataSrcContainer::selectSrcAltSrc(src, alt_src, base_path, bAlt);

    qlib::uid_t setid = sfile.loadFile(abs_path, getUID(), id);

    if (sreadonly.equalsIgnoreCase("true")) {
      StyleSet *pSet = qlib::ObjectManager::sGetObj<StyleSet>(setid);
      pSet->setReadOnly(true);
    }
  }
  else {
    // load local style nodes
    sfile.loadNodes(pNode, getUID());
  }
}

void Scene::readFrom2(qlib::LDom2Node *pNode)
{
  m_bLoading = true;

  try {

    // reader options
    qlib::LDom2Node *pRopts = pNode->findChild("qsc_opts");
    if (pRopts!=NULL) {
      qlib::LDom2Node *pRoptsCopy = MB_NEW qlib::LDom2Node(*pRopts);
      setQscOpts(pRoptsCopy);
    }

    // read other properties of scene
    super_t::readFrom2(pNode);

    for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
      qlib::LDom2Node *pChNode = pNode->getCurChild();
      LString tag = pChNode->getTagName();
      LString type_name = pChNode->getTypeName();

      if (tag.equals("object") && !type_name.isEmpty()) {
        objectReadFrom(pChNode);
      }
      else if (tag.equals("camera")) {
        try {
          cameraReadFrom(pChNode);
        }
        catch (qlib::LException &e) {
          pNode->appendErrMsg("Scene> Load camera ERROR!! (ignored)");
          pNode->appendErrMsg("Scene> Reason: %s", e.getMsg().c_str());
        }
        catch (...) {
          pNode->appendErrMsg("Scene> Load camera ERROR!! (ignored)");
          pNode->appendErrMsg("Scene> Reason: unknown");
        }
      }
      else if (tag.equals("styles")) {
        stylesReadFrom(pChNode);
        /*
        StyleFile sfile;
        LString style_src = pChNode->getStrAttr("src");
        LString style_id = pChNode->getStrAttr("id");
        LString sreadonly = pChNode->getStrAttr("readonly");
        if (!style_src.isEmpty()) {
          LString path = resolveBasePath(style_src);
          qlib::uid_t setid = sfile.loadFile(path, getUID(), style_id);
          if (sreadonly.equalsIgnoreCase("true")) {
            StyleSet *pSet = qlib::ObjectManager::sGetObj<StyleSet>(setid);
            pSet->setReadOnly(true);
          }
        }
        else {
          // load local style nodes
          sfile.loadNodes(pChNode, getUID());
        }
         */
      }
      else if (tag.equals("script")) {

        LString value = pChNode->getValue();
        LString contents = pChNode->getContents();
        contents = contents.trim("\r\n");
        if (value.isEmpty() && !contents.isEmpty())
          value = contents;

#ifndef NO_SCRIPT
        // TO DO: set file/lineno info for eval()
        // TO DO: save the original script for serialization
        if (m_pInterp!=NULL)
          m_pInterp->eval(value);
#endif
      }
      else if (tag.equals("animation")) {
        m_pAnimMgr->readFrom2(pChNode);
      }
      else {
        // Ignore unknown tags (for backward compatibility)
        continue;
      }

      pChNode->setConsumed(true);
    }

  }
  catch (...) {
    m_bLoading = false;
    throw;
  }

  m_bLoading = false;
}

bool Scene::execJSFile(const LString &scr)
{
#ifndef NO_SCRIPT
  LString path = resolveBasePath(scr);
  return m_pInterp->execFile(path);
#endif

  return false;
}

void Scene::setQscOpts(qlib::LDom2Node *ptree)
{
  if (m_pQscOpts!=NULL) {
    MB_DPRINTLN("Scene> Warning: previous reader options is deleted");
    delete m_pQscOpts;
  }

  m_pQscOpts = ptree;
}


std::pair<LString, LString> Scene::convSrcPaths(const LString &aSrc,
                                                const LString &aAltSrc) const
{
  LString src_str = aSrc;
  LString alt_src_str = aAltSrc;

  if (src_str.isEmpty() && alt_src_str.isEmpty()) {
    LOG_DPRINTLN("convSrcPath error!!; no src/altsrc path");
    return std::pair<LString, LString>();
  }
  else if (src_str.isEmpty()) {
    src_str = alt_src_str;
  }
  else if (alt_src_str.isEmpty()) {
    alt_src_str = src_str;
  }

  // get basedir of the scene
  LString basedir = getBasePath();

  LString rel_path;
  LString abs_path;

  bool bSrcAbs = qlib::isAbsolutePath(src_str);
  bool bAltAbs = qlib::isAbsolutePath(alt_src_str);

  if (bSrcAbs&&bAltAbs) {
    // src&alt are absolute path
    abs_path = src_str;
    if (!basedir.isEmpty()) {
      // convert to relative path using basedir
      rel_path = qlib::makeRelativePath(abs_path, basedir);
    }
  }
  else if (!bSrcAbs&&bAltAbs) {
    // src is relative / alt is absolute path
    rel_path = src_str;
    abs_path = alt_src_str;
  }
  else if (bSrcAbs&&!bAltAbs) {
    // src is absolute / alt is relative path
    rel_path = alt_src_str;
    abs_path = src_str;
  }
  else {
    // src&alt are relative path
    rel_path = src_str;
    if (!basedir.isEmpty()) {
      // convert to absolute path using basedir
      abs_path = qlib::makeAbsolutePath(rel_path, basedir);
    }
  }

  // Set src path(in relative-path form) / alt_src path (in abs-path form)

  if (!rel_path.isEmpty() && !abs_path.isEmpty()) {
    src_str = rel_path;
    alt_src_str = abs_path;
  }
  else if (!rel_path.isEmpty() && abs_path.isEmpty()) {
    src_str = rel_path;
    alt_src_str = "";
  }
  else if (rel_path.isEmpty() && !abs_path.isEmpty()) {
    src_str = abs_path;
    alt_src_str = "";
  }
  else {
    // ERROR!!
    LOG_DPRINTLN("Object> convPath failed, both rel/abs empty");
    src_str = "";
    alt_src_str = "";
  }
  
  return std::pair<LString, LString>(src_str, alt_src_str);
}

std::pair<LString,LString> Scene::setPathsToNode(const LString &aSrc,
                                                 const LString &aAltSrc,
                                                 qlib::LDom2Node *pNode) const
{
  std::pair<LString, LString> res = convSrcPaths(aSrc, aAltSrc);

  pNode->setStrAttr("src", res.first);

  // Set the alternative path representation (in absolute form)
  if (!res.second.isEmpty() && !res.second.equals(res.first))
    pNode->setStrAttr("alt_src", res.second);

  return res;
}

void Scene::forceEmbed()
{
  // change all camera sources
  camtab_t::const_iterator viter = m_camtab.begin();
  camtab_t::const_iterator eiter = m_camtab.end();
  for (; viter!=eiter; ++viter) {
    CameraPtr pCam = viter->second;
    pCam->setSource("");
  }
  
  // change all style sources
  qlib::uid_t nScopeID = getUID();
  LString basedir = getBasePath();
  
  StyleList *pSL = m_pStyleMgr->getCreateStyleList(nScopeID);
  if (pSL==NULL || pSL->empty())
    return;

  BOOST_FOREACH(StyleList::value_type pSet, *pSL) {
    // style set name (id)
    LString id = pSet->getName();
    pSet->setSource("");
  }

}

using gfx::ColProfMgr;
using gfx::CmsXform;

void Scene::setIccFileName(const LString &fn)
{
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  CmsXform *pXfm = pMgr->getCmsByID(getUID());

  if (fn.isEmpty()) {
    pXfm->reset();
    m_iccFileName = LString();
    return;
  }

  StyleMgr *pSMgr = StyleMgr::getInstance();
  std::list<LString> ls;
  pSMgr->getMultiPath("icc_profile_dir", getUID(), ls);

  fs::path fname(fn.c_str()), iccpath;

  BOOST_FOREACH (const LString &pathstr, ls) {
    fs::path spath(pathstr.c_str());
    spath /= fname;
    if (fs::is_regular_file(spath)) {
      iccpath = spath;
      break;
    }
  }

  if (!fs::is_regular_file(iccpath)) {
    MB_THROW(qlib::RuntimeException, "icc profile not found: "+fn);
    return;
  }

  pXfm->loadIccFile(iccpath.string());
  pXfm->setEnabled(m_bUseColProof);

  LOG_DPRINTLN("Scene> Load ICC profile [%s]: OK", iccpath.string().c_str());
  LOG_DPRINTLN("Scene> ICC profile info:");
  LOG_DPRINTLN("=====");
  LOG_DPRINTLN("%s", pXfm->getInfo().chomp().c_str());
  LOG_DPRINTLN("=====");

  m_iccFileName = fn;
}

void Scene::setUseColProof(bool b)
{
  m_bUseColProof = b;
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  CmsXform *pXfm = pMgr->getCmsByID(getUID());
  pXfm->setEnabled(m_bUseColProof);
}

int Scene::getIccIntent() const
{
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  CmsXform *pXfm = pMgr->getCmsByID(getUID());
  if (pXfm==NULL)
    return 0;
  return pXfm->getIccIntent();
}

void Scene::setIccIntent(int n)
{
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  CmsXform *pXfm = pMgr->getCmsByID(getUID());
  if (pXfm==NULL)
    return;
  if (n==pXfm->getIccIntent())
    return;

  // Reload of ICC profile is required to change the intent value
  pXfm->reset();
  pXfm->setIccIntent(n);
  setIccFileName(m_iccFileName);
}

LString Scene::toString() const
{
  return LString::format("Scene(name=%s, UID=%d)",m_name.c_str(), getUID());
}

