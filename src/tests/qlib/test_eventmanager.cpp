#include <gtest/gtest.h>
#include <common.h>
#include "qlib/EventManager.hpp"
#include "qlib/LEvent.hpp"
#include "qlib/LTimeValue.hpp"

#include <atomic>
#include <thread>
#include <vector>

using qlib::EventManager;
using qlib::LEvent;
using qlib::LEventCasterBase;
using qlib::TimerImpl;
using qlib::TimerListener;
using qlib::time_value;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

// Minimal cloneable event carrying an integer value.
class TestEvent : public LEvent
{
public:
    int m_value;
    explicit TestEvent(int v) : m_value(v) {}
    qlib::LCloneableObject *clone() const override { return new TestEvent(*this); }
};

// Caster that records the integer values of fired TestEvents.
class RecordingCaster : public LEventCasterBase
{
public:
    std::vector<int> m_fired;
    void fireEvent(LEvent *pEvent) override
    {
        TestEvent *pe = dynamic_cast<TestEvent *>(pEvent);
        if (pe) m_fired.push_back(pe->m_value);
    }
};

// TimerImpl whose "current time" is fully controlled by the test.
class MockTimerImpl : public TimerImpl
{
public:
    time_value m_now = 0;
    bool m_stopped = false;

    time_value getCurrentTime() override { return m_now; }
    void start(time_value /*period*/) override {}
    void stop() override { m_stopped = true; }
};

// TimerListener that records all onTimer calls.
class RecordingTimerListener : public TimerListener
{
public:
    struct Call {
        double t;
        time_value curr;
        bool bLast;
    };

    std::vector<Call> m_calls;

    // Return value for onTimer. Default true = keep going.
    bool m_returnValue = true;

    bool onTimer(double t, time_value curr, bool bLast) override
    {
        m_calls.push_back({t, curr, bLast});
        return m_returnValue;
    }
};

// -----------------------------------------------------------------------
// isMainThread
// -----------------------------------------------------------------------

TEST(EventManager, IsMainThreadFromMainThread)
{
    EventManager *pEM = EventManager::getInstance();
    ASSERT_NE(pEM, nullptr);
    EXPECT_TRUE(pEM->isMainThread());
}

TEST(EventManager, IsMainThreadFalseFromOtherThread)
{
    EventManager *pEM = EventManager::getInstance();
    std::atomic<bool> result{true};
    std::thread t([&]() { result = pEM->isMainThread(); });
    t.join();
    EXPECT_FALSE(result);
}

// -----------------------------------------------------------------------
// delegateEventFire / messageLoop
// -----------------------------------------------------------------------

TEST(EventManager, MessageLoopEmptyQueue)
{
    // Should not crash when there are no pending events.
    EventManager *pEM = EventManager::getInstance();
    EXPECT_NO_THROW(pEM->messageLoop());
}

TEST(EventManager, DelegateAndFireFromMainThread)
{
    EventManager *pEM = EventManager::getInstance();
    RecordingCaster caster;
    TestEvent ev(42);

    pEM->delegateEventFire(&ev, &caster);
    EXPECT_TRUE(caster.m_fired.empty()); // not fired yet

    pEM->messageLoop();
    ASSERT_EQ(caster.m_fired.size(), 1u);
    EXPECT_EQ(caster.m_fired[0], 42);
}

TEST(EventManager, DelegateMultipleEventsPreservesOrder)
{
    EventManager *pEM = EventManager::getInstance();
    RecordingCaster caster;
    TestEvent ev1(1), ev2(2), ev3(3);

    pEM->delegateEventFire(&ev1, &caster);
    pEM->delegateEventFire(&ev2, &caster);
    pEM->delegateEventFire(&ev3, &caster);

    pEM->messageLoop();
    ASSERT_EQ(caster.m_fired.size(), 3u);
    EXPECT_EQ(caster.m_fired[0], 1);
    EXPECT_EQ(caster.m_fired[1], 2);
    EXPECT_EQ(caster.m_fired[2], 3);
}

TEST(EventManager, DelegateFromBackgroundThread)
{
    EventManager *pEM = EventManager::getInstance();
    RecordingCaster caster;
    TestEvent ev(99);

    // Delegate from a background thread; messageLoop is called on main thread.
    std::thread t([&]() { pEM->delegateEventFire(&ev, &caster); });
    t.join();

    EXPECT_TRUE(caster.m_fired.empty());
    pEM->messageLoop();
    ASSERT_EQ(caster.m_fired.size(), 1u);
    EXPECT_EQ(caster.m_fired[0], 99);
}

// -----------------------------------------------------------------------
// Timer: setTimer / checkTimerQueue
// -----------------------------------------------------------------------

