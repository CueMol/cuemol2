#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LThread.hpp"

#include <atomic>
#include <chrono>
#include <thread>

// Concrete LThread subclass that just sets a flag when run() is called.
class FlagThread : public qlib::LThread {
public:
    std::atomic<bool> started{false};
    std::atomic<bool> finished{false};
    std::chrono::milliseconds sleep_duration{0};

    void run() override {
        started = true;
        if (sleep_duration.count() > 0)
            std::this_thread::sleep_for(sleep_duration);
        finished = true;
    }
};

TEST(LThread, KickAndWait)
{
    FlagThread t;
    EXPECT_FALSE(t.started);
    t.kick();
    t.waitTermination();
    EXPECT_TRUE(t.started);
    EXPECT_TRUE(t.finished);
}

TEST(LThread, IsRunningWhileRunning)
{
    FlagThread t;
    t.sleep_duration = std::chrono::milliseconds(300);
    t.kick();

    // The thread should be running shortly after kick.
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    EXPECT_TRUE(t.isRunning());

    t.waitTermination();
    EXPECT_FALSE(t.isRunning());
}

TEST(LThread, IsRunningBeforeKick)
{
    FlagThread t;
    EXPECT_FALSE(t.isRunning());
}

TEST(LThread, TimedWaitSuccess)
{
    FlagThread t;
    t.sleep_duration = std::chrono::milliseconds(100);
    t.kick();

    // Wait up to 5 seconds; thread finishes in ~100 ms, so this should succeed.
    bool ok = t.waitTermination(5);
    EXPECT_TRUE(ok);
    EXPECT_TRUE(t.finished);
}

TEST(LThread, TimedWaitTimeout)
{
    FlagThread t;
    t.sleep_duration = std::chrono::milliseconds(3000);
    t.kick();

    // Wait only 1 second; thread needs 3 seconds, so this should time out.
    bool ok = t.waitTermination(1);
    EXPECT_FALSE(ok);

    // Thread is still running; clean up.
    t.waitTermination();
}

TEST(LThread, WaitTerminationNoThread)
{
    // waitTermination on a never-kicked thread must not crash.
    FlagThread t;
    t.waitTermination();
    EXPECT_FALSE(t.isRunning());
}

TEST(LThread, IsRunningConsistentAfterFirstFalseReturn)
{
    // Regression test for the double-join UB in isRunning().
    //
    // isRunning() uses timed_join(0) internally.  When the thread has finished,
    // the first call joins it via timed_join and returns false.  Without the
    // joinable() guard, subsequent timed_join calls on the already-joined
    // (non-joinable) boost::thread are undefined behaviour: on some platforms
    // they may return false, making isRunning() wrongly return true.
    //
    // The fix adds a joinable() check so that once the thread is joined, every
    // subsequent isRunning() call returns false immediately without calling
    // timed_join again.
    FlagThread t;
    t.kick();

    // Wait until the thread has finished.
    while (t.isRunning()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    // First call returned false (thread finished, internally joined by timed_join).
    // All further calls must also return false — not flip back to true.
    for (int i = 0; i < 10; ++i) {
        EXPECT_FALSE(t.isRunning())
            << "isRunning() returned true on call " << (i + 1)
            << " after thread had already finished";
    }
}
