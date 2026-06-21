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
