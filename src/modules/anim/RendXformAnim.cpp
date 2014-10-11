// -*-Mode: C++;-*-
//
// renderer transformation animation
//

#include <common.h>

#include "RendXformAnim.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/Renderer.hpp>
#include <qsys/SceneManager.hpp>

using namespace anim;
using qlib::Matrix4D;

RendXformAnim::RendXformAnim()
     : super_t()
{
}

RendXformAnim::RendXformAnim(const RendXformAnim &arg)
     : super_t(arg), m_startDPos(arg.m_startDPos), m_endDPos(arg.m_endDPos)
{
}

RendXformAnim::~RendXformAnim()
{
}

void RendXformAnim::onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid)
{
  RendererPtr pTgtRend = qsys::SceneManager::getRendererS(tgt_uid);
  if (pTgtRend.isnull()) {
    LOG_DPRINTLN("RendXformAnim.onPropInit> Unknown tgt uid %d", int(tgt_uid));
    return;
  }

  Matrix4D xfmmat;
  xfmmat.translate(m_startDPos);
  pTgtRend->setXformMatrix(xfmmat);
}

void RendXformAnim::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  m_stDPosWld = m_startDPos;
  m_enDPosWld = m_endDPos;

  CameraPtr pWCam = pMgr->getWorkCam();
  Matrix4D rmat = Matrix4D::makeRotMat( pWCam->m_rotQuat.conj() );

  if (1) {
    rmat.xform3D(m_stDPosWld);
    rmat.xform3D(m_enDPosWld);
  }
  
  Matrix4D xfmmat;
  xfmmat.translate(m_stDPosWld);
  //m_pTgtRend->setXformMatrix(xfmmat);

  fillRendArray(pMgr->getTgtScene());
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;
    pRend->setXformMatrix(xfmmat);
  }
}

void RendXformAnim::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
  const double rho = getRho(elapsed);
  
  // MB_DPRINTLN("spin(%s) rho=%f", getName().c_str(), rho);
  // double value = m_startValue*(1.0-rho) + m_endValue*rho;
  Vector4D vnow = m_stDPosWld.scale(1.0-rho) + m_enDPosWld.scale(rho);
  
  Matrix4D xfmmat;
  xfmmat.translate(vnow);

  // rend array should have been filled here!!
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;
    pRend->setXformMatrix(xfmmat);
  }
}

void RendXformAnim::onEnd(qlib::time_value elapsed, AnimMgr *pMgr)
{
  Matrix4D xfmmat;
  xfmmat.translate(m_enDPosWld);

  // rend array should have been filled here!!
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;
    pRend->setXformMatrix(xfmmat);
  }
}

LString RendXformAnim::getPropName() const
{
  return LString("xformMat");
}

void RendXformAnim::setPropName(LString val)
{
}

