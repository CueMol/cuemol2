//
// Timer implementation using Win32 API
//

#ifndef SYSDEP_WIN_TIMERIMPL_HPP__
#define SYSDEP_WIN_TIMERIMPL_HPP__

#include "sysdep.hpp"

#include <qlib/LString.hpp>
#include <qlib/EventManager.hpp>

namespace sysdep {

  using qlib::LString;

  class SYSDEP_API WinTimerImpl : public qlib::TimerImpl
  {
  private:
    UINT m_nTimerID;

  public:
    WinTimerImpl();
    virtual ~WinTimerImpl();

    //virtual qlib::time_value getCurrentTime();

    virtual void start(qlib::time_value after);

    virtual void stop();

    static void CALLBACK timerCallbackFunc(HWND hWnd, UINT, UINT_PTR id, DWORD dwTime);

  };

}

#endif

