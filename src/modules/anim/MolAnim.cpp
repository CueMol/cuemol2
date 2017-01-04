// -*-Mode: C++;-*-
//
// realnum-value property animation
//

#include <common.h>

#include "MolAnim.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/Object.hpp>

using namespace anim;
using qsys::ObjectPtr;

MolAnim::MolAnim()
  : super_t(), m_startValue(0.0), m_endValue(1.0), m_bNotifyPropEvt(false)
{
}

MolAnim::MolAnim(const MolAnim &arg)
  : super_t(arg), m_startValue(arg.m_startValue), m_endValue(arg.m_endValue), m_bNotifyPropEvt(arg.m_bNotifyPropEvt)
{
}

MolAnim::~MolAnim()
{
}

bool MolAnim::fillCache(qsys::ScenePtr pScene)
{
  if (!m_pObj.isnull())
    return true;
  m_pObj = pScene->getObjectByName(m_molName);
  if (!m_pObj.isnull())
    return true;
  return false;
}

void MolAnim::getTgtUIDs(AnimMgr *pMgr, std::vector<qlib::uid_t> &arry)
{
  arry.reserve(1);

  fillCache(pMgr->getTgtScene());
  if (!m_pObj.isnull())
    arry.push_back(m_pObj->getUID());
}

void MolAnim::onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid)
{
  ObjectPtr pTgtObj = qsys::SceneManager::getObjectS(tgt_uid);
  if (pTgtObj.isnull()) {
    LOG_DPRINTLN("MolAnim.onPropInit> Unknown tgt uid %d", int(tgt_uid));
    return;
  }
  qlib::LVariant var(m_startValue);
  pTgtObj->setProperty(getPropName(), var);
}

void MolAnim::onStart(qlib::time_value elapsed, AnimMgr *pMgr)
{
  qlib::LVariant var(m_startValue);
  LString propname = getPropName();

  fillCache(pMgr->getTgtScene());
  if (!m_pObj.isnull())
    m_pObj->setProperty(propname, var);
}

void MolAnim::onTimer(qlib::time_value elapsed, AnimMgr *pMgr)
{
  const double rho = getRho(elapsed);
  
  // MB_DPRINTLN("spin(%s) rho=%f", getName().c_str(), rho);
  double value = m_startValue*(1.0-rho) + m_endValue*rho;

  qlib::LVariant var(value);
  LString propnm = getPropName();

  fillCache(pMgr->getTgtScene());
  if (!m_pObj.isnull()) {
    if (m_bNotifyPropEvt)
      m_pObj->setProperty(propnm, var);
    else
      m_pObj->setPropertyImpl(propnm, var);
  }
}

void MolAnim::onEnd(qlib::time_value elapsed, AnimMgr *pMgr)
{
  qlib::LVariant var(m_endValue);
  LString propnm = getPropName();

  fillCache(pMgr->getTgtScene());
  if (!m_pObj.isnull())
    m_pObj->setProperty(propnm, var);
}

