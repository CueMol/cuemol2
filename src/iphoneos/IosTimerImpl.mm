// -*-Mode: C++;-*-
//
// Timer implementation using iOS API
//

#include <common.h>
#import <QuartzCore/QuartzCore.h>

#include "IosTimerImpl.hpp"
#include <qsys/SceneManager.hpp>

IosTimerImpl::IosTimerImpl()
//  : m_nTimerID(0)
{
  m_tStart = CFAbsoluteTimeGetCurrent();

  TimerCallback *pCB = [TimerCallback alloc];
  m_pCB = pCB;

  start(30);
}

IosTimerImpl::~IosTimerImpl()
{
  stop();
  [m_pCB release];
}

qlib::time_value IosTimerImpl::getCurrentTime()
{
  qlib::time_value tval;

  //tval = (qlib::time_value) ::GetTickCount();

  CFAbsoluteTime curr = CFAbsoluteTimeGetCurrent();
  tval = qlib::time_value( curr*1000.0 );

  return tval;
}

///////////////////////////

@implementation TimerCallback
- (void)onTimer
{
  // MB_DPRINTLN("onTimer called!!");
  qlib::EventManager *pEM = qlib::EventManager::getInstance();
  pEM->messageLoop();
  pEM->checkTimerQueue();

  qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
  pSM->checkAndUpdateScenes();
}
@end

///////////////////////////

void IosTimerImpl::start(qlib::time_value after)
{
  CADisplayLink *aDisplayLink = [[UIScreen mainScreen] displayLinkWithTarget:m_pCB selector:@selector(onTimer)];
  [aDisplayLink setFrameInterval:1];
  [aDisplayLink addToRunLoop:[NSRunLoop currentRunLoop] forMode:NSDefaultRunLoopMode];

  //self.displayLink = aDisplayLink;
  //animating = TRUE;

  m_pDisplayLink = aDisplayLink;
}

void IosTimerImpl::stop()
{
  [m_pDisplayLink invalidate];
  m_pDisplayLink = nil;
}

