#include <gtest/gtest.h>
#include <common.h>
#include "qsys/TTYView.hpp"
#include "qsys/Camera.hpp"
#include "qsys/InDevEvent.hpp"
#include "qsys/ScrEventManager.hpp"
#include "qsys/ViewEvent.hpp"

#include <chrono>

using qlib::LString;
using qlib::LQuat;
using qlib::Vector4D;

// --- UID ---

TEST(ViewTest, UIDIsValid)
{
    qsys::TTYView v;
    EXPECT_NE(v.getUID(), qlib::invalid_uid);
}

TEST(ViewTest, TwoViewsHaveDifferentUIDs)
{
    qsys::TTYView v1;
    qsys::TTYView v2;
    EXPECT_NE(v1.getUID(), v2.getUID());
}

// --- Zoom clamping ---

TEST(ViewTest, ZoomClampedToEpsilonWhenTooSmall)
{
    qsys::TTYView v;
    v.setZoom(0.0);
    EXPECT_GT(v.getZoom(), 0.0);
}

TEST(ViewTest, ZoomClampedWhenNegative)
{
    qsys::TTYView v;
    v.setZoom(-10.0);
    EXPECT_GT(v.getZoom(), 0.0);
}

TEST(ViewTest, ZoomNotChangedWhenSameValue)
{
    qsys::TTYView v;
    v.setZoom(100.0);
    double before = v.getZoom();
    v.setZoom(100.0);
    EXPECT_DOUBLE_EQ(v.getZoom(), before);
}

// --- ViewDist (camera distance) clamping ---

TEST(ViewTest, ViewDistClampedToMinimum)
{
    qsys::TTYView v;
    v.setViewDist(0.0);
    EXPECT_GE(v.getViewDist(), 0.1);
}

TEST(ViewTest, ViewDistClampedToMaximum)
{
    qsys::TTYView v;
    v.setViewDist(99999.0);
    EXPECT_LE(v.getViewDist(), 10000.0);
}

// --- SlabDepth clamping ---

TEST(ViewTest, SlabDepthClampedToMinimum)
{
    qsys::TTYView v;
    v.setSlabDepth(0.0);
    EXPECT_GE(v.getSlabDepth(), 0.1);
}

TEST(ViewTest, SlabDepthClampedToMaximum)
{
    qsys::TTYView v;
    double maxSlab = v.getViewDist() * 2.0;
    v.setSlabDepth(maxSlab * 10.0);
    EXPECT_LE(v.getSlabDepth(), maxSlab);
}

// --- Quaternion normalization in setRotQuat ---

TEST(ViewTest, RotQuatNormalizedOnSet)
{
    qsys::TTYView v;
    // Set an unnormalized quaternion (length 2)
    LQuat q(2.0, 0.0, 0.0, 0.0);
    v.setRotQuat(q);
    LQuat result = v.getRotQuat();
    double sqlen = result.sqlen();
    EXPECT_NEAR(sqlen, 1.0, 1e-6);
}

TEST(ViewTest, RotQuatFallbackOnZeroQuat)
{
    qsys::TTYView v;
    // Zero quaternion: division by zero guard sets rotQuat to LQuat() (zero quat)
    LQuat zero(0.0, 0.0, 0.0, 0.0);
    v.setRotQuat(zero);
    LQuat result = v.getRotQuat();
    EXPECT_NEAR(result.sqlen(), 0.0, 1e-8);
}

TEST(ViewTest, RotQuatIdentityPreserved)
{
    qsys::TTYView v;
    LQuat identity(1.0, 0.0, 0.0, 0.0);
    v.setRotQuat(identity);
    LQuat result = v.getRotQuat();
    EXPECT_NEAR(result.sqlen(), 1.0, 1e-8);
}

// --- rotateView ---

TEST(ViewTest, RotateViewChangesQuat)
{
    qsys::TTYView v;
    LQuat before = v.getRotQuat();
    v.rotateView(45.0, 0.0, 0.0);
    LQuat after = v.getRotQuat();
    EXPECT_FALSE(before == after);
}

TEST(ViewTest, RotateViewKeepsQuatUnitLength)
{
    qsys::TTYView v;
    v.rotateView(30.0, 45.0, 60.0);
    double sqlen = v.getRotQuat().sqlen();
    EXPECT_NEAR(sqlen, 1.0, 1e-6);
}

TEST(ViewTest, RotateViewNoChangeOnZeroAngles)
{
    qsys::TTYView v;
    LQuat before = v.getRotQuat();
    v.rotateView(0.0, 0.0, 0.0);
    LQuat after = v.getRotQuat();
    EXPECT_NEAR(after.sqlen(), 1.0, 1e-8);
    // Quat should be same (no rotation applied)
    EXPECT_NEAR(before.sqlen(), after.sqlen(), 1e-8);
}

// --- View direction vectors at identity rotation ---

