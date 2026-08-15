//
// Event manager
//
// $Id: EventManager.cpp,v 1.2 2010/09/12 12:52:38 rishitani Exp $

#include <common.h>

#include "EventManager.hpp"
#include "LEvent.hpp"
#include "LExceptions.hpp"

#include <thread>
#include <mutex>

namespace qlib {

  struct EMThreadImpl
  {
    std::thread::id m_mainthr;
    mutable std::mutex m_mu;
  };

  SINGLETON_BASE_IMPL(EventManager);
  
}

using namespace qlib;

EventManager::EventManager()
{
  m_pthr = NULL;
  m_pImpl = NULL;
  m_pthr = new EMThreadImpl();
  m_pthr->m_mainthr = std::this_thread::get_id();
}

EventManager::~EventManager()
{
  delete m_pthr;
}

bool EventManager::isMainThread() const
{
  if (m_pthr->m_mainthr != std::this_thread::get_id())
    return false;
  return true;
}

void EventManager::delegateEventFire(const LEvent *pEvent, LEventCasterBase *pCaster)
{
  std::lock_guard<std::mutex> lk(m_pthr->m_mu);
  m_pending.push_back(tuple_t(static_cast<LEvent *>(pEvent->clone()), pCaster));
}

void EventManager::messageLoop()
{
  std::lock_guard<std::mutex> lk(m_pthr->m_mu);

  while (m_pending.size()>0) {
    tuple_t tup = m_pending.front();
    m_pending.pop_front();
    
    LEvent *pEvent =tup.first;
    LEventCasterBase *pCaster = tup.second;

    pCaster->fireEvent(pEvent);
    delete pEvent;
  }

}

////////////////////////////////////////////////////

void EventManager::setTimer(TimerListener *pobj, qlib::time_value dur)
{
    if (m_pImpl==NULL) {
      // Without a timer impl nothing ever calls checkTimerQueue(), so the
      // entry would just leak. Ignore it instead of dereferencing null.
      MB_DPRINTLN("EvtMgr> setTimer ignored (no TimerImpl)");
      return;
    }

    // One pending timer per listener
    removeTimer(pobj);

    qlib::time_value curr = m_pImpl->getCurrentTime();
    TimerTuple tt;
    tt.start = curr;
    tt.end = curr + dur;
    tt.pobj = pobj;
    m_timerq.push_back(tt);
}

void EventManager::removeTimer(TimerListener *pobj)
{
  TimerQueue::iterator iter = m_timerq.begin();
  for (; iter!=m_timerq.end();) {
    const TimerTuple &rtt = *iter;
    if (rtt.pobj==pobj) {
      MB_DPRINTLN("TimerListener %p removed from queue", pobj);
      iter = m_timerq.erase(iter);
      continue;
    }
    ++iter;
  }
}

void EventManager::initTimer(TimerImpl *pimpl)
{
  MB_ASSERT(m_pImpl==NULL);
  m_pImpl = pimpl;
}

void EventManager::finiTimer()
{
  if (m_pImpl != NULL) {
    m_pImpl->stop();
    delete m_pImpl;
    m_pImpl = NULL;
  }
}

void EventManager::checkTimerQueue()
{
  if (m_timerq.empty()) return;
  if (m_pImpl==NULL) return;

  const qlib::time_value curr = m_pImpl->getCurrentTime();
  MB_DPRINTLN("EventManager::checkTimerQueue() curr=%lld", (long long)curr);

  // onTimer() may re-enter setTimer()/removeTimer() (AnimMgr loop playback, a
  // listener destroyed by an event fired from within the callback, ...), which
  // would invalidate an iterator held across the callback. Work from a
  // snapshot and mutate m_timerq only by listener identity. removeTimer() only
  // compares the pointer, so it stays safe even if the listener is gone.
  const TimerQueue snap(m_timerq);

  for (const TimerTuple &rtt : snap) {
    TimerListener *pobj = rtt.pobj;
    const qlib::time_value dur_end = rtt.end-curr;
    if (dur_end<=0) {
      // process ended timer (last event)
      removeTimer(pobj);
      pobj->onTimer(1.0, curr, true);
    }
    else {
      // process active timer
      const double rho = double(curr-rtt.start)/double(rtt.end-rtt.start);
      if (!pobj->onTimer(rho, curr, false)) {
        // timer iteration is canceled
        removeTimer(pobj);
        MB_DPRINTLN("EvtMgr> timer canceled");
      }
    }
  }
}

//////////

TimerImpl::~TimerImpl()
{
}

#include <chrono>

//static
qlib::time_value TimerImpl::sGetSystemTime()
{
  using namespace std::chrono;

  high_resolution_clock::time_point tp = high_resolution_clock::now();

  // time_value is in nano-sec rep with int64 precision
  qlib::time_value t1 = duration_cast<nanoseconds>(tp.time_since_epoch()).count();

  // LOG_DPRINTLN("sGetSystemTime() = %llu", t1);
  return t1;
}

qlib::time_value TimerImpl::getCurrentTime()
{
  return sGetSystemTime();
}

//////////

#include "LPerfMeas.hpp"

IdleTask::~IdleTask()
{
}

void EventManager::performIdleTasks()
{
  try {
    qlib::AutoPerfMeas apm(PM_IDLE_TIMER);
    
    // process events
    messageLoop();
    
    // process timer events
    checkTimerQueue();
    
    for (IdleTask *pTask : m_idleTasks) {
      pTask->doIdleTask();
    }
  }
  catch (qlib::LException &e) {
    LOG_DPRINTLN("Exception occured in performIdleTask: %s",
		 e.getFmtMsg().c_str());
    throw;
  }
  catch (std::exception &e) {
    LOG_DPRINTLN("Exception occured in performIdleTask: %s",
		 e.what());
    throw;
  }
  catch (...) {
    LOG_DPRINTLN("Unknown exception occured in performIdleTask");
    throw;
  }
}
