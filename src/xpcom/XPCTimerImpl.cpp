//
// XPCOM timer implementation
//

#include <common.h>

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

#include <xmlrpc_bridge/RMIMgr.hpp>

using namespace xpcom;

XPCTimerImpl::XPCTimerImpl()
{
  m_timer = do_CreateInstance("@mozilla.org/timer;1");
  start(30);
}

XPCTimerImpl::~XPCTimerImpl()
{
  stop();
}

//static
void XPCTimerImpl::timerCallbackFunc(nsITimer *aTimer, void *aClosure)
{
  //MB_DPRINTLN("Timer: notified");

  qlib::LProcMgr *pPM = qlib::LProcMgr::getInstance();
  pPM->checkQueue();

  qlib::EventManager *pEM = qlib::EventManager::getInstance();
  pEM->messageLoop();
  pEM->checkTimerQueue();

  xrbr::RMIMgr *pXRM = xrbr::RMIMgr::getInstance();
  pXRM->processReq(1000);

  qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
  pSM->checkAndUpdateScenes();
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