TEST(ViewTest, DirectionVectorsAreUnitLength)
{
    qsys::TTYView v;
    // Reset to identity
    v.setRotQuat(LQuat(1.0, 0.0, 0.0, 0.0));
    EXPECT_NEAR(v.getUpVector().length(), 1.0, 1e-6);
    EXPECT_NEAR(v.getRightVector().length(), 1.0, 1e-6);
    EXPECT_NEAR(v.getForwardVector().length(), 1.0, 1e-6);
}

TEST(ViewTest, DirectionVectorsAreOrthogonalAtIdentity)
{
    qsys::TTYView v;
    v.setRotQuat(LQuat(1.0, 0.0, 0.0, 0.0));
    Vector4D up = v.getUpVector();
    Vector4D right = v.getRightVector();
    Vector4D fwd = v.getForwardVector();
    EXPECT_NEAR(up.dot(right), 0.0, 1e-6);
    EXPECT_NEAR(up.dot(fwd), 0.0, 1e-6);
    EXPECT_NEAR(right.dot(fwd), 0.0, 1e-6);
}

// --- translateView changes view center ---

TEST(ViewTest, TranslateViewChangesCenter)
{
    qsys::TTYView v;
    v.setRotQuat(LQuat(1.0, 0.0, 0.0, 0.0));
    v.setViewCenter(Vector4D(0.0, 0.0, 0.0));
    Vector4D before = v.getViewCenter();
    v.translateView(10.0, 0.0, 0.0);
    Vector4D after = v.getViewCenter();
    EXPECT_FALSE(before == after);
}

// --- View center ---

TEST(ViewTest, SetViewCenterStoresValue)
{
    qsys::TTYView v;
    Vector4D pos(1.0, 2.0, 3.0);
    v.setViewCenter(pos);
    Vector4D got = v.getViewCenter();
    EXPECT_NEAR(got.x(), 1.0, 1e-8);
    EXPECT_NEAR(got.y(), 2.0, 1e-8);
    EXPECT_NEAR(got.z(), 3.0, 1e-8);
}

// --- Projection change flag ---

TEST(ViewTest, ProjChangeFlagSetAfterSetViewSize)
{
    qsys::TTYView v;
    v.resetProjChgFlag();
    v.setViewSize(800, 600);
    EXPECT_TRUE(v.isProjChange());
}

TEST(ViewTest, ProjChangeFlagClearedByReset)
{
    qsys::TTYView v;
    v.setProjChange();
    EXPECT_TRUE(v.isProjChange());
    v.resetProjChgFlag();
    EXPECT_FALSE(v.isProjChange());
}

TEST(ViewTest, SizeChangedSetsProjChangeAndUpdatesSize)
{
    qsys::TTYView v;
    v.resetProjChgFlag();
    v.sizeChanged(320, 240);
    EXPECT_EQ(v.getWidth(), 320);
    EXPECT_EQ(v.getHeight(), 240);
    EXPECT_TRUE(v.isProjChange());
}

// --- Update flag ---

TEST(ViewTest, UpdateFlagLifecycle)
{
    qsys::TTYView v;
    v.clearUpdateFlag();
    EXPECT_FALSE(v.getUpdateFlag());
    v.setUpdateFlag();
    EXPECT_TRUE(v.getUpdateFlag());
    v.clearUpdateFlag();
    EXPECT_FALSE(v.getUpdateFlag());
}

// --- Scaling factor ---

TEST(ViewTest, SclFacDisabledByDefault)
{
    qsys::TTYView v;
    EXPECT_FALSE(v.useSclFac());
    EXPECT_EQ(v.convToBackingX(100), 100);
    EXPECT_EQ(v.convToBackingY(100), 100);
}

TEST(ViewTest, SclFacScalesBackingCoords)
{
    qsys::TTYView v;
    v.setSclFac(2.0, 3.0);
    EXPECT_TRUE(v.useSclFac());
    EXPECT_EQ(v.convToBackingX(100), 200);
    EXPECT_EQ(v.convToBackingY(100), 300);
}

TEST(ViewTest, UnsetSclFacRestoresIdentityScaling)
{
    qsys::TTYView v;
    v.setSclFac(2.0, 2.0);
    v.unsetSclFac();
    EXPECT_FALSE(v.useSclFac());
    EXPECT_EQ(v.convToBackingX(50), 50);
    EXPECT_EQ(v.convToBackingY(50), 50);
}

// --- Camera get/set roundtrip ---

TEST(ViewTest, CameraRoundtripPreservesZoomAndCenter)
{
    qsys::TTYView v;
    v.setZoom(42.0);
    v.setViewCenter(Vector4D(1.0, 2.0, 3.0));

    qsys::CameraPtr cam = v.getCamera();
    EXPECT_NEAR(cam->getZoom(), 42.0, 1e-6);
    EXPECT_NEAR(cam->m_center.x(), 1.0, 1e-8);

    // Reset and restore via setCamera
    qsys::TTYView v2;
    v2.setCamera(cam);
    EXPECT_NEAR(v2.getZoom(), 42.0, 1e-6);
    EXPECT_NEAR(v2.getViewCenter().x(), 1.0, 1e-8);
}

// --- Perspective / Stereo ---

