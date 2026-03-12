#include <gtest/gtest.h>
#include <common.h>
#include "qsys/InDevEvent.hpp"

using qlib::LString;
using qsys::InDevEvent;

TEST(InDevEventTest, DefaultValues)
{
    InDevEvent ev;
    EXPECT_EQ(ev.getType(), InDevEvent::INDEV_NONE);
    EXPECT_EQ(ev.getModifier(), 0);
    EXPECT_FALSE(ev.isConsumed());
    EXPECT_EQ(ev.getX(), 0);
    EXPECT_EQ(ev.getY(), 0);
    EXPECT_EQ(ev.getDeltaX(), 0);
    EXPECT_EQ(ev.getDeltaY(), 0);
    EXPECT_DOUBLE_EQ(ev.getVeloX(), 0.0);
    EXPECT_DOUBLE_EQ(ev.getVeloY(), 0.0);
    EXPECT_EQ(ev.getSource(), nullptr);
}

TEST(InDevEventTest, SetGetType)
{
    InDevEvent ev;
    ev.setType(InDevEvent::INDEV_LBTN_CLICK);
    EXPECT_EQ(ev.getType(), InDevEvent::INDEV_LBTN_CLICK);

    ev.setType(InDevEvent::INDEV_DRAG_START);
    EXPECT_EQ(ev.getType(), InDevEvent::INDEV_DRAG_START);
}

TEST(InDevEventTest, ModifierFlags)
{
    InDevEvent ev;
    ev.setModifier(InDevEvent::INDEV_SHIFT | InDevEvent::INDEV_CTRL);
    EXPECT_TRUE(ev.isShiftOn());
    EXPECT_TRUE(ev.isCtrlOn());
    EXPECT_FALSE(ev.isAltOn());
    EXPECT_FALSE(ev.isLButtonOn());
    EXPECT_FALSE(ev.isRButtonOn());
    EXPECT_FALSE(ev.isMButtonOn());
}

TEST(InDevEventTest, AllModifierFlags)
{
    InDevEvent ev;
    int allMods = InDevEvent::INDEV_SHIFT | InDevEvent::INDEV_CTRL |
                  InDevEvent::INDEV_ALT   | InDevEvent::INDEV_LBTN |
                  InDevEvent::INDEV_MBTN  | InDevEvent::INDEV_RBTN;
    ev.setModifier(allMods);
    EXPECT_TRUE(ev.isShiftOn());
    EXPECT_TRUE(ev.isCtrlOn());
    EXPECT_TRUE(ev.isAltOn());
    EXPECT_TRUE(ev.isLButtonOn());
    EXPECT_TRUE(ev.isMButtonOn());
    EXPECT_TRUE(ev.isRButtonOn());
}

TEST(InDevEventTest, ConsumedFlag)
{
    InDevEvent ev;
    EXPECT_FALSE(ev.isConsumed());
    ev.setConsumed(true);
    EXPECT_TRUE(ev.isConsumed());
    ev.setConsumed(false);
    EXPECT_FALSE(ev.isConsumed());
}

TEST(InDevEventTest, CoordinateSetGet)
{
    InDevEvent ev;
    ev.setX(100);
    ev.setY(200);
    ev.setDeltaX(10);
    ev.setDeltaY(20);
    ev.setMoveX(5);
    ev.setMoveY(15);
    ev.setRootX(300);
    ev.setRootY(400);
    EXPECT_EQ(ev.getX(), 100);
    EXPECT_EQ(ev.getY(), 200);
    EXPECT_EQ(ev.getDeltaX(), 10);
    EXPECT_EQ(ev.getDeltaY(), 20);
    EXPECT_EQ(ev.getMoveX(), 5);
    EXPECT_EQ(ev.getMoveY(), 15);
    EXPECT_EQ(ev.getRootX(), 300);
    EXPECT_EQ(ev.getRootY(), 400);
}

TEST(InDevEventTest, VelocitySetGet)
{
    InDevEvent ev;
    ev.setVeloX(1.5);
    ev.setVeloY(-2.5);
    EXPECT_DOUBLE_EQ(ev.getVeloX(), 1.5);
    EXPECT_DOUBLE_EQ(ev.getVeloY(), -2.5);
}

TEST(InDevEventTest, CopyConstructor)
{
    InDevEvent orig;
    orig.setType(InDevEvent::INDEV_WHEEL);
    orig.setModifier(InDevEvent::INDEV_SHIFT);
    orig.setX(50);
    orig.setY(60);
    orig.setVeloX(3.0);
    orig.setConsumed(true);

    InDevEvent copy(orig);
    EXPECT_EQ(copy.getType(), InDevEvent::INDEV_WHEEL);
    EXPECT_EQ(copy.getModifier(), InDevEvent::INDEV_SHIFT);
    EXPECT_EQ(copy.getX(), 50);
    EXPECT_EQ(copy.getY(), 60);
    EXPECT_DOUBLE_EQ(copy.getVeloX(), 3.0);
    EXPECT_TRUE(copy.isConsumed());
}

TEST(InDevEventTest, AssignmentOperator)
{
    InDevEvent a;
    a.setType(InDevEvent::INDEV_RBTN_CLICK);
    a.setX(77);

    InDevEvent b;
    b = a;
    EXPECT_EQ(b.getType(), InDevEvent::INDEV_RBTN_CLICK);
    EXPECT_EQ(b.getX(), 77);
}

TEST(InDevEventTest, SelfAssignment)
{
    InDevEvent ev;
    ev.setType(InDevEvent::INDEV_DRAG_MOVE);
    ev.setX(42);
    ev = ev;
    EXPECT_EQ(ev.getType(), InDevEvent::INDEV_DRAG_MOVE);
    EXPECT_EQ(ev.getX(), 42);
}

TEST(InDevEventTest, GetJSON)
{
    InDevEvent ev;
    ev.setX(10);
    ev.setY(20);
    ev.setModifier(InDevEvent::INDEV_SHIFT);
    LString json = ev.getJSON();
    EXPECT_FALSE(json.isEmpty());
    EXPECT_NE(json.indexOf("\"x\""), -1);
    EXPECT_NE(json.indexOf("\"y\""), -1);
    EXPECT_NE(json.indexOf("\"mod\""), -1);
}
