#include <gtest/gtest.h>
#include <common.h>
#include "qsys/SceneEvent.hpp"
#include "qsys/ScrEventManager.hpp"

using qlib::LString;
using qsys::SceneEvent;
using qsys::ScrEventManager;

TEST(SceneEventTest, DefaultValues)
{
    SceneEvent ev;
    EXPECT_EQ(ev.getType(), 0);
    EXPECT_EQ(ev.getTarget(), qlib::invalid_uid);
    EXPECT_TRUE(ev.getDescr().isEmpty());
}

TEST(SceneEventTest, SetGetTypeAndTarget)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_OBJ_ADDED);
    ev.setTarget(100);
    ev.setDescr("desc");
    EXPECT_EQ(ev.getType(), SceneEvent::SCE_OBJ_ADDED);
    EXPECT_EQ(ev.getTarget(), 100);
    EXPECT_EQ(ev.getDescr(), "desc");
}

TEST(SceneEventTest, CopyConstructor)
{
    SceneEvent orig;
    orig.setType(SceneEvent::SCE_REND_ADDED);
    orig.setTarget(77);
    orig.setDescr("rendAdded");

    SceneEvent copy(orig);
    EXPECT_EQ(copy.getType(), SceneEvent::SCE_REND_ADDED);
    EXPECT_EQ(copy.getTarget(), 77);
    EXPECT_EQ(copy.getDescr(), "rendAdded");
}

TEST(SceneEventTest, GetCategorySceneRemoving)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_SCENE_REMOVING);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_REMOVING);
    EXPECT_EQ(src, ScrEventManager::SEM_SCENE);
    EXPECT_EQ(cat, "sceneRemoving");
}

TEST(SceneEventTest, GetCategorySceneOnLoaded)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_SCENE_ONLOADED);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_CHANGED);
    EXPECT_EQ(src, ScrEventManager::SEM_SCENE);
    EXPECT_EQ(cat, "sceneLoaded");
}

TEST(SceneEventTest, GetCategoryObjAdded)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_OBJ_ADDED);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_ADDED);
    EXPECT_EQ(src, ScrEventManager::SEM_OBJECT);
    EXPECT_EQ(cat, "objectAdded");
}

TEST(SceneEventTest, GetCategoryObjRemoving)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_OBJ_REMOVING);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_REMOVING);
    EXPECT_EQ(src, ScrEventManager::SEM_OBJECT);
    EXPECT_EQ(cat, "objectRemoving");
}

TEST(SceneEventTest, GetCategoryRendAdded)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_REND_ADDED);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_ADDED);
    EXPECT_EQ(src, ScrEventManager::SEM_RENDERER);
    EXPECT_EQ(cat, "rendererAdded");
}

TEST(SceneEventTest, GetCategoryViewAdded)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_VIEW_ADDED);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_ADDED);
    EXPECT_EQ(src, ScrEventManager::SEM_VIEW);
    EXPECT_EQ(cat, "viewAdded");
}

TEST(SceneEventTest, GetCategoryStyleAdded)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_STYLE_ADDED);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_ADDED);
    EXPECT_EQ(src, ScrEventManager::SEM_STYLE);
    EXPECT_EQ(cat, "styleAdded");
}

TEST(SceneEventTest, GetCategoryStyleRemoving)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_STYLE_REMOVING);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(evt, ScrEventManager::SEM_REMOVING);
    EXPECT_EQ(src, ScrEventManager::SEM_STYLE);
    EXPECT_EQ(cat, "styleRemoving");
}

TEST(SceneEventTest, GetJSONContainsTargetUid)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_OBJ_ADDED);
    ev.setTarget(5);
    ev.setDescr("added");
    LString json = ev.getJSON();
    EXPECT_NE(json.indexOf("target_uid"), -1);
    EXPECT_NE(json.indexOf("descr"), -1);
}

TEST(SceneEventTest, GetCategorySceneAppDataChanged)
{
    SceneEvent ev;
    ev.setType(SceneEvent::SCE_SCENE_APPDATA_CHG);
    LString cat; int src = 0, evt = 0;
    EXPECT_TRUE(ev.getCategory(cat, src, evt));
    EXPECT_EQ(cat, "sceneAppDataChanged");
    EXPECT_EQ(src, ScrEventManager::SEM_SCENE);
    EXPECT_EQ(evt, ScrEventManager::SEM_CHANGED);
}
