// -*-Mode: C++;-*-
//
//  Event manager
//
//  $Id: EventManager.hpp,v 1.3 2010/10/24 14:06:18 rishitani Exp $

#ifndef QLIB_EVENT_MANAGER_HPP_
#define QLIB_EVENT_MANAGER_HPP_

#include "qlib.hpp"

#include "SingletonBase.hpp"
#include "LTimeValue.hpp"
#include "TimerEvent.hpp"

namespace qlib {

  class LEvent;

  /// Base class of event casters implementing lock
  class QLIB_API LEventCasterBase
  {
  public:

    LEventCasterBase() : m_fLock(false) {}

    virtual void fireEvent(LEvent *pEvent) =0;

    /////////
    // Lock

    void lock() const {
      m_fLock = true;
    }

    void unlock() const {
      m_fLock = false;
    }

    bool isLocked() const {
      return m_fLock;
    }

  protected:
    mutable bool m_fLock;

  };

  /// Automatic event cast lock object
  class AutoEventCastLock
  {
  private:
    const LEventCasterBase *m_pCaster;

  public:
    AutoEventCastLock(const LEventCasterBase *pCaster)
         : m_pCaster(pCaster)
    {
      m_pCaster->lock();
    }

    ~AutoEventCastLock()
    {
      m_pCaster->unlock();
    }
  };

  ////////////////////////////////////////////////////////////////////

  /// Timer implementation interface
  ///
  /// start()/stop() are driven by the host that creates the impl, not by the
  /// EventManager (see initTimer()).
  class QLIB_API TimerImpl
  {
  public:
    TimerImpl() {}
    virtual ~TimerImpl();

    /// Monotonic system time in the internal (nano-second) representation.
    /// Usable without a TimerImpl instance.
    static time_value sGetSystemTime();

    virtual time_value getCurrentTime();
    virtual void start(time_value period) =0;
    virtual void stop() =0;
  };

  /// Idle task interface
  class QLIB_API IdleTask
  {
  public:
    IdleTask() {}
    virtual ~IdleTask();
    virtual void doIdleTask() =0;
  };

  /// Timer entry data structure
  struct TimerTuple {
    time_value start;
    time_value end;
    TimerListener *pobj;
  };

  
  struct EMThreadImpl;

  ///
  /// Event/Timer manager
  ///
  class QLIB_API EventManager : public SingletonBase<EventManager>
  {
  private:
    EMThreadImpl *m_pthr;

    /// Event entry data structure
    typedef std::pair<LEvent *, LEventCasterBase *> tuple_t;

    /// Pending event list
    std::list<tuple_t> m_pending;

    ///////////////////////

    /// Timer implementation
    TimerImpl *m_pImpl;

    /// Timer object table type
    typedef std::list<TimerTuple> TimerQueue;

    /// Timer object table
    TimerQueue m_timerq;

    ///////////////////////

    /// Idle task list
    std::list<IdleTask*> m_idleTasks;

  public:
    EventManager();
    virtual ~EventManager();

    /////////////////////////////

    bool isMainThread() const;

    /// Delegate event notification to the main thread
    ///  Event object must be copy-safe.
    void delegateEventFire(const LEvent *pEvent, LEventCasterBase *pCaster);

    /// Main thread polling method
    ///  This method should be called periodically, when the main thread is idle.
    void messageLoop();

  public:
    
    /// Install the timer implementation (takes ownership).
    /// The impl's start()/stop() are NOT called from here: a host that needs a
    /// periodic pump drives performIdleTasks() itself (XPCTimerImpl starts its
    /// own nsITimer in its ctor; tritium calls performIdleTasks() from the
    /// worker render loop).
    void initTimer(TimerImpl *pimpl);
    void finiTimer();

    /// Register a one-shot timer driving pobj->onTimer() until it expires.
    /// Only one timer per listener: a second call replaces the pending one.
    /// Ignored when no TimerImpl is installed (nothing would ever fire it).
    ///
    /// @param dur duration until expiry in the *internal* time representation
    ///   (nano-seconds, see qlib::time_value). Convert explicitly with
    ///   qlib::timeval::fromMilliSec(), or use setTimerMilliSec(). Passing a
    ///   raw milli-second count makes the timer expire within one frame, so
    ///   onTimer() fires exactly once with rho==1.0 / bLast==true and the
    ///   animation jumps straight to its end value.
    void setTimer(TimerListener *pobj, time_value dur);

    /// setTimer() convenience wrapper taking milli-seconds.
    void setTimerMilliSec(TimerListener *pobj, double dur_msec) {
      setTimer(pobj, qlib::timeval::fromMilliSec(dur_msec));
    }

    void removeTimer(TimerListener *pobj);

    void checkTimerQueue();

    /// Current time in the internal (nano-second) representation.
    /// Falls back to the system monotonic clock when no TimerImpl is installed
    /// (pymod / cli / gtest hosts).
    inline time_value getCurrentTime() {
      if (m_pImpl==NULL)
        return TimerImpl::sGetSystemTime();
      return m_pImpl->getCurrentTime();
    }

    inline static time_value sGetCurrentTime() {
      return getInstance()->getCurrentTime();
    }
    
    void removeIdleTask(IdleTask *pTask) {
      m_idleTasks.remove(pTask);
    }

    void addIdleTask(IdleTask *pTask, bool bLast=false) {
      if (bLast) {
        m_idleTasks.push_back(pTask);
      }
      else {
        m_idleTasks.push_front(pTask);
      }
    }

    void performIdleTasks();

  };

}

SINGLETON_BASE_DECL(qlib::EventManager);

#endif


