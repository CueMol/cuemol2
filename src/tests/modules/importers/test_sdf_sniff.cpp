#include <gtest/gtest.h>
#include <common.h>
#include "importers/SDFMolReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <string>

using importers::SDFMolReader;
using qsys::ObjReader;
using qlib::StrInStream;

namespace {

int sniff(const ObjReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

}  // namespace

// ----------------------------------------------------------------------
// SDFMolReader::canHandleContent
// ----------------------------------------------------------------------

TEST(SDFMolReaderSniffTest, V2000ReturnsYes)
{
    SDFMolReader reader;
    // SDF V2000 counts line: cols 33-38 (0-indexed) hold " V2000".
    // Lines 1-3 are title / software / comment; line 4 is the counts.
    const std::string payload =
        "test\n"
        "  -OEChem-                  \n"
        "comment\n"
        "  3  2  0     0  0  0  0  0  0999 V2000\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(SDFMolReaderSniffTest, V3000ReturnsNo)
{
    SDFMolReader reader;
    // V3000 is rejected by the actual parser (throws). Sniff returns NO
    // so the load wouldn't be misrouted here.
    const std::string payload =
        "test\n"
        "  -OEChem-                  \n"
        "comment\n"
        "  0  0  0     0  0  0  0  0  0999 V3000\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_NO);
}

TEST(SDFMolReaderSniffTest, ShortFileReturnsUnknown)
{
    SDFMolReader reader;
    // Less than 4 lines: cannot reach the counts line.
    const std::string payload =
        "test\n"
        "  -OEChem-\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(SDFMolReaderSniffTest, EmptyReturnsUnknown)
{
    SDFMolReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

TEST(SDFMolReaderSniffTest, BinaryReturnsUnknown)
{
    SDFMolReader reader;
    // Zero-filled binary: line 4's col 33-38 (if line 4 exists at all)
    // will not match " V2000" / " V3000", so sniff returns UNKNOWN.
    const std::string payload(216, '\0');
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(SDFMolReaderSniffTest, PdbReturnsUnknown)
{
    SDFMolReader reader;
    // PDB line 4 is unlikely to have " V2000" at col 33-38.
    const std::string payload =
        "HEADER    PROTEIN                                   01-JAN-00   1ABC              \n"
        "TITLE     My protein\n"
        "REMARK    blah blah blah\n"
        "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}
