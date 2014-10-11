// -*-Mode: C++;-*-
//
// ShowHideAnim: renderer show/hide animation
//

#include <common.h>

#include "ShowHideAnim.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/Renderer.hpp>
#include <qsys/SceneManager.hpp>

using namespace anim;
using qsys::Renderer;

ShowHideAnim::ShowHideAnim()
     : super_t(), m_bHide(false), m_bFade(true), m_dTgtAlpha(1.0)
{
}

ShowHideAnim::ShowHideAnim(const ShowHideAnim &arg)
     : super_t(arg), m_bHide(arg.m_bHide), m_bFade(arg.m_bFade), m_dTgtAlpha(arg.m_dTgtAlpha)
{
}

ShowHideAnim::~ShowHideAnim()
{
}

LString ShowHideAnim::getPropName() const
{
  // always return visible as a target prop
  return LString("visible");
}

void ShowHideAnim::setPropName(LString val)
{
}

void ShowHideAnim::onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid)
{
  RendererPtr pTgtRend = qsys::SceneManager::getRendererS(tgt_uid);
  if (pTgtRend.isnull()) {
    LOG_DPRINTLN("ShowHideAnim.onPropInit> Unknown tgt uid %d", int(tgt_uid));
    return;
  }

  if (m_bHide) {
    setVisible(pTgtRend, true);
    if (m_bFade)
      pTgtRend->setPropReal("alpha", m_dTgtAlpha);
  }
  else {
    MB_DPRINTLN("ShowHideAnim.onPropInit> SetVisible FALSE!!!");
    setVisible(pTgtRend, false);
    if (m_bFade)
      pTgtRend->setPropReal("alpha", 0.0);
  }
}

void ShowHideAnim::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  fillRendArray(pMgr->getTgtScene());
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;

    if (m_bHide) {
      setVisible(pRend, true);
      if (m_bFade)
        pRend->setPropReal("alpha", m_dTgtAlpha);
    }
    else {
      MB_DPRINTLN("ShowHideAnim.onStart> SetVisible FALSE!!!");
      setVisible(pRend, false);
      if (m_bFade)
        pRend->setPropReal("alpha", 0.0);
    }

  }
}

void ShowHideAnim::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
  const double rho = getRho(elapsed);
  
  // rend array should be filled here!!
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;

    if (m_bHide) {
      // hiding
      setVisible(pRend, true);
      if (m_bFade) 
        pRend->setPropReal("alpha", (1.0-rho)*m_dTgtAlpha);
    }
    else {
      // showing
      MB_DPRINTLN("ShowHideAnim.onTimer> SetVisible TRUE!!!");
      setVisible(pRend, true);
      if (m_bFade) {
        pRend->setPropReal("alpha", rho*m_dTgtAlpha);
	MB_DPRINTLN("ShowHideAnim.onTimer> SetAlpha %f!", rho);
      }
    }

  }
}

void ShowHideAnim::onEnd(qlib::time_value elapsed, AnimMgr *pMgr)
{
  // rend array should be filled here!!
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;

    if (m_bHide) {
      // hiding
      setVisible(pRend, false);
      if (m_bFade)
        pRend->setPropReal("alpha", m_dTgtAlpha);
    }
    else {
      // showing
      MB_DPRINTLN("ShowHide.onEnd> SetVisible TRUE!!!");
      setVisible(pRend, true);
      if (m_bFade)
        pRend->setPropReal("alpha", m_dTgtAlpha);
    }

  }
}

