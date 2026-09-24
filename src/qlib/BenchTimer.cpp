// -*-Mode: C++;-*-
//
// Benchmark timer for the GPU-transfer ablation (bench/ablation branch only).
//

#include <common.h>

#include "BenchTimer.hpp"

#include <cstdlib>
#include <cstring>

namespace qlib {
namespace bench {

namespace {

bool s_bEnabled = false;
std::vector<double> s_crdSend;

bool envAllows()
{
    const char *env = std::getenv("CUEMOL_BENCH_TIMERS");
    return env == nullptr || std::strcmp(env, "0") != 0;
}

}  // namespace

void setEnabled(bool b)
{
    s_bEnabled = b && envAllows();
    if (s_bEnabled && s_crdSend.capacity() == 0) s_crdSend.reserve(1 << 16);
}

bool isEnabled()
{
    return s_bEnabled;
}

const std::vector<double> &crdSendSamples()
{
    return s_crdSend;
}

void reset()
{
    s_crdSend.clear();
}

void addCrdSend(double us)
{
    s_crdSend.push_back(us);
}

}  // namespace bench
}  // namespace qlib
