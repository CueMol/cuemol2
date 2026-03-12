#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ScrEventManager.hpp"

TEST(ScrEventManagerTest, SEM_ANY_IsMinusOne)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_ANY, -1);
}

TEST(ScrEventManagerTest, SEM_LOG_Is0x0001)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_LOG, 0x0001);
}

TEST(ScrEventManagerTest, SEM_INDEV_Is0x0002)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_INDEV, 0x0002);
}

TEST(ScrEventManagerTest, SEM_SCENE_Is0x0004)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_SCENE, 0x0004);
}

TEST(ScrEventManagerTest, SEM_OBJECT_Is0x0008)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_OBJECT, 0x0008);
}

TEST(ScrEventManagerTest, SEM_RENDERER_Is0x0010)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_RENDERER, 0x0010);
}

TEST(ScrEventManagerTest, SEM_VIEW_Is0x0020)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_VIEW, 0x0020);
}

TEST(ScrEventManagerTest, SEM_ADDED_Is1)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_ADDED, 1);
}

TEST(ScrEventManagerTest, SEM_REMOVING_Is2)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_REMOVING, 2);
}

TEST(ScrEventManagerTest, SEM_PROPCHG_Is3)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_PROPCHG, 3);
}

TEST(ScrEventManagerTest, SEM_CHANGED_Is4)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_CHANGED, 4);
}

TEST(ScrEventManagerTest, SEM_OTHER_Is9999)
{
    EXPECT_EQ(qsys::ScrEventManager::SEM_OTHER, 9999);
}

TEST(ScrEventManagerTest, SingletonInstance)
{
    EXPECT_NE(qsys::ScrEventManager::getInstance(), nullptr);
}
