// -*-Mode: C++;-*-
//
// SlideInOutAnim: slide in/out animation of renderers
//

#include <common.h>

#include "SlideInOutAnim.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/Renderer.hpp>
#include <qsys/SceneManager.hpp>

using namespace anim;
using qlib::Matrix4D;

SlideInOutAnim::SlideInOutAnim()
     : super_t()
{
  m_bHide = false;
  m_direction = 0.0;
  m_distance = 1.0;
}

SlideInOutAnim::SlideInOutAnim(const SlideInOutAnim &arg)
     : super_t(arg), m_bHide(arg.m_bHide), m_direction(arg.m_direction), m_distance(arg.m_distance)
{
}

SlideInOutAnim::~SlideInOutAnim()
{
}

/// convert distance/angle to dpos
void SlideInOutAnim::convDistDir(AnimMgr *pMgr)
{
  CameraPtr pWCam = pMgr->getWorkCam();
  const double zoom = pWCam->getZoom();
  
  double d = zoom * m_distance;
  double th = qlib::toRadian(m_direction);
  Vector4D v1(d * ::cos(th), d * ::sin(th), 0.0);

  if (m_bHide) {
    setStartDPos(Vector4D());
    setEndDPos(v1);
  }
  else {
    setStartDPos(v1);
    setEndDPos(Vector4D());
  }
}

void SlideInOutAnim::onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid)
{
  convDistDir(pMgr);
  super_t::onPropInit(pMgr, tgt_uid);

  RendererPtr pTgtRend = qsys::SceneManager::getRendererS(tgt_uid);
  if (pTgtRend.isnull()) {
    LOG_DPRINTLN("ShowHideAnim.onPropInit> Unknown tgt uid %d", int(tgt_uid));
    return;
  }

  if (m_bHide) {
    // Hide mode
    // init state: shown
    setVisible(pTgtRend, true);
  }
  else {
    // Show mode
    // init state: hidden
    setVisible(pTgtRend, false);
  }
}

void SlideInOutAnim::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  convDistDir(pMgr);
  super_t::onStart(elapsed, pMgr);  

  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;

    if (m_bHide) {
      setVisible(pRend, true);
    }
    else {
      setVisible(pRend, false);
    }
  }
}

void SlideInOutAnim::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
  // convDistDir(pMgr);
  super_t::onTimer(elapsed, pMgr);  

  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;

    // hiding/showing
    setVisible(pRend, true);
  }
}

void SlideInOutAnim::onEnd(qlib::time_value elapsed, AnimMgr *pMgr)
{
  // convDistDir(pMgr);
  super_t::onTimer(elapsed, pMgr);  

  Matrix4D ident;

  // rend array should be filled here!!
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;

    if (m_bHide) {
      // Hiding
      setVisible(pRend, false);
      // Finally, we reset the renderer to the original position (and hidden)
      pRend->setXformMatrix(ident);
    }
    else {
      // showing
      setVisible(pRend, true);
    }

  }
}

LString SlideInOutAnim::getPropName() const
{
  return LString("visible");
}

void SlideInOutAnim::setPropName(LString val)
{
}

