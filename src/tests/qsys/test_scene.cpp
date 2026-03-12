#include <gtest/gtest.h>
#include <common.h>
#include "qsys/Scene.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/Camera.hpp"
#include "qsys/Object.hpp"

using qlib::LString;
using qsys::SceneManager;
using qsys::ScenePtr;
using qsys::CameraPtr;
using qsys::ObjectPtr;

namespace {

class ConcreteObject : public qsys::Object {
public:
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

}  // namespace

class SceneTest : public ::testing::Test {
protected:
    ScenePtr m_pScene;

    void SetUp() override
    {
        m_pScene = SceneManager::getInstance()->createScene();
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            qlib::uid_t uid = m_pScene->getUID();
            m_pScene = ScenePtr();
            SceneManager::getInstance()->destroyScene(uid);
        }
    }
};

TEST_F(SceneTest, UIDIsValid)
{
    EXPECT_NE(m_pScene->getUID(), qlib::invalid_uid);
}

TEST_F(SceneTest, SetGetName)
{
    m_pScene->setName("testScene");
    EXPECT_EQ(m_pScene->getName(), LString("testScene"));
}

TEST_F(SceneTest, InitialObjectCountIsZero)
{
    EXPECT_EQ(m_pScene->getObjectCount(), 0);
}

TEST_F(SceneTest, AddObjectIncreasesCount)
{
    ObjectPtr pObj(new ConcreteObject());
    m_pScene->addObject(pObj);
    EXPECT_EQ(m_pScene->getObjectCount(), 1);
}

TEST_F(SceneTest, GetObjectByUID)
{
    ObjectPtr pObj(new ConcreteObject());
    qlib::uid_t uid = pObj->getUID();
    m_pScene->addObject(pObj);
    ObjectPtr pFound = m_pScene->getObject(uid);
    EXPECT_FALSE(pFound.isnull());
    EXPECT_EQ(pFound->getUID(), uid);
}

TEST_F(SceneTest, GetObjectByName)
{
    ObjectPtr pObj(new ConcreteObject());
    pObj->setName("myObj");
    m_pScene->addObject(pObj);
    ObjectPtr pFound = m_pScene->getObjectByName("myObj");
    EXPECT_FALSE(pFound.isnull());
    EXPECT_EQ(pFound->getName(), LString("myObj"));
}

TEST_F(SceneTest, GetObjectByInvalidUIDReturnsNull)
{
    ObjectPtr pFound = m_pScene->getObject(qlib::invalid_uid);
    EXPECT_TRUE(pFound.isnull());
}

TEST_F(SceneTest, DestroyObjectDecreasesCount)
{
    ObjectPtr pObj(new ConcreteObject());
    qlib::uid_t uid = pObj->getUID();
    m_pScene->addObject(pObj);
    pObj = ObjectPtr();
    m_pScene->destroyObject(uid);
    EXPECT_EQ(m_pScene->getObjectCount(), 0);
}

TEST_F(SceneTest, AddSameObjectTwiceReturnsFalse)
{
    ObjectPtr pObj(new ConcreteObject());
    EXPECT_TRUE(m_pScene->addObject(pObj));
    EXPECT_FALSE(m_pScene->addObject(pObj));
    EXPECT_EQ(m_pScene->getObjectCount(), 1);
}

TEST_F(SceneTest, InitialCameraCountIsZero)
{
    EXPECT_EQ(m_pScene->getCameraCount(), 0);
}

TEST_F(SceneTest, SetAndHasCamera)
{
    CameraPtr pCam(new qsys::Camera());
    m_pScene->setCamera("cam1", pCam);
    EXPECT_TRUE(m_pScene->hasCamera("cam1"));
}

TEST_F(SceneTest, HasCameraFalseForUnknown)
{
    EXPECT_FALSE(m_pScene->hasCamera("nonexistent"));
}

TEST_F(SceneTest, GetCameraReturnsCorrectZoom)
{
    CameraPtr pCam(new qsys::Camera());
    pCam->setZoom(75.0);
    m_pScene->setCamera("cam1", pCam);
    CameraPtr pFound = m_pScene->getCamera("cam1");
    ASSERT_FALSE(pFound.isnull());
    EXPECT_DOUBLE_EQ(pFound->getZoom(), 75.0);
}

TEST_F(SceneTest, SetCameraIncreasesCount)
{
    CameraPtr pCam(new qsys::Camera());
    m_pScene->setCamera("cam1", pCam);
    EXPECT_EQ(m_pScene->getCameraCount(), 1);
}

TEST_F(SceneTest, DestroyCameraReducesCount)
{
    CameraPtr pCam(new qsys::Camera());
    m_pScene->setCamera("cam1", pCam);
    m_pScene->destroyCamera("cam1");
    EXPECT_EQ(m_pScene->getCameraCount(), 0);
    EXPECT_FALSE(m_pScene->hasCamera("cam1"));
}
