// -*-Mode: C++;-*-
//
// Unit tests for qsys/GUIView.cpp
//

#include <gtest/gtest.h>
#include <common.h>
#include "qsys/GUIView.hpp"
#include "qsys/ViewCap.hpp"
#include "qsys/ViewInputConfig.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/PickBuffer.hpp>
#include <qlib/LByteArray.hpp>

#include <initializer_list>

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

// --- Polygon (lasso) hit test ---
// hitTestPolygon takes a FLOAT32 ByteArray of interleaved [x0,y0,x1,y1,...]
// logical-pixel vertices. Like hitTestRect, with no scene attached it returns
// an empty string. The guards (null array / <3 vertices) also short-circuit.

namespace {
// Build a FLOAT32 ByteArray of polygon vertices for hitTestPolygon.
qlib::LByteArrayPtr makePolyF32(std::initializer_list<float> coords)
{
    auto *p = new qlib::LByteArray();
    p->init(qlib::LByteArray::enumFLOAT32, static_cast<int>(coords.size()));
    int i = 0;
    for (float v : coords) p->setAtF(i++, v);
    return qlib::LByteArrayPtr(p);
}
}  // namespace

TEST(GUIViewTest, HitTestPolygonWithNoSceneReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    // A valid triangle (>=3 vertices); no scene -> empty.
    auto pts = makePolyF32({100.f, 100.f, 140.f, 100.f, 120.f, 140.f});
    LString result = v.hitTestPolygon(pts, false);
    EXPECT_TRUE(result.isEmpty());
}

TEST(GUIViewTest, HitTestPolygonTooFewVerticesReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    // Only two vertices -> cannot form a polygon -> empty (guard).
    auto pts = makePolyF32({100.f, 100.f, 140.f, 120.f});
    LString result = v.hitTestPolygon(pts, false);
    EXPECT_TRUE(result.isEmpty());
}

TEST(GUIViewTest, HitTestPolygonNullArrayReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    LString result = v.hitTestPolygon(qlib::LByteArrayPtr(), false);
    EXPECT_TRUE(result.isEmpty());
}

