//
// Unit tests for the PLY (Stanford Polygon File) surface reader.
//

#include <gtest/gtest.h>
#include <common.h>

#include "surface/PLYFileReader.hpp"
#include "surface/MolSurfObj.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>

#include <string>
#include <cstring>
#include <cstdint>
#include <cmath>

using surface::PLYFileReader;
using surface::MolSurfObj;
using qsys::ObjReader;
using qsys::ObjectPtr;
using qlib::StrInStream;

namespace {

int sniff(const ObjReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

// Reads payload through the reader; keeps the returned object alive via `keep`
// and returns it as a MolSurfObj (nullptr if the type is unexpected).
MolSurfObj *loadPLY(PLYFileReader &reader, const std::string &payload, ObjectPtr &keep)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    keep = reader.load(ins);
    return dynamic_cast<MolSurfObj *>(keep.get());
}

// Little-endian byte emitters (host-independent: bytes are written LE no matter
// the host order, exercising the reader's endianness handling).
void putU8(std::string &s, uint8_t b)
{
    s.push_back(static_cast<char>(b));
}

void putU32LE(std::string &s, uint32_t u)
{
    putU8(s, u & 0xff);
    putU8(s, (u >> 8) & 0xff);
    putU8(s, (u >> 16) & 0xff);
    putU8(s, (u >> 24) & 0xff);
}

void putF32LE(std::string &s, float f)
{
    uint32_t u;
    std::memcpy(&u, &f, sizeof(u));
    putU32LE(s, u);
}

}  // namespace

// ----------------------------------------------------------------------
// canHandleContent
// ----------------------------------------------------------------------

TEST(PLYFileReaderSniffTest, MagicLineReturnsYes)
{
    PLYFileReader reader;
    EXPECT_EQ(sniff(reader, "ply\nformat ascii 1.0\n"), ObjReader::CONTENT_YES);
}

