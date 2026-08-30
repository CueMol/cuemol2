//
// Copy semantics and bounds of small gfx value types.
//

#include <gtest/gtest.h>
#include <common.h>

#include "gfx/PixelBuffer.hpp"
#include "gfx/Mesh.hpp"
#include "gfx/CmsXform.hpp"
#include "gfx/NamedColor.hpp"
#include "gfx/GrowMesh.hpp"
#include "gfx/SphereCyls.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Matrix4D.hpp>

using qlib::Vector4D;
using qlib::Matrix4D;

// TextImgBuf::clone() copies a PixelBuffer that may not hold pixels yet; the
// copy constructor dereferenced the null data pointer.
TEST(PixelBufferCopy, EmptyBufferCanBeCopied)
{
    gfx::PixelBuffer empty;
    gfx::PixelBuffer copy(empty);
    EXPECT_EQ(copy.size(), 0u);
    EXPECT_EQ(copy.data(), nullptr);
}

TEST(PixelBufferCopy, CopyIsDeepAndAssignmentDoesNotShareStorage)
{
    gfx::PixelBuffer src;
    src.setWidth(2);
    src.setHeight(1);
    src.resize(2);
    src.data()[0] = 7;
    src.data()[1] = 9;

    gfx::PixelBuffer copy(src);
    ASSERT_EQ(copy.size(), 2u);
    EXPECT_EQ(copy.at(1), 9);
    EXPECT_NE(copy.data(), src.data());
    EXPECT_EQ(copy.getWidth(), 2);

    // the implicit assignment used to share the data pointer: double delete
    gfx::PixelBuffer assigned;
    assigned.resize(5);
    assigned = src;
    ASSERT_EQ(assigned.size(), 2u);
    EXPECT_EQ(assigned.at(0), 7);
    EXPECT_NE(assigned.data(), src.data());

    assigned = assigned;  // self-assignment keeps the pixels
    EXPECT_EQ(assigned.at(0), 7);
}

TEST(MeshBounds, GetColRejectsIndicesOutsideTheVertexArray)
{
    gfx::Mesh mesh;
    mesh.init(2, 0);
    gfx::ColorPtr col;
    EXPECT_FALSE(mesh.getCol(col, 2));  // == nverts used to pass
    EXPECT_FALSE(mesh.getCol(col, 5));
    EXPECT_FALSE(mesh.getCol(col, -1));
}

TEST(CmsXformCopy, IntentSurvivesCopyAndAssignment)
{
    gfx::CmsXform a;
    a.setIccIntent(3);
    a.setEnabled(false);

    gfx::CmsXform b(a);
    EXPECT_EQ(b.getIccIntent(), 3);
    EXPECT_FALSE(b.isEnabled());

    gfx::CmsXform c;
    c = a;
    EXPECT_EQ(c.getIccIntent(), 3);
}

TEST(NamedColorCopy, MaterialSurvivesAssignment)
{
    gfx::NamedColor a("red");
    a.setMaterial("shiny");
    gfx::NamedColor b("blue");
    b = a;
    EXPECT_TRUE(b.getMaterial().equals("shiny"));
    EXPECT_TRUE(b.getName().equals("red"));
}

// A cylinder cap is a fan of NDIVR triangles; the loop ran to NDIVR
// inclusive and emitted the first triangle twice.
TEST(CylinderCaps, CapHasOneTrianglePerSegment)
{
    using Mesh = gfx::GrowMesh<qlib::quint32>;
    gfx::CylinderList<Vector4D, Matrix4D, Mesh> cyls;
    const int ndet = 3;  // NDIVR = 2 * (ndet + 1) = 8, NDIVV = 2
    cyls.add(Vector4D(0, 0, 0), Vector4D(0, 0, 5), 1.0, 1.0, 0xFFFFFFFFu, ndet, true,
             nullptr);

    Mesh mesh;
    cyls.makeMesh(&mesh);
    const int NDIVR = 2 * (ndet + 1);
    // two caps of NDIVR triangles and a body of 2*NDIVR triangles
    EXPECT_EQ(mesh.getFaceSize(), 4 * NDIVR);

    gfx::CylinderList<Vector4D, Matrix4D, Mesh> nocap;
    nocap.add(Vector4D(0, 0, 0), Vector4D(0, 0, 5), 1.0, 1.0, 0xFFFFFFFFu, ndet, false,
              nullptr);
    Mesh mesh2;
    nocap.makeMesh(&mesh2);
    EXPECT_EQ(mesh2.getFaceSize(), 2 * NDIVR);
}
