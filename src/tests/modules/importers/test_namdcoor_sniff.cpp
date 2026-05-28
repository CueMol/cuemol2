#include <gtest/gtest.h>
#include <common.h>
#include "mdtools/NAMDCoorReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/LTypes.hpp>
#include <qlib/StringStream.hpp>
#include <cmath>
#include <cstring>
#include <limits>
#include <string>

using mdtools::NAMDCoorReader;
using qsys::ObjReader;
using qlib::StrInStream;

namespace {

constexpr int HEADER_SIZE = 4 + 3 * 8;

// Build a 28-byte NAMD coor header: int32 natoms followed by
// three float64 xyz. If swap=true, byte-swap each field after
// writing native bytes (simulates a cross-endian coor file).
std::string makeHeader(qint32 natoms, qfloat64 x, qfloat64 y, qfloat64 z,
                       bool swap = false)
{
    if (swap) {
        qlib::LByteSwapper<qint32>::swap(natoms);
        qlib::LByteSwapper<qfloat64>::swap(x);
        qlib::LByteSwapper<qfloat64>::swap(y);
        qlib::LByteSwapper<qfloat64>::swap(z);
    }
    std::string buf(HEADER_SIZE, '\0');
    std::memcpy(buf.data() + 0,  &natoms, sizeof(qint32));
    std::memcpy(buf.data() + 4,  &x,      sizeof(qfloat64));
    std::memcpy(buf.data() + 12, &y,      sizeof(qfloat64));
    std::memcpy(buf.data() + 20, &z,      sizeof(qfloat64));
    return buf;
}

int sniff(const ObjReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

}  // namespace

// ----------------------------------------------------------------------
// NAMDCoorReader::canHandleContent
// ----------------------------------------------------------------------

TEST(NAMDCoorReaderSniffTest, ValidNativeReturnsYes)
{
    NAMDCoorReader reader;
    EXPECT_EQ(sniff(reader, makeHeader(100, 1.0, -2.0, 3.0)),
              ObjReader::CONTENT_YES);
}

TEST(NAMDCoorReaderSniffTest, ValidSwappedReturnsYes)
{
    NAMDCoorReader reader;
    EXPECT_EQ(sniff(reader, makeHeader(100, 1.0, -2.0, 3.0, /*swap=*/true)),
              ObjReader::CONTENT_YES);
}

TEST(NAMDCoorReaderSniffTest, EmptyReturnsUnknown)
{
    NAMDCoorReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

TEST(NAMDCoorReaderSniffTest, ShortReturnsUnknown)
{
    NAMDCoorReader reader;
    // 16 bytes -- shorter than the 28-byte header we need.
    EXPECT_EQ(sniff(reader, std::string(16, '\0')), ObjReader::CONTENT_UNKNOWN);
}

TEST(NAMDCoorReaderSniffTest, ZeroNatomsReturnsUnknown)
{
    NAMDCoorReader reader;
    EXPECT_EQ(sniff(reader, makeHeader(0, 0.0, 0.0, 0.0)),
              ObjReader::CONTENT_UNKNOWN);
}

TEST(NAMDCoorReaderSniffTest, HugeCoordReturnsUnknown)
{
    NAMDCoorReader reader;
    EXPECT_EQ(sniff(reader, makeHeader(100, 1.0e20, 0.0, 0.0)),
              ObjReader::CONTENT_UNKNOWN);
}

TEST(NAMDCoorReaderSniffTest, NaNCoordReturnsUnknown)
{
    NAMDCoorReader reader;
    const qfloat64 nan = std::numeric_limits<qfloat64>::quiet_NaN();
    EXPECT_EQ(sniff(reader, makeHeader(100, nan, 0.0, 0.0)),
              ObjReader::CONTENT_UNKNOWN);
}

TEST(NAMDCoorReaderSniffTest, PdbTextReturnsUnknown)
{
    NAMDCoorReader reader;
    // PDB ASCII bytes interpreted as binary -> first int32 may be a
    // plausible value, but the float64 fields land on ASCII bytes and
    // come out as NaN / huge values, so sniff must reject.
    const std::string payload =
        "HEADER    PROTEIN                                   01-JAN-00\n"
        "ATOM      1  N   ALA A   1       0.000   0.000   0.000\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}
