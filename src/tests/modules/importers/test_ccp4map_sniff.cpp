#include <gtest/gtest.h>
#include <common.h>
#include "xtal/CCP4MapReader.hpp"
#include "qsys/ObjReader.hpp"
#include "qsys/StreamManager.hpp"
#include "qsys/InOutHandler.hpp"
#include <qlib/LString.hpp>
#include <qlib/StringStream.hpp>
#include <fstream>
#include <string>

using xtal::CCP4MapReader;
using qsys::ObjReader;
using qsys::StreamManager;
using qsys::InOutHandler;
using qlib::LString;
using qlib::StrInStream;

namespace {

// Build a minimal CCP4/MRC header buffer (216 bytes: 52*4 header fields
// + 4-byte "MAP " marker + 4-byte machine stamp). Header fields are
// left zero except optional `marker` placement so the test exercises
// the byte-208 verdict check, not the parser's field validation.
std::string makeMinimalCcp4Header(bool withMarker)
{
    std::string buf(216, '\0');
    if (withMarker) {
        buf[208] = 'M';
        buf[209] = 'A';
        buf[210] = 'P';
        buf[211] = ' ';
    }
    return buf;
}

int sniff(const ObjReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

LString writeTempFile(const std::string &suffix, const std::string &payload)
{
    static int s_counter = 0;
    const std::string dir = ::testing::TempDir();
    const std::string path =
        dir + "/ccp4_sniff_" + std::to_string(++s_counter) + suffix;
    std::ofstream out(path, std::ios::binary);
    out.write(payload.data(), static_cast<std::streamsize>(payload.size()));
    out.close();
    return LString(path.c_str());
}

}  // namespace

// ----------------------------------------------------------------------
// CCP4MapReader::canHandleContent
// ----------------------------------------------------------------------

TEST(CCP4MapReaderSniffTest, Ccp4HeaderReturnsYes)
{
    CCP4MapReader reader;
    const std::string payload = makeMinimalCcp4Header(/*withMarker=*/true);
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(CCP4MapReaderSniffTest, XplorTextReturnsUnknown)
{
    CCP4MapReader reader;
    // CCP4 reads 212 bytes and checks byte 208 for "MAP ". A short
    // text payload like an Xplor header either fails to reach byte
    // 212 (short read -> UNKNOWN) or has random text at 208-211
    // (no match -> UNKNOWN). No explicit text fast-reject is needed.
    const std::string payload =
        "       2\n"
        " REMARKS test xplor map\n"
        " REMARKS more\n"
        "       1       1       1       1       1       1       1       1       1\n"
        "ZYX\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(CCP4MapReaderSniffTest, EmptyReturnsUnknown)
{
    CCP4MapReader reader;
    const std::string payload;
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(CCP4MapReaderSniffTest, ShortBinaryReturnsUnknown)
{
    CCP4MapReader reader;
    // 100 zero bytes: binary (first 4 bytes are NUL, not printable, so
    // fast-NO does not trigger), but too short to verify the marker at
    // offset 208. Must return UNKNOWN rather than guessing.
    const std::string payload(100, '\0');
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

// ----------------------------------------------------------------------
// End-to-end via StreamManager::searchReaderByContent: ambiguous `.map`
// extension resolves to the correct reader purely from content.
// ----------------------------------------------------------------------

TEST(CCP4XplorMapSniffIntegration, BinaryMapPicksCcp4)
{
    const std::string payload = makeMinimalCcp4Header(/*withMarker=*/true);
    LString path = writeTempFile(".map", payload);
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString("ccp4map,xplormap"),
        InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("ccp4map"));
}

TEST(CCP4XplorMapSniffIntegration, TextMapPicksXplor)
{
    const std::string payload =
        "\n"
        "       2\n"
        " REMARKS test xplor map\n"
        " REMARKS more\n"
        "       1       1       1       1       1       1       1       1       1\n"
        "ZYX\n";
    LString path = writeTempFile(".map", payload);
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString("ccp4map,xplormap"),
        InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("xplormap"));
}
