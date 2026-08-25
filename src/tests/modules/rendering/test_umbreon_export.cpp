#include <gtest/gtest.h>

#include <common.h>

#include "modules/rendering/UmbreonDisplayContext.hpp"

#include <gfx/SolidColor.hpp>
#include <qlib/Vector4D.hpp>

#include <functional>
#include <vector>

using qlib::Vector4D;
using render::UmbreonDisplayContext;
using render::UmbreonRenderParams;

// Drives the umbreon DisplayContext with a few primitives (a triangle, a
// sphere and a cylinder), renders the accumulated scene with umbreon, and
// checks that the result is a non-empty 64x64 frame. This pins the
// RendIntData -> umbreon::Scene translation and the in-process render path; it
// is not a rendering-correctness test. qsys is initialized by the test
// Environment (test_main.cpp), so StyleMgr already holds a global context.
TEST(UmbreonExport, RendersPrimitivesIntoNonEmptyFrame)
{
    UmbreonDisplayContext ctx;
    ctx.init();

    // Orthographic eye-space camera at (0,0,dist) looking down -Z, view height
    // = zoom, so geometry within ~[-3,3] around the origin is visible.
    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("test");

    // a front-facing triangle (normal toward the +Z camera)
    ctx.color(gfx::SolidColor::createRGB(1.0, 0.2, 0.2));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-1.5, -1.5, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(1.5, -1.5, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 1.5, 0.0));
    ctx.end();

    // a sphere and a cylinder
    ctx.color(gfx::SolidColor::createRGB(0.2, 0.6, 1.0));
    ctx.sphere(0.8, Vector4D(-1.0, 1.0, 0.5));

    ctx.color(gfx::SolidColor::createRGB(0.2, 1.0, 0.2));
    ctx.cylinder(0.3, Vector4D(1.0, 1.0, 0.0), Vector4D(1.8, -1.0, 0.0));

    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    EXPECT_EQ(ow, 64);
    EXPECT_EQ(oh, 64);
    EXPECT_EQ(ncomp, 3);
    ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 3));

    // Background is black; count pixels that received geometry.
    std::size_t nNonBg = 0;
    for (std::size_t i = 0; i + 2 < pix.size(); i += 3) {
        if (pix[i] > 8 || pix[i + 1] > 8 || pix[i + 2] > 8)
            ++nNonBg;
    }
    EXPECT_GT(nNonBg, 200u);
}

// Exercises the silhouette/edge path: with edge lines enabled, a sphere is
// folded into a tessellated mesh, its silhouette is extracted (convSpheres +
// calcSilEdgeLines + AABB-tree visibility), and outline cylinders/corner
// spheres are emitted via writeEdgeLineImpl/writePointImpl. Pins that this
// pipeline runs without crashing and yields a non-empty frame.
TEST(UmbreonExport, RendersSilhouetteEdgesWithoutCrashing)
{
    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.loadIdent();

    ctx.enableEdgeLines(true);
    ctx.setEdgeLineType(gfx::DisplayContext::ELT_SILHOUETTE);
    ctx.setEdgeLineWidth(0.06);
    ctx.setEdgeLineColor(gfx::SolidColor::createRGB(0.0, 0.0, 0.0));

    ctx.startRender();
    ctx.startSection("edges");

    // a sphere: folded into a tessellated mesh, then silhouette-outlined
    ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
    ctx.sphere(1.6, Vector4D(0.0, 0.0, 0.0));

    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    EXPECT_EQ(ow, 64);
    EXPECT_EQ(oh, 64);
    ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 3));

    std::size_t nNonBg = 0;
    for (std::size_t i = 0; i + 2 < pix.size(); i += 3) {
        if (pix[i] > 8 || pix[i + 1] > 8 || pix[i + 2] > 8)
            ++nNonBg;
    }
    EXPECT_GT(nNonBg, 200u);
}

// Pins the edge-width unit conversion: getEdgeLineWidth() is a world-space
// length (A) and umbreon's stroke width is the FULL band width in FINAL pixels,
// so the conversion is edgeLineWidth / lineScale -- ONE to one, matching the GL
// view's inverted-hull band (see the derivation in UmbreonDisplayContext). The
// POV convention (a cylinder of RADIUS edgeLineWidth, i.e. 2x) is what this
// guards against: it inked every rendered image twice as heavy as the GL view.
//
// A white quad facing the camera is bordered on a blue background; the ink is
// the only BLACK in the frame, so the band is measured by scanning the center
// row for its dark run. lineScale is set to 0.1 A/px and the width to 0.8 A, so
// the band must come out ~8 px wide (16 px would be the POV convention).
TEST(UmbreonExport, EdgeWidthConvertsAngstromToFinalPixels)
{
    const double kLineScale = 0.1;  // A per pixel
    const double kEdgeWidthA = 0.8;
    const int kExpectPx = int(kEdgeWidthA / kLineScale + 0.5);  // 8

    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.4);  // 64 px over 6.4 A == kLineScale
    ctx.setLineScale(kLineScale);
    ctx.setBgColor(gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    ctx.loadIdent();

    ctx.enableEdgeLines(true);
    ctx.setEdgeLineType(gfx::DisplayContext::ELT_EDGES);
    ctx.setEdgeLineWidth(kEdgeWidthA);
    ctx.setEdgeLineColor(gfx::SolidColor::createRGB(0.0, 0.0, 0.0));

    ctx.startRender();
    ctx.startSection("width");

    // A white quad facing the camera: no silhouette (it is flat-on), so the
    // only inked feature is its open border.
    ctx.color(gfx::SolidColor::createRGB(1.0, 1.0, 1.0));
    ctx.startTriangles();
    const double kQuad = 2.0;
    const Vector4D nz(0.0, 0.0, 1.0);
    const Vector4D c0(-kQuad, -kQuad, 0.0), c1(kQuad, -kQuad, 0.0);
    const Vector4D c2(kQuad, kQuad, 0.0), c3(-kQuad, kQuad, 0.0);
    const Vector4D tri[6] = {c0, c1, c2, c0, c2, c3};
    for (int i = 0; i < 6; ++i) {
        ctx.normal(nz);
        ctx.vertex(tri[i]);
    }
    ctx.end();

    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 3));

    // Longest run of BLACK (all channels dark) in the center row: neither the
    // white quad nor the blue background is dark in every channel.
    int best = 0, run = 0;
    for (int x = 0; x < 64; ++x) {
        const std::size_t i = (static_cast<std::size_t>(32) * 64 + x) * 3;
        const bool ink = pix[i] < 60 && pix[i + 1] < 60 && pix[i + 2] < 60;
        run = ink ? run + 1 : 0;
        if (run > best) best = run;
    }
    // +-2 px covers the ribbon's antialiased shoulders while still rejecting
    // the 2x (POV radius) conversion.
    EXPECT_NEAR(best, kExpectPx, 2);
}

// Pins the section-alpha (setAlpha) transparency path: an opaque RED triangle
// sits at z=0, and a translucent BLUE triangle (its section drawn with
// alpha 0.5) covers it at z=1, closer to the camera. With the section default
// alpha applied to the front's opacity, umbreon composites front-over-back, so
// the center pixel carries BOTH the back's red and the front's blue. If the
// section alpha were dropped (the bug this guards), the opaque blue front would
// hide the red entirely (center red ~ 0).
TEST(UmbreonExport, BlendsTranslucentSectionOverOpaqueGeometry)
{
    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.loadIdent();

    ctx.startRender();

    // back: opaque RED triangle (default section alpha 1.0) at z=0
    ctx.startSection("back");
    ctx.color(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 0.0));
    ctx.end();
    ctx.endSection();

    // front: translucent BLUE triangle (section alpha 0.5) at z=1
    ctx.setAlpha(0.5);
    ctx.startSection("front");
    ctx.color(gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 1.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 1.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 1.0));
    ctx.end();
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 3));

    // Center pixel (both triangles cover it): translucent blue over opaque red.
    const std::size_t c = (static_cast<std::size_t>(32) * 64 + 32) * 3;
    EXPECT_GT(pix[c + 0], 30);  // red shows through the translucent front
    EXPECT_GT(pix[c + 2], 30);  // blue from the front
}

