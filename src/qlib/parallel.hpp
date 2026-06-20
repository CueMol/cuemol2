//
// Thin CPU-parallel abstraction.
//
// Maps to Intel oneTBB when it is available (HAVE_TBB, enabled by the
// ENABLE_TBB build option) and falls back to a plain serial loop otherwise.
// Callers write the same code regardless of the build configuration.
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
#endif

namespace qlib {

/// True when CPU parallelism (oneTBB) is compiled in. When false, parallel_for
/// falls back to a serial loop.
inline bool parallel_enabled()
{
#if defined(HAVE_TBB)
    return true;
#else
    return false;
#endif
}

/// Maximum number of worker threads parallel_for may use (1 when serial). This
/// is oneTBB's default concurrency, i.e. how many threads it will try to use.
inline int parallel_max_concurrency()
{
#if defined(HAVE_TBB)
    return tbb::info::default_concurrency();
#else
    return 1;
#endif
}

/// Apply fn(i) for every index i in the half-open range [begin, end).
///
/// When oneTBB is enabled the range is split across worker threads, so fn must
/// be safe to call concurrently for distinct indices. The whole range is
/// covered exactly once; an empty range (begin >= end) calls fn zero times.
template <typename Func>
inline void parallel_for(std::size_t begin, std::size_t end, const Func &fn)
{
#if defined(HAVE_TBB)
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
