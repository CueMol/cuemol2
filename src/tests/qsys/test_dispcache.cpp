#include <gtest/gtest.h>
#include <common.h>
#include "qsys/DispCacheRenderer.hpp"

// DispListCacheImpl is the concrete cache implementation inside DispCacheRenderer.
// Tests verify it can be constructed and invalidated without a DisplayContext.

TEST(DispListCacheImplTest, ConstructAndInvalidate)
{
    qsys::DispListCacheImpl cache;
    // invalidate on a freshly constructed (null-pointer) cache must not crash
    cache.invalidate();
    cache.invalidateHit();
}

TEST(DispListCacheImplTest, MultipleInvalidateSafe)
{
    qsys::DispListCacheImpl cache;
    cache.invalidate();
    cache.invalidate();     // second call with already-null ptrs must not crash
    cache.invalidateHit();
    cache.invalidateHit();
}
