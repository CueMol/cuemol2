//
// Accumulating timers for the benchmark harness.
//
// Lives on the bench/perf-harness branch and is not part of a release.
//
// The counters answer where a frame's C++ time goes: geometry generation, the
// buffer create / update / draw calls that cross into JS, the per-object
// uniform uploads, and the coordinate-texture upload a trajectory frame
// triggers. `tritium/docs/architecture/buffer-alloc-routing.md` put roughly
// 82% of the first frame in renderer-side generation, measured by hand with
// std::chrono at these very sites; this makes that measurement repeatable.
//
// A scope enters the timers through BenchScope, which costs two steady_clock
// reads and a relaxed atomic add. They are always compiled in: the harness is
// the only thing that reads them, and a build flag would mean the numbers came
// from a binary nobody else runs.
//

#ifndef NODE_JSBR_BENCH_STATS_HPP_
#define NODE_JSBR_BENCH_STATS_HPP_

#include <atomic>
#include <chrono>

namespace node_jsbr {

/** One measured site: how long it took in total, and how often it ran. */
struct BenchCounter
{
    std::atomic<int64_t> usec{0};
    std::atomic<int64_t> count{0};

    void add(int64_t us)
    {
        usec.fetch_add(us, std::memory_order_relaxed);
        count.fetch_add(1, std::memory_order_relaxed);
    }

    void reset()
    {
        usec.store(0, std::memory_order_relaxed);
        count.store(0, std::memory_order_relaxed);
    }
};

/**
 * The sites the harness reports.
 *
 * Deliberately few: each one is a boundary the optimization work is aimed at,
 * so that a change shows up as one number moving rather than as a shift spread
 * over a dozen.
 */
struct BenchStats
{
    /** DisplayContext::drawElem -- the single funnel for all vertex traffic. */
    BenchCounter drawElem;
    /** EcBufferRep::create -- first upload of a buffer, including the JSON. */
    BenchCounter bufferCreate;
    /** EcBufferRep::update -- per-frame re-upload decision. */
    BenchCounter bufferUpdate;
    /** EcBufferRep::draw -- the N-API call that draws one buffer. */
    BenchCounter bufferDraw;
    /** The three per-object UBO uploads (matrices, fog, draw params). */
    BenchCounter uboUpdate;
    /** EcFloatDataTexture::update -- one MD frame's coordinates. */
    BenchCounter coordTexUpdate;
    /** ElecDisplayContext::allocBuffer -- bytes handed to V8 per rebuild. */
    std::atomic<int64_t> allocBytes{0};
    std::atomic<int64_t> allocCount{0};

    void reset()
    {
        drawElem.reset();
        bufferCreate.reset();
        bufferUpdate.reset();
        bufferDraw.reset();
        uboUpdate.reset();
        coordTexUpdate.reset();
        allocBytes.store(0, std::memory_order_relaxed);
        allocCount.store(0, std::memory_order_relaxed);
    }
};

extern BenchStats g_benchStats;

/** Times the scope it is declared in into `counter`. */
class BenchScope
{
public:
    explicit BenchScope(BenchCounter &counter)
        : m_counter(counter), m_start(std::chrono::steady_clock::now())
    {
    }

    ~BenchScope()
    {
        const auto us = std::chrono::duration_cast<std::chrono::microseconds>(
                            std::chrono::steady_clock::now() - m_start)
                            .count();
        m_counter.add(us);
    }

private:
    BenchCounter &m_counter;
    std::chrono::steady_clock::time_point m_start;
};

}  // namespace node_jsbr

#endif
