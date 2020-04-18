//
// Timer implementation using QT5 QTimer
//

#pragma once

#include "qt5_gui.hpp"
#include <QtCore/QTimer>
#include <QElapsedTimer>
#include <qlib/EventManager.hpp>

class QtTimerImpl : public QObject, public qlib::TimerImpl
{
    Q_OBJECT;

private:
    QTimer *m_pTimer;

    QElapsedTimer *m_pElaTimer;

public:
    QtTimerImpl();

    virtual ~QtTimerImpl();

    /// Implementation

    virtual qlib::time_value getCurrentTime();

    virtual void start(qlib::time_value period);
    virtual void stop();

    // private:
    //   void startImpl(int msec) {
    //     m_pTimer->start(msec);
    //   }

    //   void stopImpl() {
    //     m_pTimer->stop();
    //   }

    /// static initialization / setup Event/Timer manager
    static void init();

public slots:
    void timerCallbackFunc();

signals:
};
