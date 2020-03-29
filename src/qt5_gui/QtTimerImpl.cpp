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
#ifdef WIN32
  tval = (qlib::time_value) ::GetTickCount();
#endif
#ifdef MB_MACOSX
  uint64_t abstime = mach_absolute_time();
  Nanoseconds nanos = AbsoluteToNanoseconds( *(AbsoluteTime *) &abstime );
  tval = UnsignedWideToUInt64(nanos)/1000000;
#endif
  // TO DO: Linux implementation
      
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
