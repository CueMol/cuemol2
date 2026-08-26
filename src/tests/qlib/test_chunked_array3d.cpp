// -*-Mode: C++;-*-
//
// Tests for qlib::ChunkedArray3D: the section-chunked 3D array behind
// DensityMap. The indexing must agree with Array3D (column fastest), the
// chunk layout must be computable without allocating, and the total size
// must be 64-bit.
//

#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include <cstdint>
#include <cstring>
#include <vector>
#include "qlib/ByteMap.hpp"
#include "qlib/ChunkedArray3D.hpp"

using qlib::Array3D;
using qlib::ChunkedArray3D;

namespace {

/// Deterministic per-element value
inline unsigned char valueAt(int i, int j, int k)
{
    return (unsigned char)((i * 7 + j * 13 + k * 31) & 0xff);
}

}  // namespace

// The layout of a huge map is planned in 64-bit without any allocation.
TEST(ChunkedArray3D, LayoutIsSixtyFourBit)
{
    typedef ChunkedArray3D<unsigned char>::Layout Layout;
    const Layout l = Layout::make(2000, 2000, 2000, size_t(8) << 20);
    EXPECT_EQ(l.total, size_t(8000000000ULL));
    EXPECT_EQ(l.sliceSize, size_t(4000000));
    // 8 MiB / 4 MB per slice = 2 sections per chunk
    EXPECT_EQ(l.secsPerChunk, 2);
    EXPECT_EQ(l.nchunk, 1000);

    // a slice larger than the chunk bound still gets one section per chunk
    const Layout big = Layout::make(4000, 4000, 3, size_t(8) << 20);
    EXPECT_EQ(big.secsPerChunk, 1);
    EXPECT_EQ(big.nchunk, 3);

    // empty
    const Layout e = Layout::make(0, 5, 5, size_t(8) << 20);
    EXPECT_EQ(e.total, size_t(0));
    EXPECT_EQ(e.nchunk, 0);
}

// With a chunk bound that forces several chunks, every access path
// (at / row / slice / chunkData) agrees with Array3D's element order.
TEST(ChunkedArray3D, IndexingMatchesArray3D)
{
    const int nc = 7, nr = 5, ns = 11;
    // 7*5 = 35 bytes per slice; a 100-byte bound gives 2 sections per chunk
    ChunkedArray3D<unsigned char> a(nc, nr, ns, 100);
    Array3D<unsigned char> ref(nc, nr, ns);
    EXPECT_EQ(a.secsPerChunk(), 2);
    EXPECT_EQ(a.chunkCount(), 6);
    EXPECT_EQ(a.chunkSecs(5), 1);
    EXPECT_EQ(a.chunkFirstSec(5), 10);
    EXPECT_EQ(a.size(), size_t(nc * nr * ns));

    for (int k = 0; k < ns; ++k)
        for (int j = 0; j < nr; ++j)
            for (int i = 0; i < nc; ++i) {
                a.at(i, j, k) = valueAt(i, j, k);
                ref.at(i, j, k) = valueAt(i, j, k);
            }

    // at()
    for (int k = 0; k < ns; ++k)
        for (int j = 0; j < nr; ++j)
            for (int i = 0; i < nc; ++i)
                EXPECT_EQ(a.at(i, j, k), ref.at(i, j, k));

    // row() and slice() are contiguous runs in Array3D order
    for (int k = 0; k < ns; ++k) {
        EXPECT_EQ(std::memcmp(a.slice(k), &ref.at(0, 0, k), size_t(nc) * nr), 0);
        for (int j = 0; j < nr; ++j)
            EXPECT_EQ(std::memcmp(a.row(j, k), &ref.at(0, j, k), size_t(nc)), 0);
    }

    // chunkData() covers chunkSecs() whole slices
    for (int c = 0; c < a.chunkCount(); ++c) {
        const int k0 = a.chunkFirstSec(c);
        EXPECT_EQ(std::memcmp(a.chunkData(c), &ref.at(0, 0, k0),
                              size_t(a.chunkSecs(c)) * nc * nr), 0);
    }
}

// A single-chunk instance is byte-compatible with Array3D.
TEST(ChunkedArray3D, SingleChunkIsContiguous)
{
    const int nc = 4, nr = 3, ns = 5;
    ChunkedArray3D<unsigned char> a(nc, nr, ns);
    EXPECT_EQ(a.chunkCount(), 1);
    Array3D<unsigned char> ref(nc, nr, ns);
    for (int k = 0; k < ns; ++k)
        for (int j = 0; j < nr; ++j)
            for (int i = 0; i < nc; ++i) {
                a.at(i, j, k) = valueAt(i, j, k);
                ref.at(i, j, k) = valueAt(i, j, k);
            }
    EXPECT_EQ(std::memcmp(a.chunkData(0), ref.data(), a.size()), 0);
}

TEST(ChunkedArray3D, CopyMoveResizeClear)
{
    ChunkedArray3D<float> a(3, 3, 4, 40);  // 36 bytes per slice -> 1 per chunk
    EXPECT_EQ(a.chunkCount(), 4);
    a.fill(1.5f);
    a.at(1, 2, 3) = 9.0f;

    ChunkedArray3D<float> b(a);
    EXPECT_EQ(b.at(1, 2, 3), 9.0f);
    EXPECT_EQ(b.at(0, 0, 0), 1.5f);
    b.at(0, 0, 0) = 2.0f;
    EXPECT_EQ(a.at(0, 0, 0), 1.5f);  // deep copy

    ChunkedArray3D<float> c(std::move(b));
    EXPECT_EQ(c.at(1, 2, 3), 9.0f);
    EXPECT_TRUE(b.empty());

    ChunkedArray3D<float> d;
    EXPECT_TRUE(d.empty());
    d = c;
    EXPECT_EQ(d.at(0, 0, 0), 2.0f);

    d.resize(2, 2, 2);
    EXPECT_EQ(d.size(), size_t(8));
    EXPECT_EQ(d.chunkCount(), 1);
    d.clear();
    EXPECT_TRUE(d.empty());
    EXPECT_EQ(d.chunkCount(), 0);
}
