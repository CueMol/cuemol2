// -*-Mode: C++;-*-
//
// Camera object implementaion
//
// $Id: Camera.cpp,v 1.3 2010/09/22 16:59:39 rishitani Exp $
//

#include <common.h>

#include "Camera.hpp"
#include "ScrEventManager.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Stream.hpp>

using namespace qsys;

Camera::Camera()
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


