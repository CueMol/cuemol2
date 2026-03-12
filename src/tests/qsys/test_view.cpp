#include <gtest/gtest.h>
#include <common.h>
#include "qsys/TTYView.hpp"

using qlib::LString;

TEST(ViewTest, UIDIsValid)
{
    qsys::TTYView v;
    EXPECT_NE(v.getUID(), qlib::invalid_uid);
}

TEST(ViewTest, TwoViewsHaveDifferentUIDs)
{
    qsys::TTYView v1;
    qsys::TTYView v2;
    EXPECT_NE(v1.getUID(), v2.getUID());
}

TEST(ViewTest, DefaultNameEmpty)
{
    qsys::TTYView v;
    EXPECT_TRUE(v.getName().isEmpty());
}

TEST(ViewTest, SetGetName)
{
    qsys::TTYView v;
    v.setName("view1");
    EXPECT_EQ(v.getName(), LString("view1"));
}

TEST(ViewTest, DefaultIsActiveTrue)
{
    qsys::TTYView v;
    EXPECT_TRUE(v.isActive());
}

TEST(ViewTest, SetGetActive)
{
    qsys::TTYView v;
    v.setActive(false);
    EXPECT_FALSE(v.isActive());
}

TEST(ViewTest, DefaultSizeNonZero)
{
    qsys::TTYView v;
    EXPECT_EQ(v.getWidth(), 100);
    EXPECT_EQ(v.getHeight(), 100);
}

TEST(ViewTest, SetViewSize)
{
    qsys::TTYView v;
    v.setViewSize(800, 600);
    EXPECT_EQ(v.getWidth(), 800);
    EXPECT_EQ(v.getHeight(), 600);
}

TEST(ViewTest, DefaultTransMMSFalse)
{
    qsys::TTYView v;
    EXPECT_FALSE(v.isTransMMS());
}

TEST(ViewTest, SetGetTransMMS)
{
    qsys::TTYView v;
    v.setTransMMS(true);
    EXPECT_TRUE(v.isTransMMS());
}

TEST(ViewTest, DefaultRotMMSFalse)
{
    qsys::TTYView v;
    EXPECT_FALSE(v.isRotMMS());
}

TEST(ViewTest, SetGetRotMMS)
{
    qsys::TTYView v;
    v.setRotMMS(true);
    EXPECT_TRUE(v.isRotMMS());
}

TEST(ViewTest, DefaultCursorIsDefault)
{
    qsys::TTYView v;
    EXPECT_EQ(v.getCursor(), LString("default"));
}

TEST(ViewTest, SetGetCursor)
{
    qsys::TTYView v;
    v.setCursor("crosshair");
    EXPECT_EQ(v.getCursor(), LString("crosshair"));
}