TEST(PLYFileReaderSniffTest, NonPlyReturnsUnknown)
{
    PLYFileReader reader;
    EXPECT_EQ(sniff(reader, "HEADER something else\n"), ObjReader::CONTENT_UNKNOWN);
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

// ----------------------------------------------------------------------
// ascii read
// ----------------------------------------------------------------------

namespace {

// One triangle in the z=0 plane with explicit +Z normals.
const char *const kAsciiWithNormals =
    "ply\n"
    "format ascii 1.0\n"
    "comment exported by test\n"
    "element vertex 3\n"
    "property float x\n"
    "property float y\n"
    "property float z\n"
    "property float nx\n"
    "property float ny\n"
    "property float nz\n"
    "element face 1\n"
    "property list uchar uint vertex_indices\n"
    "end_header\n"
    "0 0 0 0 0 1\n"
    "1 0 0 0 0 1\n"
    "0 1 0 0 0 1\n"
    "3 0 1 2\n";

}  // namespace

TEST(PLYFileReaderTest, AsciiReadsVertsFacesNormals)
{
    PLYFileReader reader;
    ObjectPtr keep;
    MolSurfObj *p = loadPLY(reader, kAsciiWithNormals, keep);
    ASSERT_NE(p, nullptr);

    ASSERT_EQ(p->getVertSize(), 3);
    ASSERT_EQ(p->getFaceSize(), 1);

    // Positions.
    EXPECT_NEAR(p->getVertAt(1).x, 1.0f, 1e-5);
    EXPECT_NEAR(p->getVertAt(2).y, 1.0f, 1e-5);

    // Explicit normals are preserved verbatim (not recomputed).
    EXPECT_NEAR(p->getVertAt(0).nz, 1.0f, 1e-5);
    EXPECT_NEAR(p->getVertAt(0).nx, 0.0f, 1e-5);

    // Indices are 0-based (no MSMS-style -1 shift).
    EXPECT_EQ(p->getFaceAt(0).id1, 0u);
    EXPECT_EQ(p->getFaceAt(0).id2, 1u);
    EXPECT_EQ(p->getFaceAt(0).id3, 2u);
}

TEST(PLYFileReaderTest, AsciiTriangulatesQuad)
{
    PLYFileReader reader;
    const std::string payload =
        "ply\n"
        "format ascii 1.0\n"
        "element vertex 4\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "element face 1\n"
        "property list uchar uint vertex_indices\n"
        "end_header\n"
        "0 0 0\n"
        "1 0 0\n"
        "1 1 0\n"
        "0 1 0\n"
        "4 0 1 2 3\n";

    ObjectPtr keep;
    MolSurfObj *p = loadPLY(reader, payload, keep);
    ASSERT_NE(p, nullptr);

    ASSERT_EQ(p->getVertSize(), 4);
    // A single quad fan-triangulates into two triangles.
    ASSERT_EQ(p->getFaceSize(), 2);
    EXPECT_EQ(p->getFaceAt(0).id1, 0u);
    EXPECT_EQ(p->getFaceAt(0).id2, 1u);
    EXPECT_EQ(p->getFaceAt(0).id3, 2u);
    EXPECT_EQ(p->getFaceAt(1).id1, 0u);
    EXPECT_EQ(p->getFaceAt(1).id2, 2u);
    EXPECT_EQ(p->getFaceAt(1).id3, 3u);
}

TEST(PLYFileReaderTest, AsciiSkipsColorAndComputesNormals)
{
    PLYFileReader reader;
    // x,y,z + per-vertex color, no normals. Color must be discarded and a
    // normal computed from the (CCW) triangle: +Z for this z=0 triangle.
    const std::string payload =
        "ply\n"
        "format ascii 1.0\n"
        "element vertex 3\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "element face 1\n"
        "property list uchar uint vertex_indices\n"
        "end_header\n"
        "0 0 0 255 0 0\n"
        "1 0 0 0 255 0\n"
        "0 1 0 0 0 255\n"
        "3 0 1 2\n";

    ObjectPtr keep;
    MolSurfObj *p = loadPLY(reader, payload, keep);
    ASSERT_NE(p, nullptr);

    ASSERT_EQ(p->getVertSize(), 3);
    ASSERT_EQ(p->getFaceSize(), 1);
    // Positions unaffected by the color columns.
    EXPECT_NEAR(p->getVertAt(1).x, 1.0f, 1e-5);

    for (int i = 0; i < 3; ++i) {
        const surface::MSVert &v = p->getVertAt(i);
        const double len = std::sqrt(v.nx * v.nx + v.ny * v.ny + v.nz * v.nz);
        EXPECT_NEAR(len, 1.0, 1e-4);   // unit length
        EXPECT_NEAR(v.nz, 1.0f, 1e-4); // points +Z
    }
}

// ----------------------------------------------------------------------
// binary read
// ----------------------------------------------------------------------

TEST(PLYFileReaderTest, BinaryLittleEndianReadsSameMesh)
{
    PLYFileReader reader;

    std::string payload =
        "ply\n"
        "format binary_little_endian 1.0\n"
        "element vertex 3\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property float nx\n"
        "property float ny\n"
        "property float nz\n"
        "element face 1\n"
        "property list uchar uint vertex_indices\n"
        "end_header\n";

    // Vertex records: x,y,z,nx,ny,nz.
    const float verts[3][6] = {
        {0, 0, 0, 0, 0, 1},
        {1, 0, 0, 0, 0, 1},
        {0, 1, 0, 0, 0, 1},
    };
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 6; ++j)
            putF32LE(payload, verts[i][j]);

    // Face record: uchar count, then uint32 indices.
    putU8(payload, 3);
    putU32LE(payload, 0);
    putU32LE(payload, 1);
    putU32LE(payload, 2);

    ObjectPtr keep;
    MolSurfObj *p = loadPLY(reader, payload, keep);
    ASSERT_NE(p, nullptr);

    ASSERT_EQ(p->getVertSize(), 3);
    ASSERT_EQ(p->getFaceSize(), 1);
    EXPECT_NEAR(p->getVertAt(1).x, 1.0f, 1e-5);
    EXPECT_NEAR(p->getVertAt(2).y, 1.0f, 1e-5);
    EXPECT_NEAR(p->getVertAt(0).nz, 1.0f, 1e-5);
    EXPECT_EQ(p->getFaceAt(0).id1, 0u);
    EXPECT_EQ(p->getFaceAt(0).id2, 1u);
    EXPECT_EQ(p->getFaceAt(0).id3, 2u);
}
