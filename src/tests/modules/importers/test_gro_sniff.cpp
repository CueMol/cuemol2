#include <gtest/gtest.h>
#include <common.h>
#include "mdtools/GROFileReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <string>

using mdtools::GROFileReader;
using qsys::ObjReader;
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

TEST(GROFileReaderSniffTest, MissingAtomLineReturnsNo)
{
    // Title and count present, but no atom line.
    const std::string text = "title\n    3\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_NO);
}

TEST(GROFileReaderSniffTest, NonIntegerCountReturnsNo)
{
    // Line 2 must be parseable as an integer.
    const std::string text =
        "title\n"
        "not_a_number\n"
        "    1SOL     OW    1   1.000   2.000   3.000\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_NO);
}

TEST(GROFileReaderSniffTest, ZeroAtomsReturnsUnknown)
{
    // 0 atoms is technically valid GRO but ambiguous as a sniff signal.
    const std::string text = "title\n    0\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_UNKNOWN);
}

TEST(GROFileReaderSniffTest, ShortAtomLineReturnsNo)
{
    // Atom line shorter than 44 characters fails the fixed-column check.
    const std::string text =
        "title\n"
        "    1\n"
        "    1SOL     OW    1 1.0 2.0 3.0\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_NO);
}

TEST(GROFileReaderSniffTest, NonNumericCoordsReturnsNo)
{
    // Position columns must parse as doubles.
    const std::string text =
        "title\n"
        "    1\n"
        "    1SOL     OW    1     bad      x      yz\n";
    GROFileReader reader;
    EXPECT_EQ(sniff(reader, text), ObjReader::CONTENT_NO);
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
