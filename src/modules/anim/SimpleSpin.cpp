// -*-Mode: C++;-*-
//
// Simple spin animation
//

#include <common.h>

#include "SimpleSpin.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/Camera.hpp>

using namespace anim;
using qsys::CameraPtr;

SimpleSpin::SimpleSpin()
     : super_t(), m_angle(0.0), m_axis(0,1,0)
{
}

SimpleSpin::SimpleSpin(const SimpleSpin &arg)
     : super_t(arg), m_angle(arg.m_angle), m_axis(arg.m_axis)
{
}

SimpleSpin::~SimpleSpin()
{
}

void SimpleSpin::setAxis(const Vector4D &val)
{
  double len = val.length();
  if (qlib::isNear4(len, 0.0)) {
    LOG_DPRINTLN("SimpleSpin> ERROR: axis length is too small!!");
    return;
  }
  m_axis = val.divide(len);
}

void SimpleSpin::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  m_anglRad2 = qlib::toRadian(m_angle)*0.5;
  m_endMulQ = qlib::LQuat(m_axis, m_anglRad2);
}

void SimpleSpin::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
  const double rho = getRho(elapsed);
  
  //MB_DPRINTLN("spin(%s) rho=%f", getName().c_str(), rho);

  qlib::LQuat quat(m_axis, m_anglRad2 * rho);

  CameraPtr pCam = pMgr->getWorkCam();
  pCam->m_rotQuat = pCam->m_rotQuat * quat;
}

void SimpleSpin::onTimerPost(qlib::time_value elapsed, AnimMgr *pMgr)
{
  CameraPtr pCam = pMgr->getWorkCam();
  pCam->m_rotQuat = pCam->m_rotQuat * m_endMulQ;
}
