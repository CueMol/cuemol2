#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LProcMgr.hpp"

#include <chrono>
#include <thread>

using qlib::LProcMgr;
using qlib::LString;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

// Wait until the process with id reaches one of the given states, or until
// a timeout.  Returns the final state.
static int waitForState(LProcMgr *pMgr, int id,
                        int targetState,
                        std::chrono::milliseconds timeout = std::chrono::milliseconds(5000))
{
    auto deadline = std::chrono::steady_clock::now() + timeout;
    while (std::chrono::steady_clock::now() < deadline) {
        int st = pMgr->getState(id);
        if (st == targetState) return st;
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    return pMgr->getState(id);
}

// -----------------------------------------------------------------------
// Fixture: each test starts from a clean LProcMgr state.
// -----------------------------------------------------------------------

class LProcMgrTest : public ::testing::Test
{
protected:
    LProcMgr *pMgr = nullptr;

    void SetUp() override
    {
        pMgr = LProcMgr::getInstance();
        ASSERT_NE(pMgr, nullptr);
        // Ensure no leftover tasks from previous tests.
        pMgr->killAll();
    }

    void TearDown() override { pMgr->killAll(); }
};

// -----------------------------------------------------------------------
// Basic accessors
// -----------------------------------------------------------------------

TEST_F(LProcMgrTest, InitiallyEmpty)
{
    EXPECT_TRUE(pMgr->isEmpty());
    EXPECT_EQ(pMgr->getQueueLen(), 0);
}

TEST_F(LProcMgrTest, SlotSizePositive)
{
    EXPECT_GT(pMgr->getSlotSize(), 0);
}

TEST_F(LProcMgrTest, SetSlotSize)
{
    pMgr->setSlotSize(2);
    EXPECT_EQ(pMgr->getSlotSize(), 2);

    // Restore to a reasonable default.
    pMgr->setSlotSize(-1); // -1 → use CPU count
    EXPECT_GT(pMgr->getSlotSize(), 0);
}

// -----------------------------------------------------------------------
// queueTask / getState / waitForExit / getResultOutput
// -----------------------------------------------------------------------

TEST_F(LProcMgrTest, EchoTask)
{
    int id = pMgr->queueTask("/bin/echo", "hello_cuemol", "");
    EXPECT_GE(id, 0);

    // State should be queued or running (may already be done on a fast machine).
    int st = pMgr->getState(id);
    EXPECT_NE(st, LProcMgr::PM_UNKNOWN);

    pMgr->waitForExit(id);

    st = pMgr->getState(id);
    EXPECT_EQ(st, LProcMgr::PM_ENDED);

    LString out = pMgr->getResultOutput(id);
    EXPECT_NE(out.indexOf("hello_cuemol"), -1)
        << "Output was: " << out.c_str();
}

TEST_F(LProcMgrTest, EmptyAfterResultRetrieved)
{
    int id = pMgr->queueTask("/bin/echo", "test", "");
    pMgr->waitForExit(id);
    pMgr->getResultOutput(id);

    // After consuming the result the manager should be empty again.
    EXPECT_TRUE(pMgr->isEmpty());
}

TEST_F(LProcMgrTest, GetStateQueued)
{
    // Saturate the slot with a long-running task so the next task will queue.
    pMgr->setSlotSize(1);

    int id1 = pMgr->queueTask("/bin/sleep", "3", "");
    int id2 = pMgr->queueTask("/bin/echo", "queued", "");

    // id2 should be queued (waiting for a free slot).
    int st2 = pMgr->getState(id2);
    EXPECT_EQ(st2, LProcMgr::PM_QUEUED);

    // Clean up.
    pMgr->kill(id1);
    pMgr->kill(id2);
    pMgr->setSlotSize(-1);
}

TEST_F(LProcMgrTest, GetStateRunning)
{
    int id = pMgr->queueTask("/bin/sleep", "3", "");

    // Give the process a moment to start.
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    int st = pMgr->getState(id);
    EXPECT_EQ(st, LProcMgr::PM_RUNNING);

    pMgr->kill(id);
}

TEST_F(LProcMgrTest, GetStateUnknownForBadId)
{
    EXPECT_EQ(pMgr->getState(99999), LProcMgr::PM_UNKNOWN);
}

// -----------------------------------------------------------------------
// Multiple tasks
// -----------------------------------------------------------------------

TEST_F(LProcMgrTest, MultipleConcurrentTasks)
{
    int id1 = pMgr->queueTask("/bin/echo", "task1", "");
    int id2 = pMgr->queueTask("/bin/echo", "task2", "");
    int id3 = pMgr->queueTask("/bin/echo", "task3", "");

    pMgr->waitForExit(id1);
    pMgr->waitForExit(id2);
    pMgr->waitForExit(id3);

    LString out1 = pMgr->getResultOutput(id1);
    LString out2 = pMgr->getResultOutput(id2);
    LString out3 = pMgr->getResultOutput(id3);

    EXPECT_NE(out1.indexOf("task1"), -1);
    EXPECT_NE(out2.indexOf("task2"), -1);
    EXPECT_NE(out3.indexOf("task3"), -1);
}

// -----------------------------------------------------------------------
// Dependency (wait IDs)
// -----------------------------------------------------------------------

TEST_F(LProcMgrTest, WaitIDDependency)
{
    pMgr->setSlotSize(4);

    // Queue a short "producer" task and a "consumer" task that waits for it.
    int id1 = pMgr->queueTask("/bin/echo", "producer", "");
    int id2 = pMgr->queueTask("/bin/echo", "consumer",
                              LString::format("%d", id1));

    // id2 must not start before id1 finishes.
    pMgr->waitForExit(id1);
    pMgr->waitForExit(id2);

    EXPECT_EQ(pMgr->getState(id1), LProcMgr::PM_ENDED);
    EXPECT_EQ(pMgr->getState(id2), LProcMgr::PM_ENDED);

    // After getResultOutput the endq entry for id2 should be gone, and
    // after id1's result is also consumed, the manager should be empty.
    pMgr->getResultOutput(id1);
    pMgr->getResultOutput(id2);
    EXPECT_TRUE(pMgr->isEmpty());

    pMgr->setSlotSize(-1);
}

// -----------------------------------------------------------------------
// kill / killAll
// -----------------------------------------------------------------------

TEST_F(LProcMgrTest, KillRunningTask)
{
    int id = pMgr->queueTask("/bin/sleep", "10", "");

    // Wait for it to start.
    int st = waitForState(pMgr, id, LProcMgr::PM_RUNNING);
    ASSERT_EQ(st, LProcMgr::PM_RUNNING);

    pMgr->kill(id);

    // After kill the process should be in ENDED or UNKNOWN state.
    st = pMgr->getState(id);
    EXPECT_TRUE(st == LProcMgr::PM_ENDED || st == LProcMgr::PM_UNKNOWN)
        << "Unexpected state after kill: " << st;
}

TEST_F(LProcMgrTest, KillQueuedTask)
{
    pMgr->setSlotSize(1);

    // Fill the slot.
    int id1 = pMgr->queueTask("/bin/sleep", "5", "");
    // This one will be queued.
    int id2 = pMgr->queueTask("/bin/echo", "should_not_run", "");

    EXPECT_EQ(pMgr->getState(id2), LProcMgr::PM_QUEUED);

    pMgr->kill(id2);
    EXPECT_EQ(pMgr->getState(id2), LProcMgr::PM_UNKNOWN);

    pMgr->kill(id1);
    pMgr->setSlotSize(-1);
}

TEST_F(LProcMgrTest, KillAll)
{
    pMgr->queueTask("/bin/sleep", "5", "");
    pMgr->queueTask("/bin/sleep", "5", "");

    pMgr->killAll();
    EXPECT_TRUE(pMgr->isEmpty());
}

// -----------------------------------------------------------------------
// getResultOutput: when a task is found in the slot but not running,
// getResultOutput calls finishTask() so the slot entry is properly moved
// to m_endq.  Tasks queued later that declared a dependency on id1 will
// see it as PM_UNKNOWN (already consumed) and start without waiting.
// -----------------------------------------------------------------------

TEST_F(LProcMgrTest, GetResultOutputTriggersDependentTask)
{
    pMgr->setSlotSize(4);

    int id1 = pMgr->queueTask("/bin/echo", "first", "");
    // Let id1 complete and consume its result.
    pMgr->waitForExit(id1);
    pMgr->getResultOutput(id1);

    // Queue a task that would have waited for id1 (already done).
    // Since id1 is now PM_UNKNOWN, updateWaitIDs will clear the dependency.
    int id2 = pMgr->queueTask("/bin/echo", "second",
                              LString::format("%d", id1));
    pMgr->waitForExit(id2);
    EXPECT_EQ(pMgr->getState(id2), LProcMgr::PM_ENDED);

    pMgr->getResultOutput(id2);
    EXPECT_TRUE(pMgr->isEmpty());

    pMgr->setSlotSize(-1);
}

// -----------------------------------------------------------------------
// doneTaskListJSON
// -----------------------------------------------------------------------

TEST_F(LProcMgrTest, DoneTaskListJSONEmpty)
{
    LString json = pMgr->doneTaskListJSON();
    EXPECT_EQ(std::string(json.c_str()), "[]");
}

TEST_F(LProcMgrTest, DoneTaskListJSONAfterCompletion)
{
    int id = pMgr->queueTask("/bin/echo", "json_test", "");
    // Wait for it to complete.
    int st = waitForState(pMgr, id, LProcMgr::PM_ENDED);
    ASSERT_EQ(st, LProcMgr::PM_ENDED);

    // checkQueue() → getEmptySlot() → finishTask() moves the finished slot
    // entry to m_endq, which doneTaskListJSON() lists.
    pMgr->checkQueue();

    LString json = pMgr->doneTaskListJSON();
    EXPECT_NE(json.indexOf(LString::format("%d", id)), -1)
        << "JSON was: " << json.c_str();

    pMgr->getResultOutput(id);
}
