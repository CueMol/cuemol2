#include <gtest/gtest.h>
#include <common.h>
#include "qsys/DispListRenderer.hpp"

namespace {

class MinimalDispListRenderer : public qsys::DispListRenderer {
public:
    const char *getTypeName() const override { return "minimal_dl"; }
    bool isCompatibleObj(qsys::ObjectPtr) const override { return false; }
    qlib::Vector4D getCenter() const override { return qlib::Vector4D(); }
    void render(gfx::DisplayContext *) override {}
    void unloading() override {}
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

}  // namespace

TEST(DispListRendererTest, ConstructAndDestruct)
{
    MinimalDispListRenderer r;
    // construction and destruction must not crash
}

TEST(DispListRendererTest, InvalidateDisplayCacheWithoutContext)
{
    MinimalDispListRenderer r;
    // invalidate on a freshly constructed renderer (no DisplayContext) must not crash
    r.invalidateDisplayCache();
}

TEST(DispListRendererTest, InvalidateHittestCacheWithoutContext)
{
    MinimalDispListRenderer r;
    r.invalidateHittestCache();
}

TEST(DispListRendererTest, MultipleInvalidateSafe)
{
    MinimalDispListRenderer r;
    r.invalidateDisplayCache();
    r.invalidateDisplayCache();
    r.invalidateHittestCache();
    r.invalidateHittestCache();
}
