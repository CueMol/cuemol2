// -*-Mode: C++;-*-
//
// Unit tests for qsys/GUIView.cpp
//

#include <gtest/gtest.h>
#include <common.h>
#include "qsys/GUIView.hpp"
#include <gfx/DisplayContext.hpp>

using qlib::LString;
using qlib::Vector4D;

namespace {

// Minimal concrete GUIView subclass for testing.
// Pure-virtual methods from View are stubbed out.
class TestGUIView : public qsys::GUIView
{
private:
    // Stub display context (no rendering occurs)
    class StubDC : public gfx::DisplayContext
    {
    public:
        bool setCurrent() override { return true; }
        bool isCurrent() const override { return true; }
        bool isFile() const override { return true; }
        void vertex(const Vector4D &) override {}
        void normal(const Vector4D &) override {}
        void color(const gfx::ColorPtr &) override {}
        void pushMatrix() override {}
        void popMatrix() override {}
        void multMatrix(const qlib::Matrix4D &) override {}
        void loadMatrix(const qlib::Matrix4D &) override {}
        void setPolygonMode(int) override {}
        void startPoints() override {}
        void startPolygon() override {}
        void startLines() override {}
        void startLineStrip() override {}
        void startTriangles() override {}
        void startTriangleStrip() override {}
        void startTriangleFan() override {}
        void startQuadStrip() override {}
        void startQuads() override {}
        void end() override {}
    };

    StubDC m_dc;

public:
    gfx::DisplayContext *getDisplayContext() override { return &m_dc; }
    void drawScene() override {}

protected:
    void setUpProjMat(int, int) override {}
    void setUpModelMat(int) override {}
};

}  // namespace

// --- Construction ---

TEST(GUIViewTest, UIDIsValid)
{
    TestGUIView v;
    EXPECT_NE(v.getUID(), qlib::invalid_uid);
}

TEST(GUIViewTest, TwoViewsHaveDifferentUIDs)
{
    TestGUIView v1;
    TestGUIView v2;
    EXPECT_NE(v1.getUID(), v2.getUID());
}

// --- Basic View properties ---

TEST(GUIViewTest, DefaultNameIsEmpty)
{
    TestGUIView v;
    EXPECT_TRUE(v.getName().isEmpty());
}

TEST(GUIViewTest, SetGetName)
{
    TestGUIView v;
    v.setName("myGUIView");
    EXPECT_EQ(v.getName(), LString("myGUIView"));
}

// --- Framebuffer operations ---

TEST(GUIViewTest, CreateOffScreenViewReturnsNull)
{
    TestGUIView v;
    qsys::View *result = v.createOffScreenView(200, 100, 0);
    EXPECT_EQ(result, nullptr);
}

TEST(GUIViewTest, ReadPixelsDoesNotCrash)
{
    TestGUIView v;
    char buf[64] = {};
    // GUIView::readPixels is a no-op stub; just verify no crash/exception
    v.readPixels(0, 0, 4, 4, buf, sizeof(buf), 4);
}

// --- Hit test with no scene attached ---
// When no scene is attached getScene() returns null, so hitTestImpl returns
// false and hitTest / hitTestRect return empty strings immediately.

TEST(GUIViewTest, HitTestWithNoSceneReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    LString result = v.hitTest(100, 100);
    EXPECT_TRUE(result.isEmpty());
}

TEST(GUIViewTest, HitTestRectAllWithNoSceneReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    LString result = v.hitTestRect(100, 100, 20, 20, false);
    EXPECT_TRUE(result.isEmpty());
}

TEST(GUIViewTest, HitTestRectNearestWithNoSceneReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    LString result = v.hitTestRect(100, 100, 20, 20, true);
    EXPECT_TRUE(result.isEmpty());
}

// --- Hit test with scaling factor ---

TEST(GUIViewTest, HitTestWithSclFacNoSceneReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    v.setSclFac(2.0, 2.0);
    LString result = v.hitTest(100, 100);
    EXPECT_TRUE(result.isEmpty());
}

TEST(GUIViewTest, HitTestRectWithSclFacNoSceneReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    v.setSclFac(2.0, 2.0);
    LString result = v.hitTestRect(50, 50, 10, 10, false);
    EXPECT_TRUE(result.isEmpty());
}

// --- Repeated hit tests do not accumulate state ---

TEST(GUIViewTest, RepeatedHitTestsReturnEmpty)
{
    TestGUIView v;
    v.setViewSize(640, 480);
    for (int i = 0; i < 5; ++i) {
        EXPECT_TRUE(v.hitTest(i * 10, i * 10).isEmpty());
    }
}
