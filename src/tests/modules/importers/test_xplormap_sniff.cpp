#include <gtest/gtest.h>
#include <common.h>
#include "xtal/XplorMapReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <string>

using xtal::XplorMapReader;
using qsys::ObjReader;
using qlib::StrInStream;

namespace {

// Build a minimal CCP4 binary header buffer: 216 bytes of zero with
// "MAP " at offset 208. Used as the negative-case payload for Xplor's
// sniffer (binary input -> CONTENT_NO via NUL-byte rejection).
std::string makeMinimalCcp4Header()
{
    std::string buf(216, '\0');
    buf[208] = 'M';
    buf[209] = 'A';
    buf[210] = 'P';
    buf[211] = ' ';
    return buf;
}

int sniff(const ObjReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

}  // namespace

// ----------------------------------------------------------------------
// XplorMapReader::canHandleContent
// ----------------------------------------------------------------------

TEST(XplorMapReaderSniffTest, XplorAxisLineReturnsYes)
{
    XplorMapReader reader;
    // Minimal Xplor map head: blank line, title count, REMARKS, the
    // 9-field axis-info line, then "ZYX" at column 0 (the verdict-
    // forming token, matching XplorMapReader::readAxisInfo).
    const std::string payload =
        "\n"
        "       2\n"
        " REMARKS test xplor map\n"
        " REMARKS more\n"
        "       1       1       1       1       1       1       1       1       1\n"
        "ZYX\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(XplorMapReaderSniffTest, Ccp4BinaryReturnsNo)
{
    XplorMapReader reader;
    // Binary CCP4 header (zero-filled with "MAP " marker) contains NUL
    // bytes in the first 4 bytes -- Xplor's sniffer must reject it.
    const std::string payload = makeMinimalCcp4Header();
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_NO);
}

TEST(XplorMapReaderSniffTest, EmptyReturnsUnknown)
{
    XplorMapReader reader;
    const std::string payload;
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(XplorMapReaderSniffTest, TextWithoutAxisLineReturnsUnknown)
{
    XplorMapReader reader;
    // mmCIF-shaped text head: pure ASCII (no NUL), no "ZYX" axis line.
    // Sniffer must return UNKNOWN, not NO (caller may retry with a
    // larger maxBytes if the actual file is a long-REMARKS Xplor map).
    const std::string payload =
        "data_test\n"
        "loop_\n"
        "_atom_site.group_PDB\n"
        "ATOM 1 N N\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}
