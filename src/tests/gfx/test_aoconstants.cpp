// Tests for gfx::AoConstants::fromCamera — the GTAO view-space reconstruction
// constants.
//
// These pin that the depth linearization and XY reconstruction the GTAO shaders
// apply are consistent with the projection matrix actually used
// (DisplayContext::makePersProjMat / makeOrthoProjMat), in BOTH perspective and
// orthographic modes.
//
// Regression guard: the orthographic path once reused the perspective
// (hyperbolic) depth unpack for the linear ortho depth buffer, so the
// reconstructed view-space Z was wrong and grew distorted with the slab depth.
// That made GTAO darken as the slab approached the camera distance. A failure of
// OrthographicDepthRoundTrip would catch that class of bug.

#include <gtest/gtest.h>
#include <common.h>

#include "gfx/PostProcGpuPrim.hpp"
#include "gfx/DisplayContext.hpp"
#include <qlib/Matrix4D.hpp>

using gfx::AoConstants;
using gfx::DisplayContext;
using qlib::Matrix4D;

namespace {

// Slab planes, matching GUIView::setUpProjMat / AoConstants::fromCamera.
void slabPlanes(double dist, double slab, double &outNear, double &outFar)
{
    if (slab <= 0.1) slab = 0.1;
    double n = dist - slab / 2.0;
    if (n < 0.1) n = 0.1;
    outNear = n;
    outFar = dist + slab;
}

// Window depth d in [0,1] for an eye-space point on the view axis at the given
// positive view-space distance viewZ (the eye looks down -Z, so ez = -viewZ),
// as produced by projMat with the default glDepthRange [0,1].
double windowDepth(const Matrix4D &m, double viewZ)
{
    const double ez = -viewZ;
    const double clipZ = m.getAt(3, 3) * ez + m.getAt(3, 4);
    const double clipW = m.getAt(4, 3) * ez + m.getAt(4, 4);
    return ((clipZ / clipW) + 1.0) * 0.5;
}

// Bottom-up [0,1] horizontal uv that an eye-space point (ex, 0, -viewZ) projects
// to, as produced by projMat.
double projectUvx(const Matrix4D &m, double ex, double viewZ)
{
    const double ez = -viewZ;
    const double clipX = m.getAt(1, 1) * ex + m.getAt(1, 3) * ez + m.getAt(1, 4);
    const double clipW = m.getAt(4, 1) * ex + m.getAt(4, 3) * ez + m.getAt(4, 4);
    return ((clipX / clipW) + 1.0) * 0.5;
}

// Shader-side depth linearization (matches gtao_frag.glsl / ao_composite_frag.glsl).
double linearizeZ(const AoConstants &c, double d)
{
    if (c.isOrtho != 0)
        return double(c.depthLinearizeMul) + d * double(c.depthLinearizeAdd);
    return double(c.depthLinearizeMul) / (double(c.depthLinearizeAdd) - d);
}

// Shader-side XY reconstruction (matches gtao_frag.glsl viewPos()).
double reconViewX(const AoConstants &c, double uvx, double viewZ)
{
    double x = double(c.ndcToViewMul[0]) * uvx + double(c.ndcToViewAdd[0]);
    if (c.isOrtho == 0) x *= viewZ;  // perspective unprojects by viewZ
    return x;
}

constexpr double kDist = 200.0;
constexpr double kZoom = 50.0;
constexpr double kAspect = 1.5;

}  // namespace

TEST(AoConstantsTest, PerspectiveDepthRoundTrip)
{
    for (double slab : {20.0, 50.0, 200.0, 350.0}) {
        double n, f;
        slabPlanes(kDist, slab, n, f);
        Matrix4D pm =
            DisplayContext::makePersProjMat(kZoom / 2.0, kAspect, n, f, kDist);
        AoConstants c =
            AoConstants::fromCamera(kDist, kZoom, slab, kAspect, 800, 600, true);
        ASSERT_EQ(c.isOrtho, 0);
        for (double vz : {n + 1.0, kDist, (kDist + f) / 2.0, f - 1.0}) {
            const double d = windowDepth(pm, vz);
            EXPECT_NEAR(linearizeZ(c, d), vz, 1e-2) << "slab=" << slab << " vz=" << vz;
        }
    }
}

TEST(AoConstantsTest, OrthographicDepthRoundTrip)
{
    for (double slab : {20.0, 50.0, 200.0, 350.0}) {
        double n, f;
        slabPlanes(kDist, slab, n, f);
        Matrix4D om = DisplayContext::makeOrthoProjMat(kZoom / 2.0, kAspect, n, f);
        AoConstants c =
            AoConstants::fromCamera(kDist, kZoom, slab, kAspect, 800, 600, false);
        ASSERT_EQ(c.isOrtho, 1);
        for (double vz : {n + 1.0, kDist, (kDist + f) / 2.0, f - 1.0}) {
            const double d = windowDepth(om, vz);
            EXPECT_NEAR(linearizeZ(c, d), vz, 1e-2) << "slab=" << slab << " vz=" << vz;
        }
    }
}

TEST(AoConstantsTest, PerspectiveXYRoundTrip)
{
    double n, f;
    slabPlanes(kDist, 200.0, n, f);
    Matrix4D pm = DisplayContext::makePersProjMat(kZoom / 2.0, kAspect, n, f, kDist);
    AoConstants c =
        AoConstants::fromCamera(kDist, kZoom, 200.0, kAspect, 800, 600, true);
    for (double vz : {n + 1.0, kDist, f - 1.0}) {
        for (double ex : {-15.0, 0.0, 9.0}) {
            const double uvx = projectUvx(pm, ex, vz);
            EXPECT_NEAR(reconViewX(c, uvx, vz), ex, 1e-2) << "vz=" << vz << " ex=" << ex;
        }
    }
}

TEST(AoConstantsTest, OrthographicXYRoundTrip)
{
    double n, f;
    slabPlanes(kDist, 200.0, n, f);
    Matrix4D om = DisplayContext::makeOrthoProjMat(kZoom / 2.0, kAspect, n, f);
    AoConstants c =
        AoConstants::fromCamera(kDist, kZoom, 200.0, kAspect, 800, 600, false);
    // In ortho the reconstructed X must be both correct AND independent of depth.
    for (double vz : {n + 1.0, kDist, f - 1.0}) {
        for (double ex : {-15.0, 0.0, 9.0}) {
            const double uvx = projectUvx(om, ex, vz);
            EXPECT_NEAR(reconViewX(c, uvx, vz), ex, 1e-2) << "vz=" << vz << " ex=" << ex;
        }
    }
}