TEST(ViewTest, SetGetPerspec)
{
    qsys::TTYView v;
    bool before = v.isPerspec();
    v.setPerspec(!before);
    EXPECT_EQ(v.isPerspec(), !before);
}

TEST(ViewTest, SetGetStereoMode)
{
    qsys::TTYView v;
    v.setStereoMode(qsys::Camera::CSM_PARA);
    EXPECT_EQ(v.getStereoMode(), qsys::Camera::CSM_PARA);
    v.setStereoMode(qsys::Camera::CSM_NONE);
    EXPECT_EQ(v.getStereoMode(), qsys::Camera::CSM_NONE);
}

TEST(ViewTest, SwapStereoEyesDefault)
{
    qsys::TTYView v;
    EXPECT_FALSE(v.isSwapStereoEyes());
}

TEST(ViewTest, SetSwapStereoEyes)
{
    qsys::TTYView v;
    v.setSwapStereoEyes(true);
    EXPECT_TRUE(v.isSwapStereoEyes());
}

// --- toString ---

TEST(ViewTest, ToStringIsNotEmpty)
{
    qsys::TTYView v;
    v.setName("testview");
    EXPECT_FALSE(v.toString().isEmpty());
}

// --- SceneID initial value ---

TEST(ViewTest, SceneIDIsInvalidByDefault)
{
    qsys::TTYView v;
    EXPECT_EQ(v.getSceneID(), qlib::invalid_uid);
}

// --- Center settle (wheel/gesture-driven center drags) ---
//
// Wheel/gesture pans have no end event of their own, so the view settles
// them into a non-drag "center" property change once the interaction goes
// idle. Listeners that only act on the final value (map renderers in
// autoupdate mode) depend on exactly that event.

namespace {

/// Counts non-drag "center" property changes.
class CenterChgCounter : public qsys::ViewEventListener
{
public:
    int nfired = 0;

    void viewChanged(qsys::ViewEvent &ev) override
    {
        if (ev.getType() == qsys::ViewEvent::VWE_PROPCHG &&
            ev.getDescr().equals("center"))
            ++nfired;
    }
};

/// RAII registration of a view-event listener matching any view.
class ScopedCenterChgCounter : public CenterChgCounter
{
public:
    ScopedCenterChgCounter()
    {
        qsys::ScrEventManager::getInstance()->addViewListener(qlib::invalid_uid,
                                                             this);
    }
    ~ScopedCenterChgCounter()
    {
        qsys::ScrEventManager::getInstance()->removeViewListener(this);
    }
};

qlib::time_value steadyNowNs()
{
    return qlib::time_value(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::steady_clock::now().time_since_epoch())
            .count());
}

const qlib::time_value ONE_MS_NS = 1000000LL;

}  // namespace

TEST(ViewCenterSettleTest, SettlesAfterIdleDelay)
{
    qsys::TTYView v;
    ScopedCenterChgCounter counter;

    const qlib::time_value t0 = steadyNowNs();
    v.setViewCenterDrag(Vector4D(1.0, 2.0, 3.0));
    EXPECT_EQ(counter.nfired, 0) << "the drag itself must not fire PROPCHG";

    // Still within the settle delay
    v.tickCenterSettle(t0);
    EXPECT_EQ(counter.nfired, 0);

    // Past the settle delay
    v.tickCenterSettle(t0 + 300 * ONE_MS_NS);
    EXPECT_EQ(counter.nfired, 1);

    // Pending is cleared: no repeats
    v.tickCenterSettle(t0 + 600 * ONE_MS_NS);
    EXPECT_EQ(counter.nfired, 1);
}

TEST(ViewCenterSettleTest, NoSettleWhileMouseDragActive)
{
    qsys::TTYView v;
    ScopedCenterChgCounter counter;

    qsys::InDevEvent ev;
    ev.setType(qsys::InDevEvent::INDEV_DRAG_START);
    v.mouseDragStart(ev);

    const qlib::time_value t0 = steadyNowNs();
    v.setViewCenterDrag(Vector4D(1.0, 2.0, 3.0));

    // A pause during a mouse drag must never settle: the drag has its own
    // end event.
    v.tickCenterSettle(t0 + 1000 * ONE_MS_NS);
    EXPECT_EQ(counter.nfired, 0);

    ev.setType(qsys::InDevEvent::INDEV_DRAG_END);
    v.mouseDragEnd(ev);
    EXPECT_EQ(counter.nfired, 1) << "drag end flushes the center change";
}

TEST(ViewCenterSettleTest, PendingSettleFlushedAtDragStart)
{
    qsys::TTYView v;
    ScopedCenterChgCounter counter;

    // Wheel/gesture pan, not yet settled...
    v.setViewCenterDrag(Vector4D(4.0, 5.0, 6.0));
    EXPECT_EQ(counter.nfired, 0);

    // ...followed immediately by a mouse drag: the pending change must be
    // flushed instead of being dropped by the drag-start state reset.
    qsys::InDevEvent ev;
    ev.setType(qsys::InDevEvent::INDEV_DRAG_START);
    v.mouseDragStart(ev);
    EXPECT_EQ(counter.nfired, 1);
}