TEST(GUIViewTest, HitTestPolygonWithSclFacNoSceneReturnsEmpty)
{
    TestGUIView v;
    v.setViewSize(800, 600);
    v.setSclFac(2.0, 2.0);
    auto pts = makePolyF32({50.f, 50.f, 70.f, 50.f, 60.f, 70.f});
    LString result = v.hitTestPolygon(pts, false);
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

// --- GPU ID-buffer pick: texel -> HitData conversion ---

// A pick texel (R = 1-based renderer index, G = encoded element name,
// B = encoded outer name) becomes a HitData entry with the same name-list
// layout HittestContext produces ([outer,] element), so interpHit() reads
// GPU and CPU hits identically.
TEST(GUIViewTest, PickTexelToHitData)
{
    const std::vector<qlib::uid_t> rendTab = {1001, 1002};
    gfx::HitData hd;

    gfx::PickTexel t;
    t.rend = 2;
    t.name = gfx::encodeHitName(3);
    t.outer = gfx::encodeHitName(5);
    t.dx = t.dy = 0;
    ASSERT_TRUE(qsys::GUIView::pickTexelToHitData(hd, rendTab, t));
    EXPECT_EQ(hd.getNearestRendID(), 1002u);
    ASSERT_EQ(hd.getDataSize(1002), 1);
    EXPECT_EQ(hd.getDataAt(1002, 0, 0), 5);  // outer name (e.g. symop)
    EXPECT_EQ(hd.getDataAt(1002, 0, 1), 3);  // element name (e.g. atom id)

    // No outer name: the list is just [element].
    gfx::HitData hd2;
    t.rend = 1;
    t.outer = 0;
    ASSERT_TRUE(qsys::GUIView::pickTexelToHitData(hd2, rendTab, t));
    EXPECT_EQ(hd2.getNearestRendID(), 1001u);
    ASSERT_EQ(hd2.getDataSize(1001), 1);
    EXPECT_EQ(hd2.getDataAt(1001, 0, 0), 3);
    EXPECT_EQ(hd2.getDataAt(1001, 0, 1), -1);

    // Invalid texels are rejected: renderer index out of range, or no name.
    gfx::HitData hd3;
    t.rend = 3;
    EXPECT_FALSE(qsys::GUIView::pickTexelToHitData(hd3, rendTab, t));
    t.rend = 1;
    t.name = 0;
    EXPECT_FALSE(qsys::GUIView::pickTexelToHitData(hd3, rendTab, t));
    EXPECT_EQ(hd3.getNearestRendID(), qlib::invalid_uid);
}

// --- GPU ID-buffer pick: the user switch gates the GPU path ---

namespace {
class GpuPickViewCap : public qsys::ViewCap
{
public:
    bool hasGpuPick() const override { return true; }
};
}  // namespace

// The GPU pass runs only when the backend supports it AND ViewInputConfig's
// gpu_pick is on; switching it off routes hitTest to the CPU point hit test
// without a restart.
TEST(GUIViewTest, GpuPickActiveFollowsViewCapAndUserSwitch)
{
    TestGUIView v;
    qsys::ViewCap *pPrevCap = qsys::View::getViewCap();
    qsys::ViewInputConfig *pVIC = qsys::ViewInputConfig::getInstance();
    const bool bPrev = pVIC->isGpuPick();

    // No capability (desktop / uxp_gui, tests): never active.
    qsys::View::setViewCap(nullptr);
    pVIC->setGpuPick(true);
    EXPECT_FALSE(v.isGpuPickActive());

    GpuPickViewCap cap;
    qsys::View::setViewCap(&cap);
    EXPECT_TRUE(v.isGpuPickActive());
    pVIC->setGpuPick(false);
    EXPECT_FALSE(v.isGpuPickActive());
    pVIC->setGpuPick(true);
    EXPECT_TRUE(v.isGpuPickActive());

    qsys::View::setViewCap(pPrevCap);
    pVIC->setGpuPick(bPrev);
}

// --- Hover highlight: frame planning and the hovered element's pick ID ---

// The per-frame decision: only a hover-highlight change with a cached frame
// and no pending progressive work is served by a present-only frame; a
// scene/camera change is a regular frame that also invalidates the pick
// buffer; a progressive jitter sample keeps the pick buffer valid; a
// present request that cannot be served restarts a converged jitter
// accumulation but not one in progress.
TEST(GUIViewTest, PlanFramePresentOnlyVsRegularFrame)
{
    using Flags = qsys::GUIView::FrameFlags;
    struct Case
    {
        const char *name;
        Flags f;
        bool presentOnly, sceneChanged, restartJitter;
    };
    auto flags = [](bool present, bool update, bool reset, bool more, bool half,
                    bool cached) {
        Flags f;
        f.presentDirty = present;
        f.updateFlag = update;
        f.jitterReset = reset;
        f.jitterMore = more;
        f.aoHalfPending = half;
        f.frameCached = cached;
        return f;
    };
    const Case cases[] = {
        {"hover only", flags(true, false, false, false, false, true), true, false, false},
        {"camera", flags(false, true, false, false, false, true), false, true, false},
        {"hover + scene", flags(true, false, true, false, false, true), false, true, false},
        {"jitter sample", flags(false, false, false, true, false, true), false, false, false},
        {"hover while accumulating", flags(true, false, false, true, false, true), false, false, false},
        {"hover, no cache", flags(true, false, false, false, false, false), false, false, true},
        {"hover, AO follow-up", flags(true, false, false, false, true, true), false, false, true},
        {"idle", flags(false, false, false, false, false, true), false, false, false},
    };
    for (const Case &c : cases) {
        const auto p = qsys::GUIView::planFrame(c.f);
        EXPECT_EQ(p.presentOnly, c.presentOnly) << c.name;
        EXPECT_EQ(p.sceneChanged, c.sceneChanged) << c.name;
        EXPECT_EQ(p.restartJitter, c.restartJitter) << c.name;
    }
}

// setHoverHit schedules a present-only frame (needsContinuousRedraw) only when
// the value changes and the GPU pick pass is active; the same value again is
// a no-op and clearHoverHit schedules the frame that removes the overlay.
TEST(GUIViewTest, SetHoverHitSchedulesPresentOnlyFrame)
{
    TestGUIView v;
    qsys::ViewCap *pPrevCap = qsys::View::getViewCap();

    // No GPU pick (desktop): the state is kept but no frame is requested.
    qsys::View::setViewCap(nullptr);
    v.setHoverHit(1001, 42, -1);
    EXPECT_FALSE(v.needsContinuousRedraw());

    GpuPickViewCap cap;
    qsys::View::setViewCap(&cap);
    v.setHoverHit(1001, 42, -1);  // unchanged value: no frame
    EXPECT_FALSE(v.needsContinuousRedraw());
    v.setHoverHit(1001, 43, -1);
    EXPECT_TRUE(v.needsContinuousRedraw());

    // A frame consumes the request (drawScene is stubbed here; the flag is
    // private, so re-check through a fresh view).
    TestGUIView v2;
    v2.clearHoverHit();  // nothing set: no frame
    EXPECT_FALSE(v2.needsContinuousRedraw());
    v2.setHoverHit(1001, 42, -1);
    EXPECT_TRUE(v2.needsContinuousRedraw());

    qsys::View::setViewCap(pPrevCap);
}

// The hovered element (renderer uid, atom id, symm id) maps to the pick texel
// it was drawn with: 1-based index of the renderer in the pick table and the
// encoded names (-1 -> 0). Renderers absent from the last pick pass (CPU-only,
// hidden, deleted) and hits without an atom have no texel.
TEST(GUIViewTest, HoverIdToPickId)
{
    const std::vector<qlib::uid_t> rendTab = {1001, 1002};
    int id[3] = {0, 0, 0};

    ASSERT_TRUE(qsys::GUIView::hoverIdToPickId(1002, 42, -1, rendTab, id));
    EXPECT_EQ(id[0], 2);
    EXPECT_EQ(id[1], int(gfx::encodeHitName(42)));
    EXPECT_EQ(id[2], 0);

    ASSERT_TRUE(qsys::GUIView::hoverIdToPickId(1001, 0, 5, rendTab, id));
    EXPECT_EQ(id[0], 1);
    EXPECT_EQ(id[1], int(gfx::encodeHitName(0)));
    EXPECT_EQ(id[2], int(gfx::encodeHitName(5)));

    EXPECT_FALSE(qsys::GUIView::hoverIdToPickId(1003, 42, -1, rendTab, id));
    EXPECT_FALSE(qsys::GUIView::hoverIdToPickId(1001, -1, -1, rendTab, id));
}

// --- Slab planes: the pick pass clips at the fog end ---

// The display projection keeps the far clip one slab depth behind the centre
// (fully fogged geometry still occludes), the pick-pass projection clips at
// the fog end (centre + slab/2, beyond which nothing is visible) so invisible
// geometry is not picked; near clip and fog range are the same in both, and
// the near clamp applies.
TEST(GUIViewTest, ComputeSlabPlanesPickClipsAtFogEnd)
{
    double n, f, fn, ff;
    qsys::GUIView::computeSlabPlanes(100.0, 40.0, /*bPickProj=*/false, n, f, fn, ff);
    EXPECT_DOUBLE_EQ(n, 80.0);
    EXPECT_DOUBLE_EQ(f, 140.0);
    EXPECT_DOUBLE_EQ(fn, 100.0);
    EXPECT_DOUBLE_EQ(ff, 120.0);

    double pn, pf, pfn, pff;
    qsys::GUIView::computeSlabPlanes(100.0, 40.0, /*bPickProj=*/true, pn, pf, pfn, pff);
    EXPECT_DOUBLE_EQ(pn, n);
    EXPECT_DOUBLE_EQ(pfn, fn);
    EXPECT_DOUBLE_EQ(pff, ff);
    EXPECT_DOUBLE_EQ(pf, ff);  // far clip = fog end

    // Camera close to the centre: near is clamped to 0.1 and the pick far
    // clip stays in front of it.
    qsys::GUIView::computeSlabPlanes(0.05, 0.1, /*bPickProj=*/true, pn, pf, pfn, pff);
    EXPECT_DOUBLE_EQ(pn, 0.1);
    EXPECT_GT(pf, pn);
}
