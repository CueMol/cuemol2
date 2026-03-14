#include <gtest/gtest.h>
#include <common.h>
#include "qsys/Renderer.hpp"
#include <qlib/Vector4D.hpp>

using qlib::LString;

namespace {

class MinimalRenderer : public qsys::Renderer {
public:
    const char *getTypeName() const override { return "minimal"; }
    bool isCompatibleObj(qsys::ObjectPtr) const override { return false; }
    qlib::Vector4D getCenter() const override { return qlib::Vector4D(); }
    void display(gfx::DisplayContext *) override {}
    void unloading() override {}
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

}  // namespace

TEST(RendererTest, UIDIsValid)
{
    MinimalRenderer r;
    EXPECT_NE(r.getUID(), qlib::invalid_uid);
}

TEST(RendererTest, TwoInstancesHaveDifferentUIDs)
{
    MinimalRenderer r1;
    MinimalRenderer r2;
    EXPECT_NE(r1.getUID(), r2.getUID());
}

TEST(RendererTest, DefaultVisibilityTrue)
{
    MinimalRenderer r;
    EXPECT_TRUE(r.isVisible());
}

TEST(RendererTest, DefaultLockedFalse)
{
    MinimalRenderer r;
    EXPECT_FALSE(r.isUILocked());
}

TEST(RendererTest, DefaultSceneIDInvalid)
{
    MinimalRenderer r;
    EXPECT_EQ(r.getSceneID(), qlib::invalid_uid);
}

TEST(RendererTest, DefaultClientObjInvalid)
{
    MinimalRenderer r;
    EXPECT_EQ(r.getClientObjID(), qlib::invalid_uid);
}

TEST(RendererTest, DefaultNameEmpty)
{
    MinimalRenderer r;
    EXPECT_TRUE(r.getName().isEmpty());
}

TEST(RendererTest, DefaultGroupNameEmpty)
{
    MinimalRenderer r;
    EXPECT_TRUE(r.getGroupName().isEmpty());
}

TEST(RendererTest, SetGetName)
{
    MinimalRenderer r;
    r.setName("myRend");
    EXPECT_EQ(r.getName(), LString("myRend"));
}

TEST(RendererTest, SetGetVisible)
{
    MinimalRenderer r;
    r.setVisible(false);
    EXPECT_FALSE(r.isVisible());
    r.setVisible(true);
    EXPECT_TRUE(r.isVisible());
}

TEST(RendererTest, SetGetLocked)
{
    MinimalRenderer r;
    r.setUILocked(true);
    EXPECT_TRUE(r.isUILocked());
    r.setUILocked(false);
    EXPECT_FALSE(r.isUILocked());
}

TEST(RendererTest, SetGetGroupName)
{
    MinimalRenderer r;
    r.setGroupName("grp1");
    EXPECT_EQ(r.getGroupName(), LString("grp1"));
}

TEST(RendererTest, IsNotTranspByDefault)
{
    MinimalRenderer r;
    EXPECT_FALSE(r.isTransp());
}

TEST(RendererTest, IsHitTestSupportedFalse)
{
    MinimalRenderer r;
    EXPECT_FALSE(r.isHitTestSupported());
}