// Pins the slab near-clip path (setClipZ): with the slab depth set so the clip
// plane is z = 1, a GREEN triangle at z=0 is inside the slab and a RED triangle
// at z=2 is in front of the clip plane (closer to the camera). The clipping is
// umbreon's (Scene::clipNear = viewDist - slab/2); the mesh is handed over
// uncut, and the red triangle is removed by the plane, so the center pixel
// shows the green behind it. Without clipping the closer red would occlude it.
TEST(UmbreonExport, ClipsGeometryInFrontOfSlabPlane)
{
    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.setSlabDepth(2.0);  // near clip plane at z = slab/2 = 1.0
    ctx.setClipZ(true);
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("clip");

    // GREEN triangle at z=0 (inside the slab, z < 1) -- kept
    ctx.color(gfx::SolidColor::createRGB(0.0, 1.0, 0.0));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 0.0));
    ctx.end();

    // RED triangle at z=2 (in front of the near clip plane, z >= 1) -- clipped
    ctx.color(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 2.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 2.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 2.0));
    ctx.end();

    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 3));

    // Center pixel: the closer red triangle was clipped, so green shows.
    const std::size_t c = (static_cast<std::size_t>(32) * 64 + 32) * 3;
    EXPECT_GT(pix[c + 1], 30);  // green (inside the slab) is visible
    EXPECT_LT(pix[c + 0], 30);  // red (in front of the clip plane) is gone
}

// Pins that the slab plane cuts the ANALYTIC primitives too: spheres and
// cylinders are handed to umbreon whole and its clipNear plane does the
// cutting. The RED sphere (center z=1.5, radius 0.6) straddles the clip plane
// at z=1, and its rim -- everything more than ~0.37 off the view axis -- lies
// ENTIRELY in front of that plane. The probe sits in the rim, so it shows the
// sphere when clipping is off and the GREEN backdrop (z=0, inside the slab)
// when it is on. The CueMol-side clip this replaces could not cut a quadric: it
// only dropped a sphere fully in front of the plane and drew the rest whole,
// which left the probe red in both renders.
TEST(UmbreonExport, ClipPlaneCutsAnalyticSphere)
{
    // Orthographic: 64 px over a zoom (view height) of 4.0 => 16 px per world
    // unit, so pixel x=39 is world x = (39 + 0.5 - 32) / 16 = 0.47 -- inside the
    // sphere's 0.6 disk, and on the cut-away rim. The scene is symmetric about
    // the view axis, so the probe does not depend on the image axis directions.
    const int kProbeX = 39, kProbeY = 32;

    auto renderProbe = [kProbeX, kProbeY](bool useClipZ, unsigned char &red,
                                          unsigned char &green) {
        UmbreonDisplayContext ctx;
        ctx.init();

        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(4.0);
        ctx.setSlabDepth(2.0);  // near clip plane at z = slab/2 = 1.0
        ctx.setClipZ(useClipZ);
        ctx.loadIdent();

        ctx.startRender();
        ctx.startSection("clipsph");

        // GREEN backdrop at z=0 (inside the slab)
        ctx.color(gfx::SolidColor::createRGB(0.0, 1.0, 0.0));
        ctx.startTriangles();
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-2.0, -2.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(2.0, -2.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(0.0, 2.0, 0.0));
        ctx.end();

        // RED sphere straddling the clip plane (spans z = 0.9 .. 2.1)
        ctx.color(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
        ctx.sphere(0.6, Vector4D(0.0, 0.0, 1.5));

        ctx.endSection();

        UmbreonRenderParams prm;
        prm.width = 64;
        prm.height = 64;
        prm.supersample = 1;

        int ow = 0, oh = 0, ncomp = 0;
        std::vector<unsigned char> pix;
        ctx.render(prm, ow, oh, ncomp, pix);
        ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 3));

        const std::size_t c =
            (static_cast<std::size_t>(kProbeY) * 64 + kProbeX) * 3;
        red = pix[c + 0];
        green = pix[c + 1];
    };

    unsigned char red = 0, green = 0;

    renderProbe(false, red, green);
    EXPECT_GT(red, 30);    // unclipped: the whole sphere is drawn
    EXPECT_LT(green, 30);

    renderProbe(true, red, green);
    EXPECT_LT(red, 30);    // clipped: the sphere's rim is cut away
    EXPECT_GT(green, 30);  // the backdrop inside the slab shows through
}

// Pins the output encoding contract: the umbreon linear HDR framebuffer is
// mapped STRAIGHT to 8-bit (clamp [0,1] * 255) with NO assumed_gamma and NO
// sRGB OETF -- the PNG sRGB tag carries the display transfer curve instead.
// Verified through linearity: a flat ambient ("nolighting") surface shades to
// out = k * pigment, so doubling the pigment (0.25 -> 0.5) must double the
// output byte. A sRGB OETF would compress that ratio to ~1.37 and an
// assumed_gamma 2.2 would expand it to ~4.6; only the direct linear map gives 2.
TEST(UmbreonExport, OutputIsDirectLinearMap)
{
    auto renderGray = [](double gray) {
        UmbreonDisplayContext ctx;
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(6.0);
        ctx.setSlabDepth(1.0e6);  // push depth fog far away (negligible)
        ctx.loadIdent();

        ctx.startRender();
        ctx.startSection("gray");
        ctx.setMaterial("nolighting");  // flat ambient: out = k * pigment
        ctx.color(gfx::SolidColor::createRGB(gray, gray, gray));
        ctx.startTriangles();
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-2.0, -2.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(2.0, -2.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(0.0, 2.0, 0.0));
        ctx.end();
        ctx.endSection();

        UmbreonRenderParams prm;
        prm.width = 64;
        prm.height = 64;
        prm.supersample = 1;

        int ow = 0, oh = 0, ncomp = 0;
        std::vector<unsigned char> pix;
        ctx.render(prm, ow, oh, ncomp, pix);
        return pix;
    };

    std::vector<unsigned char> quarter = renderGray(0.25);
    std::vector<unsigned char> half = renderGray(0.5);

    ASSERT_EQ(quarter.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(quarter.size(), half.size());

    const std::size_t c = (static_cast<std::size_t>(32) * 64 + 32) * 3;
    ASSERT_GT(quarter[c], 8);  // both grays are visible
    ASSERT_GT(half[c], 8);

    // Linear map (no gamma, no sRGB): half / quarter == 2. Rounding keeps it
    // well inside [1.75, 2.25]; sRGB (~1.37) and gamma-2.2 (~4.6) are far out.
    const double ratio =
        static_cast<double>(half[c]) / static_cast<double>(quarter[c]);
    EXPECT_NEAR(ratio, 2.0, 0.25);
}

// Renders one flat gray triangle (normal +Z, facing the camera) carrying
// `matName`, at 64x64. Shared by the per-material tests below: they vary only
// the material name, so the material resolution IS the discriminator.
static std::vector<unsigned char> renderTriangleWithMaterial(const char *matName)
{
    UmbreonDisplayContext ctx;
    ctx.init();
    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.setSlabDepth(1.0e6);  // push the depth fog far away (negligible)
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("m");
    ctx.setMaterial(matName);  // before color(): the CLUT captures the name
    ctx.color(gfx::SolidColor::createRGB(0.5, 0.5, 0.5));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 0.0));
    ctx.end();
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);
    return pix;
}

// Red channel of the center pixel of a 64x64 RGB frame (the triangle covers it).
static const std::size_t kCenterPx = (static_cast<std::size_t>(32) * 64 + 32) * 3;

