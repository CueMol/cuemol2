#include <gtest/gtest.h>
#include <common.h>
#include <memory>
#include "qlib/LDOM2Tree.hpp"
#include "qsys/Camera.hpp"

using qsys::Camera;

TEST(CameraTest, DefaultValues)
{
    Camera cam;
    EXPECT_DOUBLE_EQ(cam.getZoom(), 50.0);
    EXPECT_DOUBLE_EQ(cam.getSlabDepth(), 50.0);
    EXPECT_DOUBLE_EQ(cam.getCamDist(), 200.0);
    EXPECT_NEAR(cam.m_fStereoDist, 1.0, 1e-10);
    EXPECT_EQ(cam.getStereoMode(), Camera::CSM_NONE);
    EXPECT_FALSE(cam.isPerspec());
    EXPECT_EQ(cam.getCenterMark(), Camera::CCM_CROSS);
    EXPECT_EQ(cam.getVisSize(), 0);
}

TEST(CameraTest, SetGetName)
{
    Camera cam;
    cam.setName("testcam");
    EXPECT_EQ(cam.getName(), "testcam");
}

TEST(CameraTest, SetGetStereoMode)
{
    Camera cam;
    cam.setStereoMode(Camera::CSM_PARA);
    EXPECT_EQ(cam.getStereoMode(), Camera::CSM_PARA);
    cam.setStereoMode(Camera::CSM_CROSS);
    EXPECT_EQ(cam.getStereoMode(), Camera::CSM_CROSS);
}

TEST(CameraTest, SetGetPerspec)
{
    Camera cam;
    EXPECT_FALSE(cam.isPerspec());
    cam.setPerspec(true);
    EXPECT_TRUE(cam.isPerspec());
    cam.setPerspec(false);
    EXPECT_FALSE(cam.isPerspec());
}

TEST(CameraTest, CamDistClamping)
{
    Camera cam;
    cam.setCamDist(0.05);       // too small → 0.1
    EXPECT_DOUBLE_EQ(cam.getCamDist(), 0.1);
    cam.setCamDist(20000.0);    // too large → 10000.0
    EXPECT_DOUBLE_EQ(cam.getCamDist(), 10000.0);
    cam.setCamDist(500.0);
    EXPECT_DOUBLE_EQ(cam.getCamDist(), 500.0);
}

TEST(CameraTest, ZoomClamping)
{
    Camera cam;
    cam.setZoom(0.0);           // < F_EPS4 → F_EPS4
    EXPECT_DOUBLE_EQ(cam.getZoom(), F_EPS4);
    cam.setZoom(100.0);
    EXPECT_DOUBLE_EQ(cam.getZoom(), 100.0);
}

TEST(CameraTest, SlabDepthClamping)
{
    Camera cam;
    cam.setSlabDepth(0.05);     // too small → 0.1
    EXPECT_DOUBLE_EQ(cam.getSlabDepth(), 0.1);
    cam.setSlabDepth(20000.0);  // too large → 10000.0
    EXPECT_DOUBLE_EQ(cam.getSlabDepth(), 10000.0);
    cam.setSlabDepth(100.0);
    EXPECT_DOUBLE_EQ(cam.getSlabDepth(), 100.0);
}

TEST(CameraTest, CopyConstructor)
{
    Camera orig;
    orig.setName("orig");
    orig.setZoom(80.0);
    orig.setSlabDepth(30.0);
    orig.setCamDist(150.0);
    orig.setStereoMode(Camera::CSM_CROSS);
    orig.setPerspec(true);

    Camera copy(orig);
    EXPECT_EQ(copy.getName(), "orig");
    EXPECT_DOUBLE_EQ(copy.getZoom(), 80.0);
    EXPECT_DOUBLE_EQ(copy.getSlabDepth(), 30.0);
    EXPECT_DOUBLE_EQ(copy.getCamDist(), 150.0);
    EXPECT_EQ(copy.getStereoMode(), Camera::CSM_CROSS);
    EXPECT_TRUE(copy.isPerspec());
}

TEST(CameraTest, AssignmentOperator)
{
    Camera a;
    a.setName("a");
    a.setZoom(60.0);

    Camera b;
    b = a;
    EXPECT_EQ(b.getName(), "a");
    EXPECT_DOUBLE_EQ(b.getZoom(), 60.0);
}

