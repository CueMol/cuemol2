// -*-Mode: C++;-*-
//
// BrixMapReader: the density statistics and the value range must follow
// the byte-to-density mapping of the format (BRIX: rho = (b - plus) / prod,
// DSN6: rho = dmin + b * byteFactor).
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/StringStream.hpp>
#include <qsys/Object.hpp>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include "xtal/BrixMapReader.hpp"
#include "xtal/DensityMap.hpp"

using qlib::StrInStream;
using xtal::BrixMapReader;
using xtal::DensityMap;

namespace {

// One 8x8x8 brick: the first half of the voxels hold lo, the rest hi.
std::string makeBrick(unsigned char lo, unsigned char hi)
{
    std::string brick(512, '\0');
    for (int i = 0; i < 512; ++i) brick[i] = char(i < 256 ? lo : hi);
    return brick;
}

std::string makeBrixImage(double prod, double plus, unsigned char lo, unsigned char hi)
{
    char hdr[600];
    std::snprintf(hdr, sizeof(hdr),
                  ":-) Origin 0 0 0 Extent 8 8 8 Grid 8 8 8 "
                  "Cell 10.0 10.0 10.0 90.0 90.0 90.0 Prod %.4f Plus %.4f Sigma 1.0 ",
                  prod, plus);
    std::string image(hdr);
    image.resize(512, ' ');
    return image + makeBrick(lo, hi);
}

void putInt16(std::string &buf, int index, int value)
{
    const uint16_t u = uint16_t(int16_t(value));
    buf[index * 2] = char(u & 0xff);
    buf[index * 2 + 1] = char((u >> 8) & 0xff);
}

// DSN6 header words (little-endian int16): origin, extent, grid, cell*scale,
// 100*255/(dmax-dmin), -255*dmin/(dmax-dmin), scale, 100.
std::string makeDsn6Image(double dmin, double dmax, unsigned char lo, unsigned char hi)
{
    std::string hdr(512, '\0');
    const int scale = 100;
    const double range = dmax - dmin;
    int w = 0;
    putInt16(hdr, w++, 0); putInt16(hdr, w++, 0); putInt16(hdr, w++, 0);
    putInt16(hdr, w++, 8); putInt16(hdr, w++, 8); putInt16(hdr, w++, 8);
    putInt16(hdr, w++, 8); putInt16(hdr, w++, 8); putInt16(hdr, w++, 8);
    for (int i = 0; i < 3; ++i) putInt16(hdr, w++, 10 * scale);
    for (int i = 0; i < 3; ++i) putInt16(hdr, w++, 90 * scale);
    putInt16(hdr, w++, int(100.0 * 255.0 / range + 0.5));
    putInt16(hdr, w++, int(-255.0 * dmin / range + 0.5));
    putInt16(hdr, w++, scale);
    putInt16(hdr, w++, 100);
    return hdr + makeBrick(lo, hi);
}

DensityMap *readImage(const std::string &image, qsys::ObjectPtr &rpObj)
{
    DensityMap *pMap = MB_NEW DensityMap();
    rpObj = qsys::ObjectPtr(pMap);
    BrixMapReader reader;
    reader.attach(rpObj);
    StrInStream ins(image.data(), static_cast<int>(image.size()));
    const bool bOK = reader.read(ins);
    reader.detach();
    return bOK ? pMap : NULL;
}

}  // namespace

TEST(BrixMapReader, BrixStatisticsFollowByteMapping)
{
    // prod 10, plus 100: bytes 90 / 110 are densities -1 / +1
    qsys::ObjectPtr pObj;
    DensityMap *pMap = readImage(makeBrixImage(10.0, 100.0, 90, 110), pObj);
    ASSERT_NE(pMap, nullptr);

    EXPECT_NEAR(pMap->getMinDensity(), -10.0, 1e-6);   // byte 0
    EXPECT_NEAR(pMap->getMaxDensity(), 15.5, 1e-6);    // byte 255
    EXPECT_NEAR(pMap->getMeanDensity(), 0.0, 1e-6);
    EXPECT_NEAR(pMap->getRmsdDensity(), 1.0, 1e-6);
    EXPECT_EQ(pMap->getColNo(), 8);
    EXPECT_EQ(pMap->getRowNo(), 8);
    EXPECT_EQ(pMap->getSecNo(), 8);
}

TEST(BrixMapReader, Dsn6RangeAndStatisticsFollowHeader)
{
    // dmin -1, dmax 1.55: byte 0 is -1, byte 200 is +1
    qsys::ObjectPtr pObj;
    DensityMap *pMap = readImage(makeDsn6Image(-1.0, 1.55, 0, 200), pObj);
    ASSERT_NE(pMap, nullptr);

    EXPECT_NEAR(pMap->getMinDensity(), -1.0, 1e-3);
    EXPECT_NEAR(pMap->getMaxDensity(), 1.55, 1e-3);
    EXPECT_NEAR(pMap->getMeanDensity(), 0.0, 1e-3);
    EXPECT_NEAR(pMap->getRmsdDensity(), 1.0, 1e-3);
}

TEST(BrixMapReader, ZeroProdIsRejected)
{
    qsys::ObjectPtr pObj;
    EXPECT_EQ(readImage(makeBrixImage(0.0, 100.0, 90, 110), pObj), nullptr);
}
