//
// XPCOM timer implementation
//

#ifndef XPC_TIMERIMPL_HPP__
#define XPC_TIMERIMPL_HPP__

#include <nsCOMPtr.h>
#include <nsITimer.h>
#include <nsIObserver.h>

#include <qlib/LString.hpp>
#include <qlib/EventManager.hpp>

namespace xpcom {

  using qlib::LString;

  class XPCTimerImpl : public qlib::TimerImpl
  {
  private:

    // Timer used for notification
    nsCOMPtr<nsITimer> m_timer;

  public:
    void *m_pMesTimer;

  public:
    XPCTimerImpl();
    virtual ~XPCTimerImpl();

    //virtual qlib::time_value getCurrentTime();

    virtual void start(qlib::time_value nperiod);

    virtual void stop();

    static void timerCallbackFunc(nsITimer *aTimer, void *aClosure);
  };

}

#endif

