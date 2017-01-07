
#include <common.h>

#include "Renderer.hpp"
#include "SceneManager.hpp"
#include "ScrEventManager.hpp"
#include "style/StyleSheet.hpp"
#include "style/StyleMgr.hpp"
#include "style/StyleEditInfo.hpp"
#include <gfx/DisplayContext.hpp>
#include <qlib/LDOM2Stream.hpp>

#include "UndoManager.hpp"
#include "PropEditInfo.hpp"

using namespace qsys;
using gfx::DisplayContext;

///////////////////////////////////////////////////////////////////
// Ctor/Dtor

Renderer::Renderer()
{
  m_pStyles = MB_NEW StyleSheet();
  m_pEvtCaster = MB_NEW RendererEventCaster;
  m_uid = qlib::ObjectManager::sRegObj(this);
  m_nSceneID = qlib::invalid_uid;
  m_nClientObj = qlib::invalid_uid;
  m_bVisible = true;
  m_bLocked = false;
  m_defAlpha = 1.0;

  m_nUIOrder = m_uid;

  m_dEdgeLineWidth = -1.0;

  //MB_DPRINTLN("Renderer (%p/%d) created\n", this, m_uid);
  addPropListener(this);

  // // Listen style events
  // StyleMgr *pSMgr = StyleMgr::getInstance();
  // if (pSMgr!=NULL)
  // pSMgr->addListener(this);
}

Renderer::Renderer(const Renderer &r)
{
  MB_ASSERT(false);
  m_uid = qlib::ObjectManager::sRegObj(this);
  //: m_uid(qlib::LUIDGen::sget())
  MB_DPRINTLN("????? ERROR ?? XXX: Renderer copy (%p/%d) created\n", this, m_uid);
  addPropListener(this);
}

Renderer::~Renderer()
{
  // detach from style event
  StyleMgr *pSMgr = StyleMgr::getInstance();
  if (pSMgr!=NULL)
    pSMgr->removeListener(this);

  // detach from old scene
  if (m_nSceneID != qlib::invalid_uid) {
    ScenePtr pScene = getScene();
    if (!pScene.isnull())
      pScene->removeListener(this);
  }

  delete m_pEvtCaster;
  delete m_pStyles;
  //MB_DPRINTLN("Renderer(%p) destructed\n", this);
  qlib::ObjectManager::sUnregObj(m_uid);
}

///////////////////////////////////////////////////////////////////

qlib::uid_t Renderer::getRootUID() const
{
  return getUID();
}

void Renderer::attachObj(qlib::uid_t obj_uid)
{
  m_nClientObj = obj_uid;

  ObjectPtr pObj = getClientObj();
  if (pObj.isnull())
    return;

  pObj->addListener(this);
}

qlib::uid_t Renderer::detachObj()
{
  ObjectPtr pObj = getClientObj();
  if (!pObj.isnull())
    pObj->removeListener(this);

  qlib::uid_t r = m_nClientObj;
  m_nClientObj = qlib::invalid_uid;
  return r;
}

ObjectPtr Renderer::getClientObj() const
{
  return SceneManager::getObjectS(getClientObjID());
}

void Renderer::setSceneID(qlib::uid_t nid)
{
  ScenePtr pScene;
  // detach from old scene
  if (m_nSceneID != qlib::invalid_uid) {
    pScene = getScene();
    if (!pScene.isnull())
      pScene->removeListener(this);
  }

  m_pStyles->setScopeID(nid);
  m_nSceneID = nid;

  // listen for new scene
  pScene = getScene();
  if (!pScene.isnull())
    pScene->addListener(this);
}

ScenePtr Renderer::getScene() const
{
  return SceneManager::getSceneS(m_nSceneID);
}

////////////////////////////////////////
// Style supports

bool Renderer::resetProperty(const LString &propnm)
{
  bool res = StyleResetPropImpl::resetProperty(propnm, this);
  if (!res) {
    // stylesheet value is not found --> default behaviour
    return super_t::resetProperty(propnm);
  }

  return true;
}

StyleSheet *Renderer::getStyleSheet() const
{
  return m_pStyles;
}

void Renderer::styleChanged(StyleEvent &)
{
  m_pStyles->applyStyle(this);
}

qlib::uid_t Renderer::getStyleCtxtID() const
{
  return m_nSceneID;
}

//

LString Renderer::getStyleNames() const
{
  return m_pStyles->getStyleNames();
}

void Renderer::applyStyles(const LString &n)
{
  LString ov = m_pStyles->getStyleNames();

  m_pStyles->setStyleNames(n);
  m_pStyles->applyStyle(this);

  setupStyleUndo(ov, n);

  // Style changed & prop changed event
  fireStyleEvents();
}

void Renderer::reapplyStyle()
{
  m_pStyles->applyStyle(this);
}


