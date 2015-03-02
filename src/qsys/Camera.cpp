// -*-Mode: C++;-*-
//
// Camera object implementaion
//
// $Id: Camera.cpp,v 1.3 2010/09/22 16:59:39 rishitani Exp $
//

#include <common.h>

#include "Camera.hpp"
#include "Scene.hpp"
#include "SceneManager.hpp"
#include "ScrEventManager.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Stream.hpp>

using namespace qsys;

Camera::Camera()
     :  m_pVisSetNodes(NULL)
{
  //m_fSlabDepth = 50.0;
  //m_fZoom = 50.0;
  m_center = qlib::Vector4D(0,0,0);
  m_rotQuat = qlib::LQuat(1, 0, 0, 0);

  // m_fStereoDist = 1.0;
  // m_nStereoMode = 0;
  // m_fPerspec = false;

  resetAllProps();
}

void Camera::copyFrom(const Camera&r)
{
  if (!r.m_visset.empty()) {
    LOG_DPRINTLN("Warning: copy of non-empty visflags camera <%s>", r.m_name.c_str());
  }
  
  m_name = r.m_name;
  m_source = r.m_source;

  m_nStereoMode = r.m_nStereoMode;
  setDefaultPropFlag("stereoMode", false);

  m_fStereoDist = r.m_fStereoDist;
  setDefaultPropFlag("stereoDist", false);

  m_fPerspec = r.m_fPerspec;
  setDefaultPropFlag("perspec", false);

  m_center = r.m_center;

  m_rotQuat = r.m_rotQuat;

  m_fSlabDepth = r.m_fSlabDepth;
  setDefaultPropFlag("slab", false);

  m_fZoom = r.m_fZoom;
  setDefaultPropFlag("zoom", false);

  m_dCamDist = r.m_dCamDist;
  setDefaultPropFlag("distance", false);

  m_nCenterMark = r.m_nCenterMark;
  setDefaultPropFlag("centerMark", false);

}

bool Camera::equals(const Camera &r)
{
  if (!m_name.equals(r.m_name))
    return false;

  if (m_nStereoMode!=r.m_nStereoMode)
    return false;

  if (!qlib::isNear4(m_fStereoDist, r.m_fStereoDist))
    return false;

  if (m_fPerspec!=r.m_fPerspec)
    return false;

  if (!m_center.equals(r.m_center, F_EPS4))
    return false;

  if (!m_rotQuat.equals(r.m_rotQuat, F_EPS4))
    return false;

  if (!qlib::isNear4(m_fSlabDepth, r.m_fSlabDepth))
    return false;

  if (!qlib::isNear4(m_fZoom, r.m_fZoom))
    return false;

  if (!qlib::isNear4(m_dCamDist, r.m_dCamDist))
    return false;

  if (m_nCenterMark!=r.m_nCenterMark)
    return false;

  return true;
}

/////////

void Camera::writeTo2(qlib::LDom2Node *pNode) const
{
  super_t::writeTo2(pNode);

  if (m_visset.empty())
    return;
  
  // write visibility settings
  qlib::LDom2Node *pChNode = pNode->appendChild("visibilities");
  VisSetting::const_iterator i = m_visset.begin();
  VisSetting::const_iterator ie = m_visset.end();
  for (; i!=ie; ++i) {
    qlib::uid_t uid = i->first;
    if (i->second.bObj) {
      ObjectPtr pObj = SceneManager::getObjectS(uid);
      if (!pObj.isnull()) {
        qlib::LDom2Node *pChChNode = pChNode->appendChild("object");
        pChChNode->setValue(i->second.bVis?"true":"false");
        pChChNode->setStrAttr("target", pObj->getName());
        // pChChNode->setStrAttr("type", "object");
      }
    }
    else {
      RendererPtr pRend = SceneManager::getRendererS(uid);
      ObjectPtr pObj = pRend->getClientObj();
      if (!pRend.isnull()) {
        qlib::LDom2Node *pChChNode = pChNode->appendChild("renderer");
        pChChNode->setValue(i->second.bVis?"true":"false");
        pChChNode->setStrAttr("target", pRend->getName());
        pChChNode->setStrAttr("type", pRend->getTypeName());
        if (!pObj.isnull())
          pChChNode->setStrAttr("client", pObj->getName());
      }
    }
  }  
}

