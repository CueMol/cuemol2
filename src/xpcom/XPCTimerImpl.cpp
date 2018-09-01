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

#include <qlib/LPerfMeas.hpp>

#ifdef USE_XMLRPC
#  include <xmlrpc_bridge/XmlRpcMgr.hpp>
#endif

using namespace xpcom;

XPCTimerImpl::XPCTimerImpl()
{
  m_timer = do_CreateInstance("@mozilla.org/timer;1");
  start(1);
}

XPCTimerImpl::~XPCTimerImpl()
{
  stop();
}

//static
void XPCTimerImpl::timerCallbackFunc(nsITimer *aTimer, void *aClosure)
{
  // MB_DPRINTLN("Timer: notified");

  qlib::EventManager *pEM = qlib::EventManager::getInstance();
  pEM->performIdleTasks();

  return;
}

#if 0
qlib::time_value XPCTimerImpl::getCurrentTime()
{
  qlib::time_value tval;
#if defined(WIN32)
  tval = qlib::time_value( ::GetTickCount() );
  // conv from milli-sec to nano-sec repr
  tval *= qlib::time_value(1000000);
#elif defined(XP_MACOSX)
  uint64_t abstime = mach_absolute_time();
  Nanoseconds nanos = AbsoluteToNanoseconds( *(AbsoluteTime *) &abstime );
  //tval = UnsignedWideToUInt64(nanos)/1000000;
  tval = UnsignedWideToUInt64(nanos);
#else
  // UNIX (linux, etc)
  timeval tv;
  gettimeofday(&tv, NULL);
  tval = qlib::time_value(tv.tv_sec) * qlib::time_value(1000000) +
    qlib::time_value(tv.tv_usec);
  // conv from micro-sec to nano-sec repr
  tval *= qlib::time_value(1000);
#endif

  return tval;
}
#endif

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

