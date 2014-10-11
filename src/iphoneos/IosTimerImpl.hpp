//
// Timer implementation using iOS API
//

#ifndef IOS_TIMER_IMPL_HPP__
#define IOS_TIMER_IMPL_HPP__

#import <QuartzCore/QuartzCore.h>

#include <qlib/LString.hpp>
#include <qlib/EventManager.hpp>

@interface TimerCallback : NSObject
{
}
- (void)onTimer;
@end

using qlib::LString;

class IosTimerImpl : public qlib::TimerImpl
{
private:
  //UINT m_nTimerID;

  CFAbsoluteTime m_tStart;

  TimerCallback *m_pCB;
  CADisplayLink *m_pDisplayLink;

public:
  IosTimerImpl();
  virtual ~IosTimerImpl();

  virtual qlib::time_value getCurrentTime();

  virtual void start(qlib::time_value after);

  virtual void stop();

  //static void CALLBACK timerCallbackFunc(HWND hWnd, UINT, UINT_PTR id, DWORD dwTime);

};

#endif