void Camera::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  qlib::LDom2Node *pVisSet = pNode->findChild("visibilities");
  if (pVisSet!=NULL) {
    m_pVisSetNodes = MB_NEW qlib::LDom2Node(*pVisSet);
    return;
  }
}

void Camera::loadVisSetFromNodes(ScenePtr pScene)
{
  if (m_pVisSetNodes==NULL)
    return;
  m_visset.clear();
  
  // convert visset nodes to m_visset hash table
  qlib::LDom2Node *pVisSet = m_pVisSetNodes;
  for (pVisSet->firstChild(); pVisSet->hasMoreChild(); pVisSet->nextChild()) {
    qlib::LDom2Node *pChNode = pVisSet->getCurChild();
    LString tag = pChNode->getTagName();
    LString sVis = pChNode->getValue();
    bool bVis = false;
    if (sVis.equalsIgnoreCase("true"))
      bVis = true;

    if (tag.equals("object")) {
      LString tgt = pChNode->getStrAttr("target");
      ObjectPtr pObj = pScene->getObjectByName(tgt);
      if (pObj.isnull()) {
        LOG_DPRINTLN("loadVisSet> unknown target object <%s>", pObj->getName());
        continue;
      }
      m_visset.set(pObj, bVis);
    }
    else if (tag.equals("renderer")) {
      LString tgt = pChNode->getStrAttr("target");
      LString cli = pChNode->getStrAttr("client");
      LString type = pChNode->getStrAttr("type");
      ObjectPtr pObj = pScene->getObjectByName(cli);
      if (pObj.isnull()) {
        LOG_DPRINTLN("loadVisSet> unknown client object <%s> for rend <%s>", cli.c_str(), tgt.c_str());
        continue;
      }
      RendererPtr pRend;
      pRend = pObj->getRendByName(tgt, type);
      if (pRend.isnull()) {
        LOG_DPRINTLN("loadVisSet> unknown renderer <%s>", tgt.c_str());
        continue;
      }
      m_visset.set(pRend, bVis);
    }
    else {
      // ERROR (ignore)
      LOG_DPRINTLN("Camera.readFrom() unknown tag %s", tag.c_str());
    }
  }
  
  // cleanup the viset nodes
  delete m_pVisSetNodes;
  m_pVisSetNodes = NULL;
}


void Camera::updateSrcPath(const LString &srcpath)
{
  m_source = srcpath;
}

/// Save camera to the local file
void Camera::writeFile(const LString &aLocalFile) const
{
  //LString path = resolveBasePath(aLocalFile);
  LString path = aLocalFile;
  
  qlib::FileOutStream fis;
  fis.open(path);
  qlib::LDom2OutStream ois(fis);
  
  qlib::LDom2Tree tree("camera");
  
  // Camera obj --> LDOM2 tree
  // top node doesn't use type attribute as object's typename
  tree.serialize(const_cast<Camera*>(this), false);
  
  // LDOM2 tree --> Stream (local file)
  ois.write(&tree);
  // tree.top()->dump();
}

// void Camera::readFromPath(const LString &path)
void Camera::readFromStream(qlib::InStream &ins)
{
  qlib::LDom2InStream ois(ins);
  
  qlib::LDom2Tree tree;
  ois.read(tree);
  //tree.top()->dump();

  tree.deserialize(this);
}

////////////////////////////////////////////////////////////
// Visibility flags management

void Camera::visAppend(qlib::uid_t tgtid, bool bObj)
{
  VisSetting::iterator i = m_visset.find(tgtid);
  if (i!=m_visset.end())
    return; // ERROR??
  
  if (bObj) {
    ObjectPtr pObj = SceneManager::getObjectS(tgtid);
    m_visset.save(pObj);
  }
  else {
    RendererPtr pRend = SceneManager::getRendererS(tgtid);
    m_visset.save(pRend);
  }

  // undo/redo
}

bool Camera::visRemove(qlib::uid_t tgtid)
{
  VisSetting::iterator i = m_visset.find(tgtid);
  if (i==m_visset.end())
    return false;
  m_visset.erase(i);

  // undo/redo

  return true;
}

bool Camera::visChange(qlib::uid_t tgtid, bool bVis)
{
  VisSetting::iterator i = m_visset.find(tgtid);
  if (i==m_visset.end())
    return false;

  i->second.bVis = bVis;

  // undo/redo

  return true;
}

/////

