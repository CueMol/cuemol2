#include <gtest/gtest.h>
#include <common.h>

#include "mdtools/AmberPrmtopReader.hpp"
#include "qsys/ObjReader.hpp"

#include <qlib/LString.hpp>
#include <qlib/StringStream.hpp>

#include <string>

using mdtools::AmberPrmtopReader;
using qsys::ObjReader;
using qlib::StrInStream;

namespace {

int sniff(const AmberPrmtopReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

const char *const kPrmtopHead =
    "%VERSION  VERSION_STAMP = V0001.000  DATE = 06/22/12  12:00:00\n"
    "%FLAG TITLE\n"
    "%FORMAT(20a4)\n"
    "test\n"
    "%FLAG POINTERS\n"
    "%FORMAT(10I8)\n";

const char *const kFlagOnlyHead =
    "%FLAG POINTERS\n"
    "%FORMAT(10I8)\n"
    "       3       2       2       0       0       0       0       0       0       0\n";

const char *const kPdbText =
    "HEADER    PROTEIN                                   01-JAN-00\n"
    "ATOM      1  N   ALA A   1       0.000   0.000   0.000\n";

const char *const kOldPrmtopText =
    "test\n"
    "    3    1    2    0    0    0    0    0    0    0\n"
    "    0    1    0    0    0    0    0    0    0    0\n";

}  // namespace

TEST(AmberPrmtopSniffTest, VersionHeaderReturnsYes)
{
    AmberPrmtopReader reader;
    EXPECT_EQ(sniff(reader, kPrmtopHead), ObjReader::CONTENT_YES);
}

TEST(AmberPrmtopSniffTest, FlagOnlyHeaderReturnsYes)
{
    AmberPrmtopReader reader;
    EXPECT_EQ(sniff(reader, kFlagOnlyHead), ObjReader::CONTENT_YES);
}

TEST(AmberPrmtopSniffTest, EmptyReturnsUnknown)
{
    AmberPrmtopReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

TEST(AmberPrmtopSniffTest, PdbTextReturnsUnknown)
{
    AmberPrmtopReader reader;
    // PDB text has neither %VERSION nor %FLAG -- sniff must not claim it.
    EXPECT_EQ(sniff(reader, kPdbText), ObjReader::CONTENT_UNKNOWN);
}

TEST(AmberPrmtopSniffTest, OldFormatReturnsUnknown)
{
    AmberPrmtopReader reader;
    // Pre-Amber-7 (label-less) header is unrecognizable from sniff alone.
    // canHandleContent returns UNKNOWN; the actual read() path rejects it
    // explicitly with a FileFormatException (covered separately).
    EXPECT_EQ(sniff(reader, kOldPrmtopText), ObjReader::CONTENT_UNKNOWN);
}

TEST(AmberPrmtopSniffTest, BinaryNulReturnsNo)
{
    AmberPrmtopReader reader;
    // A binary file with NUL bytes in the head is definitely not a prmtop.
    std::string payload(64, '\0');
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_NO);
}
