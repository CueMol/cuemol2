#include <gtest/gtest.h>
#include <common.h>
#include "xtal/XplorMapReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <qlib/LimitedInStream.hpp>
#include <string>

using xtal::XplorMapReader;
using qsys::ObjReader;
using qlib::StrInStream;
using qlib::LimitedInStream;

namespace {

// Build a minimal CCP4 binary header buffer: 216 bytes of zero with
// "MAP " at offset 208. Used as the negative-case payload for Xplor's
// sniffer (binary input never carries the ZYX line -> CONTENT_UNKNOWN).
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

TEST(XplorMapReaderSniffTest, Ccp4BinaryReturnsUnknown)
{
    XplorMapReader reader;
    // Binary CCP4 header has no "ZYX" line, so LineStream-based sniff
    // naturally returns UNKNOWN. No explicit binary reject is needed
    // -- non-matching input is UNKNOWN, not NO.
    const std::string payload = makeMinimalCcp4Header();
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
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

TEST(XplorMapReaderSniffTest, LongRemarksHeaderReachesZyxBeyond4Kb)
{
    XplorMapReader reader;
    // Regression: real CNS-generated Xplor maps have ~18 REMARKS title
    // lines each padded to ~256 chars, putting the ZYX marker at byte
    // ~4900. The earlier PEEK=4096 sniff missed it. Synthesize a
    // header with NTITLE=18 padded REMARK lines so the ZYX marker
    // lands well past 4 KB.
    std::string payload = "\n       18      !NTITLE\n";
    const std::string pad(255, ' ');
    for (int i = 0; i < 18; ++i) {
        payload += " REMARKS line " + std::to_string(i) + pad + "\n";
    }
    payload +=
        "     180       0     180     180       0     180     162       0     162\n"
        " 0.85336E+02 0.85336E+02 0.75650E+02 0.90000E+02 0.90000E+02 0.12000E+03\n"
        "ZYX\n";
    EXPECT_GT(static_cast<int>(payload.size()), 4500);
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(XplorMapReaderSniffTest, ZyxWithLeadingWhitespaceReturnsYes)
{
    XplorMapReader reader;
    // Some writers emit the axis line with leading whitespace; the
    // parser trims it before the startsWith check, and so must sniff.
    const std::string payload =
        "\n"
        "       2\n"
        " REMARKS test\n"
        " REMARKS more\n"
        "       1       1       1       1       1       1       1       1       1\n"
        "   ZYX\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(XplorMapReaderSniffTest, CapShorterThanZyxReturnsUnknown)
{
    XplorMapReader reader;
    // Build a 5+ KB Xplor payload (NTITLE=18 padded), then wrap in
    // LimitedInStream with a 1 KB cap. The ZYX marker sits past byte
    // 1024, so sniff hits cap-EOF before any verdict -> UNKNOWN.
    // Pins the contract: the reader is agnostic of the cap; the
    // upstream LimitedInStream is what truncates input.
    std::string payload = "\n       18      !NTITLE\n";
    const std::string pad(255, ' ');
    for (int i = 0; i < 18; ++i) {
        payload += " REMARKS line " + std::to_string(i) + pad + "\n";
    }
    payload +=
        "     180       0     180     180       0     180     162       0     162\n"
        " 0.85336E+02 0.85336E+02 0.75650E+02 0.90000E+02 0.90000E+02 0.12000E+03\n"
        "ZYX\n";
    EXPECT_GT(static_cast<int>(payload.size()), 4500);

    StrInStream raw(payload.data(), static_cast<int>(payload.size()));
    LimitedInStream capped(raw, 1024);
    EXPECT_EQ(reader.canHandleContent(capped), ObjReader::CONTENT_UNKNOWN);
    // The cap, not the payload, ended the scan: the sniff harness uses
    // this flag to retry the reader with a larger budget.
    EXPECT_TRUE(capped.isLimitHit());
}
