// -*-Mode: C++;-*-
//
// realnum-value property animation
//

#include <common.h>

#include "RealPropAnim.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/Renderer.hpp>
#include <qsys/SceneManager.hpp>

using namespace anim;
using qsys::Renderer;

RealPropAnim::RealPropAnim()
     : super_t(), m_startValue(0.0), m_endValue(1.0)
{
}

RealPropAnim::RealPropAnim(const RealPropAnim &arg)
     : super_t(arg), m_startValue(arg.m_startValue), m_endValue(arg.m_endValue)
{
}

RealPropAnim::~RealPropAnim()
{
}

void RealPropAnim::onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid)
{
  RendererPtr pTgtRend = qsys::SceneManager::getRendererS(tgt_uid);
  if (pTgtRend.isnull()) {
    LOG_DPRINTLN("RealPropAnim.onPropInit> Unknown tgt uid %d", int(tgt_uid));
    return;
  }
  qlib::LVariant var(m_startValue);
  pTgtRend->setProperty(getPropName(), var);
}

void RealPropAnim::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  qlib::LVariant var(m_startValue);
  LString propname = getPropName();

  fillRendArray(pMgr->getTgtScene());
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;
    pRend->setProperty(propname, var);
  }
}

void RealPropAnim::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
  const double rho = getRho(elapsed);
  
  // MB_DPRINTLN("spin(%s) rho=%f", getName().c_str(), rho);
  double value = m_startValue*(1.0-rho) + m_endValue*rho;

  qlib::LVariant var(value);
  LString propnm = getPropName();

  // rend array should be filled here!!
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;
    pRend->setProperty(propnm, var);
  }
}

void RealPropAnim::onEnd(qlib::time_value elapsed, AnimMgr *pMgr)
{
  qlib::LVariant var(m_endValue);
  LString propnm = getPropName();

  // rend array should be filled here!!
  rendlist_t::const_iterator riter = rendBegin();
  rendlist_t::const_iterator rend = rendEnd();
  for (; riter!=rend; ++riter) {
    RendererPtr pRend = *riter;
    pRend->setProperty(propnm, var);
  }
}

