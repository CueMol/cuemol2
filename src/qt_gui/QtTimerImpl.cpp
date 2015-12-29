//
// QT5 timer implementation
//

#define NO_USING_QTYPES
#include <common.h>
#include <qlib/EventManager.hpp>

#include "QtTimerImpl_moc.hpp"

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

