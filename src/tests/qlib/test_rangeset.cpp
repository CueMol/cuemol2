#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LScrRangeSet.hpp"

using qlib::LScrRangeSet;
using qlib::LString;

// Helper: build a RangeSet from half-open integer ranges [start, end)
static LScrRangeSet makeRange(std::initializer_list<std::pair<int,int>> ranges)
{
    LScrRangeSet rs;
    for (auto &p : ranges)
        rs = rs.scr_appendInt(p.first, p.second);
    return rs;
}

TEST(LScrRangeSet, CreateAndInit)
{
    LScrRangeSet rs;
    EXPECT_TRUE(rs.isEmpty());
    EXPECT_TRUE(rs.toString().equals(""));
}

TEST(LScrRangeSet, AppendInt)
{
    // [5, 10) -> toString: "5:9"
    LScrRangeSet rs;
    LScrRangeSet rs2 = rs.scr_appendInt(5, 10);
    EXPECT_TRUE(rs.isEmpty());           // original unchanged
    EXPECT_TRUE(rs2.toString().equals("5:9"));
}

TEST(LScrRangeSet, AppendIntSorted)
{
    // Insert out-of-order, result should be sorted
    LScrRangeSet rs = makeRange({{20, 30}, {1, 10}, {100, 110}});
    EXPECT_TRUE(rs.toString().equals("1:9,20:29,100:109"));
}

TEST(LScrRangeSet, AppendIntMergeOverlap)
{
    // Overlapping ranges get merged
    LScrRangeSet rs = makeRange({{1, 10}, {5, 15}});
    EXPECT_TRUE(rs.toString().equals("1:14"));
}

TEST(LScrRangeSet, AppendMergeAdjacent)
{
    // Adjacent ranges [1,10) and [10,20) merge to [1,20)
    LScrRangeSet rs = makeRange({{1, 10}, {10, 20}});
    EXPECT_TRUE(rs.toString().equals("1:19"));
}

TEST(LScrRangeSet, AppendSingleElement)
{
    // [5,6) is a single element
    LScrRangeSet rs = makeRange({{5, 6}});
    EXPECT_TRUE(rs.toString().equals("5"));
}

TEST(LScrRangeSet, AppendEmptyRange)
{
    // [5,5) is empty
    LScrRangeSet rs = makeRange({{5, 5}});
    EXPECT_TRUE(rs.isEmpty());
}

TEST(LScrRangeSet, AppendRangeSet)
{
    LScrRangeSet rs1 = makeRange({{1, 10}});
    LScrRangeSet rs2 = makeRange({{5, 15}});
    LScrRangeSet result = rs1.scr_append(rs2);
    EXPECT_TRUE(result.toString().equals("1:14"));
}

TEST(LScrRangeSet, AppendRangeSetNonOverlap)
{
    LScrRangeSet rs1 = makeRange({{1, 10}, {30, 40}});
    LScrRangeSet rs2 = makeRange({{15, 25}});
    LScrRangeSet result = rs1.scr_append(rs2);
    EXPECT_TRUE(result.toString().equals("1:9,15:24,30:39"));
}

TEST(LScrRangeSet, RemoveInt)
{
    // Split: [1,10) remove [4,7) -> [1,4) + [7,10)
    LScrRangeSet rs = makeRange({{1, 10}});
    LScrRangeSet result = rs.scr_removeInt(4, 7);
    EXPECT_TRUE(rs.toString().equals("1:9"));  // original unchanged
    EXPECT_TRUE(result.toString().equals("1:3,7:9"));
}

TEST(LScrRangeSet, RemoveIntFromStart)
{
    LScrRangeSet rs = makeRange({{1, 10}}).scr_removeInt(1, 5);
    EXPECT_TRUE(rs.toString().equals("5:9"));
}

TEST(LScrRangeSet, RemoveIntFromEnd)
{
    LScrRangeSet rs = makeRange({{1, 10}}).scr_removeInt(5, 10);
    EXPECT_TRUE(rs.toString().equals("1:4"));
}

