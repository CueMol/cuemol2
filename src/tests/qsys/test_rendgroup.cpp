#include <gtest/gtest.h>
#include <common.h>
#include "qsys/RendGroup.hpp"
#include "qsys/Object.hpp"

using qlib::LString;

TEST(RendGroupTest, TypeName)
{
    qsys::RendGroup rg;
    EXPECT_STREQ(rg.getTypeName(), "*group");
}

TEST(RendGroupTest, ToString)
{
    qsys::RendGroup rg;
    EXPECT_EQ(rg.toString(), LString("Renderer group"));
}

// isCompatibleObj ignores the argument and always returns true
TEST(RendGroupTest, IsCompatibleObjAlwaysTrue)
{
    qsys::RendGroup rg;
    EXPECT_TRUE(rg.isCompatibleObj(qsys::ObjectPtr()));
}

TEST(RendGroupTest, UICollapsedDefaultFalse)
{
    qsys::RendGroup rg;
    EXPECT_FALSE(rg.isUICollapsed());
}

TEST(RendGroupTest, SetUICollapsed)
{
    qsys::RendGroup rg;
    rg.setUICollapsed(true);
    EXPECT_TRUE(rg.isUICollapsed());
    rg.setUICollapsed(false);
    EXPECT_FALSE(rg.isUICollapsed());
}

TEST(RendGroupTest, DefaultVisibilityTrue)
{
    qsys::RendGroup rg;
    EXPECT_TRUE(rg.isVisible());
}

TEST(RendGroupTest, DefaultLockedFalse)
{
    qsys::RendGroup rg;
    EXPECT_FALSE(rg.isUILocked());
}

TEST(RendGroupTest, IsHitTestSupportedFalse)
{
    qsys::RendGroup rg;
    EXPECT_FALSE(rg.isHitTestSupported());
}

TEST(RendGroupTest, DefaultGroupNameEmpty)
{
    qsys::RendGroup rg;
    EXPECT_TRUE(rg.getGroupName().isEmpty());
}