TEST(CameraTest, EqualsTrue)
{
    Camera a, b;
    a.setName("cam");
    b.setName("cam");
    EXPECT_TRUE(a.equals(b));
}

TEST(CameraTest, EqualsFalseDifferentName)
{
    Camera a, b;
    a.setName("cam1");
    b.setName("cam2");
    EXPECT_FALSE(a.equals(b));
}

TEST(CameraTest, EqualsFalseDifferentZoom)
{
    Camera a, b;
    a.setZoom(80.0);
    EXPECT_FALSE(a.equals(b));
}

TEST(CameraTest, EqualsFalseDifferentPerspec)
{
    Camera a, b;
    a.setPerspec(true);
    EXPECT_FALSE(a.equals(b));
}

TEST(CameraTest, VisSettingEmpty)
{
    Camera cam;
    EXPECT_EQ(cam.getVisSize(), 0);
    EXPECT_EQ(cam.getVisSetJSON(), "{}");
}

TEST(CameraTest, ClearVisSettingsNoCrash)
{
    Camera cam;
    cam.clearVisSettings();  // no-op when empty
    EXPECT_EQ(cam.getVisSize(), 0);
}

namespace {

// Builds a <camera> node with a <visibilities> child, the shape a camera
// serialized with vis flags has before the scene finishes loading.
qlib::LDom2Node *makeCameraNodeWithVisibilities()
{
    qlib::LDom2Node *pCam = new qlib::LDom2Node();
    pCam->setTagName("camera");

    qlib::LDom2Node *pVis = new qlib::LDom2Node();
    pVis->setTagName("visibilities");

    qlib::LDom2Node *pObj = new qlib::LDom2Node();
    pObj->setTagName("object");
    pObj->setStrAttr("target", "mol1");
    pObj->setValue("false");
    pVis->appendChild(pObj);

    pCam->appendChild(pVis);
    return pCam;
}

}  // namespace

TEST(CameraTest, ClearVisSettingsDropsUnconvertedNodes)
{
    // A camera read from a file keeps the <visibilities> node until the
    // scene finishes loading (notifyLoaded). Clearing before that used to
    // walk an empty map because getVisSize() reports the pending node as 1.
    std::unique_ptr<qlib::LDom2Node> pNode(makeCameraNodeWithVisibilities());
    Camera cam;
    cam.readFrom2(pNode.get());
    ASSERT_EQ(cam.getVisSize(), 1);

    cam.clearVisSettings();
    EXPECT_EQ(cam.getVisSize(), 0);

    // clearing twice stays a no-op
    cam.clearVisSettings();
    EXPECT_EQ(cam.getVisSize(), 0);
}

TEST(CameraTest, ReadFrom2ReplacesPendingVisibilities)
{
    std::unique_ptr<qlib::LDom2Node> pNode(makeCameraNodeWithVisibilities());
    Camera cam;
    cam.readFrom2(pNode.get());
    cam.readFrom2(pNode.get());  // second read must not leak the first node
    EXPECT_EQ(cam.getVisSize(), 1);
    cam.clearVisSettings();
    EXPECT_EQ(cam.getVisSize(), 0);
}

TEST(CameraTest, CopyKeepsPendingVisibilityNodesWithoutSharingThem)
{
    // Scene::getCamera(), the undo/redo edit info and the lightweight viewer
    // all work on copies; a copy that dropped the vis settings silently lost
    // them for the user.
    std::unique_ptr<qlib::LDom2Node> pNode(makeCameraNodeWithVisibilities());
    Camera orig;
    orig.readFrom2(pNode.get());
    ASSERT_EQ(orig.getVisSize(), 1);

    Camera copy(orig);
    EXPECT_EQ(copy.getVisSize(), 1);

    Camera assigned;
    assigned = orig;
    EXPECT_EQ(assigned.getVisSize(), 1);

    // the node tree is deep-copied: clearing one camera leaves the others
    copy.clearVisSettings();
    EXPECT_EQ(copy.getVisSize(), 0);
    EXPECT_EQ(orig.getVisSize(), 1);
    EXPECT_EQ(assigned.getVisSize(), 1);
}
