#include <gtest/gtest.h>
#include <common.h>
#include "qsys/SceneManager.hpp"

using qlib::LString;
using qsys::SceneManager;
using qsys::ScenePtr;

// SceneManager singleton is created by qsys::init() via QsysEnvironment.

class SceneManagerTest : public ::testing::Test {
protected:
    void TearDown() override
    {
        SceneManager::getInstance()->destroyAllScenes();
    }
};

TEST_F(SceneManagerTest, SingletonIsNotNull)
{
    EXPECT_NE(SceneManager::getInstance(), nullptr);
}

TEST_F(SceneManagerTest, CreateSceneReturnsValidScene)
{
    ScenePtr pScene = SceneManager::getInstance()->createScene();
    EXPECT_FALSE(pScene.isnull());
    EXPECT_NE(pScene->getUID(), qlib::invalid_uid);
}

TEST_F(SceneManagerTest, TwoScenesHaveDifferentUIDs)
{
    ScenePtr s1 = SceneManager::getInstance()->createScene();
    ScenePtr s2 = SceneManager::getInstance()->createScene();
    EXPECT_NE(s1->getUID(), s2->getUID());
}

TEST_F(SceneManagerTest, GetSceneByUID)
{
    ScenePtr pScene = SceneManager::getInstance()->createScene();
    qlib::uid_t uid = pScene->getUID();
    ScenePtr pFound = SceneManager::getInstance()->getScene(uid);
    EXPECT_FALSE(pFound.isnull());
    EXPECT_EQ(pFound->getUID(), uid);
}

TEST_F(SceneManagerTest, GetSceneByInvalidUIDReturnsNull)
{
    ScenePtr pFound = SceneManager::getInstance()->getScene(qlib::invalid_uid);
    EXPECT_TRUE(pFound.isnull());
}

TEST_F(SceneManagerTest, GetSceneByName)
{
    ScenePtr pScene = SceneManager::getInstance()->createScene();
    pScene->setName("myScene");
    ScenePtr pFound = SceneManager::getInstance()->getSceneByName("myScene");
    EXPECT_FALSE(pFound.isnull());
    EXPECT_EQ(pFound->getUID(), pScene->getUID());
}

TEST_F(SceneManagerTest, GetSceneByNameNotFound)
{
    ScenePtr pFound = SceneManager::getInstance()->getSceneByName("nonexistent");
    EXPECT_TRUE(pFound.isnull());
}

TEST_F(SceneManagerTest, DestroySceneRemovesIt)
{
    ScenePtr pScene = SceneManager::getInstance()->createScene();
    qlib::uid_t uid = pScene->getUID();
    pScene = ScenePtr();
    EXPECT_TRUE(SceneManager::getInstance()->destroyScene(uid));
    EXPECT_TRUE(SceneManager::getInstance()->getScene(uid).isnull());
}

TEST_F(SceneManagerTest, DestroyNonexistentSceneReturnsFalse)
{
    EXPECT_FALSE(SceneManager::getInstance()->destroyScene(qlib::invalid_uid));
}

TEST_F(SceneManagerTest, GetSceneUIDListContainsCreatedScene)
{
    ScenePtr pScene = SceneManager::getInstance()->createScene();
    LString uidStr = LString::format("%d", int(pScene->getUID()));
    LString list = SceneManager::getInstance()->getSceneUIDList();
    EXPECT_NE(list.indexOf(uidStr), -1);
}

TEST_F(SceneManagerTest, DestroyAllScenesResultsInEmptyList)
{
    SceneManager::getInstance()->createScene();
    SceneManager::getInstance()->createScene();
    SceneManager::getInstance()->destroyAllScenes();
    EXPECT_TRUE(SceneManager::getInstance()->getSceneUIDList().isEmpty());
}
