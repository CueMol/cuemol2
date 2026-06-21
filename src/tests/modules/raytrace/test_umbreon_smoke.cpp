#include <gtest/gtest.h>

#include "modules/raytrace/umbreon_smoke.hpp"

// Build-system integration smoke: umbreon links into the cuemol2 build and its
// Embree-backed render() produces a non-empty frame for a trivial scene. This
// proves the deplibs-bundled Embree/TBB + umbreon static link works end to end;
// it is not a rendering-correctness test.
TEST(UmbreonSmoke, RendersTrivialSceneIntoNonEmptyFrame)
{
    const raytrace::UmbreonSmokeResult res = raytrace::renderUmbreonSmoke();

    EXPECT_EQ(res.width, 64);
    EXPECT_EQ(res.height, 64);
    EXPECT_GE(res.renderSeconds, 0.0);
    // The lit quad covers a large central region of the 64x64 frame; require a
    // substantial fraction to be non-background.
    EXPECT_GT(res.nonBackgroundPixels, 1000u);
}
