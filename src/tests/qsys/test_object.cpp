#include <gtest/gtest.h>
#include <common.h>
#include "qsys/Object.hpp"

using qlib::LString;

namespace {

class ConcreteObject : public qsys::Object {
public:
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

}  // namespace

TEST(ObjectTest, UIDIsValid)
{
    ConcreteObject obj;
    EXPECT_NE(obj.getUID(), qlib::invalid_uid);
}

TEST(ObjectTest, TwoInstancesHaveDifferentUIDs)
{
    ConcreteObject obj1;
    ConcreteObject obj2;
    EXPECT_NE(obj1.getUID(), obj2.getUID());
}

TEST(ObjectTest, DefaultSceneIDInvalid)
{
    ConcreteObject obj;
    EXPECT_EQ(obj.getSceneID(), qlib::invalid_uid);
}

TEST(ObjectTest, DefaultVisibilityTrue)
{
    ConcreteObject obj;
    EXPECT_TRUE(obj.isVisible());
}

TEST(ObjectTest, DefaultLockedFalse)
{
    ConcreteObject obj;
    EXPECT_FALSE(obj.isUILocked());
}

TEST(ObjectTest, DefaultModifiedFlagFalse)
{
    ConcreteObject obj;
    EXPECT_FALSE(obj.getModifiedFlag());
}

TEST(ObjectTest, DefaultUICollapsedFalse)
{
    ConcreteObject obj;
    EXPECT_FALSE(obj.isUICollapsed());
}

TEST(ObjectTest, DefaultNameEmpty)
{
    ConcreteObject obj;
    EXPECT_TRUE(obj.getName().isEmpty());
}

TEST(ObjectTest, SetGetName)
{
    ConcreteObject obj;
    obj.setName("testObj");
    EXPECT_EQ(obj.getName(), LString("testObj"));
}

TEST(ObjectTest, SetGetVisible)
{
    ConcreteObject obj;
    obj.setVisible(false);
    EXPECT_FALSE(obj.isVisible());
    obj.setVisible(true);
    EXPECT_TRUE(obj.isVisible());
}

TEST(ObjectTest, SetGetLocked)
{
    ConcreteObject obj;
    obj.setUILocked(true);
    EXPECT_TRUE(obj.isUILocked());
    obj.setUILocked(false);
    EXPECT_FALSE(obj.isUILocked());
}

TEST(ObjectTest, SetGetUICollapsed)
{
    ConcreteObject obj;
    obj.setUICollapsed(true);
    EXPECT_TRUE(obj.isUICollapsed());
    obj.setUICollapsed(false);
    EXPECT_FALSE(obj.isUICollapsed());
}

TEST(ObjectTest, SetGetModifiedFlag)
{
    ConcreteObject obj;
    obj.setModifiedFlag(true);
    EXPECT_TRUE(obj.getModifiedFlag());
    obj.setModifiedFlag(false);
    EXPECT_FALSE(obj.getModifiedFlag());
}

TEST(ObjectTest, DefaultSourceEmpty)
{
    ConcreteObject obj;
    EXPECT_TRUE(obj.getSource().isEmpty());
}

TEST(ObjectTest, SetGetSource)
{
    ConcreteObject obj;
    obj.setSource("/path/to/file.pdb");
    EXPECT_EQ(obj.getSource(), LString("/path/to/file.pdb"));
}

TEST(ObjectTest, SetGetSourceType)
{
    ConcreteObject obj;
    obj.setSourceType("pdb");
    EXPECT_EQ(obj.getSourceType(), LString("pdb"));
}

TEST(ObjectTest, ForceEmbedSetsDataChunkSource)
{
    ConcreteObject obj;
    obj.setSource("/path/to/file.pdb");
    obj.forceEmbed();
    EXPECT_TRUE(obj.getSource().startsWith("datachunk:"));
    EXPECT_TRUE(obj.getAltSource().isEmpty());
}
