#include <gtest/gtest.h>
#include <common.h>
#include "qsys/Scene.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/Camera.hpp"
#include "qsys/Object.hpp"
#include "qsys/TTYView.hpp"
#include "qsys/View.hpp"

using qlib::LString;
using qsys::SceneManager;
using qsys::ScenePtr;
using qsys::CameraPtr;
using qsys::ObjectPtr;
using qsys::ViewPtr;

namespace {

class ConcreteObject : public qsys::Object {
public:
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

class TTYViewFactory : public qsys::ViewFactory {
public:
    qsys::View *create() override { return new qsys::TTYView(); }
};

}  // namespace

class SceneTest : public ::testing::Test {
protected:
    ScenePtr m_pScene;

    void SetUp() override
    {
        qsys::View::setViewFactory(new TTYViewFactory());
        m_pScene = SceneManager::getInstance()->createScene();
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            qlib::uid_t uid = m_pScene->getUID();
            m_pScene = ScenePtr();
            SceneManager::getInstance()->destroyScene(uid);
        }
        qsys::View::setViewFactory(nullptr);
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

// --- Object management logic ---

TEST_F(SceneTest, DestroyObjectWithInvalidUIDReturnsFalse)
{
    EXPECT_FALSE(m_pScene->destroyObject(qlib::invalid_uid));
}

TEST_F(SceneTest, DestroyAllObjectsClearsScene)
{
    m_pScene->addObject(ObjectPtr(new ConcreteObject()));
    m_pScene->addObject(ObjectPtr(new ConcreteObject()));
    m_pScene->destroyAllObjects();
    EXPECT_EQ(m_pScene->getObjectCount(), 0);
}

TEST_F(SceneTest, GetObjectByNameReturnsNullForUnknown)
{
    EXPECT_TRUE(m_pScene->getObjectByName("nosuchobj").isnull());
}

TEST_F(SceneTest, AddObjectSetsSceneID)
{
    ObjectPtr pObj(new ConcreteObject());
    m_pScene->addObject(pObj);
    EXPECT_EQ(pObj->getSceneID(), m_pScene->getUID());
}

TEST_F(SceneTest, GetAllObjectUIDsReturnsAllAdded)
{
    ObjectPtr pObj1(new ConcreteObject());
    ObjectPtr pObj2(new ConcreteObject());
    qlib::uid_t uid1 = pObj1->getUID();
    qlib::uid_t uid2 = pObj2->getUID();
    m_pScene->addObject(pObj1);
    m_pScene->addObject(pObj2);

    qlib::UIDList uids;
    int n = m_pScene->getAllObjectUIDs(uids);
    EXPECT_EQ(n, 2);
    bool found1 = std::find(uids.begin(), uids.end(), uid1) != uids.end();
    bool found2 = std::find(uids.begin(), uids.end(), uid2) != uids.end();
    EXPECT_TRUE(found1);
    EXPECT_TRUE(found2);
}

TEST_F(SceneTest, GetObjUIDListEmptyForEmptyScene)
{
    EXPECT_TRUE(m_pScene->getObjUIDList().isEmpty());
}

TEST_F(SceneTest, GetObjUIDListContainsUID)
{
    ObjectPtr pObj(new ConcreteObject());
    qlib::uid_t uid = pObj->getUID();
    m_pScene->addObject(pObj);
    LString list = m_pScene->getObjUIDList();
    LString expected = LString::format("%d", uid);
    EXPECT_EQ(list, expected);
}

// --- Active object ---

TEST_F(SceneTest, InitialActiveObjIDIsInvalid)
{
    EXPECT_EQ(m_pScene->getActiveObjID(), qlib::invalid_uid);
}

TEST_F(SceneTest, SetActiveObjIDStoresCorrectly)
{
    ObjectPtr pObj(new ConcreteObject());
    qlib::uid_t uid = pObj->getUID();
    m_pScene->addObject(pObj);
    m_pScene->setActiveObjID(uid);
    EXPECT_EQ(m_pScene->getActiveObjID(), uid);
}

TEST_F(SceneTest, SetActiveObjIDThrowsForInvalidUID)
{
    EXPECT_THROW(m_pScene->setActiveObjID(qlib::invalid_uid), qlib::IllegalArgumentException);
}

// --- Camera logic ---

TEST_F(SceneTest, SetCameraOverwriteKeepsCountSame)
{
    CameraPtr pCam1(new qsys::Camera());
    pCam1->setZoom(10.0);
    m_pScene->setCamera("cam1", pCam1);

    CameraPtr pCam2(new qsys::Camera());
    pCam2->setZoom(20.0);
    m_pScene->setCamera("cam1", pCam2);

    EXPECT_EQ(m_pScene->getCameraCount(), 1);
    CameraPtr pFound = m_pScene->getCamera("cam1");
    ASSERT_FALSE(pFound.isnull());
    EXPECT_DOUBLE_EQ(pFound->getZoom(), 20.0);
}

TEST_F(SceneTest, GetCameraReturnsCopyNotReference)
{
    CameraPtr pCam(new qsys::Camera());
    pCam->setZoom(50.0);
    m_pScene->setCamera("cam1", pCam);

    // getCamera() returns a copy; mutating it must not affect stored camera
    CameraPtr pCopy = m_pScene->getCamera("cam1");
    pCopy->setZoom(99.0);

    CameraPtr pAgain = m_pScene->getCamera("cam1");
    EXPECT_DOUBLE_EQ(pAgain->getZoom(), 50.0);
}

TEST_F(SceneTest, DestroyCameraForNonExistentReturnsFalse)
{
    EXPECT_FALSE(m_pScene->destroyCamera("nosuchcam"));
}

// --- Scene state ---

TEST_F(SceneTest, IsJustCreatedTrueForFreshScene)
{
    EXPECT_TRUE(m_pScene->isJustCreated());
}

TEST_F(SceneTest, IsJustCreatedFalseAfterAddObject)
{
    ObjectPtr pObj(new ConcreteObject());
    m_pScene->addObject(pObj);
    EXPECT_FALSE(m_pScene->isJustCreated());
}

TEST_F(SceneTest, ClearAllDataRemovesObjectsAndCameras)
{
    m_pScene->addObject(ObjectPtr(new ConcreteObject()));
    CameraPtr pCam(new qsys::Camera());
    m_pScene->setCamera("cam1", pCam);

    m_pScene->clearAllData();

    EXPECT_EQ(m_pScene->getObjectCount(), 0);
    EXPECT_EQ(m_pScene->getCameraCount(), 0);
}

// --- Source path ---

TEST_F(SceneTest, SetGetSource)
{
    m_pScene->setSource("/some/path/scene.qsc");
    EXPECT_EQ(m_pScene->getSource(), LString("/some/path/scene.qsc"));
}

TEST_F(SceneTest, GetBasePathReturnsParentDirectory)
{
    m_pScene->setSource("/some/path/scene.qsc");
    EXPECT_EQ(m_pScene->getBasePath(), LString("/some/path"));
}

// --- View management ---

TEST_F(SceneTest, InitialViewCountIsZero)
{
    EXPECT_EQ(m_pScene->getViewCount(), 0);
}

TEST_F(SceneTest, CreateViewIncreasesCount)
{
    m_pScene->createView();
    EXPECT_EQ(m_pScene->getViewCount(), 1);
}

TEST_F(SceneTest, GetViewByUID)
{
    ViewPtr pView = m_pScene->createView();
    ASSERT_FALSE(pView.isnull());
    qlib::uid_t uid = pView->getUID();
    ViewPtr pFound = m_pScene->getView(uid);
    ASSERT_FALSE(pFound.isnull());
    EXPECT_EQ(pFound->getUID(), uid);
}

TEST_F(SceneTest, GetViewByName)
{
    ViewPtr pView = m_pScene->createView();
    ASSERT_FALSE(pView.isnull());
    pView->setName("myView");
    ViewPtr pFound = m_pScene->getViewByName("myView");
    ASSERT_FALSE(pFound.isnull());
    EXPECT_EQ(pFound->getName(), LString("myView"));
}

TEST_F(SceneTest, GetViewByInvalidUIDReturnsNull)
{
    EXPECT_TRUE(m_pScene->getView(qlib::invalid_uid).isnull());
}

TEST_F(SceneTest, DestroyViewDecreasesCount)
{
    ViewPtr pView = m_pScene->createView();
    ASSERT_FALSE(pView.isnull());
    qlib::uid_t uid = pView->getUID();
    pView = ViewPtr();
    m_pScene->destroyView(uid);
    EXPECT_EQ(m_pScene->getViewCount(), 0);
}

TEST_F(SceneTest, DestroyViewWithInvalidUIDReturnsFalse)
{
    EXPECT_FALSE(m_pScene->destroyView(qlib::invalid_uid));
}

TEST_F(SceneTest, InitialActiveViewIDIsInvalid)
{
    EXPECT_EQ(m_pScene->getActiveViewID(), qlib::invalid_uid);
}

TEST_F(SceneTest, SetActiveViewIDStoresCorrectly)
{
    ViewPtr pView = m_pScene->createView();
    ASSERT_FALSE(pView.isnull());
    qlib::uid_t uid = pView->getUID();
    m_pScene->setActiveViewID(uid);
    EXPECT_EQ(m_pScene->getActiveViewID(), uid);
    ASSERT_FALSE(m_pScene->getActiveView().isnull());
    EXPECT_EQ(m_pScene->getActiveView()->getUID(), uid);
}

TEST_F(SceneTest, SetActiveViewIDThrowsForInvalidUID)
{
    EXPECT_THROW(m_pScene->setActiveViewID(qlib::invalid_uid), qlib::IllegalArgumentException);
}

TEST_F(SceneTest, CreateViewSetsSceneID)
{
    ViewPtr pView = m_pScene->createView();
    ASSERT_FALSE(pView.isnull());
    EXPECT_EQ(pView->getSceneID(), m_pScene->getUID());
}

// AA (aa_method / aaJitterLevel) is independent of AO: the settings hold
// their values regardless of the AO flag, and toggling AO does not touch them.
TEST_F(SceneTest, AAPropsAreIndependentOfAO)
{
    m_pScene->setAOEnabled(false);
    m_pScene->setAAMethod(qsys::Scene::AA_SMAA);
    m_pScene->setAAJitterLevel(3);
    EXPECT_EQ(m_pScene->getAAMethod(), qsys::Scene::AA_SMAA);
    EXPECT_EQ(m_pScene->getAAJitterLevel(), 3);

    m_pScene->setAOEnabled(true);
    EXPECT_EQ(m_pScene->getAAMethod(), qsys::Scene::AA_SMAA);
    EXPECT_EQ(m_pScene->getAAJitterLevel(), 3);
}

// requiresFramePipeline() decides whether drawScene routes the frame through
// the off-screen pipeline: AO, spatial post-AA, or temporal jitter each
// require it on their own; all off = legacy direct (MSAA) rendering.
TEST_F(SceneTest, RequiresFramePipelineContract)
{
    // Default scene: AO off, aa_method fxaa, jitter 0 -> pipeline required
    // (the default AA is deliberately active without AO).
    EXPECT_FALSE(m_pScene->isAOEnabled());
    EXPECT_EQ(m_pScene->getAAMethod(), qsys::Scene::AA_FXAA);
    EXPECT_EQ(m_pScene->getAAJitterLevel(), 0);
    EXPECT_TRUE(m_pScene->requiresFramePipeline());

    m_pScene->setAAMethod(qsys::Scene::AA_NONE);
    EXPECT_FALSE(m_pScene->requiresFramePipeline());

    m_pScene->setAAJitterLevel(2);
    EXPECT_TRUE(m_pScene->requiresFramePipeline());

    m_pScene->setAAJitterLevel(0);
    m_pScene->setAOEnabled(true);
    EXPECT_TRUE(m_pScene->requiresFramePipeline());

    m_pScene->setAOEnabled(false);
    m_pScene->setAAMethod(qsys::Scene::AA_SMAA);
    EXPECT_TRUE(m_pScene->requiresFramePipeline());
}

// The SMAA edge-detection threshold is a tunable scene property; 0.05 (the
// SMAA "Ultra" preset) is the deliberate default so object-object silhouettes
// with modest color contrast are still antialiased.
TEST_F(SceneTest, SmaaThresholdDefaultAndSetGet)
{
    EXPECT_DOUBLE_EQ(m_pScene->getAASmaaThreshold(), 0.05);
    m_pScene->setAASmaaThreshold(0.12);
    EXPECT_DOUBLE_EQ(m_pScene->getAASmaaThreshold(), 0.12);
}

// --- camera visibility settings survive copies ---

namespace {

// A camera whose vis flags hide the (only) object of the scene.
CameraPtr makeCameraHidingObject(qlib::uid_t objUID)
{
    CameraPtr pCam(new qsys::Camera());
    pCam->setName("cam1");
    pCam->visAppend(objUID, false, true);
    return pCam;
}

}  // namespace

TEST_F(SceneTest, GetCameraCopyKeepsVisSettings)
{
    ObjectPtr pObj(new ConcreteObject());
    pObj->setName("mol1");
    m_pScene->addObject(pObj);

    m_pScene->setCamera("cam1", makeCameraHidingObject(pObj->getUID()));

    // getCamera() hands out a copy (scripts, exporters, lightweight viewer)
    CameraPtr pCopy = m_pScene->getCamera("cam1");
    ASSERT_FALSE(pCopy.isnull());
    EXPECT_EQ(pCopy->getVisSize(), 1);
    EXPECT_NE(pCopy->getVisSetJSON().indexOf("\"visible\":false"), -1);
}

TEST_F(SceneTest, UndoOfSetCameraRestoresVisSettings)
{
    ObjectPtr pObj(new ConcreteObject());
    pObj->setName("mol1");
    m_pScene->addObject(pObj);
    m_pScene->setCamera("cam1", makeCameraHidingObject(pObj->getUID()));
    ASSERT_EQ(m_pScene->getCameraRef("cam1")->getVisSize(), 1);

    // overwriting the camera (e.g. "save view to camera" without vis flags)
    // drops the flags; the edit info holds copies of both cameras
    m_pScene->startUndoTxn("Change camera cam1");
    m_pScene->setCamera("cam1", CameraPtr(new qsys::Camera()));
    m_pScene->commitUndoTxn();
    EXPECT_EQ(m_pScene->getCameraRef("cam1")->getVisSize(), 0);

    ASSERT_TRUE(m_pScene->getUndoMgr()->undo());
    EXPECT_EQ(m_pScene->getCameraRef("cam1")->getVisSize(), 1);

    ASSERT_TRUE(m_pScene->getUndoMgr()->redo());
    EXPECT_EQ(m_pScene->getCameraRef("cam1")->getVisSize(), 0);
}

TEST_F(SceneTest, ViewCameraDoesNotCarryVisSettings)
{
    ObjectPtr pObj(new ConcreteObject());
    pObj->setName("mol1");
    m_pScene->addObject(pObj);
    m_pScene->setCamera("cam1", makeCameraHidingObject(pObj->getUID()));

    ViewPtr pView = m_pScene->createView();
    ASSERT_FALSE(pView.isnull());

    // loading a named camera into the view only takes its geometry, so saving
    // the view to another camera must not spread the vis flags around
    m_pScene->loadViewFromCam(pView->getUID(), "cam1");
    EXPECT_EQ(pView->getCamera()->getVisSize(), 0);

    m_pScene->saveViewToCam(pView->getUID(), "cam2");
    EXPECT_EQ(m_pScene->getCameraRef("cam2")->getVisSize(), 0);
    EXPECT_EQ(m_pScene->getCameraRef("cam1")->getVisSize(), 1);
}