TEST(LScrRangeSet, RemoveIntEntire)
{
    LScrRangeSet rs = makeRange({{1, 10}}).scr_removeInt(1, 10);
    EXPECT_TRUE(rs.isEmpty());
}

TEST(LScrRangeSet, RemoveIntNoOverlap)
{
    LScrRangeSet rs = makeRange({{1, 10}}).scr_removeInt(20, 30);
    EXPECT_TRUE(rs.toString().equals("1:9"));
}

TEST(LScrRangeSet, RemoveIntAcrossMultiple)
{
    LScrRangeSet rs = makeRange({{1, 10}, {20, 30}, {40, 50}}).scr_removeInt(5, 45);
    EXPECT_TRUE(rs.toString().equals("1:4,45:49"));
}

TEST(LScrRangeSet, RemoveRangeSet)
{
    LScrRangeSet rs1 = makeRange({{1, 100}});
    LScrRangeSet rs2 = makeRange({{10, 20}, {30, 40}, {50, 60}});
    LScrRangeSet result = rs1.scr_remove(rs2);
    EXPECT_TRUE(result.toString().equals("1:9,20:29,40:49,60:99"));
}

TEST(LScrRangeSet, ContainsInt)
{
    LScrRangeSet rs = makeRange({{1, 10}, {20, 30}, {40, 50}});
    EXPECT_TRUE(rs.contains(2, 5));
    EXPECT_TRUE(rs.contains(1, 10));
    EXPECT_TRUE(rs.contains(22, 28));
    EXPECT_FALSE(rs.contains(5, 15));
    EXPECT_FALSE(rs.contains(11, 19));
}

TEST(LScrRangeSet, ContainsIntBoundary)
{
    LScrRangeSet rs = makeRange({{1, 10}});
    EXPECT_TRUE(rs.contains(1, 2));
    EXPECT_TRUE(rs.contains(9, 10));
    EXPECT_FALSE(rs.contains(0, 1));
    EXPECT_FALSE(rs.contains(10, 11));
}

TEST(LScrRangeSet, Negate)
{
    // Double negation recovers original
    LScrRangeSet original = makeRange({{10, 20}, {30, 40}});
    LScrRangeSet doubleNeg = original.negate().negate();
    EXPECT_TRUE(doubleNeg.toString().equals(original.toString()));
}

TEST(LScrRangeSet, NegateGap)
{
    // Gap between 20 and 30 filled in complement
    LScrRangeSet rs = makeRange({{10, 20}, {30, 40}}).negate();
    EXPECT_TRUE(rs.toString().indexOf(LString("20:29")) >= 0);
}

TEST(LScrRangeSet, ToStringFromString)
{
    LScrRangeSet original = makeRange({{1, 11}, {20, 31}, {40, 51}, {100, 201}});
    LString s = original.toString();
    LScrRangeSet parsed;
    EXPECT_TRUE(parsed.fromString(s));
    EXPECT_TRUE(parsed.toString().equals(s));
}

TEST(LScrRangeSet, FromStringSingleElement)
{
    LScrRangeSet rs;
    EXPECT_TRUE(rs.fromString("5"));
    EXPECT_TRUE(rs.toString().equals("5"));
    EXPECT_TRUE(rs.contains(5, 6));
}

TEST(LScrRangeSet, EdgeCasesNegative)
{
    LScrRangeSet rs = makeRange({{-10, -5}, {0, 5}});
    EXPECT_TRUE(rs.toString().equals("-10:-6,0:4"));
}

TEST(LScrRangeSet, EdgeCasesLargeValues)
{
    LScrRangeSet rs = makeRange({{1000000, 2000000}});
    EXPECT_TRUE(rs.toString().equals("1000000:1999999"));
    EXPECT_TRUE(rs.contains(1500000, 1500100));
}

TEST(LScrRangeSet, ClearAndReuse)
{
    LScrRangeSet rs = makeRange({{1, 10}, {20, 30}});
    rs.clear();
    EXPECT_TRUE(rs.isEmpty());
    EXPECT_TRUE(rs.fromString("100:200"));
    EXPECT_FALSE(rs.isEmpty());
}
