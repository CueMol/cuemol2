#include <gtest/gtest.h>
#include <common.h>
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
