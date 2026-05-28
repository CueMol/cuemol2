#include <gtest/gtest.h>
#include <common.h>
#include "xtal/MTZ2MapReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <string>

using xtal::MTZ2MapReader;
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
// MTZ2MapReader::canHandleContent
// ----------------------------------------------------------------------

TEST(MTZ2MapReaderSniffTest, MtzMagicReturnsYes)
{
    MTZ2MapReader reader;
    // MTZ format: 4-byte ASCII "MTZ " at file offset 0 (note trailing
    // space).
    std::string payload = "MTZ ";
    // The parser reads more after the magic; pad to a plausible size.
    payload.resize(64, '\0');
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(MTZ2MapReaderSniffTest, MissingTrailingSpaceReturnsUnknown)
{
    MTZ2MapReader reader;
    // "MTZX..." without the trailing space is not the MTZ magic.
    std::string payload(64, '\0');
    payload[0] = 'M'; payload[1] = 'T'; payload[2] = 'Z'; payload[3] = 'X';
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(MTZ2MapReaderSniffTest, Ccp4BinaryReturnsUnknown)
{
    MTZ2MapReader reader;
    // CCP4 first 4 bytes are int32 NC, not "MTZ ".
    std::string payload(216, '\0');
    payload[208] = 'M';
    payload[209] = 'A';
    payload[210] = 'P';
    payload[211] = ' ';
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(MTZ2MapReaderSniffTest, ShortFileReturnsUnknown)
{
    MTZ2MapReader reader;
    const std::string payload = "MT";  // < 4 bytes
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(MTZ2MapReaderSniffTest, EmptyReturnsUnknown)
{
    MTZ2MapReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}