void Renderer::fireStyleEvents()
{
  // Style changed event
  {
    StyleEvent ev;
    styleChanged(ev);
  }

  // Fire propchanged event (for styles prop)
  {
    RendererEvent obe;
    qlib::LPropEvent ev("styles");
    obe.setType(RendererEvent::RNE_PROPCHG);
    obe.setTarget(getUID());
    obe.setDescr("styles");
    obe.setPropEvent(&ev);
    fireRendererEvent(obe);
  }
}

void Renderer::setupStyleUndo(const LString &ov, const LString &nv)
{
  // Check whether is in the undo/redo context or not.
  ScenePtr cursc = getScene();
  if (cursc.isnull())
    return;

  UndoManager *pUM = cursc->getUndoMgr();
  if (!pUM->isOK())
    return;

  // Record property changed undo/redo info
  RendStyleEditInfo *pPEI = MB_NEW RendStyleEditInfo;
  pPEI->setup(getUID(), ov, nv);
  pUM->addEditInfo(pPEI);
}

////////////////////////////////////////////

int Renderer::addListener(RendererEventListener *pL)
{
  return m_pEvtCaster->add(pL);
}

bool Renderer::removeListener(RendererEventListener *pL)
{
  return m_pEvtCaster->remove(pL);
}

void Renderer::fireRendererEvent(RendererEvent &ev)
{
  m_pEvtCaster->replicaFire(ev);

  ScrEventManager *pSEM = ScrEventManager::getInstance();
  ev.setSource(m_nSceneID);
  pSEM->fireEvent(ev);
}

void Renderer::propChanged(qlib::LPropEvent &ev)
{
  //MB_DPRINTLN("Renderer(%p) property %s.%s changed.\n", this,
  //ev.getParentName().c_str(), ev.getName().c_str());

  // record undo/redo info
  ScenePtr cursc = getScene();
  if (!ev.isIntrDataChanged() && !cursc.isnull()) {
    UndoManager *pUM = cursc->getUndoMgr();
    if (pUM->isOK()) {
      // record property changed undo/redo info
      PropEditInfo *pPEI = MB_NEW PropEditInfo;
      pPEI->setup(getUID(), ev);
      pUM->addEditInfo(pPEI);
    }
  }
  
  // propagate to renderer event
  {
    RendererEvent obe;
    obe.setType(RendererEvent::RNE_PROPCHG);
    obe.setTarget(getUID());
    obe.setDescr(ev.getName());
    obe.setPropEvent(&ev);
    fireRendererEvent(obe);
  }

  return;
}

void Renderer::objectChanged(ObjectEvent &ev)
{
  //if (ev.getType()==ObjectEvent::OBE_CHANGED) {
  //}
}

void Renderer::sceneChanged(SceneEvent &ev)
{
  if (ev.getType()!=SceneEvent::SCE_SCENE_ONLOADED)
    return;

  // Loaded from QSC file
  // Apply styles
  if (!getStyleNames().isEmpty())
    m_pStyles->applyStyle(this);

  // XXX 2016/05/29: Scene event has to be handled for detecting
  //   the color profile change (and resulting redraw)
/*
  // Scene event is no more required, after the styles are applied.
  // --> Detach from scene events.
  ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->removeListener(this);
*/
  
  return;
}

void Renderer::displayLabels(DisplayContext *pdc)
{

}

////////////////////////////////////////////

void Renderer::processHit(DisplayContext *pdc)
{
  MB_DPRINTLN("Renderer.processHit: scene=%d, rend=%d, obj=%d", m_nSceneID, m_uid, m_nClientObj);

  pdc->startHit(m_uid);
  displayHit(pdc);
  pdc->endHit();
  return;

}

void Renderer::displayHit(DisplayContext *pdc)
{
}

bool Renderer::isHitTestSupported() const
{
  return false;
}

LString Renderer::interpHit(const gfx::RawHitData &)
{
  return NULL;
}

////////////////////////////////////////////

void Renderer::writeTo2(qlib::LDom2Node *pNode) const
{
  // Write properties of renderer
  super_t::writeTo2(pNode);

  LString sty = getStyleNames();
  if (!sty.isEmpty()) {
    pNode->appendStrAttr("style", sty);
  }

}

void Renderer::readFrom2(qlib::LDom2Node *pNode)
{
  // Read properties of renderer
  super_t::readFrom2(pNode);

  LDom2Node *pChNode = pNode->findChild("style");
  if (pChNode==NULL) return;
  LString sty = pChNode->getValue();
  if (sty.isEmpty()) return;

  // Only set names here (apply after the deserialization completed)
  m_pStyles->setStyleNames(sty);
  
}

////////////////////////////////////////////

bool Renderer::isTransp() const
{
  //return false;
  if ( qlib::isNear4(m_defAlpha, 1.0) )
    return false;
  else
    return true;
}

bool Renderer::isDispLater() const
{
  return false;
}

LString Renderer::toString() const
{
  return LString::format("Generic Renderer (%p)", this);
}

void Renderer::unloading()
{
}

bool Renderer::hasCenter() const
{
  return true;
}
