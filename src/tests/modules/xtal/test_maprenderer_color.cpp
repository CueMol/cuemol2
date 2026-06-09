// -*-Mode: C++;-*-
//
// Regression tests for MapRenderer color-property cache invalidation.
//

#include <gtest/gtest.h>
#include <common.h>
#include <gfx/SolidColor.hpp>
#include "xtal/MapSurfRenderer.hpp"
#include "xtal/MapRenderer.hpp"

using xtal::MapRenderer;
using xtal::MapSurfRenderer;

namespace {

// MapSurfRenderer is the concrete renderer used to exercise the shared
// MapRenderer property setters. invalidateDisplayCache() is virtual, so we
// override it to count invocations.
class CountingMapSurfRenderer : public MapSurfRenderer {
public:
    int m_nInvalidates = 0;
    void invalidateDisplayCache() override {
        ++m_nInvalidates;
        MapSurfRenderer::invalidateDisplayCache();
    }
};

}  // namespace

// In the display-list rendering path the color is baked into the cached display
// list, so changing the color property must invalidate the cache. Otherwise the
// stale list is reused and the surface color never updates (rendered gray).
// setColor must behave like its sibling setters (setColorMode etc.).
TEST(MapRendererColorTest, SetColorInvalidatesDisplayCache)
{
    CountingMapSurfRenderer r;
    r.m_nInvalidates = 0;

    gfx::ColorPtr col = gfx::SolidColor::createRGB(1.0, 0.0, 0.0);
    r.setColor(col);

    EXPECT_EQ(r.getColor().get(), col.get());
    EXPECT_GT(r.m_nInvalidates, 0);
}

// Sanity check on a known-correct sibling setter, confirming the test observes
// the right signal.
TEST(MapRendererColorTest, SetColorModeInvalidatesDisplayCache)
{
    CountingMapSurfRenderer r;
    r.m_nInvalidates = 0;

    r.setColorMode(MapRenderer::MAPREND_MULTIGRAD);

    EXPECT_GT(r.m_nInvalidates, 0);
}
