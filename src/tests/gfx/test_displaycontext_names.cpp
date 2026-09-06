// Tests for the DisplayContext name stack / renderer table used by the GPU
// ID-buffer pick pass (base-class state; HittestContext overrides it for the
// CPU point hit test).

#include <gtest/gtest.h>
#include <common.h>

#include "gfx/DisplayContext.hpp"
#include <qlib/Vector4D.hpp>

using qlib::Vector4D;

namespace {

class StubDC : public gfx::DisplayContext
{
public:
    bool setCurrent() override { return true; }
    bool isCurrent() const override { return true; }
    bool isFile() const override { return false; }
    void vertex(const Vector4D &) override {}
    void normal(const Vector4D &) override {}
    void setPolygonMode(int) override {}
    void startPoints() override {}
    void startPolygon() override {}
    void startLines() override {}
    void startLineStrip() override {}
    void startTriangles() override {}
    void startTriangleStrip() override {}
    void startTriangleFan() override {}
    void startQuadStrip() override {}
    void startQuads() override {}
    void end() override {}
};

}  // namespace

TEST(DisplayContextNames, NameStackAndEncoding)
{
    StubDC dc;

    // Initial state: a single "no name" entry.
    EXPECT_EQ(dc.getCurrentName(), -1);
    EXPECT_EQ(dc.getOuterName(), -1);

    // loadName replaces the top; pushName adds a level (the previous top
    // becomes the outer name, as in HittestContext / SymmRenderer).
    dc.loadName(42);
    EXPECT_EQ(dc.getCurrentName(), 42);
    EXPECT_EQ(dc.getOuterName(), -1);
    dc.pushName(-1);
    EXPECT_EQ(dc.getCurrentName(), -1);
    EXPECT_EQ(dc.getOuterName(), 42);
    dc.loadName(7);
    EXPECT_EQ(dc.getCurrentName(), 7);
    EXPECT_EQ(dc.getOuterName(), 42);
    dc.popName();
    EXPECT_EQ(dc.getCurrentName(), 42);
    // The bottom entry is never popped.
    dc.popName();
    dc.popName();
    EXPECT_EQ(dc.getCurrentName(), 42);
    dc.resetNames();
    EXPECT_EQ(dc.getCurrentName(), -1);

    // Attribute / texel encoding: 0 is reserved for "no name".
    EXPECT_EQ(gfx::encodeHitName(-1), 0u);
    EXPECT_EQ(gfx::encodeHitName(0), 1u);
    EXPECT_EQ(gfx::decodeHitName(0u), -1);
    EXPECT_EQ(gfx::decodeHitName(gfx::encodeHitName(123456)), 123456);
}

TEST(DisplayContextNames, StartHitFillsRendererTable)
{
    StubDC dc;
    EXPECT_EQ(dc.getHitRendIndex(), 0u);

    dc.startHit(1001);
    EXPECT_EQ(dc.getHitRendIndex(), 1u);
    dc.endHit();
    EXPECT_EQ(dc.getHitRendIndex(), 0u);
    dc.startHit(1002);
    EXPECT_EQ(dc.getHitRendIndex(), 2u);
    dc.endHit();

    ASSERT_EQ(dc.getHitRendTable().size(), 2u);
    EXPECT_EQ(dc.getHitRendTable()[0], 1001u);
    EXPECT_EQ(dc.getHitRendTable()[1], 1002u);

    dc.resetHitRendTable();
    EXPECT_TRUE(dc.getHitRendTable().empty());
    EXPECT_EQ(dc.getHitRendIndex(), 0u);
}
