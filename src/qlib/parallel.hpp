//
// Thin CPU-parallel abstraction.
//
// Maps to Intel oneTBB when it is available (HAVE_TBB, enabled by the
// ENABLE_TBB build option) and falls back to a plain serial loop otherwise.
// Callers write the same code regardless of the build configuration.
//
// Runtime control (no rebuild needed): the CUEMOL_TBB_THREADS environment
// variable caps the number of worker threads. Set it to 1 to run effectively
// serially (useful for A/B timing against the parallel path); set it to N to
// use N threads; leave it unset for the default (all cores).
//

#ifndef QLIB_PARALLEL_HPP
#define QLIB_PARALLEL_HPP

#if defined(HAVE_CONFIG_H)
#  include "config.h"
#endif

#include <cstddef>

#if defined(HAVE_TBB)
#  include <tbb/blocked_range.h>
#  include <tbb/parallel_for.h>
#  include <tbb/info.h>
#  include <tbb/global_control.h>
#  include <cstdlib>
#  include <memory>
#endif

namespace qlib {

#if defined(HAVE_TBB)
namespace detail {

  /// Applies an optional process-wide oneTBB thread cap read once from the
  /// CUEMOL_TBB_THREADS environment variable (>= 1). The global_control is kept
  /// alive for the rest of the run. Unset / 0 / negative means "all cores".
  struct TbbThreadLimit
  {
    std::unique_ptr<tbb::global_control> ctl;
    TbbThreadLimit()
    {
      const char *env = std::getenv("CUEMOL_TBB_THREADS");
      if (env != nullptr && env[0] != '\0') {
        const int n = std::atoi(env);
        if (n >= 1)
          ctl.reset(new tbb::global_control(
              tbb::global_control::max_allowed_parallelism, (std::size_t) n));
      }
    }
  };

  /// Construct the thread-cap holder once (thread-safe in C++11).
  inline void ensureThreadLimit()
  {
    static TbbThreadLimit inst;
    (void) inst;
  }

}  // namespace detail
#endif

/// True when CPU parallelism (oneTBB) is compiled in. When false, parallel_for
/// always runs serially.
inline bool parallel_enabled()
{
#if defined(HAVE_TBB)
  return true;
#else
  return false;
#endif
}

/// Effective maximum number of worker threads parallel_for may use, honoring
/// the CUEMOL_TBB_THREADS cap. 1 means it runs serially.
inline int parallel_max_concurrency()
{
#if defined(HAVE_TBB)
  detail::ensureThreadLimit();
  return (int) tbb::global_control::active_value(
      tbb::global_control::max_allowed_parallelism);
#else
  return 1;
#endif
}

/// Apply fn(i) for every index i in the half-open range [begin, end).
///
/// When oneTBB is enabled (and more than one thread is allowed) the range is
/// split across worker threads, so fn must be safe to call concurrently for
/// distinct indices. The whole range is covered exactly once; an empty range
/// (begin >= end) calls fn zero times.
template <typename Func>
inline void parallel_for(std::size_t begin, std::size_t end, const Func &fn)
{
#if defined(HAVE_TBB)
  if (parallel_max_concurrency() <= 1) {
    // Forced serial (e.g. CUEMOL_TBB_THREADS=1): skip the TBB scheduler.
    for (std::size_t i = begin; i < end; ++i)
      fn(i);
    return;
  }
  tbb::parallel_for(
      tbb::blocked_range<std::size_t>(begin, end),
      [&fn](const tbb::blocked_range<std::size_t> &range) {
        for (std::size_t i = range.begin(); i != range.end(); ++i) {
          fn(i);
        }
      });
#else
  for (std::size_t i = begin; i < end; ++i) {
    fn(i);
  }
#endif
}

}  // namespace qlib

#endif  // QLIB_PARALLEL_HPP
