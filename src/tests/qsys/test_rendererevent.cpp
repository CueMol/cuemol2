#include <gtest/gtest.h>
#include <common.h>
#include "qsys/RendererEvent.hpp"
#include "qsys/ScrEventManager.hpp"

using qlib::LString;
using qsys::RendererEvent;
using qsys::ScrEventManager;

TEST(RendererEventTest, DefaultValues)
{
    RendererEvent ev;
    EXPECT_EQ(ev.getType(), 0);
    EXPECT_EQ(ev.getTarget(), qlib::invalid_uid);
    EXPECT_TRUE(ev.getDescr().isEmpty());
    EXPECT_EQ(ev.getPropEvent(), nullptr);
}

TEST(RendererEventTest, SetGetType)
{
    RendererEvent ev;
    ev.setType(RendererEvent::RNE_CHANGED);
    EXPECT_EQ(ev.getType(), RendererEvent::RNE_CHANGED);

    ev.setType(RendererEvent::RNE_PROPCHG);
    EXPECT_EQ(ev.getType(), RendererEvent::RNE_PROPCHG);
}

TEST(RendererEventTest, SetGetTargetAndDescr)
{
    RendererEvent ev;
    ev.setTarget(99);
    ev.setDescr("rendDescr");
    EXPECT_EQ(ev.getTarget(), 99);
    EXPECT_EQ(ev.getDescr(), "rendDescr");
}

TEST(RendererEventTest, CopyConstructor)
{
    RendererEvent orig;
    orig.setType(RendererEvent::RNE_CHANGED);
    orig.setTarget(55);
    orig.setDescr("rend");

    RendererEvent copy(orig);
    EXPECT_EQ(copy.getType(), RendererEvent::RNE_CHANGED);
    EXPECT_EQ(copy.getTarget(), 55);
    EXPECT_EQ(copy.getDescr(), "rend");
}

TEST(RendererEventTest, GetJSONChanged)
{
    RendererEvent ev;
    ev.setType(RendererEvent::RNE_CHANGED);
    ev.setTarget(7);
    ev.setDescr("rendChanged");
    LString json = ev.getJSON();
    EXPECT_FALSE(json.isEmpty());
    EXPECT_NE(json.indexOf("target_uid"), -1);
    EXPECT_NE(json.indexOf("descr"), -1);
}

TEST(RendererEventTest, GetCategoryChanged)
{
    RendererEvent ev;
    ev.setType(RendererEvent::RNE_CHANGED);
    ev.setDescr("rendChg");

    LString category;
    int nSrcType = 0, nEvtType = 0;
    bool ret = ev.getCategory(category, nSrcType, nEvtType);

    EXPECT_TRUE(ret);
    EXPECT_EQ(nEvtType, ScrEventManager::SEM_CHANGED);
    EXPECT_EQ(nSrcType, ScrEventManager::SEM_RENDERER);
    EXPECT_EQ(category, "rendChg");
}

TEST(RendererEventTest, GetCategoryPropChg)
{
    RendererEvent ev;
    ev.setType(RendererEvent::RNE_PROPCHG);
    ev.setDescr("propDesc");

    LString category;
    int nSrcType = 0, nEvtType = 0;
    bool ret = ev.getCategory(category, nSrcType, nEvtType);

    EXPECT_TRUE(ret);
    EXPECT_EQ(nEvtType, ScrEventManager::SEM_PROPCHG);
    EXPECT_EQ(nSrcType, ScrEventManager::SEM_RENDERER);
}
