// -*-Mode: C++;-*-
//
// Tests for the level-of-detail helpers of the map renderers: the
// budget-derived stride and the stride-aligned node range.
//

#include <gtest/gtest.h>
#include <common.h>
#include "xtal/MapLod.hpp"

using xtal::lodCellCount;
using xtal::lodStepForBudget;
using xtal::lodAlignRange;
using xtal::LodRange;

TEST(MapLod, CellCount)
{
    EXPECT_EQ(lodCellCount(12, 12, 12, 1), 11LL * 11 * 11);
    EXPECT_EQ(lodCellCount(12, 12, 12, 2), 5LL * 5 * 5);
    EXPECT_EQ(lodCellCount(13, 13, 13, 2), 6LL * 6 * 6);
    EXPECT_EQ(lodCellCount(1, 12, 12, 1), 0);
    EXPECT_EQ(lodCellCount(0, 12, 12, 1), 0);
}

// The stride is an isotropic power of two, the smallest one under the
// budget, so typical cryo-EM box sizes at the 16 Mcell default give:
// 256^3 -> 1, 300^3 / 512^3 -> 2, 1024^3 -> 4, and a small map -> 1.
TEST(MapLod, StepForBudget)
{
    const long long budget = 16LL << 20;
    EXPECT_EQ(lodStepForBudget(12, 12, 12, budget), 1);
    EXPECT_EQ(lodStepForBudget(256, 256, 256, budget), 1);
    EXPECT_EQ(lodStepForBudget(300, 300, 300, budget), 2);
    EXPECT_EQ(lodStepForBudget(512, 512, 512, budget), 2);
    EXPECT_EQ(lodStepForBudget(1024, 1024, 1024, budget), 4);
    EXPECT_EQ(lodStepForBudget(2048, 2048, 2048, budget), 8);
    // anisotropic region: only the product matters
    EXPECT_EQ(lodStepForBudget(1024, 256, 256, budget), 2);
}

TEST(MapLod, StepIsCapped)
{
    EXPECT_EQ(lodStepForBudget(100000, 100000, 100000, 1), 64);
}

// Whole block, stride 1: the span is n-1 cells (last cube ends on the
// last node); stride 2 on 12 nodes: the last aligned node is 10, so the
// span is 10 and the incomplete tail cube [10,12] is dropped.
TEST(MapLod, AlignWholeBlock)
{
    LodRange r = lodAlignRange(0, 11, 0, 12, 1);
    EXPECT_EQ(r.start, 0);
    EXPECT_EQ(r.span, 11);

    r = lodAlignRange(0, 11, 0, 12, 2);
    EXPECT_EQ(r.start, 0);
    EXPECT_EQ(r.span, 10);

    // 13 nodes: the last aligned node is 12, so the tail cube is kept
    r = lodAlignRange(0, 12, 0, 13, 2);
    EXPECT_EQ(r.start, 0);
    EXPECT_EQ(r.span, 12);
}

// Alignment is relative to the block start, not to absolute index 0.
TEST(MapLod, AlignNonZeroStart)
{
    // block [3, 15) i.e. nodes 3..14, stride 4: aligned nodes 3,7,11
    LodRange r = lodAlignRange(3, 14, 3, 12, 4);
    EXPECT_EQ(r.start, 3);
    EXPECT_EQ(r.span, 8);

    // sub-range [6, 9] rounds down to 3 and up to 11
    r = lodAlignRange(6, 9, 3, 12, 4);
    EXPECT_EQ(r.start, 3);
    EXPECT_EQ(r.span, 8);

    // sub-range [8, 9] rounds down to 7 and up to 11
    r = lodAlignRange(8, 9, 3, 12, 4);
    EXPECT_EQ(r.start, 7);
    EXPECT_EQ(r.span, 4);
}

TEST(MapLod, AlignClampsAndEmpty)
{
    // range outside the block on the low side is clamped
    LodRange r = lodAlignRange(-20, 5, 0, 12, 2);
    EXPECT_EQ(r.start, 0);
    EXPECT_EQ(r.span, 6);

    // range past the block on the high side stops at the last aligned node
    r = lodAlignRange(6, 100, 0, 12, 2);
    EXPECT_EQ(r.start, 6);
    EXPECT_EQ(r.span, 4);

    // disjoint range is empty
    r = lodAlignRange(20, 30, 0, 12, 1);
    EXPECT_EQ(r.span, 0);

    // empty block
    r = lodAlignRange(0, 5, 0, 0, 1);
    EXPECT_EQ(r.span, 0);
}