// Pins per-material resolution (setMaterial -> CLUT -> lookupMaterial ->
// umbreon::Material). "nolighting" (ambient 1.0) and "shadow" (ambient 0.75)
// are both ambient-only flat NPR materials (diffuse 0, specular 0), so they are
// independent of lighting/normals and differ ONLY by their ambient term. The
// same gray triangle therefore renders brighter under nolighting than shadow.
// If the exporter ignored per-material lookup (one shared default for
// everything, as it once did), the two would be identical and this would fail.
TEST(UmbreonExport, AppliesPerMaterialFinish)
{
    std::vector<unsigned char> noli = renderTriangleWithMaterial("nolighting");
    std::vector<unsigned char> shad = renderTriangleWithMaterial("shadow");

    ASSERT_EQ(noli.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(noli.size(), shad.size());

    EXPECT_GT(noli[kCenterPx], 8);  // the flat ambient surface is visible
    // ambient 1.0 (nolighting) is clearly brighter than 0.75 (shadow)
    EXPECT_GT(static_cast<int>(noli[kCenterPx]),
              static_cast<int>(shad[kCenterPx]) + 15);
}

// Pins the authored PBR materials. "metallic_chrome" has no POV finish block in
// the style (its def is a bare `texture{T_Chrome_4D}`), so the old POV-def path
// fell back to the default plastic finish and chrome rendered EXACTLY like
// "default" -- the bug the name -> material table replaced. Chrome is now an
// authored principled metal (metallic 1), whose metal cut zeroes the diffuse
// lobe, so it must render clearly DARKER than default plastic (diffuse 0.8)
// under the same light. Fails if the table is bypassed or chrome loses its
// metallic authoring.
TEST(UmbreonExport, AuthoredMetalDiffersFromDefaultPlastic)
{
    std::vector<unsigned char> chrome =
        renderTriangleWithMaterial("metallic_chrome");
    std::vector<unsigned char> plastic = renderTriangleWithMaterial("default");

    ASSERT_EQ(chrome.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(chrome.size(), plastic.size());

    EXPECT_LT(static_cast<int>(chrome[kCenterPx]),
              static_cast<int>(plastic[kCenterPx]));
}

// Pins the transparent-background path (transparentBackground -> RGBA output
// with alpha = coverage). An opaque triangle covers the center; a corner has no
// geometry. The output must be 4-component, with the covered center fully
// opaque (alpha 255) and the empty corner fully transparent (alpha 0, and RGB
// zeroed by the un-premultiply).
TEST(UmbreonExport, RendersTransparentBackground)
{
    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("t");
    ctx.color(gfx::SolidColor::createRGB(0.2, 0.8, 0.2));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 0.0));
    ctx.end();
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;
    prm.transparentBackground = true;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    EXPECT_EQ(ncomp, 4);
    ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 4));

    // center: covered by the opaque triangle -> fully opaque
    const std::size_t center = (static_cast<std::size_t>(32) * 64 + 32) * 4;
    EXPECT_EQ(pix[center + 3], 255);
    EXPECT_GT(pix[center + 1], 8);  // the green surface shows through

    // top-left corner: no geometry -> fully transparent, RGB un-premultiplied to 0
    const std::size_t corner = 0;
    EXPECT_EQ(pix[corner + 3], 0);
    EXPECT_EQ(pix[corner + 0], 0);
    EXPECT_EQ(pix[corner + 1], 0);
    EXPECT_EQ(pix[corner + 2], 0);
}

// Pins that the ambient-occlusion and shadow options reach umbreon and change
// the result. A mesh plane (AO applies to mesh hits) is occluded by a sphere in
// front of it, so enabling AO + shadows darkens the plane around the sphere
// (AO) and casts the sphere's shadow onto it. The enhanced render must differ
// from the baseline; if the options were dropped the two would be identical.
TEST(UmbreonExport, AmbientOcclusionAndShadowsAffectOutput)
{
    auto renderOccludedPlane = [](int aoSamples, bool shadows) {
        UmbreonDisplayContext ctx;
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(8.0);
        ctx.loadIdent();

        ctx.startRender();
        ctx.startSection("s");
        ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
        // a mesh plane at z=0 facing the camera (two triangles)
        ctx.startTriangles();
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0, -3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0, -3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0, 3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0, -3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0, 3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0, 3.0, 0.0));
        ctx.end();
        // a sphere in front of the plane (between it and the camera/lights)
        ctx.sphere(1.2, Vector4D(0.0, 0.0, 1.5));
        ctx.endSection();

        UmbreonRenderParams prm;
        prm.width = 64;
        prm.height = 64;
        prm.supersample = 1;
        prm.aoSamples = aoSamples;
        prm.aoDistance = 10.0;
        prm.aoIntensity = 1.0;
        prm.shadows = shadows;
        prm.shadowSamples = 4;
        prm.lightRadius = 2.0;

        int ow = 0, oh = 0, ncomp = 0;
        std::vector<unsigned char> pix;
        ctx.render(prm, ow, oh, ncomp, pix);
        return pix;
    };

    std::vector<unsigned char> base = renderOccludedPlane(0, false);
    std::vector<unsigned char> enh = renderOccludedPlane(16, true);

    ASSERT_EQ(base.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(base.size(), enh.size());

    // the scene is lit in the baseline
    std::size_t nNonBg = 0;
    for (std::size_t i = 0; i + 2 < base.size(); i += 3) {
        if (base[i] > 8 || base[i + 1] > 8 || base[i + 2] > 8)
            ++nNonBg;
    }
    EXPECT_GT(nNonBg, 200u);
    // AO + shadows change the shaded result
    EXPECT_NE(base, enh);
}

// The AO quality recipe (UmbreonSceneExporter aoDiffuseFactor / aoMultiScale /
// aoBentNormal / aoLowDiscrepancy / aoResDiv) must reach umbreon's RenderOptions.
//
// aoDiffuseFactor is the one that decides whether AO is visible at all: AO
// darkens only the ambient term by default, and CueMol's default lighting puts
// most of its energy in the direct lights, so AO at factor 0 barely changes the
// image. Raising it to 1.0 must darken the occluded region measurably. This
// pins the wiring that the Rendering window's AO quality presets depend on.
namespace {

/// Mean of every channel byte -- a proxy for overall image brightness.
double meanLevel(const std::vector<unsigned char> &pix)
{
    if (pix.empty())
        return 0.0;
    double sum = 0.0;
    for (unsigned char c : pix) sum += double(c);
    return sum / double(pix.size());
}

/// A plane with a sphere hovering in front of it, rendered with the supplied
/// AO settings. The sphere occludes the plane, so AO has something to darken.
std::vector<unsigned char> renderAoRecipe(const UmbreonRenderParams &aoPrm)
{
    UmbreonDisplayContext ctx;
    ctx.init();
    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(8.0);
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("s");
    ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-3.0, -3.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(3.0, -3.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(3.0, 3.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-3.0, -3.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(3.0, 3.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-3.0, 3.0, 0.0));
    ctx.end();
    ctx.sphere(1.2, Vector4D(0.0, 0.0, 1.5));
    ctx.endSection();

    UmbreonRenderParams prm = aoPrm;
    prm.width = 64;
    prm.height = 64;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);
    return pix;
}

}  // anonymous namespace

TEST(UmbreonExport, AoDiffuseFactorDarkensOccludedGeometry)
{
    UmbreonRenderParams prm;
    prm.supersample = 1;
    prm.aoSamples = 32;
    prm.aoDistance = 10.0;
    prm.aoIntensity = 1.0;
    prm.aoLowDiscrepancy = true;

    // Ambient-only AO (umbreon's default factor).
    std::vector<unsigned char> ambientOnly = renderAoRecipe(prm);

    // The recipe value: AO also darkens the direct diffuse term.
    prm.aoDiffuseFactor = 1.0;
    std::vector<unsigned char> withDiffuse = renderAoRecipe(prm);

    ASSERT_EQ(ambientOnly.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(ambientOnly.size(), withDiffuse.size());
    // Strictly darker overall, not merely different: the occluded plane loses
    // direct diffuse energy it kept at factor 0.
    EXPECT_LT(meanLevel(withDiffuse), meanLevel(ambientOnly) - 1.0);
}

// AO radius auto-scaling: aoDistance <= 0 means "derive it from this scene".
// A fixed world radius would make the same setting darken a small molecule and
// do nothing on a large one, since AO only finds occluders within the radius.
TEST(UmbreonExport, AutoAoDistanceScalesWithTheScene)
{
    // The same geometry at two scales. With auto distance both must show AO;
    // a fixed radius tuned for the small one leaves the large one untouched.
    auto renderScaled = [](double scale, double aoDistance) {
        UmbreonDisplayContext ctx;
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0 * scale);
        ctx.setZoom(8.0 * scale);
        ctx.loadIdent();

        ctx.startRender();
        ctx.startSection("s");
        ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
        ctx.startTriangles();
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0 * scale, -3.0 * scale, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0 * scale, -3.0 * scale, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0 * scale, 3.0 * scale, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0 * scale, -3.0 * scale, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0 * scale, 3.0 * scale, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0 * scale, 3.0 * scale, 0.0));
        ctx.end();
        ctx.sphere(1.2 * scale, Vector4D(0.0, 0.0, 1.5 * scale));
        ctx.endSection();

        UmbreonRenderParams prm;
        prm.width = 64;
        prm.height = 64;
        prm.supersample = 1;
        prm.aoSamples = 32;
        prm.aoDistance = aoDistance;
        prm.aoIntensity = 1.0;
        prm.aoDiffuseFactor = 1.0;

        int ow = 0, oh = 0, ncomp = 0;
        std::vector<unsigned char> pix;
        ctx.render(prm, ow, oh, ncomp, pix);
        return pix;
    };

    const double smallAo = meanLevel(renderScaled(1.0, 0.0));   // auto
    const double largeAo = meanLevel(renderScaled(20.0, 0.0));  // auto
    // A radius tuned for the small scene, used unchanged on the large one.
    const double largeFixed = meanLevel(renderScaled(20.0, 10.0));

    // Auto keeps the occlusion at both scales: the 20x scene is darkened about
    // as much as the 1x one, while the fixed radius leaves it much brighter.
    EXPECT_NEAR(largeAo, smallAo, 6.0);
    EXPECT_LT(largeAo, largeFixed - 1.0);
}

