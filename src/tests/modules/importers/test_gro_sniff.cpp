#include <gtest/gtest.h>
#include <common.h>
#include "mdtools/GROFileReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/LimitedInStream.hpp>
#include <qlib/StringStream.hpp>
#include <string>

using mdtools::GROFileReader;
using qsys::ObjReader;
using qlib::LimitedInStream;
using qlib::StrInStream;

namespace {

int sniff(const ObjReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

}  // namespace

// Minimal valid 3-atom water .gro (no velocity, orthogonal box).
static const std::string kWaterGRO =
    "water\n"
    "    3\n"
    "    1SOL     OW    1   1.000   2.000   3.000\n"
    "    1SOL    HW1    2   1.100   2.000   3.000\n"
    "    1SOL    HW2    3   1.000   2.100   3.000\n"
    "   2.00000   2.00000   2.00000\n";

TEST(GROFileReaderSniffTest, ValidWaterReturnsYes)
{
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, kWaterGRO), ObjReader::CONTENT_YES);
}

TEST(GROFileReaderSniffTest, EmptyReturnsUnknown)
{
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

TEST(GROFileReaderSniffTest, MissingAtomLineReturnsUnknown)
{
    // Title and count present, but no atom line. Not NO: a byte cap
    // could have cut the stream here, so the verdict must stay
    // retryable.
    const std::string text = "title\n    3\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_UNKNOWN);
}

TEST(GROFileReaderSniffTest, NonIntegerCountReturnsUnknown)
{
    // Line 2 must be parseable as an integer.
    const std::string text =
        "title\n"
        "not_a_number\n"
        "    1SOL     OW    1   1.000   2.000   3.000\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_UNKNOWN);
}

TEST(GROFileReaderSniffTest, ZeroAtomsReturnsUnknown)
{
    // 0 atoms is technically valid GRO but ambiguous as a sniff signal.
    const std::string text = "title\n    0\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_UNKNOWN);
}

TEST(GROFileReaderSniffTest, ShortAtomLineReturnsUnknown)
{
    // Atom line shorter than 44 characters fails the fixed-column check.
    const std::string text =
        "title\n"
        "    1\n"
        "    1SOL     OW    1 1.0 2.0 3.0\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_UNKNOWN);
}

TEST(GROFileReaderSniffTest, NonNumericCoordsReturnsUnknown)
{
    // Position columns must parse as doubles.
    const std::string text =
        "title\n"
        "    1\n"
        "    1SOL     OW    1     bad      x      yz\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_UNKNOWN);
}

// A byte cap that lands inside the first atom line must not turn into
// NO (which the sniff harness treats as final). The reader reports
// UNKNOWN and the LimitedInStream records that the cap was the limiting
// factor, so the harness can retry with a larger budget.
TEST(GROFileReaderSniffTest, TruncatedAtomLineReturnsUnknownNotNo)
{
    GROFileReader reader;
    StrInStream raw(kWaterGRO.data(), static_cast<int>(kWaterGRO.size()));
    // "water\n" (6) + "    3\n" (6) = 12; cap 30 ends mid atom line 1.
    LimitedInStream capped(raw, 30);
    EXPECT_EQ(reader.canHandleContent(capped), ObjReader::CONTENT_UNKNOWN);
    EXPECT_TRUE(capped.isLimitHit());
}

TEST(GROFileReaderSniffTest, GetNameReturnsGro)
{
    GROFileReader reader;
    EXPECT_STREQ(reader.getName(), "gro");
}

TEST(GROFileReaderSniffTest, GetFileExtContainsGro)
{
    GROFileReader reader;
    qlib::LString ext(reader.getFileExt());
    EXPECT_NE(ext.indexOf("gro"), -1);
}
