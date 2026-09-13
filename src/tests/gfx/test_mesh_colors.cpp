//
// gfx::Mesh vertex colours: the palette + per-vertex record that replaced
// one ColorPtr per vertex. Pins what the two consumers (DisplayList::drawMesh
// and RendIntData::mesh) rely on: getCol() gives back a colour equal to the
// one color() was given, equal base colours share one palette entry, and a
// vertex that was never coloured reports none instead of a null pointer.
//

#include <gtest/gtest.h>
#include <common.h>

#include "gfx/Mesh.hpp"
#include "gfx/SolidColor.hpp"
#include "gfx/GradientColor.hpp"

#include <qlib/Vector4D.hpp>

using gfx::ColorPtr;
using qlib::Vector4D;

namespace {

ColorPtr solid(int r, int g, int b, int a = 255, const char *mat = nullptr)
{
    gfx::SolidColor *p = MB_NEW gfx::SolidColor(gfx::makeRGBACode(r, g, b, a));
    if (mat != nullptr) p->setMaterial(mat);
    return ColorPtr(p);
}

}  // namespace

// A gradient vertex is stored as its two components and parameter. What
// getCol() rebuilds must resolve to exactly the code the original did: one
// channel is equal (the blend's shortcut), alpha differs, and the parameter
// runs over both ends and interior values, in both component orders.
TEST(MeshColors, GradientVertexResolvesToTheOriginalGradientCode)
{
    const ColorPtr c1 = solid(10, 200, 77, 255);
    const ColorPtr c2 = solid(250, 3, 77, 128);
    const double rhos[] = {0.0, 0.3, 1.0 / 3.0, 0.5, 0.999, 1.0};
    const int nrho = (int) (sizeof(rhos) / sizeof(rhos[0]));

    gfx::Mesh mesh;
    mesh.init(nrho * 2, 0);
    std::vector<ColorPtr> given;
    for (int i = 0; i < nrho; ++i) {
        ColorPtr g1(MB_NEW gfx::GradientColor(c1, c2, rhos[i]));
        ColorPtr g2(MB_NEW gfx::GradientColor(c2, c1, rhos[i]));
        mesh.color(g1);
        mesh.setVertex(i * 2, Vector4D(i, 0, 0));
        mesh.color(g2);
        mesh.setVertex(i * 2 + 1, Vector4D(i, 1, 0));
        given.push_back(g1);
        given.push_back(g2);
    }

    // Only the two components are palette entries; the gradients are not.
    EXPECT_EQ(mesh.getPaletteSize(), 2);

    for (int i = 0; i < nrho * 2; ++i) {
        ColorPtr got;
        ASSERT_TRUE(mesh.getCol(got, i)) << "vertex " << i;
        EXPECT_EQ(got->getDevCode(qlib::invalid_uid), given[i]->getDevCode(qlib::invalid_uid))
            << "vertex " << i;
        EXPECT_TRUE(got->getMaterial().equals(given[i]->getMaterial()));
    }
}

// Base colours are deduplicated by value (code and material), the identity
// the exporters' colour table keys on, so a colour created afresh for every
// vertex still collapses. A plain-coloured vertex hands back the object the
// palette retains.
TEST(MeshColors, EqualBaseColoursShareOnePaletteEntry)
{
    const ColorPtr a = solid(1, 2, 3);
    const ColorPtr a2 = solid(1, 2, 3);           // equal value, another object
    const ColorPtr shiny = solid(1, 2, 3, 255, "shiny");

    gfx::Mesh mesh;
    mesh.init(3, 0);
    mesh.color(a);
    mesh.setVertex(0, Vector4D(0, 0, 0));
    mesh.color(a2);
    mesh.setVertex(1, Vector4D(1, 0, 0));
    mesh.color(shiny);
    mesh.setVertex(2, Vector4D(2, 0, 0));

    EXPECT_EQ(mesh.getPaletteSize(), 2) << "same code+material folds, material splits";

    ColorPtr got;
    ASSERT_TRUE(mesh.getCol(got, 0));
    EXPECT_EQ(got.get(), a.get()) << "the first object seen is the one retained";
    ASSERT_TRUE(mesh.getCol(got, 1));
    EXPECT_EQ(got.get(), a.get());
    ASSERT_TRUE(mesh.getCol(got, 2));
    EXPECT_EQ(got.get(), shiny.get());
}

// A vertex that setVertex() never reached, or that was set under a null
// colour, has no colour: getCol() says so rather than returning null.
TEST(MeshColors, UncolouredVertexReportsNoColour)
{
    gfx::Mesh mesh;
    mesh.init(3, 0);
    mesh.color(solid(9, 9, 9));
    mesh.setVertex(0, Vector4D(0, 0, 0));
    mesh.color(ColorPtr());
    mesh.setVertex(2, Vector4D(2, 0, 0));

    ColorPtr got;
    EXPECT_TRUE(mesh.getCol(got, 0));
    EXPECT_FALSE(mesh.getCol(got, 1)) << "never written";
    EXPECT_FALSE(mesh.getCol(got, 2)) << "written under a null colour";
}
