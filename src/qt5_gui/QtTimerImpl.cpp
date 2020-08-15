//
// QT5 timer implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtTimerImpl.hpp"

#include "moc_QtTimerImpl.cpp"
#include <qlib/EventManager.hpp>

#include <QThread>

QtTimerImpl::QtTimerImpl()
{
    auto *pthr = QThread::currentThread();
    printf("thread: %p\n", pthr);

    m_pTimer = new QTimer(this);
    m_pTimer->setSingleShot(false);
    connect(m_pTimer, SIGNAL(timeout()), this, SLOT(timerCallbackFunc()));

    m_pElaTimer = new QElapsedTimer();
    m_pElaTimer->start();
}

QtTimerImpl::~QtTimerImpl()
{
    delete m_pTimer;
    delete m_pElaTimer;
}

void QtTimerImpl::timerCallbackFunc()
{
    LOG_DPRINTLN("*** TimerCallback Called");

    qlib::EventManager *pEM = qlib::EventManager::getInstance();
    pEM->performIdleTasks();
}

qlib::time_value QtTimerImpl::getCurrentTime()
{
    qlib::time_value tval;
    auto elapsed = m_pElaTimer->nsecsElapsed();
    tval = qlib::time_value(elapsed);
    // MB_DPRINTLN("getCurrrentTime: %f", double(tval));
    return tval;
}

void QtTimerImpl::start(qlib::time_value period)
{
    // period is in nanosec
    // QTimer's msec is std::chrono::milliseconds

    //m_pTimer->start(period / (1000 * 1000));
    m_pTimer->start();
}

void QtTimerImpl::stop()
{
    //m_pTimer->stop();
}

// static
void QtTimerImpl::init()
{
    QtTimerImpl *ptimer = new QtTimerImpl();
    qlib::EventManager::getInstance()->initTimer(ptimer);
    ptimer->start(1);
}
