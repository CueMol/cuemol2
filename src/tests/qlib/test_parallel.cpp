#include <gtest/gtest.h>
#include <common.h>
#include "qlib/parallel.hpp"

#include <atomic>
#include <cstddef>
#include <numeric>
#include <thread>
#include <vector>

// These tests pin the coverage contract of qlib::parallel_for so the serial and
// oneTBB-backed implementations stay observably identical: every index in
// [begin, end) is visited exactly once, empty ranges visit nothing, and a
// concurrent reduction matches the serial result.

TEST(Parallel, CoversRangeExactlyOnce)
{
    const std::size_t n = 10000;
    std::vector<std::atomic<int>> hits(n);
    for (std::size_t i = 0; i < n; ++i) {
        hits[i].store(0);
    }

    qlib::parallel_for(0, n, [&hits](std::size_t i) {
        hits[i].fetch_add(1, std::memory_order_relaxed);
    });

    for (std::size_t i = 0; i < n; ++i) {
        ASSERT_EQ(hits[i].load(), 1) << "index " << i << " visited wrong number of times";
    }
}

TEST(Parallel, EmptyRangeDoesNothing)
{
    std::atomic<int> count{0};
    qlib::parallel_for(5, 5, [&count](std::size_t) {
        count.fetch_add(1, std::memory_order_relaxed);
    });
    EXPECT_EQ(count.load(), 0);
}

TEST(Parallel, ConcurrentSumMatchesSerial)
{
    const std::size_t n = 100000;
    std::vector<int> data(n);
    std::iota(data.begin(), data.end(), 1);

    std::atomic<long long> sum{0};
    qlib::parallel_for(0, n, [&data, &sum](std::size_t i) {
        sum.fetch_add(data[i], std::memory_order_relaxed);
    });

    long long expected = 0;
    for (std::size_t i = 0; i < n; ++i) {
        expected += data[i];
    }
    EXPECT_EQ(sum.load(), expected);
}

// Inside an enabled SerialScope, parallel_for runs every index on the calling
// thread (in order); a disabled one, or the end of the scope, changes nothing.
TEST(Parallel, SerialScopeRunsOnCallingThread)
{
    const std::size_t n = 1000;
    const std::thread::id self = std::this_thread::get_id();
    {
        qlib::SerialScope serial;
        std::vector<std::size_t> order;
        bool bOther = false;
        qlib::parallel_for(0, n, [&](std::size_t i) {
            order.push_back(i);
            if (std::this_thread::get_id() != self) bOther = true;
        });
        EXPECT_FALSE(bOther);
        ASSERT_EQ(order.size(), n);
        for (std::size_t i = 0; i < n; ++i) EXPECT_EQ(order[i], i);
    }
    {
        qlib::SerialScope off(false);
        std::vector<std::atomic<int>> hits(n);
        for (auto &h : hits) h.store(0);
        qlib::parallel_for(0, n, [&hits](std::size_t i) { hits[i].fetch_add(1); });
        for (auto &h : hits) EXPECT_EQ(h.load(), 1);
    }
}
