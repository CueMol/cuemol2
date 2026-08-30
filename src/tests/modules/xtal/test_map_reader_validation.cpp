// -*-Mode: C++;-*-
//
// Header validation of the CCP4/MRC and MTZ readers: corrupt size / axis /
// length words must raise a FileFormatException instead of indexing
// arrays with them.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/LExceptions.hpp>
#include <qlib/StringStream.hpp>
#include <cstdint>
#include <cstring>
#include <string>
#include "xtal/CCP4MapReader.hpp"
#include "xtal/MTZ2MapReader.hpp"
#include "xtal/DensityMap.hpp"

using qlib::StrInStream;
using xtal::CCP4MapReader;
using xtal::DensityMap;
using xtal::MTZ2MapReader;

namespace {

/// Minimal MRC image (mode 2, 1024-byte header) with the given map size and
/// axis order words, followed by nc*nr*ns floats.
std::string makeMrc(int nc, int nr, int ns, int mapc, int mapr, int maps)
{
    std::string buf(1024, '\0');
    auto putI = [&](int word, int v) { std::memcpy(&buf[(word - 1) * 4], &v, 4); };
    auto putF = [&](int word, float v) { std::memcpy(&buf[(word - 1) * 4], &v, 4); };

    putI(1, nc);
    putI(2, nr);
    putI(3, ns);
    putI(4, 2);  // MODE: float32
    putI(8, 4);
    putI(9, 4);
    putI(10, 4);
    putF(11, 4.0f);
    putF(12, 4.0f);
    putF(13, 4.0f);
    putF(14, 90.0f);
    putF(15, 90.0f);
    putF(16, 90.0f);
    putI(17, mapc);
    putI(18, mapr);
    putI(19, maps);
    putF(20, -1.0f);
    putF(21, 1.0f);
    putF(22, 0.0f);
    putI(23, 1);  // ISPG
    putI(24, 0);  // NSYMBT
    std::memcpy(&buf[208], "MAP ", 4);
    buf[212] = 0x44;  // MACHST: little endian
    buf[213] = 0x44;
    putF(55, 0.5f);  // RMS

    const int ntotal = (nc > 0 && nr > 0 && ns > 0) ? nc * nr * ns : 0;
    for (int i = 0; i < ntotal; ++i) {
        const float v = float(i % 5) - 2.0f;
        buf.append(reinterpret_cast<const char *>(&v), 4);
    }
    return buf;
}

bool readMrc(const std::string &image)
{
    qsys::ObjectPtr pObj(MB_NEW DensityMap());
    CCP4MapReader reader;
    reader.attach(pObj);
    StrInStream ins(image.data(), static_cast<int>(image.size()));
    const bool bOK = reader.read(ins);
    reader.detach();
    return bOK;
}

/// 80-character MTZ footer record.
std::string mtzRecord(const std::string &s)
{
    std::string r = s;
    r.resize(80, ' ');
    return r;
}

/// Minimal MTZ image: 80-byte header whose header-location word is nhdrst,
/// the reflection body that word implies, then the footer records.
std::string makeMtz(uint32_t nhdrst, const std::string &footer)
{
    std::string buf = "MTZ ";
    buf.append(reinterpret_cast<const char *>(&nhdrst), 4);
    unsigned char mtstring[4] = {0x41, 0x41, 0, 0};  // native int/float
    buf.append(reinterpret_cast<const char *>(mtstring), 4);
    buf.resize(80, '\0');
    if (nhdrst >= 21)
        buf.resize((nhdrst - 1) * 4, '\0');
    buf += footer;
    return buf;
}

bool readMtz(const std::string &image)
{
    qsys::ObjectPtr pObj(MB_NEW DensityMap());
    MTZ2MapReader reader;
    reader.attach(pObj);
    StrInStream ins(image.data(), static_cast<int>(image.size()));
    const bool bOK = reader.read(ins);
    reader.detach();
    return bOK;
}

}  // namespace

TEST(CCP4MapReaderValidation, ValidTinyMapLoads)
{
    EXPECT_TRUE(readMrc(makeMrc(4, 4, 4, 1, 2, 3)));
    EXPECT_TRUE(readMrc(makeMrc(4, 4, 4, 3, 1, 2)));
}

TEST(CCP4MapReaderValidation, AxisOrderMustBeAPermutation)
{
    // MAPC=MAPR=MAPS=0 (seen in broken MRC files) made rotate() write r[-1]
    EXPECT_THROW(readMrc(makeMrc(4, 4, 4, 0, 0, 0)), qlib::FileFormatException);
    EXPECT_THROW(readMrc(makeMrc(4, 4, 4, 1, 1, 2)), qlib::FileFormatException);
    EXPECT_THROW(readMrc(makeMrc(4, 4, 4, 1, 2, 4)), qlib::FileFormatException);
}

TEST(CCP4MapReaderValidation, ZeroMapSizeIsRejected)
{
    // NC=0 left the chunk arrays empty and sliceBytes() dereferenced them
    EXPECT_THROW(readMrc(makeMrc(0, 4, 4, 1, 2, 3)), qlib::FileFormatException);
    EXPECT_THROW(readMrc(makeMrc(4, 4, -1, 1, 2, 3)), qlib::FileFormatException);
}

TEST(MTZ2MapReaderValidation, HeaderLocationInsideHeaderIsRejected)
{
    // nhdrst < 21 made the body length negative
    EXPECT_THROW(readMtz(makeMtz(5, mtzRecord("END"))), qlib::FileFormatException);
}

TEST(MTZ2MapReaderValidation, BodyShorterThanNcolNreflIsRejected)
{
    // 10 words of body (40 bytes) but NCOL*NREFL = 5*100 floats
    std::string footer;
    footer += mtzRecord("NCOL 5 100 0");
    footer += mtzRecord("COLUMN H H 0 0");
    footer += mtzRecord("COLUMN K H 0 0");
    footer += mtzRecord("COLUMN L H 0 0");
    footer += mtzRecord("COLUMN FWT F 0 0");
    footer += mtzRecord("COLUMN PHWT P 0 0");
    footer += mtzRecord("END");
    EXPECT_THROW(readMtz(makeMtz(21 + 10, footer)), qlib::FileFormatException);
}
