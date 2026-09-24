// -*-Mode: C++;-*-
//
// Benchmark timer for the GPU-transfer ablation (bench/ablation branch only).
//
// Records one sample per call of an instrumented section, so the harness can
// report a mean and percentiles. The only section is crdSend: one renderer's
// whole per-frame coordinate resend, CoordTexSupport::ctUpdate() from its
// guard checks to its return. It sits in libcuemol2 rather than next to the
// addon's BenchStats because ctUpdate lives here and libcuemol2 cannot call
// into the addon; the addon reads these samples through getBenchStats().
//
// Off until the harness enables it; disabled, a section costs one branch.
// CUEMOL_BENCH_TIMERS=0 keeps it off even then, for the overhead check.
//

#ifndef QLIB_BENCH_TIMER_HPP_INCLUDED
#define QLIB_BENCH_TIMER_HPP_INCLUDED

#include "qlib.hpp"

#include <chrono>
#include <vector>

namespace qlib {
namespace bench {

/// Turn sample recording on or off (the harness turns it on).
QLIB_API void setEnabled(bool b);
QLIB_API bool isEnabled();

/// crdSend samples in microseconds since the last reset, in call order.
QLIB_API const std::vector<double> &crdSendSamples();
QLIB_API void reset();

QLIB_API void addCrdSend(double us);

/// Times its own lifetime into crdSend when recording is on.
class CrdSendScope
{
public:
    CrdSendScope() : m_bOn(isEnabled())
    {
        if (m_bOn) m_t0 = std::chrono::steady_clock::now();
    }
    ~CrdSendScope()
    {
        if (!m_bOn) return;
        const auto dt = std::chrono::steady_clock::now() - m_t0;
        addCrdSend(std::chrono::duration<double, std::micro>(dt).count());
    }

private:
    bool m_bOn;
    std::chrono::steady_clock::time_point m_t0;
};

}  // namespace bench
}  // namespace qlib

#endif
