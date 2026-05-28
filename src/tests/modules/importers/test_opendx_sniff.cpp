#include <gtest/gtest.h>
#include <common.h>
#include "surface/OpenDXPotReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <string>

using surface::OpenDXPotReader;
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
// OpenDXPotReader::canHandleContent
// ----------------------------------------------------------------------

TEST(OpenDXPotReaderSniffTest, GridPositionsLineReturnsYes)
{
    OpenDXPotReader reader;
    // APBS OpenDX header: the verdict-forming line is
    // "object 1 class gridpositions counts <nx> <ny> <nz>".
    const std::string payload =
        "# Data from APBS\n"
        "#\n"
        "object 1 class gridpositions counts 65 65 65\n"
        "origin -16.000 -16.000 -16.000\n"
        "delta 0.5 0.0 0.0\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(OpenDXPotReaderSniffTest, GridPositionsAtStartReturnsYes)
{
    OpenDXPotReader reader;
    // No leading comments -- still YES because the marker is at line 0.
    const std::string payload =
        "object 1 class gridpositions counts 10 10 10\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(OpenDXPotReaderSniffTest, EmptyReturnsUnknown)
{
    OpenDXPotReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

TEST(OpenDXPotReaderSniffTest, BinaryReturnsUnknown)
{
    OpenDXPotReader reader;
    // No "object 1 class gridpositions" line in binary -> UNKNOWN.
    const std::string payload(216, '\0');
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(OpenDXPotReaderSniffTest, PdbReturnsUnknown)
{
    OpenDXPotReader reader;
    const std::string payload =
        "HEADER    PROTEIN                                   01-JAN-00\n"
        "ATOM      1  N   ALA A   1       0.000   0.000   0.000\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}
