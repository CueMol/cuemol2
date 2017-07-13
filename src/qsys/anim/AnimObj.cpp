// -*-Mode: C++;-*-
//
// abstract animation object
//

#include <common.h>

#include "AnimObj.hpp"
#include "AnimMgr.hpp"
#include <qlib/LQuat.hpp>
#include <qsys/Camera.hpp>

using namespace qsys;

AnimObj::AnimObj()
     : m_start(0), m_end(0)
{
  m_uid = qlib::ObjectManager::sRegObj(this);

  setQuadric(0.0);
  m_bDisabled = false;

  //m_refName = LString();
  m_relStart = 0;
  m_relEnd = 0;
}

AnimObj::AnimObj(const AnimObj &arg)
     : m_name(arg.m_name), m_start(arg.m_start), m_end(arg.m_end)
{
  m_uid = qlib::ObjectManager::sRegObj(this);

  setQuadric(arg.m_quadric);
  m_bDisabled = arg.m_bDisabled;

  m_refName = arg.m_refName;
  m_relStart = arg.m_relStart;
  m_relEnd = arg.m_relEnd;
}

AnimObj::~AnimObj()
{
  qlib::ObjectManager::sUnregObj(m_uid);
}

//////////////////////////////

void AnimObj::setQuadric(qlib::LReal val)
{
  if (val<0.01) {
    m_quadric = -0.0;
    m_coeff = 0.0;
    m_grad = 1.0;
    m_absc = 0.0;
  }
  else {
    m_quadric = qlib::trunc(val, 0.0, 0.5);
    m_coeff = 1.0/(2.0*m_quadric*(1.0-m_quadric));
    m_grad = 1.0/(1.0-m_quadric);
    m_absc = 0.5 * (1.0 - m_grad);
  }
}

void AnimObj::setRelStart(qlib::time_value value)
{
  m_relStart = value;
  if (m_relStart>m_relEnd) {
    LOG_DPRINTLN("warning: inconsistent end time (s=%d > e=%d) modified",
                 int(m_relStart), int(m_relEnd));
    m_relEnd = value;
  }

  LOG_DPRINTLN("AnimObj> rel_start changed to %d", m_relStart);
}

void AnimObj::setRelEnd(qlib::time_value value)
{
  m_relEnd = value;
  if (m_relStart>m_relEnd) {
    LOG_DPRINTLN("warning: inconsistent start time (s=%d > e=%d) modified",
                 int(m_relStart), int(m_relEnd));
    m_relStart = value;
  }

  LOG_DPRINTLN("AnimObj> rel_end changed to %d", m_relEnd);
}

void AnimObj::setTimeRefName(const LString &nm)
{
  m_refName = nm;
}

double AnimObj::getRho(qlib::time_value elapsed) const
{
  qlib::time_value span = getAbsEnd() - getAbsStart();

  //if (qlib::isNear4(span, 0.0)) {
  if (span==0) {
    // degenerated case (end==start)
    if (elapsed-getAbsStart()<0)
      return 0.0;
    else
      return 1.0;
  }

  double rho = double(elapsed-getAbsStart())/double(span);
  rho = qlib::trunc(rho, 0.0, 1.0);
  return convRho(rho);
}

//////////////

void AnimObj::onTimerPre(qlib::time_value elapsed, AnimMgr *pMgr)
{
}

void AnimObj::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
}

void AnimObj::onTimerPost(qlib::time_value elapsed, AnimMgr *pMgr)
{
}

void AnimObj::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  MB_DPRINTLN("AnimObj(%s) onStart called at %d", m_name.c_str(), int(elapsed));
}

void AnimObj::onEnd(qlib::time_value elapsed, AnimMgr *pMgr)
{
  MB_DPRINTLN("AnimObj(%s) onEnd called at %d", m_name.c_str(), int(elapsed));
}

