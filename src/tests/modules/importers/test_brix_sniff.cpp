#include <gtest/gtest.h>
#include <common.h>
#include "xtal/BrixMapReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <string>

using xtal::BrixMapReader;
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
// BrixMapReader::canHandleContent
// ----------------------------------------------------------------------

TEST(BrixMapReaderSniffTest, SmileyAtStartReturnsYes)
{
    BrixMapReader reader;
    // BRIX header: ":-)" as the first whitespace-delimited token.
    const std::string payload =
        ":-) origin 0 0 0 extent 10 10 10 grid 100 100 100\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(BrixMapReaderSniffTest, SmileyAfterLeadingWhitespaceReturnsYes)
{
    BrixMapReader reader;
    // The parser uses strtok with " ,\t\r\n" so any leading delimiter
    // is skipped before the smiley.
    const std::string payload =
        "   :-) origin 0 0 0\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(BrixMapReaderSniffTest, RandomTextReturnsUnknown)
{
    BrixMapReader reader;
    const std::string payload =
        "HEADER    PROTEIN                                   01-JAN-00\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(BrixMapReaderSniffTest, EmptyReturnsUnknown)
{
    BrixMapReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

TEST(BrixMapReaderSniffTest, Ccp4BinaryReturnsUnknown)
{
    BrixMapReader reader;
    // BRIX doesn't have a fast-NO path for arbitrary binary because
    // DSN6 (which this reader also accepts via fallback) IS binary.
    // We just don't claim CCP4 here.
    std::string payload(216, '\0');
    payload[208] = 'M';
    payload[209] = 'A';
    payload[210] = 'P';
    payload[211] = ' ';
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}
