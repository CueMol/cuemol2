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
}

AnimObj::AnimObj(const AnimObj &arg)
     : m_name(arg.m_name), m_start(arg.m_start), m_end(arg.m_end)
{
  m_uid = qlib::ObjectManager::sRegObj(this);

  setQuadric(arg.m_quadric);
  m_bDisabled = arg.m_bDisabled;
}

AnimObj::~AnimObj()
{
  //qlib::ObjectManager::sUnregObj(m_uid);
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

void AnimObj::setStart(qlib::time_value value)
{
  m_start = value;
  if (m_start>m_end) {
    MB_DPRINTLN("warning: inconsistent end time (s=%d > e=%d) modified", int(m_start), int(m_end));
    m_end = value;
  }
}

void AnimObj::setEnd(qlib::time_value value)
{
  m_end = value;
  if (m_start>m_end) {
    MB_DPRINTLN("warning: inconsistent start time (s=%d > e=%d) modified", int(m_start), int(m_end));
    m_start = value;
  }
}

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