// Helper: install a MockTimerImpl and return ownership so the test can
// control it. The caller must NOT call finiTimer() for this mock since
// the EventManager owns it after initTimer().
static MockTimerImpl *installMockTimer()
{
    EventManager *pEM = EventManager::getInstance();
    MockTimerImpl *pMock = new MockTimerImpl();
    pEM->initTimer(pMock);
    return pMock;
}

static void removeMockTimer()
{
    EventManager::getInstance()->finiTimer();
}

TEST(EventManager, CheckTimerQueueEmptyNoOp)
{
    MockTimerImpl *pMock = installMockTimer();
    pMock->m_now = 0;

    EventManager *pEM = EventManager::getInstance();
    // No timers registered; should be a no-op.
    EXPECT_NO_THROW(pEM->checkTimerQueue());

    removeMockTimer();
}

TEST(EventManager, TimerNotYetExpired)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();

    const time_value kDuration = 1000; // 1000 ns
    pMock->m_now = 0;

    RecordingTimerListener listener;
    pEM->setTimer(&listener, kDuration);

    // Advance time to midpoint.
    pMock->m_now = 500;
    pEM->checkTimerQueue();

    ASSERT_EQ(listener.m_calls.size(), 1u);
    EXPECT_NEAR(listener.m_calls[0].t, 0.5, 1e-9);
    EXPECT_FALSE(listener.m_calls[0].bLast);

    // Clean up: advance past end so the timer is consumed.
    pMock->m_now = 2000;
    pEM->checkTimerQueue();

    removeMockTimer();
}

TEST(EventManager, TimerExpiredFiresFinalCallback)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();

    const time_value kDuration = 1000;
    pMock->m_now = 0;

    RecordingTimerListener listener;
    pEM->setTimer(&listener, kDuration);

    // Advance time past the end of the timer.
    pMock->m_now = 1500;
    pEM->checkTimerQueue();

    ASSERT_EQ(listener.m_calls.size(), 1u);
    EXPECT_DOUBLE_EQ(listener.m_calls[0].t, 1.0);
    EXPECT_TRUE(listener.m_calls[0].bLast);

    // Timer should have been removed; a second check should produce no new calls.
    pEM->checkTimerQueue();
    EXPECT_EQ(listener.m_calls.size(), 1u);

    removeMockTimer();
}

TEST(EventManager, RemoveTimerPreventsCallback)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();

    const time_value kDuration = 1000;
    pMock->m_now = 0;

    RecordingTimerListener listener;
    pEM->setTimer(&listener, kDuration);
    pEM->removeTimer(&listener);

    // Advance past expiry; callback must not be fired.
    pMock->m_now = 2000;
    pEM->checkTimerQueue();

    EXPECT_TRUE(listener.m_calls.empty());

    removeMockTimer();
}

TEST(EventManager, TimerCanceledWhenOnTimerReturnsFalse)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();

    const time_value kDuration = 1000;
    pMock->m_now = 0;

    RecordingTimerListener listener;
    listener.m_returnValue = false; // cancel immediately
    pEM->setTimer(&listener, kDuration);

    // Time is at midpoint; onTimer returns false → timer should be removed.
    pMock->m_now = 500;
    pEM->checkTimerQueue();

    ASSERT_EQ(listener.m_calls.size(), 1u);

    // Second check should not fire again.
    pEM->checkTimerQueue();
    EXPECT_EQ(listener.m_calls.size(), 1u);

    removeMockTimer();
}

// -----------------------------------------------------------------------
// Timer duration unit contract
//
// setTimer() takes the internal time representation (nano-seconds), NOT
// milli-seconds -- the clock it is added to is a nano-second clock. Feeding
// it a raw milli-second count makes the timer expire within one frame, so
// onTimer() fires once with rho==1.0/bLast==true and any animation driven by
// it jumps straight to its end value.
// -----------------------------------------------------------------------

TEST(EventManager, SetTimerDurationIsNanoSeconds)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();
    pMock->m_now = 0;

    RecordingTimerListener listener;
    // 500 msec expressed in the internal (ns) representation
    pEM->setTimer(&listener, qlib::timeval::fromMilliSec(500));

    // 250 msec in: still running. If setTimer() took milli-seconds, "500"
    // would already be far in the past and this would be the final call.
    pMock->m_now = qlib::timeval::fromMilliSec(250);
    pEM->checkTimerQueue();
    ASSERT_EQ(listener.m_calls.size(), 1u);
    EXPECT_FALSE(listener.m_calls[0].bLast);
    EXPECT_NEAR(listener.m_calls[0].t, 0.5, 1e-9);

    pMock->m_now = qlib::timeval::fromMilliSec(500);
    pEM->checkTimerQueue();
    ASSERT_EQ(listener.m_calls.size(), 2u);
    EXPECT_TRUE(listener.m_calls[1].bLast);

    removeMockTimer();
}

