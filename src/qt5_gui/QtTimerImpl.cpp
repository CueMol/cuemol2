//
// QT5 timer implementation
//

#define NO_USING_QTYPES
#include <common.h>
#include <qlib/EventManager.hpp>

#include "QtTimerImpl.hpp"
#include "moc_QtTimerImpl.cpp"

QtTimerImpl::QtTimerImpl()
{
  m_pTimer = new QTimer(this);
  connect(m_pTimer, SIGNAL(timeout()), this, SLOT(timerCallbackFunc()));
}

QtTimerImpl::~QtTimerImpl()
{
  delete m_pTimer;
}

void QtTimerImpl::timerCallbackFunc()
{
  // MB_DPRINTLN("*** TimerCallback Called");

  qlib::EventManager *pEM = qlib::EventManager::getInstance();
  pEM->performIdleTasks();
}

#ifdef WIN32
#  include <windows.h>
#endif

#ifdef MB_MACOSX
#include <CoreServices/CoreServices.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <unistd.h>
#endif

qlib::time_value QtTimerImpl::getCurrentTime()
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

void QtTimerImpl::start(qlib::time_value period)
{
  // period is in nanosec
  // QTimer's msec is std::chrono::milliseconds 

  m_pTimer->start(period / (1000*1000));
}

void QtTimerImpl::stop()
{
  m_pTimer->stop();
}

//static
void QtTimerImpl::init()
{
  qlib::EventManager::getInstance()->initTimer(new QtTimerImpl);
}

