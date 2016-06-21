// -*-Mode: C++;-*-
//
// CamMotion: camera-motion animation object
//

#include <common.h>

#include "CamMotion.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qlib/LQuat.hpp>
#include <qsys/Camera.hpp>
#include <qsys/Scene.hpp>

using namespace anim;
using qsys::ScenePtr;

CamMotion::CamMotion()
     : super_t(), m_destCamName()
{
  m_bIgnoreCenter = false;
  m_bIgnoreRotate = false;
  m_bIgnoreZoom = false;
  m_bIgnoreSlab = false;
  m_bKeepQuatPositive = true;
}

CamMotion::CamMotion(const CamMotion &arg)
     : super_t(arg), m_destCamName(arg.m_destCamName)
{
  m_bIgnoreCenter = arg.m_bIgnoreCenter;
  m_bIgnoreRotate = arg.m_bIgnoreRotate;
  m_bIgnoreZoom = arg.m_bIgnoreZoom;
  m_bIgnoreSlab = arg.m_bIgnoreSlab;
  m_bKeepQuatPositive = arg.m_bKeepQuatPositive;
}

CamMotion::~CamMotion()
{
}

void CamMotion::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  super_t::onStart(elapsed, pMgr);

  ScenePtr pSce = pMgr->getTgtScene();
  CameraPtr pCam = pSce->getCamera(m_destCamName);

  if (!pCam.isnull()) {
    m_pStaCam = pMgr->getWorkCam();
    m_pEndCam = pCam;
  }
  else {
    m_pStaCam = CameraPtr();
    m_pEndCam = CameraPtr();
  }
}

void CamMotion::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
  const double rho = getRho(elapsed);

  // MB_DPRINTLN("camm(%s) rho=%f", getName().c_str(), rho);

  if (m_pStaCam.isnull()||m_pEndCam.isnull()) return;
  
  // update current
  CameraPtr pCam = pMgr->getWorkCam();

  if (!m_bIgnoreRotate) {
    // rotation
    LQuat qnow = LQuat::slerp(m_pStaCam->m_rotQuat,
                              m_pEndCam->m_rotQuat, rho,
                              m_bKeepQuatPositive);
    pCam->m_rotQuat = qnow;
  }
  
  if (!m_bIgnoreCenter) {
    // center
    Vector4D vnow = m_pStaCam->m_center.scale(1.0-rho) + m_pEndCam->m_center.scale(rho);
    pCam->m_center = vnow;
  }
    
  if (!m_bIgnoreZoom) {
    // zoom
    double znow = m_pStaCam->getZoom()*(1.0-rho) + m_pEndCam->getZoom()*rho;
    pCam->setZoom(znow);
  }
  
  if (!m_bIgnoreSlab) {
    // slab
    double snow = m_pStaCam->getSlabDepth()*(1.0-rho) + m_pEndCam->getSlabDepth()*rho;
    pCam->setSlabDepth(snow);
  }
}

void CamMotion::onTimerPost(qlib::time_value elapsed, AnimMgr *pMgr)
{
  if (m_pStaCam.isnull()||m_pEndCam.isnull()) return;
  //pMgr->setWorkCam(m_pEndCam);

  CameraPtr pCam = pMgr->getWorkCam();

  if (!m_bIgnoreRotate) {
    // rotation
    pCam->m_rotQuat = m_pEndCam->m_rotQuat;
  }
  
  if (!m_bIgnoreCenter) {
    // center
    pCam->m_center = m_pEndCam->m_center;
  }
    
  if (!m_bIgnoreZoom) {
    // zoom
    pCam->setZoom(m_pEndCam->getZoom());
  }
  
  if (!m_bIgnoreSlab) {
    // slab
    pCam->setSlabDepth(m_pEndCam->getSlabDepth());
  }
}

