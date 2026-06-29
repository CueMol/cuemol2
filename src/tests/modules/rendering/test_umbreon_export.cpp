#include <gtest/gtest.h>

#include <common.h>

#include "modules/rendering/UmbreonDisplayContext.hpp"

#include <gfx/SolidColor.hpp>
#include <qlib/Vector4D.hpp>

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
// at z=2 is in front of the clip plane (closer to the camera). calcMeshClip
// removes the red triangle entirely, so the center pixel shows the green behind
// it. Without clipping the closer red would occlude the green (center red).
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

// Pins per-material finish resolution (setMaterial -> CLUT -> StyleMgr POV def
// -> umbreon::Material). "nolighting" (ambient 1.0) and "shadow" (ambient 0.75)
// are both ambient-only flat finishes (diffuse 0, specular 0), so they are
// independent of lighting/normals and differ ONLY by their ambient term. The
// same gray triangle therefore renders brighter under nolighting than shadow.
// If the exporter ignored per-material finishes (one shared surfaceFinish for
// everything, as before), the two would be identical and this would fail.
TEST(UmbreonExport, AppliesPerMaterialFinish)
{
    auto renderWithMaterial = [](const char *matName) {
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
    };

    std::vector<unsigned char> noli = renderWithMaterial("nolighting");
    std::vector<unsigned char> shad = renderWithMaterial("shadow");

    ASSERT_EQ(noli.size(), static_cast<std::size_t>(64 * 64 * 3));
    ASSERT_EQ(noli.size(), shad.size());

    const std::size_t c = (static_cast<std::size_t>(32) * 64 + 32) * 3;
    EXPECT_GT(noli[c], 8);  // the flat ambient surface is visible
    // ambient 1.0 (nolighting) is clearly brighter than 0.75 (shadow)
    EXPECT_GT(static_cast<int>(noli[c]), static_cast<int>(shad[c]) + 15);
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

// Pins per-renderer veil compositing: a semi-transparent section (renderer) is
// laid down as ONE single-layer veil, so several overlapping spheres in it look
// identical to a single sphere -- the overlaps do not double-blend. Without the
// veil (plain front-to-back "over"), N stacked translucent spheres would
// accumulate and look brighter/more opaque than one.
TEST(UmbreonExport, VeilsTranslucentRendererAsSingleLayer)
{
    auto renderStackedSpheres = [](int nSpheres) {
        UmbreonDisplayContext ctx;
        ctx.init();
        ctx.setPerspective(false);
        ctx.setViewDist(100.0);
        ctx.setZoom(6.0);
        ctx.loadIdent();

        ctx.startRender();
        ctx.setAlpha(0.5);  // the renderer is semi-transparent -> a veil
        ctx.startSection("veil");
        ctx.color(gfx::SolidColor::createRGB(0.2, 0.4, 1.0));
        // coincident in screen space (same x,y, stacked slightly in z), so they
        // fully overlap; only the frontmost should contribute under the veil
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
    // veil = single layer: three coincident spheres == one (no accumulation)
    EXPECT_EQ(one, three);
}
