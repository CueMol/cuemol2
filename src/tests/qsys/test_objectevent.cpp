#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ObjectEvent.hpp"
#include "qsys/ScrEventManager.hpp"

using qlib::LString;
using qsys::ObjectEvent;
using qsys::ScrEventManager;

TEST(ObjectEventTest, DefaultValues)
{
    ObjectEvent ev;
    EXPECT_EQ(ev.getType(), 0);
    EXPECT_EQ(ev.getTarget(), qlib::invalid_uid);
    EXPECT_TRUE(ev.getDescr().isEmpty());
    EXPECT_EQ(ev.getPropEvent(), nullptr);
}

TEST(ObjectEventTest, SetGetType)
{
    ObjectEvent ev;
    ev.setType(ObjectEvent::OBE_CHANGED);
    EXPECT_EQ(ev.getType(), ObjectEvent::OBE_CHANGED);

    ev.setType(ObjectEvent::OBE_PROPCHG);
    EXPECT_EQ(ev.getType(), ObjectEvent::OBE_PROPCHG);
}

TEST(ObjectEventTest, SetGetTargetAndDescr)
{
    ObjectEvent ev;
    ev.setTarget(123);
    ev.setDescr("testDescr");
    EXPECT_EQ(ev.getTarget(), 123);
    EXPECT_EQ(ev.getDescr(), "testDescr");
}

TEST(ObjectEventTest, CopyConstructor)
{
    ObjectEvent orig;
    orig.setType(ObjectEvent::OBE_CHANGED);
    orig.setTarget(42);
    orig.setDescr("desc");

    ObjectEvent copy(orig);
    EXPECT_EQ(copy.getType(), ObjectEvent::OBE_CHANGED);
    EXPECT_EQ(copy.getTarget(), 42);
    EXPECT_EQ(copy.getDescr(), "desc");
}

TEST(ObjectEventTest, GetJSONChanged)
{
    ObjectEvent ev;
    ev.setType(ObjectEvent::OBE_CHANGED);
    ev.setTarget(10);
    ev.setDescr("changed");
    LString json = ev.getJSON();
    EXPECT_FALSE(json.isEmpty());
    EXPECT_NE(json.indexOf("target_uid"), -1);
    EXPECT_NE(json.indexOf("descr"), -1);
}

TEST(ObjectEventTest, GetCategoryChanged)
{
    ObjectEvent ev;
    ev.setType(ObjectEvent::OBE_CHANGED);
    ev.setDescr("objChanged");

    LString category;
    int nSrcType = 0, nEvtType = 0;
    bool ret = ev.getCategory(category, nSrcType, nEvtType);

    EXPECT_TRUE(ret);
    EXPECT_EQ(nEvtType, ScrEventManager::SEM_CHANGED);
    EXPECT_EQ(nSrcType, ScrEventManager::SEM_OBJECT);
    EXPECT_EQ(category, "objChanged");
}

TEST(ObjectEventTest, GetCategoryPropChg)
{
    ObjectEvent ev;
    ev.setType(ObjectEvent::OBE_PROPCHG);
    ev.setDescr("propDesc");

    LString category;
    int nSrcType = 0, nEvtType = 0;
    bool ret = ev.getCategory(category, nSrcType, nEvtType);

    EXPECT_TRUE(ret);
    EXPECT_EQ(nEvtType, ScrEventManager::SEM_PROPCHG);
    EXPECT_EQ(nSrcType, ScrEventManager::SEM_OBJECT);
}
