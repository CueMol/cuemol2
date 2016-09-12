//
// XPCOM timer implementation
//

#include "xpcom.hpp"
#include "XPCTimerImpl.hpp"

#include <qlib/LProcMgr.hpp>
#include <qsys/SceneManager.hpp>

#ifdef WIN32
#  include <windows.h>
#endif

#ifdef XP_MACOSX
#include <CoreServices/CoreServices.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <unistd.h>
#endif

#ifdef USE_XMLRPC
#  include <xmlrpc_bridge/XmlRpcMgr.hpp>
#endif

// #define USE_PERFTIMER 1

#ifdef USE_PERFTIMER
#  include <boost/timer/timer.hpp>
#endif

using namespace xpcom;

XPCTimerImpl::XPCTimerImpl()
{
  m_timer = do_CreateInstance("@mozilla.org/timer;1");
  start(1);

#ifdef USE_PERFTIMER
  m_pMesTimer = new boost::timer::cpu_timer();
#endif
}

XPCTimerImpl::~XPCTimerImpl()
{
  stop();
  
#ifdef USE_PERFTIMER
  boost::timer::cpu_timer *p = static_cast<boost::timer::cpu_timer *>(m_pMesTimer);
  delete p;
#endif
}

//static
void XPCTimerImpl::timerCallbackFunc(nsITimer *aTimer, void *aClosure)
{
  //MB_DPRINTLN("Timer: notified");

#ifdef USE_PERFTIMER
  XPCTimerImpl *pthis = static_cast<XPCTimerImpl *>(aClosure);
  boost::timer::cpu_timer *p = static_cast<boost::timer::cpu_timer *>(pthis->m_pMesTimer);
  p->start();
#endif

  qlib::LProcMgr *pPM = qlib::LProcMgr::getInstance();
  pPM->checkQueue();

  qlib::EventManager *pEM = qlib::EventManager::getInstance();
  pEM->messageLoop();
  pEM->checkTimerQueue();

#ifdef USE_XMLRPC
  xrbr::XmlRpcMgr *pXRM = xrbr::XmlRpcMgr::getInstance();
  pXRM->processReq(1000);
#endif

  qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
  pSM->checkAndUpdateScenes();

#ifdef USE_PERFTIMER
  p->stop();
  boost::timer::cpu_times t = p->elapsed();
  //LString msg = boost::timer::format(t);
  //MB_DPRINTLN("Block time=%s", msg.c_str());
  pSM->setBusyTime(t.wall);
#endif

  return;
}

qlib::time_value XPCTimerImpl::getCurrentTime()
{
  qlib::time_value tval;
#ifdef WIN32
  tval = (qlib::time_value) ::GetTickCount();
#endif
#ifdef XP_MACOSX
  uint64_t abstime = mach_absolute_time();
  Nanoseconds nanos = AbsoluteToNanoseconds( *(AbsoluteTime *) &abstime );
  tval = UnsignedWideToUInt64(nanos)/1000000;
#endif

  return tval;
}

void XPCTimerImpl::start(qlib::time_value nperiod)
{
  if (!m_timer)
    return;

  nsresult rv = m_timer->InitWithFuncCallback(timerCallbackFunc, this, nperiod, nsITimer::TYPE_REPEATING_SLACK);
  if (NS_FAILED(rv)) {
    m_timer = nullptr;
    MB_DPRINTLN(">>>>> Setup idle timer ERROR!!");
  }
  else {
    MB_DPRINTLN("Timer> Setup idle timer OK");
  }
}

void XPCTimerImpl::stop()
{
  if (m_timer) {
    m_timer->Cancel();
    m_timer = nullptr;
  }
}

