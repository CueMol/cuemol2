//
// Timer implementation using QT5 QTimer
//

#ifndef QT_TIMER_IMPL_HPP_INCLUDED
#define QT_TIMER_IMPL_HPP_INCLUDED

#include "qtgui.hpp"
#include <QtCore/QTimer>

class QtTimerImpl : public QObject
{
  Q_OBJECT;

private:
  QTimer *m_pTimer;
  
public:
  QtTimerImpl();
  
  virtual ~QtTimerImpl();

  void start(int msec) {
    m_pTimer->start(msec);
  }

  void stop() {
    m_pTimer->stop();
  }

public slots:
  void timerCallbackFunc();
  
  
signals:

};

#endif

