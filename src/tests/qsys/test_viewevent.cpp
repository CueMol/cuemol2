#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ViewEvent.hpp"
#include "qsys/ScrEventManager.hpp"

using qlib::LString;
using qsys::ViewEvent;
using qsys::ScrEventManager;

TEST(ViewEventTest, DefaultValues)
{
    ViewEvent ev;
    EXPECT_EQ(ev.getType(), 0);
    EXPECT_EQ(ev.getTarget(), qlib::invalid_uid);
    EXPECT_TRUE(ev.getDescr().isEmpty());
    EXPECT_EQ(ev.getTargetPtr(), nullptr);
}

TEST(ViewEventTest, SetGetType)
{
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG);
    EXPECT_EQ(ev.getType(), ViewEvent::VWE_PROPCHG);

    ev.setType(ViewEvent::VWE_SIZECHG);
    EXPECT_EQ(ev.getType(), ViewEvent::VWE_SIZECHG);
}

TEST(ViewEventTest, SetGetTargetAndDescr)
{
    ViewEvent ev;
    ev.setTarget(200);
    ev.setDescr("viewProp");
    EXPECT_EQ(ev.getTarget(), 200);
    EXPECT_EQ(ev.getDescr(), "viewProp");
}

TEST(ViewEventTest, CopyConstructor)
{
    ViewEvent orig;
    orig.setType(ViewEvent::VWE_ACTIVATED);
    orig.setTarget(33);
    orig.setDescr("activated");

    ViewEvent copy(orig);
    EXPECT_EQ(copy.getType(), ViewEvent::VWE_ACTIVATED);
    EXPECT_EQ(copy.getTarget(), 33);
    EXPECT_EQ(copy.getDescr(), "activated");
    EXPECT_EQ(copy.getTargetPtr(), orig.getTargetPtr());
}

TEST(ViewEventTest, GetCategoryPropChg)
{
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG);
    LString cat; int tgt = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, tgt, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_PROPCHG);
    EXPECT_EQ(tgt, ScrEventManager::SEM_VIEW);
    EXPECT_EQ(cat, "viewPropChanged");
}

TEST(ViewEventTest, GetCategoryPropChgDragging)
{
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG_DRG);
    LString cat; int tgt = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, tgt, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_PROPCHG);
    EXPECT_EQ(tgt, ScrEventManager::SEM_VIEW);
    EXPECT_EQ(cat, "viewPropChgDragging");
}

TEST(ViewEventTest, GetCategoryActivated)
{
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_ACTIVATED);
    LString cat; int tgt = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, tgt, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_OTHER);
    EXPECT_EQ(tgt, ScrEventManager::SEM_VIEW);
    EXPECT_EQ(cat, "viewActivated");
}

TEST(ViewEventTest, GetCategorySizeChanged)
{
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_SIZECHG);
    LString cat; int tgt = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, tgt, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_CHANGED);
    EXPECT_EQ(tgt, ScrEventManager::SEM_VIEW);
    EXPECT_EQ(cat, "viewSizeChanged");
}

TEST(ViewEventTest, GetJSONPropChgNoDragging)
{
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG);
    ev.setTarget(8);
    ev.setDescr("zoom");
    LString json = ev.getJSON();
    EXPECT_NE(json.indexOf("dragging"), -1);
    EXPECT_NE(json.indexOf("false"), -1);
    EXPECT_NE(json.indexOf("target_uid"), -1);
}

TEST(ViewEventTest, GetJSONPropChgDragging)
{
    ViewEvent ev;
    ev.setType(ViewEvent::VWE_PROPCHG_DRG);
    ev.setTarget(9);
    ev.setDescr("zoom");
    LString json = ev.getJSON();
    EXPECT_NE(json.indexOf("dragging"), -1);
    EXPECT_NE(json.indexOf("true"), -1);
}