TEST(EventManager, SetTimerMilliSecHelperMatchesFromMilliSec)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();
    pMock->m_now = 0;

    RecordingTimerListener listener;
    pEM->setTimerMilliSec(&listener, 500.0);

    pMock->m_now = qlib::timeval::fromMilliSec(250);
    pEM->checkTimerQueue();
    ASSERT_EQ(listener.m_calls.size(), 1u);
    EXPECT_FALSE(listener.m_calls[0].bLast);
    EXPECT_NEAR(listener.m_calls[0].t, 0.5, 1e-9);

    pMock->m_now = qlib::timeval::fromMilliSec(500);
    pEM->checkTimerQueue();
    ASSERT_EQ(listener.m_calls.size(), 2u);
    EXPECT_TRUE(listener.m_calls[1].bLast);

    removeMockTimer();
}

TEST(EventManager, SetTimerTwiceForSameListenerReplacesPending)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();
    pMock->m_now = 0;

    RecordingTimerListener listener;
    pEM->setTimer(&listener, qlib::timeval::fromMilliSec(500));
    pEM->setTimer(&listener, qlib::timeval::fromMilliSec(500));

    // One pending timer per listener: a single tick, not two.
    pMock->m_now = qlib::timeval::fromMilliSec(250);
    pEM->checkTimerQueue();
    EXPECT_EQ(listener.m_calls.size(), 1u);

    pMock->m_now = qlib::timeval::fromMilliSec(600);
    pEM->checkTimerQueue();
    ASSERT_EQ(listener.m_calls.size(), 2u);
    EXPECT_TRUE(listener.m_calls[1].bLast);

    // Consumed
    pEM->checkTimerQueue();
    EXPECT_EQ(listener.m_calls.size(), 2u);

    removeMockTimer();
}

// -----------------------------------------------------------------------
// Re-entrancy: a listener may mutate the queue from inside onTimer()
// -----------------------------------------------------------------------

namespace {

/// Listener that removes itself from within onTimer(). This happens for real
/// when an event fired from the callback destroys the listener (~View() calls
/// removeTimer()).
class SelfRemovingTimerListener : public TimerListener
{
public:
    int m_nCalls = 0;

    bool onTimer(double, time_value, bool) override
    {
        ++m_nCalls;
        EventManager::getInstance()->removeTimer(this);
        return true;
    }
};

}  // namespace

TEST(EventManager, RemoveTimerFromWithinOnTimerIsSafe)
{
    MockTimerImpl *pMock = installMockTimer();
    EventManager *pEM = EventManager::getInstance();
    pMock->m_now = 0;

    SelfRemovingTimerListener selfrm;
    RecordingTimerListener other;
    pEM->setTimer(&selfrm, qlib::timeval::fromMilliSec(500));
    pEM->setTimer(&other, qlib::timeval::fromMilliSec(500));

    // The self-removal must not invalidate the traversal: the second listener
    // still gets its tick.
    pMock->m_now = qlib::timeval::fromMilliSec(250);
    pEM->checkTimerQueue();
    EXPECT_EQ(selfrm.m_nCalls, 1);
    EXPECT_EQ(other.m_calls.size(), 1u);

    // selfrm is gone from the queue; other still runs to its end.
    pMock->m_now = qlib::timeval::fromMilliSec(600);
    pEM->checkTimerQueue();
    EXPECT_EQ(selfrm.m_nCalls, 1);
    ASSERT_EQ(other.m_calls.size(), 2u);
    EXPECT_TRUE(other.m_calls[1].bLast);

    removeMockTimer();
}

// -----------------------------------------------------------------------
// Missing TimerImpl null-safety (bug fix regression tests)
// -----------------------------------------------------------------------

TEST(EventManager, FiniTimerWithNullImplDoesNotCrash)
{
    // EventManager starts with m_pImpl == NULL (no timer installed).
    // Before the bug fix, this would dereference a null pointer and crash.
    EventManager *pEM = EventManager::getInstance();
    EXPECT_NO_THROW(pEM->finiTimer());
}

TEST(EventManager, SetTimerWithoutTimerImplIsIgnored)
{
    // Hosts that never call initTimer() (pymod, cli) must not crash.
    EventManager *pEM = EventManager::getInstance();
    RecordingTimerListener listener;

    EXPECT_NO_THROW(pEM->setTimer(&listener, qlib::timeval::fromMilliSec(500)));
    EXPECT_NO_THROW(pEM->checkTimerQueue());
    EXPECT_TRUE(listener.m_calls.empty());
}

TEST(EventManager, GetCurrentTimeWithoutTimerImplFallsBack)
{
    // Falls back to the system monotonic clock instead of dereferencing null.
    EventManager *pEM = EventManager::getInstance();
    time_value t1 = 0, t2 = 0;
    EXPECT_NO_THROW(t1 = pEM->getCurrentTime());
    EXPECT_NO_THROW(t2 = pEM->getCurrentTime());
    EXPECT_GT(t1, 0);
    EXPECT_GE(t2, t1);
}
