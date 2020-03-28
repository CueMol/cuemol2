//
// Timer implementation using QT5 QTimer
//

#pragma once

#include "qt5_gui.hpp"
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