void Camera::clearVisSettings()
{
  while (getVisSize()>0) {
    VisSetting::iterator i = m_visset.begin();
    visRemove(i->first);
  }
  // m_visset.clear();
  if (m_pVisSetNodes!=NULL) {
    delete m_pVisSetNodes;
    m_pVisSetNodes = NULL;
  }
}

void Camera::saveVisSettings(ScenePtr pScene)
{
  clearVisSettings();
  
  Scene::ObjIter oi = pScene->beginObj();
  Scene::ObjIter oie = pScene->endObj();
  for (; oi!=oie; ++oi) {
    ObjectPtr pObj = oi->second;
    // m_visset.save(pObj);
    visAppend(oi->first, true);

    Object::RendIter ri = pObj->beginRend();
    Object::RendIter rie = pObj->endRend();
    for (; ri!=rie; ++ri) {
      // RendererPtr pRend = ri->second;
      // m_visset.save(pRend);
      visAppend(ri->first, false);
    }
    
  }
  
}

void Camera::loadVisSettings(ScenePtr pScene) const
{
  if (m_visset.empty())
    return;
  
  VisSetting::const_iterator i = m_visset.begin();
  VisSetting::const_iterator ie = m_visset.end();
  for (; i!=ie; ++i) {
    qlib::uid_t uid = i->first;
    if (i->second.bObj) {
      ObjectPtr pObj = pScene->getObject(uid);
      if (!pObj.isnull()) {
        //pObj->setVisible(i->second.bVis);
        pObj->setPropBool("visible", i->second.bVis);
      }
    }
    else {
      RendererPtr pRend = pScene->getRenderer(uid);
      if (!pRend.isnull()) {
        //pRend->setVisible(i->second.bVis);
        pRend->setPropBool("visible", i->second.bVis);
      }
    }
  }
}

LString Camera::getVisSetJSON() const
{
  LString rval;

  if (m_visset.empty())
    return rval;
  
  rval += "{";

  VisSetting::const_iterator i = m_visset.begin();
  VisSetting::const_iterator ie = m_visset.end();
  bool bfirst = true;
  for (; i!=ie; ++i) {
    if (bfirst) {
      bfirst = false;
    }
    else {
      rval += ",";
    }

    qlib::uid_t uid = i->first;
    rval += LString::format("\"%d\": ", uid);

    if (i->second.bObj) {
      rval += "{";
      rval += "\"type\": \"object\",";
      rval += "\"include\": true,";
      rval += "\"visible\":";
      rval += (i->second.bVis)?"true":"false";
      rval += "}";
    }
    else {
      rval += "{";
      rval += "\"type\": \"renderer\",";
      rval += "\"include\": true,";
      rval += "\"visible\":";
      rval += (i->second.bVis)?"true":"false";
      rval += "}";
    }
  }

  rval += "}";

  return rval;
}


//////////

void VisSetting::save(ObjectPtr pObj)
{
  VisSetElem vse;
  vse.bVis = pObj->isVisible();
  vse.bObj = true;
  qlib::uid_t uid = pObj->getUID();
  super_t::insert(super_t::value_type(uid, vse));
}

void VisSetting::save(RendererPtr pRend)
{
  VisSetElem vse;
  vse.bVis = pRend->isVisible();
  vse.bObj = false;
  qlib::uid_t uid = pRend->getUID();
  super_t::insert(super_t::value_type(uid, vse));
}

void VisSetting::set(ObjectPtr pObj, bool b)
{
  VisSetElem vse;
  vse.bVis = b;
  vse.bObj = true;
  qlib::uid_t uid = pObj->getUID();
  super_t::insert(super_t::value_type(uid, vse));
}

void VisSetting::set(RendererPtr pRend, bool b)
{
  VisSetElem vse;
  vse.bVis = b;
  vse.bObj = false;
  qlib::uid_t uid = pRend->getUID();
  super_t::insert(super_t::value_type(uid, vse));
}

//////////////////////////////////////////////////////////////////////////////////////////

CameraEvent::~CameraEvent()
{
}

qlib::LCloneableObject *CameraEvent::clone() const
{
  return MB_NEW CameraEvent(*this);
}

LString CameraEvent::getJSON() const
{
  return "{\"name\":\""+m_name.escapeQuots()+"\"}";
}

bool CameraEvent::getCategory(LString &category, int &nSrcType, int &nEvtType) const
{
  category = getDescr();
  nEvtType = getType();
  nSrcType = ScrEventManager::SEM_CAMERA;
  return true;
}


