// -*-Mode: C++;-*-
//
// Tests for qlib::ChunkedVector: the block-wise array behind the recorded
// mesh of TubeMeshBuilder. Elements must keep their values and order across
// block boundaries (indexing and forEachSpan), and clear() must free the
// blocks.
//

#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qlib/ChunkedVector.hpp"

#include <vector>

// Elements stored over several blocks (4 per block here) read back the same
// by index and, in order, by block spans; clear() empties the array.
TEST(ChunkedVectorTest, KeepsElementsAcrossBlocks)
{
    qlib::ChunkedVector<int, 2> a;
    const int n = 11;  // two full blocks and a partial one
    for (int i = 0; i < n; ++i) a.push_back(i * 3);
    ASSERT_EQ(a.size(), size_t(n));
    for (int i = 0; i < n; ++i) EXPECT_EQ(a[i], i * 3);

    std::vector<int> seen;
    std::vector<size_t> spans;
    a.forEachSpan([&](const int *p, size_t m) {
        spans.push_back(m);
        seen.insert(seen.end(), p, p + m);
    });
    EXPECT_EQ(spans, (std::vector<size_t>{4, 4, 3}));
    ASSERT_EQ(seen.size(), size_t(n));
    for (int i = 0; i < n; ++i) EXPECT_EQ(seen[i], i * 3);

    a.clear();
    EXPECT_TRUE(a.empty());
    int nspans = 0;
    a.forEachSpan([&](const int *, size_t) { ++nspans; });
    EXPECT_EQ(nspans, 0);
}
