// Tests for the nearest-first search of the pick target readback window.

#include <gtest/gtest.h>
#include <common.h>

#include "gfx/PickBuffer.hpp"

#include <vector>

namespace {

// w*h texels, 4 uints each, row-major (bottom-left origin).
struct Window
{
    int w, h;
    std::vector<qlib::quint32> data;
    Window(int aw, int ah) : w(aw), h(ah), data(size_t(aw) * size_t(ah) * 4u, 0u) {}
    void set(int x, int y, qlib::quint32 rend, qlib::quint32 name, qlib::quint32 outer)
    {
        qlib::quint32 *p = &data[(size_t(y) * size_t(w) + size_t(x)) * 4u];
        p[0] = rend;
        p[1] = name;
        p[2] = outer;
        p[3] = 0u;
    }
};

}  // namespace

TEST(PickBuffer, NearestTexelWinsAndEmptyWindowMisses)
{
    Window win(5, 5);
    gfx::PickTexel t;

    // Empty window: no hit, even with a radius.
    EXPECT_FALSE(gfx::findNearestPickTexel(win.data.data(), 5, 5, 2, 2, 2, t));

    // Two hits: (2,0) at distance 2 straight along x, (1,1) diagonal at
    // sqrt(2) -> the diagonal one is nearer and must win.
    win.set(4, 2, 1u, 10u, 0u);  // dx=+2, dy=0
    win.set(3, 3, 2u, 20u, 5u);  // dx=+1, dy=+1
    ASSERT_TRUE(gfx::findNearestPickTexel(win.data.data(), 5, 5, 2, 2, 2, t));
    EXPECT_EQ(t.rend, 2u);
    EXPECT_EQ(t.name, 20u);
    EXPECT_EQ(t.outer, 5u);
    EXPECT_EQ(t.dx, 1);
    EXPECT_EQ(t.dy, 1);

    // The centre texel itself takes precedence over any ring.
    win.set(2, 2, 3u, 30u, 0u);
    ASSERT_TRUE(gfx::findNearestPickTexel(win.data.data(), 5, 5, 2, 2, 2, t));
    EXPECT_EQ(t.rend, 3u);
    EXPECT_EQ(t.dx, 0);
    EXPECT_EQ(t.dy, 0);

    // Radius 0 only looks at the centre.
    Window win2(5, 5);
    win2.set(3, 2, 1u, 1u, 0u);
    EXPECT_FALSE(gfx::findNearestPickTexel(win2.data.data(), 5, 5, 2, 2, 0, t));
    EXPECT_TRUE(gfx::findNearestPickTexel(win2.data.data(), 5, 5, 2, 2, 1, t));
}

TEST(PickBuffer, CentreNearWindowEdgeStaysInBounds)
{
    // Centre at the corner with a radius larger than the window: rings that
    // fall outside are skipped, and a hit on the far side is still found.
    Window win(3, 3);
    win.set(2, 2, 7u, 70u, 0u);
    gfx::PickTexel t;
    ASSERT_TRUE(gfx::findNearestPickTexel(win.data.data(), 3, 3, 0, 0, 5, t));
    EXPECT_EQ(t.rend, 7u);
    EXPECT_EQ(t.dx, 2);
    EXPECT_EQ(t.dy, 2);
}