// Adaptive AA (aaMode = 1) refines only the pixels an edge crosses. It must
// reach the renderer and change the edges relative to a plain ss=1 grid render,
// and it must be forced back to grid under GI (umbreon does not support the
// combination).
TEST(UmbreonExport, AdaptiveAaRefinesEdges)
{
    UmbreonRenderParams prm;
    prm.supersample = 1;

    std::vector<unsigned char> grid = renderAoRecipe(prm);

    prm.aaMode = 1;
    prm.aaDepth = 3;
    std::vector<unsigned char> adaptive = renderAoRecipe(prm);

    ASSERT_EQ(grid.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(grid.size(), adaptive.size());
    // Same scene, better edges: the frames differ but stay comparably bright
    // (adaptive AA is an edge refinement, not a shading change).
    EXPECT_NE(grid, adaptive);
    EXPECT_NEAR(meanLevel(adaptive), meanLevel(grid), 4.0);
}

TEST(UmbreonExport, AoRecipeFlagsReachTheRenderer)
{
    UmbreonRenderParams prm;
    // aoResDiv = -1 (gather once per output pixel) only engages above ss 1.
    prm.supersample = 2;
    prm.aoSamples = 16;
    prm.aoDistance = 10.0;
    prm.aoIntensity = 1.0;
    prm.aoDiffuseFactor = 1.0;
    std::vector<unsigned char> inlineGather = renderAoRecipe(prm);

    prm.aoMultiScale = true;
    prm.aoBentNormal = true;
    prm.aoLowDiscrepancy = true;
    prm.aoResDiv = -1;
    std::vector<unsigned char> recipe = renderAoRecipe(prm);

    ASSERT_EQ(inlineGather.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(inlineGather.size(), recipe.size());
    // The frame is still lit (the coarse-grid path did not blank it) ...
    EXPECT_GT(meanLevel(recipe), 1.0);
    // ... and the enhanced estimator produced a different shading than the
    // single-scale inline gather.
    EXPECT_NE(inlineGather, recipe);
}

// Smoke test for the pt1 path-traced GI integrator + Intel OIDN denoiser:
// enabling GI must run without crashing, produce a lit frame, and (via the
// radiosity lighting rebalance) differ from the local-shading render.
TEST(UmbreonExport, GlobalIlluminationAffectsOutput)
{
    auto renderBox = [](bool useGi) {
        UmbreonDisplayContext ctx;
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(8.0);
        ctx.loadIdent();

        ctx.startRender();
        ctx.startSection("s");
        ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
        // a backdrop plane plus a sphere in front to receive indirect bounce
        ctx.startTriangles();
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0, -3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0, -3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0, 3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0, -3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(3.0, 3.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-3.0, 3.0, 0.0));
        ctx.end();
        ctx.sphere(1.2, Vector4D(0.0, 0.0, 1.5));
        ctx.endSection();

        UmbreonRenderParams prm;
        prm.width = 48;
        prm.height = 48;
        prm.supersample = 1;
        prm.giEnabled = useGi;
        prm.giSamples = 8;  // low count -- this is a smoke test, not a quality one
        prm.giDenoise = useGi;

        int ow = 0, oh = 0, ncomp = 0;
        std::vector<unsigned char> pix;
        ctx.render(prm, ow, oh, ncomp, pix);
        return pix;
    };

    std::vector<unsigned char> base = renderBox(false);
    std::vector<unsigned char> giFrame = renderBox(true);

    ASSERT_EQ(base.size(), static_cast<std::size_t>(48 * 48 * 3));
    ASSERT_EQ(base.size(), giFrame.size());

    std::size_t nNonBg = 0;
    for (std::size_t i = 0; i + 2 < giFrame.size(); i += 3) {
        if (giFrame[i] > 8 || giFrame[i + 1] > 8 || giFrame[i + 2] > 8)
            ++nNonBg;
    }
    EXPECT_GT(nNonBg, 100u);
    EXPECT_NE(base, giFrame);
}

// Pins the GI integrator's TRACED reflection (the pt2 behavior CueMol asks for
// via giIntegrator=2 in buildSceneAndOptions): a reflective material must mirror
// the actual scene geometry, not the background color.
//
// Setup: a gray "spec_metal" panel (a principled metal ported from POV
// F_MetalD: metallic 1, roughness 0.37, reflection 0.65 -- the reflection
// scalar is dormant in the BSDF but still sets the non-pt2 fake environment
// amount) tilted 45 deg about Y, so its mirror direction is exactly -X. Note
// the traced lobe is glossy at that roughness, not a sharp mirror; the
// threshold below has margin for the spread. A red "matte"
// panel sits at x = -4, OUTSIDE the view frustum (zoom 6 => the frame spans x
// in [-3,3]) and edge-on to the camera, so it is invisible directly and can
// only reach the metal through a reflection bounce. The background is black.
//
// The discriminator is the MAGNITUDE of the red the metal picks up. A traced
// specular lobe composites reflection * E_spec = 0.65 * red. The older fake
// environment term composites reflection * background = 0.65 * black = 0, and
// leaves only the diffuse gather's bounce -- the red panel subtends a small
// part of the cosine-weighted hemisphere, so that is an order of magnitude
// weaker. The threshold below sits between the two measured regimes.
TEST(UmbreonExport, ReflectiveMaterialMirrorsSceneGeometryUnderGI)
{
    UmbreonDisplayContext ctx;
    ctx.init();
    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.setSlabDepth(1.0e6);  // push the depth fog far away (negligible)
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("refl");

    // Metal panel through the origin, normal (-1,0,1)/sqrt(2) (faces the +Z
    // camera, tilts the mirror ray to -X). Spanned by U = (1,0,1)/sqrt(2) and
    // Y; every point on it reflects toward -X.
    const double h = 0.70710678;  // 1/sqrt(2)
    const double a = 1.5, b = 1.5;
    ctx.setMaterial("spec_metal");  // before color(): the CLUT captures the name
    ctx.color(gfx::SolidColor::createRGB(0.5, 0.5, 0.5));  // gray: any red is reflected
    ctx.startTriangles();
    const Vector4D nrm(-h, 0.0, h);
    const Vector4D p1(-a * h, -b, -a * h);
    const Vector4D p2(a * h, -b, a * h);
    const Vector4D p3(a * h, b, a * h);
    const Vector4D p4(-a * h, b, -a * h);
    const Vector4D quad[6] = {p1, p2, p3, p1, p3, p4};
    for (const Vector4D &v : quad) {
        ctx.normal(nrm);
        ctx.vertex(v);
    }
    ctx.end();

    // Red panel at x = -4 facing +X: out of frame and edge-on, so it is only
    // reachable by a bounce. "matte" (ambient 0.3, diffuse 0.8) is an ordinary
    // diffuse surface -- it must have a non-zero diffuse to feed the bounce at
    // all ("nolighting" has diffuse 0, so its flat ambient look is camera-
    // visible self-illumination only and it hands the gather nothing).
    ctx.setMaterial("matte");
    ctx.color(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
    ctx.startTriangles();
    const Vector4D rn(1.0, 0.0, 0.0);
    const Vector4D q1(-4.0, -1.5, -1.5);
    const Vector4D q2(-4.0, -1.5, 1.5);
    const Vector4D q3(-4.0, 1.5, 1.5);
    const Vector4D q4(-4.0, 1.5, -1.5);
    const Vector4D rquad[6] = {q1, q2, q3, q1, q3, q4};
    for (const Vector4D &v : rquad) {
        ctx.normal(rn);
        ctx.vertex(v);
    }
    ctx.end();
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 48;
    prm.height = 48;
    prm.supersample = 1;
    prm.giEnabled = true;
    prm.giSamples = 8;
    prm.giDenoise = false;  // keep the raw gather: OIDN would blur the signal

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    ASSERT_EQ(pix.size(), static_cast<std::size_t>(48 * 48 * 3));

    // center of the frame: on the metal panel
    const std::size_t c = (static_cast<std::size_t>(24) * 48 + 24) * 3;
    const int red = pix[c], blue = pix[c + 2];

    EXPECT_GT(red, 8);  // the metal panel is actually there

    // Measured at this setup: R-B = 119 with the traced lobe, R-B = 2 with the
    // fake reflection*background term (the metal only picks up the gather's weak
    // diffuse bounce off the red panel). 40 sits well between the two regimes.
    EXPECT_GT(red - blue, 40);
}

// Pins per-renderer veil compositing: a semi-transparent section (renderer) is
// laid down as ONE single-layer veil, so several overlapping spheres in it look
// identical to a single sphere -- the overlaps do not double-blend. Without the
// veil (plain front-to-back "over"), N stacked translucent spheres would
// accumulate and look brighter/more opaque than one.
TEST(UmbreonExport, PostBlendsTranslucentSectionWithoutDoubleBlend)
{
    auto renderStackedSpheres = [](int nSpheres) {
        UmbreonDisplayContext ctx;
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(6.0);
        ctx.loadIdent();

        ctx.startRender();
        ctx.setAlpha(0.5);  // semi-transparent section -> a post-blended group
        ctx.startSection("group");
        ctx.color(gfx::SolidColor::createRGB(0.2, 0.4, 1.0));
        // coincident in screen space (same x,y, stacked slightly in z), so they
        // fully overlap; only the frontmost contributes within the group's pass
        for (int i = 0; i < nSpheres; ++i)
            ctx.sphere(1.5, Vector4D(0.0, 0.0, -0.02 * i));
        ctx.endSection();

        UmbreonRenderParams prm;
        prm.width = 64;
        prm.height = 64;
        prm.supersample = 1;

        int ow = 0, oh = 0, ncomp = 0;
        std::vector<unsigned char> pix;
        ctx.render(prm, ow, oh, ncomp, pix);
        return pix;
    };

    std::vector<unsigned char> one = renderStackedSpheres(1);
    std::vector<unsigned char> three = renderStackedSpheres(3);

    ASSERT_EQ(one.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(one.size(), three.size());

    // the sphere is visible (lit, semi-transparent over the black background)
    const std::size_t c = (static_cast<std::size_t>(32) * 64 + 32) * 3;
    EXPECT_GT(one[c + 2], 8);
    // post-blend group: three coincident spheres == one (no double-blend)
    EXPECT_EQ(one, three);
}

// Two semi-transparent sections make the group-alpha blend weights sum to more
// than 1 (0.95 + 0.95), which over-brightens every pass and blows OPAQUE
// geometry out to white.
//
// The blend is out = (1 - sum(a)) * bgPass + sum_i a_i * layerPass_i. The
// background weight is clamped at 0 when sum(a) > 1, but the layer weights are
// not rescaled, so the total stays at sum(a). An opaque section belongs to no
// blend group, so it is present in EVERY layer pass and is multiplied by
// sum(a) = 1.9; anything above ~0.24 linear then clips to pure white.
TEST(UmbreonExport, OpaqueSectionSurvivesTwoTranslucentSections)
{
    // A bright opaque triangle, plus `nTrans` translucent sections placed well
    // away from it (off to the sides), so they never cover the triangle.
    auto renderWith = [](int nTrans, double transAlpha) {
        UmbreonDisplayContext ctx;
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(6.0);
        ctx.loadIdent();

        ctx.startRender();

        ctx.setAlpha(1.0);  // opaque -> no blend group
        ctx.startSection("opaque");
        ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
        ctx.startTriangles();
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-1.0, -1.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(1.0, -1.0, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(0.0, 1.0, 0.0));
        ctx.end();
        ctx.endSection();

        for (int i = 0; i < nTrans; ++i) {
            ctx.setAlpha(transAlpha);
            ctx.startSection(LString::format("trans%d", i));
            ctx.color(gfx::SolidColor::createRGB(0.2, 0.4, 1.0));
            ctx.sphere(0.4, Vector4D((i == 0) ? -2.5 : 2.5, 2.0, 0.0));
            ctx.endSection();
        }

        UmbreonRenderParams prm;
        prm.width = 64;
        prm.height = 64;
        prm.supersample = 1;

        int ow = 0, oh = 0, ncomp = 0;
        std::vector<unsigned char> pix;
        ctx.render(prm, ow, oh, ncomp, pix);
        return pix;
    };

    // Sample the middle of the opaque triangle (below the frame centre, since
    // the triangle spans y = -1 .. 1 with its wide edge at the bottom).
    const std::size_t c = (static_cast<std::size_t>(38) * 64 + 32) * 3;

    const std::vector<unsigned char> none = renderWith(0, 1.0);
    ASSERT_EQ(none.size(), static_cast<std::size_t>(64 * 64 * 3));
    // Baseline: lit grey, not saturated.
    ASSERT_GT(none[c], 8);
    ASSERT_LT(none[c], 250);

    // One translucent section: sum(a) = 0.95 <= 1, so the opaque triangle is
    // unaffected.
    const std::vector<unsigned char> one = renderWith(1, 0.95);
    EXPECT_NEAR(one[c], none[c], 2);

    // Two translucent sections: sum(a) = 1.9. The opaque triangle must still
    // match the baseline -- it is in no blend group and nothing occludes it.
    const std::vector<unsigned char> two = renderWith(2, 0.95);
    EXPECT_NEAR(two[c], none[c], 2)
        << "opaque geometry was scaled by the group-alpha weight sum";
}

// Pins the asynchronous render path (startAsyncRender -> finishAsyncRender)
// against the synchronous render(): rendering the SAME scene on a background
// thread must produce a byte-identical frame (umbreon guarantees deterministic
// pixels; only the threading differs). This is the core regression guard for
// the async split -- if buildSceneAndOptions/encodeFrame or the move-into-
// renderAsync drops or reorders anything, the two frames diverge.
TEST(UmbreonExport, AsyncRenderMatchesSyncRender)
{
    auto buildScene = [](UmbreonDisplayContext &ctx) {
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(6.0);
        ctx.loadIdent();

        ctx.startRender();
        ctx.startSection("test");

        ctx.color(gfx::SolidColor::createRGB(1.0, 0.2, 0.2));
        ctx.startTriangles();
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(-1.5, -1.5, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(1.5, -1.5, 0.0));
        ctx.normal(Vector4D(0.0, 0.0, 1.0));
        ctx.vertex(Vector4D(0.0, 1.5, 0.0));
        ctx.end();

        ctx.color(gfx::SolidColor::createRGB(0.2, 0.6, 1.0));
        ctx.sphere(0.8, Vector4D(-1.0, 1.0, 0.5));

        ctx.color(gfx::SolidColor::createRGB(0.2, 1.0, 0.2));
        ctx.cylinder(0.3, Vector4D(1.0, 1.0, 0.0), Vector4D(1.8, -1.0, 0.0));

        ctx.endSection();
    };

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 1;

    // synchronous baseline
    UmbreonDisplayContext ctxSync;
    buildScene(ctxSync);
    int sw = 0, sh = 0, sncomp = 0;
    std::vector<unsigned char> syncPix;
    ctxSync.render(prm, sw, sh, sncomp, syncPix);

    // asynchronous: same scene, background thread + finish (which joins).
    UmbreonDisplayContext ctxAsync;
    buildScene(ctxAsync);
    ctxAsync.startAsyncRender(prm);
    int aw = 0, ah = 0, ancomp = 0;
    std::vector<unsigned char> asyncPix;
    bool cancelled = true;
    ctxAsync.finishAsyncRender(aw, ah, ancomp, asyncPix, cancelled);

    EXPECT_FALSE(cancelled);
    EXPECT_EQ(aw, sw);
    EXPECT_EQ(ah, sh);
    EXPECT_EQ(ancomp, sncomp);
    EXPECT_EQ(asyncPix, syncPix);
}

// Pins the progress plumbing: while an async render is in flight getProgress()
// always returns a fraction in [0, 1], the render completes (isDone() turns
// true), and finishAsyncRender() yields a full, non-cancelled frame. Cross-
// thread reads of the lock-free progress atomics are only asserted for their
// invariant range, not exact values (no synchronization point exists until the
// join inside finishAsyncRender).
TEST(UmbreonExport, AsyncRenderReportsProgressAndCompletes)
{
    UmbreonDisplayContext ctx;
    ctx.init();
    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("p");
    ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
    ctx.sphere(1.6, Vector4D(0.0, 0.0, 0.0));
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 96;
    prm.height = 96;
    prm.supersample = 2;  // a bit heavier so progress is observable

    ctx.startAsyncRender(prm);

    // Poll the lock-free progress; every reading must stay within [0, 1]. The
    // cap is a safety net -- a finite render always finishes first.
    bool inRange = true;
    long iters = 0;
    const long kMaxIters = 50000000L;
    for (; iters < kMaxIters && !ctx.isDone(); ++iters) {
        const double p = ctx.getProgress();
        if (p < 0.0 || p > 1.0)
            inRange = false;
    }

    ASSERT_TRUE(ctx.isDone()) << "async render did not finish within the poll cap";
    EXPECT_TRUE(inRange) << "progress went outside [0, 1]";

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    bool cancelled = true;
    ctx.finishAsyncRender(ow, oh, ncomp, pix, cancelled);

    EXPECT_FALSE(cancelled);
    EXPECT_EQ(ow, 96);
    EXPECT_EQ(oh, 96);
    ASSERT_EQ(pix.size(), static_cast<std::size_t>(96 * 96 * 3));
}

// Pins the cancellation contract: cancelRender() requests a cooperative stop and
// finishAsyncRender() must report it. Cancellation is checked at row/pass
// boundaries, so a fast render MAY complete before the first check -- the test
// accepts either outcome, but pins the invariant that a CANCELLED result yields
// no pixels (empty buffer, zero dimensions).
TEST(UmbreonExport, AsyncRenderCanBeCancelled)
{
    UmbreonDisplayContext ctx;
    ctx.init();
    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.loadIdent();

    ctx.startRender();
    ctx.startSection("c");
    ctx.color(gfx::SolidColor::createRGB(0.8, 0.8, 0.8));
    ctx.sphere(1.6, Vector4D(0.0, 0.0, 0.0));
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 256;
    prm.height = 256;
    prm.supersample = 3;  // heavy enough that an immediate cancel usually lands

    ctx.startAsyncRender(prm);
    ctx.cancelRender();

    int ow = 99, oh = 99, ncomp = 99;
    std::vector<unsigned char> pix(123, 7);  // pre-filled to verify it is cleared
    bool cancelled = false;
    ctx.finishAsyncRender(ow, oh, ncomp, pix, cancelled);

    if (cancelled) {
        EXPECT_TRUE(pix.empty());
        EXPECT_EQ(ow, 0);
        EXPECT_EQ(oh, 0);
        EXPECT_EQ(ncomp, 0);
    } else {
        // Finished before the first cancel check: a normal complete frame.
        ASSERT_EQ(pix.size(), static_cast<std::size_t>(256 * 256 * 3));
    }
}
// Pins the slab clip running together with the native stroke edge pass and
// supersampling -- the combination the app actually renders with, and the one
// that has to agree inside umbreon (the clip-cut G-buffer is captured only when
// clip planes AND stroke edges are both on). The scene is the near-clip scene
// above: a GREEN triangle inside the slab and a RED one in front of the plane.
TEST(UmbreonExport, ClipsWithEdgeLinesAndSupersampling)
{
    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(6.0);
    ctx.setSlabDepth(2.0);  // near clip plane at z = slab/2 = 1.0
    ctx.setClipZ(true);
    ctx.setLineScale(6.0 / 64.0);
    ctx.loadIdent();

    ctx.enableEdgeLines(true);
    ctx.setEdgeLineType(gfx::DisplayContext::ELT_EDGES);
    ctx.setEdgeLineWidth(0.06);
    ctx.setEdgeLineColor(gfx::SolidColor::createRGB(0.0, 0.0, 0.0));

    ctx.startRender();
    ctx.startSection("clipedges");

    // GREEN triangle at z=0 (inside the slab) -- kept
    ctx.color(gfx::SolidColor::createRGB(0.0, 1.0, 0.0));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 0.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 0.0));
    ctx.end();

    // RED triangle at z=2 (in front of the clip plane) -- removed by the plane
    ctx.color(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
    ctx.startTriangles();
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(-2.0, -2.0, 2.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(2.0, -2.0, 2.0));
    ctx.normal(Vector4D(0.0, 0.0, 1.0));
    ctx.vertex(Vector4D(0.0, 2.0, 2.0));
    ctx.end();

    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = 64;
    prm.height = 64;
    prm.supersample = 3;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);

    ASSERT_EQ(pix.size(), static_cast<std::size_t>(64 * 64 * 3));

    // Center pixel: well inside the green triangle, away from any outline.
    const std::size_t c = (static_cast<std::size_t>(32) * 64 + 32) * 3;
    EXPECT_GT(pix[c + 1], 30);  // green (inside the slab) is visible
    EXPECT_LT(pix[c + 0], 30);  // red (in front of the clip plane) is gone
}

namespace {

const int kEdgeModeDim = 96;

// Report how much ink a kEdgeModeDim square frame carries: the total count of
// BLACK pixels, and the number of separate ink runs on the center row. The
// scenes below are white with the "nolighting" material (flat, full
// brightness) on a blue background, so black is the only color that is dark in
// every channel and the shading never approaches the ink threshold.
void countEdgeInk(const std::vector<unsigned char> &pix, std::size_t &outInk,
                  int &outRuns)
{
    const auto isInk = [&pix](std::size_t i) {
        return pix[i] < 60 && pix[i + 1] < 60 && pix[i + 2] < 60;
    };

    outInk = 0;
    for (std::size_t i = 0; i + 2 < pix.size(); i += 3) {
        if (isInk(i)) ++outInk;
    }

    outRuns = 0;
    bool prev = false;
    for (int x = 0; x < kEdgeModeDim; ++x) {
        const std::size_t i =
            (static_cast<std::size_t>(kEdgeModeDim / 2) * kEdgeModeDim + x) * 3;
        const bool ink = isInk(i);
        if (ink && !prev) ++outRuns;
        prev = ink;
    }
}

// Render TWO overlapping spheres of ONE section at different depths with the
// given CueMol edge line type, and report how much ink the frame carries (see
// countEdgeInk).
//
// Screen layout at the center row (view height 6 A over 96 px):
//   back sphere  x in [-2.4, 0.6] at eye z 0
//   front sphere x in [-0.6, 2.4] at eye z 2.5 (toward the camera)
// so the front sphere's left contour at x = -0.6 lies ON the back sphere -- a
// same-section self-occlusion boundary, which is exactly what the silhouette
// mode switches off.
void renderTwoSphereEdges(int edgeLineType, std::size_t &outInk, int &outRuns)
{
    const double kViewH = 6.0;
    const double kLineScale = kViewH / kEdgeModeDim;

    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(kViewH);
    ctx.setLineScale(kLineScale);
    ctx.setBgColor(gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    ctx.loadIdent();

    ctx.enableEdgeLines(true);
    ctx.setEdgeLineType(edgeLineType);
    ctx.setEdgeLineWidth(2.0 * kLineScale);  // a 2 px band
    ctx.setEdgeLineColor(gfx::SolidColor::createRGB(0.0, 0.0, 0.0));

    ctx.startRender();
    ctx.startSection("twosph");

    ctx.setMaterial("nolighting");
    ctx.color(gfx::SolidColor::createRGB(1.0, 1.0, 1.0));
    ctx.sphere(1.5, Vector4D(-0.9, 0.0, 0.0));
    ctx.sphere(1.5, Vector4D(0.9, 0.0, 2.5));

    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = kEdgeModeDim;
    prm.height = kEdgeModeDim;
    prm.supersample = 2;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);
    ASSERT_EQ(pix.size(),
              static_cast<std::size_t>(kEdgeModeDim * kEdgeModeDim * 3));

    countEdgeInk(pix, outInk, outRuns);
}

// Render TWO INTERSECTING spheres in TWO DIFFERENT sections, both in CueMol's
// silhouette edge mode, with the cross-section contact contours off or on.
//
// Both spheres have radius 1.5 A at eye z 0, centred at x = -0.9 and +0.9, so
// they overlap in 3D. On the center row the visible surface swaps from the
// left sphere to the right one exactly at x = 0, where their depths are EQUAL:
// that boundary is the intersection contour of the two renderers -- surface
// contact, not occlusion -- which is what contactEdges controls. Each sphere's
// own rim inside the overlap (x = -+0.6) is buried under the other sphere and
// never reaches the screen, so besides the contact line the row crosses only
// the two outer contours at x = -+2.4.
void renderTwoSectionContact(bool contactEdges, std::size_t &outInk,
                             int &outRuns)
{
    const double kViewH = 6.0;
    const double kLineScale = kViewH / kEdgeModeDim;

    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(kViewH);
    ctx.setLineScale(kLineScale);
    ctx.setBgColor(gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    ctx.loadIdent();

    ctx.enableEdgeLines(true);
    ctx.setEdgeLineType(gfx::DisplayContext::ELT_SILHOUETTE);
    ctx.setEdgeLineWidth(2.0 * kLineScale);  // a 2 px band
    ctx.setEdgeLineColor(gfx::SolidColor::createRGB(0.0, 0.0, 0.0));

    ctx.startRender();

    // One sphere per section, so the boundary between them is a CROSS-section
    // one (same-section contact is seamless whatever contactEdges says).
    ctx.startSection("left");
    ctx.setMaterial("nolighting");
    ctx.color(gfx::SolidColor::createRGB(1.0, 1.0, 1.0));
    ctx.sphere(1.5, Vector4D(-0.9, 0.0, 0.0));
    ctx.endSection();

    ctx.startSection("right");
    ctx.setMaterial("nolighting");
    ctx.color(gfx::SolidColor::createRGB(1.0, 1.0, 1.0));
    ctx.sphere(1.5, Vector4D(0.9, 0.0, 0.0));
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = kEdgeModeDim;
    prm.height = kEdgeModeDim;
    prm.supersample = 2;
    prm.contactEdges = contactEdges;

    int ow = 0, oh = 0, ncomp = 0;
    std::vector<unsigned char> pix;
    ctx.render(prm, ow, oh, ncomp, pix);
    ASSERT_EQ(pix.size(),
              static_cast<std::size_t>(kEdgeModeDim * kEdgeModeDim * 3));

    countEdgeInk(pix, outInk, outRuns);
}

}  // namespace

// Pins the edge line TYPE -> umbreon silhouette MODE switch: ELT_SILHOUETTE
// maps to SilhouetteMode::Outline (outer contour of the section union only) and
// ELT_EDGES to SilhouetteMode::Full (every self-occlusion boundary inks too).
//
// This is CueMol's own distinction between the two modes: the GL view draws the
// inverted-hull edge fragments at the far plane in silhouette mode
// (gl_FragDepth = 0.9999), so an interior contour is hidden behind the surface
// it lies on, while edges mode writes the hull's true depth and inks it.
//
// The same two-sphere scene is rendered under both types, so the surface
// shading is identical and the whole difference is the interior line: the
// center row crosses three ink bands in edges mode (left outer contour, the
// front sphere's occluding contour, right outer contour) and only the two
// outer ones in silhouette mode.
TEST(UmbreonExport, SilhouetteModeInksOnlyTheOuterContour)
{
    std::size_t inkSil = 0, inkEdges = 0;
    int runsSil = 0, runsEdges = 0;

    renderTwoSphereEdges(gfx::DisplayContext::ELT_SILHOUETTE, inkSil, runsSil);
    renderTwoSphereEdges(gfx::DisplayContext::ELT_EDGES, inkEdges, runsEdges);

    // The outer contour survives in both modes.
    EXPECT_GT(inkSil, 40u);

    // Only edges mode inks the interior self-occlusion contour.
    EXPECT_EQ(runsSil, 2);
    EXPECT_EQ(runsEdges, 3);
    EXPECT_GT(inkEdges, inkSil + 30);
}

// Pins the contactEdges knob (UmbreonSceneExporter "contactEdges" ->
// UmbreonRenderParams::contactEdges -> umbreon strokeEdges.contact): the
// depth-CONTINUOUS boundary where one renderer's geometry plunges into
// another's surface inks only when it is asked for.
//
// The silhouette / border classes ink across a depth STEP, so a contact
// boundary draws nothing by default -- which is also what the interactive GL
// view shows, its inverted hull being buried inside the other surface there --
// and a silhouette-mode renderer's outer contour is left OPEN wherever it
// meets another renderer. The same two intersecting spheres, one per section,
// are rendered under both settings: the center row crosses the two outer
// contours with the flag off and their intersection line as well with it on.
TEST(UmbreonExport, ContactEdgesInkTheCrossSectionIntersection)
{
    std::size_t inkOff = 0, inkOn = 0;
    int runsOff = 0, runsOn = 0;

    renderTwoSectionContact(false, inkOff, runsOff);
    renderTwoSectionContact(true, inkOn, runsOn);

    // The outer contour of the union is drawn either way.
    EXPECT_GT(inkOff, 40u);

    EXPECT_EQ(runsOff, 2);
    EXPECT_EQ(runsOn, 3);
    EXPECT_GT(inkOn, inkOff + 30);
}

namespace {

const int kHatchDim = 64;

/// Render one sphere with the NPR tone-hatching pass. `edgeLines` gives the
/// section renderer-side edge lines (red, so its ink is distinguishable from
/// the black default contour); `paperHex` empty keeps the style's own paper.
/// `tweak` may adjust the render params before the render (hatch overrides).
void renderHatchedSphere(
    bool edgeLines, bool defaultEdges, const char *style, float paperR,
    float paperG, float paperB, bool paperSet,
    std::vector<unsigned char> &outPix,
    const std::function<void(UmbreonRenderParams &)> &tweak = {})
{
    const double kViewH = 6.0;

    UmbreonDisplayContext ctx;
    ctx.init();

    ctx.setPerspective(false);
    ctx.setViewDist(100.0);
    ctx.setZoom(kViewH);
    ctx.setLineScale(kViewH / kHatchDim);
    // A blue scene background, so a paper-colored background is unmistakably
    // the hatch pass' doing and not the scene's.
    ctx.setBgColor(gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    ctx.loadIdent();

    ctx.enableEdgeLines(edgeLines);
    if (edgeLines) {
        ctx.setEdgeLineType(gfx::DisplayContext::ELT_SILHOUETTE);
        ctx.setEdgeLineWidth(2.0 * kViewH / kHatchDim);
        ctx.setEdgeLineColor(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
    }

    ctx.startRender();
    ctx.startSection("mol");
    ctx.color(gfx::SolidColor::createRGB(0.2, 0.8, 0.2));
    ctx.sphere(1.8, Vector4D(0.0, 0.0, 0.0));
    ctx.endSection();

    UmbreonRenderParams prm;
    prm.width = kHatchDim;
    prm.height = kHatchDim;
    prm.supersample = 2;
    prm.hatchEnable = true;
    prm.hatchStyle = style;
    prm.hatchDefaultEdges = defaultEdges;
    prm.hatchPaperColorSet = paperSet;
    prm.hatchPaperColor[0] = paperR;
    prm.hatchPaperColor[1] = paperG;
    prm.hatchPaperColor[2] = paperB;
    if (tweak) tweak(prm);

    int ow = 0, oh = 0, ncomp = 0;
    ctx.render(prm, ow, oh, ncomp, outPix);
    ASSERT_EQ(outPix.size(),
              static_cast<std::size_t>(kHatchDim * kHatchDim * 3));
}

/// Pixel at (x, y) of an RGB frame.
void pixelAt(const std::vector<unsigned char> &pix, int x, int y, int rgb[3])
{
    const std::size_t i = (static_cast<std::size_t>(y) * kHatchDim + x) * 3;
    for (int k = 0; k < 3; ++k) rgb[k] = pix[i + k];
}

/// Near-black pixels (ink marks and contour) of an RGB frame.
std::size_t countInk(const std::vector<unsigned char> &pix)
{
    std::size_t n = 0;
    for (std::size_t i = 0; i + 2 < pix.size(); i += 3) {
        if (pix[i] < 60 && pix[i + 1] < 60 && pix[i + 2] < 60) ++n;
    }
    return n;
}

}  // namespace

// The NPR pass repaints the picture as an ink drawing: the surface is no
// longer the shaded object color but the paper base with ink marks on it, and
// the paper reaches the BACKGROUND too. umbreon paints its paper over surface
// pixels only ("the paper color only fills the object interior"), which left a
// custom paper color looking inert against the scene background -- the display
// context therefore points the background (and the fog fading into it) at the
// resolved paper.
TEST(UmbreonExport, HatchInkModePaintsThePaperOverTheBackgroundToo)
{
    std::vector<unsigned char> pix;
    // A saturated magenta paper: no shading path could produce it by accident.
    renderHatchedSphere(false, true, "ink-cross", 1.0f, 0.0f, 1.0f, true, pix);

    int corner[3];
    pixelAt(pix, 1, 1, corner);
    EXPECT_GT(corner[0], 200);
    EXPECT_LT(corner[1], 60);
    EXPECT_GT(corner[2], 200);

    // The sphere's interior is drawn on that paper rather than left green:
    // paper between the marks, ink on them, so no pixel keeps the object hue.
    std::size_t nGreen = 0;
    for (std::size_t i = 0; i + 2 < pix.size(); i += 3) {
        if (pix[i + 1] > pix[i] + 20 && pix[i + 1] > pix[i + 2] + 20) ++nGreen;
    }
    EXPECT_EQ(nGreen, 0u);
}

// Contour edges under NPR: the manual pairs the tone pass with contour lines,
// so a section whose renderer asks for none still gets a default contour in
// the ink color. A section that DOES configure edge lines keeps its own style
// -- the default must not overwrite the renderer's color or width.
TEST(UmbreonExport, HatchDefaultEdgesRespectTheRendererEdgeStyle)
{
    // Count strongly-red pixels: only the renderer's own red edge color can
    // produce them (the default contour is black, the paper white).
    auto countRedInk = [](const std::vector<unsigned char> &pix) {
        std::size_t n = 0;
        for (std::size_t i = 0; i + 2 < pix.size(); i += 3) {
            if (pix[i] > 150 && pix[i + 1] < 90 && pix[i + 2] < 90) ++n;
        }
        return n;
    };
    // ... and near-black pixels for the default contour.
    auto countDarkInk = [](const std::vector<unsigned char> &pix) {
        std::size_t n = 0;
        for (std::size_t i = 0; i + 2 < pix.size(); i += 3) {
            if (pix[i] < 60 && pix[i + 1] < 60 && pix[i + 2] < 60) ++n;
        }
        return n;
    };

    // No renderer-side edges: the default contour supplies the outline.
    std::vector<unsigned char> pixDefault;
    renderHatchedSphere(false, true, "ink-cross", 1.0f, 1.0f, 1.0f, true,
                        pixDefault);
    EXPECT_GT(countDarkInk(pixDefault), 40u);
    EXPECT_EQ(countRedInk(pixDefault), 0u);

    // Renderer-side red edges: its color survives the default-contour pass.
    std::vector<unsigned char> pixRenderer;
    renderHatchedSphere(true, true, "ink-cross", 1.0f, 1.0f, 1.0f, true,
                        pixRenderer);
    EXPECT_GT(countRedInk(pixRenderer), 40u);

    // Turning the default off leaves an unconfigured section without a
    // contour, so the outline ink disappears (the hatch marks stay).
    std::vector<unsigned char> pixOff;
    renderHatchedSphere(false, false, "ink-cross", 1.0f, 1.0f, 1.0f, true,
                        pixOff);
    EXPECT_LT(countDarkInk(pixOff), countDarkInk(pixDefault));
}

// An unknown style name must not silently fall back to umbreon's built-in
// defaults (a different picture from any style the UI offers): the context
// warns and renders richardson, so the frame matches an explicit richardson.
TEST(UmbreonExport, UnknownHatchStyleFallsBackToRichardson)
{
    std::vector<unsigned char> pixBogus, pixRichardson;
    renderHatchedSphere(false, true, "no-such-style", 0.0f, 0.0f, 0.0f, false,
                        pixBogus);
    renderHatchedSphere(false, true, "richardson", 0.0f, 0.0f, 0.0f, false,
                        pixRichardson);
    EXPECT_EQ(pixBogus, pixRichardson);
}

// Mark width reaches the dot screens too: umbreon scales a Dot layer's
// dotScale (a dot gain) where it scales a Line layer's width, so the halftone
// styles no longer ignore the slider.
TEST(UmbreonExport, HatchWidthScaleChangesDotScreens)
{
    for (const char *style : {"screentone-60", "manga"}) {
        std::vector<unsigned char> pixOne, pixTwo;
        renderHatchedSphere(false, false, style, 1.0f, 1.0f, 1.0f, true, pixOne,
                            [](UmbreonRenderParams &p) { p.hatchWidthScale = 1.0; });
        renderHatchedSphere(false, false, style, 1.0f, 1.0f, 1.0f, true, pixTwo,
                            [](UmbreonRenderParams &p) { p.hatchWidthScale = 2.0; });
        EXPECT_NE(pixOne, pixTwo) << style;
        EXPECT_GT(countInk(pixTwo), countInk(pixOne)) << style;
    }
}

// A hand-edited layer spec replaces the style's layers; a malformed one is
// reported into the render log and ignored, so the render still runs with
// the style itself.
TEST(UmbreonExport, HatchLayersSpecOverridesTheStyleLayers)
{
    std::vector<unsigned char> pixPlain, pixSpec, pixBad;
    renderHatchedSphere(false, false, "ink-cross", 1.0f, 1.0f, 1.0f, true,
                        pixPlain);
    renderHatchedSphere(false, false, "ink-cross", 1.0f, 1.0f, 1.0f, true,
                        pixSpec, [](UmbreonRenderParams &p) {
                            p.hatchLayersSpec =
                                "layer: kind=line,angle=0,spacing=8,subdiv=0,"
                                "width=3,tonehi=1,tonelo=0.9,fade=0";
                        });
    EXPECT_NE(pixPlain, pixSpec);

    UmbreonDisplayContext::drainLog();
    renderHatchedSphere(false, false, "ink-cross", 1.0f, 1.0f, 1.0f, true,
                        pixBad, [](UmbreonRenderParams &p) {
                            p.hatchLayersSpec = "layer: bogus=1";
                        });
    EXPECT_EQ(pixPlain, pixBad);
    const LString log = UmbreonDisplayContext::drainLog();
    EXPECT_NE(log.indexOf("hatch layers spec ignored"), -1) << log.c_str();
}

// The style template a host loads (hatchStyleSpec) sent back unedited
// reproduces the style's own picture, for the layers and for the tone / ink
// model alike.
TEST(UmbreonExport, HatchStyleSpecRoundTripsToTheSamePixels)
{
    const LString spec = UmbreonDisplayContext::hatchStyleSpec("richardson");
    ASSERT_FALSE(spec.isEmpty());
    int nLayers = 0;
    const std::string text = spec.c_str();
    for (std::size_t pos = text.find("layer:"); pos != std::string::npos;
         pos = text.find("layer:", pos + 1))
        ++nLayers;
    EXPECT_EQ(nLayers, 3);
    EXPECT_NE(spec.indexOf("tone:"), -1);
    EXPECT_NE(spec.indexOf("ink:"), -1);
    EXPECT_TRUE(UmbreonDisplayContext::hatchStyleSpec("no-such-style").isEmpty());

    // The paper is pinned explicitly on both sides: the spec carries colors
    // as #rrggbb, and richardson's warm paper is not exactly representable.
    std::vector<unsigned char> pixPlain, pixLayers, pixTone;
    renderHatchedSphere(false, true, "richardson", 0.94f, 0.92f, 0.86f, true,
                        pixPlain);
    renderHatchedSphere(false, true, "richardson", 0.94f, 0.92f, 0.86f, true,
                        pixLayers, [&](UmbreonRenderParams &p) {
                            p.hatchLayersSpec = spec;
                        });
    EXPECT_EQ(pixPlain, pixLayers);
    renderHatchedSphere(false, true, "richardson", 0.94f, 0.92f, 0.86f, true,
                        pixTone, [&](UmbreonRenderParams &p) {
                            p.hatchToneSpec = spec;
                        });
    EXPECT_EQ(pixPlain, pixTone);
}

// Ink amount: the strength multiplier darkens the drawing monotonically.
TEST(UmbreonExport, HatchToneStrengthScalesTheInk)
{
    std::vector<unsigned char> pixHalf, pixOne, pixTwo;
    renderHatchedSphere(false, false, "ink-cross", 1.0f, 1.0f, 1.0f, true, pixHalf,
                        [](UmbreonRenderParams &p) { p.hatchToneStrength = 0.5; });
    renderHatchedSphere(false, false, "ink-cross", 1.0f, 1.0f, 1.0f, true, pixOne,
                        [](UmbreonRenderParams &p) { p.hatchToneStrength = 1.0; });
    renderHatchedSphere(false, false, "ink-cross", 1.0f, 1.0f, 1.0f, true, pixTwo,
                        [](UmbreonRenderParams &p) { p.hatchToneStrength = 2.0; });
    EXPECT_GT(meanLevel(pixHalf), meanLevel(pixOne));
    EXPECT_GT(meanLevel(pixOne), meanLevel(pixTwo));
}
