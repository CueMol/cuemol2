//
// Event manager
//
// $Id: EventManager.cpp,v 1.2 2010/09/12 12:52:38 rishitani Exp $

#include <common.h>

#include "EventManager.hpp"
#include "LEvent.hpp"

using namespace qlib;

SINGLETON_BASE_IMPL(EventManager);

EventManager::EventManager()
{
#ifdef HAVE_BOOST_THREAD
  m_mainthr = boost::this_thread::get_id();
#endif  
  m_pImpl = NULL;
}

EventManager::~EventManager()
{
}

bool EventManager::isMainThread() const
{
#ifdef HAVE_BOOST_THREAD
  if (m_mainthr != boost::this_thread::get_id())
    return false;
#endif  
  return true;
}

void EventManager::delegateEventFire(const LEvent *pEvent, LEventCasterBase *pCaster)
{
  boost::mutex::scoped_lock lk(m_mu);
  m_pending.push_back(tuple_t(static_cast<LEvent *>(pEvent->clone()), pCaster));
}

void EventManager::messageLoop()
{
  boost::mutex::scoped_lock lk(m_mu);

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

void EventManager::setTimer(TimerListener *pobj, time_value dur_msec)
{
  time_value curr = m_pImpl->getCurrentTime();
  TimerTuple tt;
  tt.start = curr;
  tt.end = curr + dur_msec;
  tt.pobj = pobj;
  m_timerq.push_back(tt);

  //timerEntryMethod();
  //checkQueueAndSetupTimer(false);
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
  if (m_pImpl!=NULL)
    delete m_pImpl;
  m_pImpl = NULL;
}

void EventManager::checkTimerQueue()
{
  if (m_timerq.empty()) return;
  time_value curr = m_pImpl->getCurrentTime();

  TimerQueue::iterator iter = m_timerq.begin();
  //TimerQueue::iterator eiter = m_timerq.end();
  //for (; iter!=eiter;) {

  for (; iter!=m_timerq.end(); ) {
    const TimerTuple &rtt = *iter;
    TimerListener *pobj = rtt.pobj;
    time_value dur_end = rtt.end-curr;
    if (dur_end<=0) {
      iter = m_timerq.erase(iter);
      pobj->onTimer(1.0, curr, true);
      continue;
    }
    else {
      double rho = double(curr-rtt.start)/double(rtt.end-rtt.start);
      if (!pobj->onTimer(rho, curr, false)) {
        // timer iteration is canceled
        MB_DPRINTLN("timer canceled");
        iter = m_timerq.erase(iter);
        continue;
      }
    }
    ++iter;
  }
}

TimerImpl::~TimerImpl()
{
}

