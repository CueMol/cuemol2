// -*-Mode: C++;-*-
//
// Round trip of a DensityMap through the QDF map chunk (QdfDenMapWriter /
// QdfDenMapReader): every sample, the statistics, the grid placement, the
// detected map kind and the origin must survive; the sample block is
// written as fixed records section by section.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/Vector4D.hpp>
#include <string>
#include <vector>
#include "xtal/DensityMap.hpp"
#include "xtal/QdfDenMapReader.hpp"
#include "xtal/QdfDenMapWriter.hpp"

using qlib::LString;
using qlib::StrInStream;
using qlib::StrOutStream;
using qlib::Vector4D;
using xtal::DensityMap;
using xtal::QdfDenMapReader;
using xtal::QdfDenMapWriter;

namespace {

DensityMap *makeMap(qsys::ObjectPtr &rpObj)
{
    const int nc = 5, nr = 4, ns = 3;
    std::vector<float> data(size_t(nc) * nr * ns);
    for (size_t i = 0; i < data.size(); ++i)
        data[i] = 0.25f * float((i * 11) % 17) - 1.0f;
    DensityMap *pMap = MB_NEW DensityMap();
    rpObj = qsys::ObjectPtr(pMap);
    pMap->setMapFloatArray(data.data(), nc, nr, ns, 0, 1, 2);
    pMap->setMapParams(2, -1, 3, 10, 8, 6);
    pMap->setXtalParams(10.0, 8.0, 6.0, 90.0, 90.0, 120.0, 5);
    return pMap;
}

/// Write the map; chunkLimit lowers the records-per-chunk limit of the
/// writer (0 keeps the default) to force the split MAP2 layout
std::string writeQdf(const qsys::ObjectPtr &pObj, size_t chunkLimit = 0)
{
    QdfDenMapWriter writer;
    if (chunkLimit > 0) writer.setChunkLimit(chunkLimit);
    writer.attach(pObj);
    StrOutStream outs;
    writer.write(outs);
    writer.detach();
    outs.close();
    int nsize = 0;
    char *p = outs.getData(nsize);
    std::string s(p, size_t(nsize));
    delete[] p;
    return s;
}

DensityMap *readQdf(const std::string &image, qsys::ObjectPtr &rpObj)
{
    DensityMap *pMap = MB_NEW DensityMap();
    rpObj = qsys::ObjectPtr(pMap);
    QdfDenMapReader reader;
    reader.attach(rpObj);
    StrInStream ins(image.data(), int(image.size()));
    const bool bOK = reader.read(ins);
    reader.detach();
    return bOK ? pMap : NULL;
}

}  // namespace

TEST(QdfMapRoundTrip, SamplesStatsAndPlacement)
{
    qsys::ObjectPtr pSrcObj, pDstObj;
    DensityMap *pSrc = makeMap(pSrcObj);
    DensityMap *pDst = readQdf(writeQdf(pSrcObj), pDstObj);
    ASSERT_NE(pDst, nullptr);

    ASSERT_EQ(pDst->getColNo(), pSrc->getColNo());
    ASSERT_EQ(pDst->getRowNo(), pSrc->getRowNo());
    ASSERT_EQ(pDst->getSecNo(), pSrc->getSecNo());
    for (int k = 0; k < pSrc->getSecNo(); ++k)
        for (int j = 0; j < pSrc->getRowNo(); ++j)
            for (int i = 0; i < pSrc->getColNo(); ++i)
                ASSERT_EQ(pDst->atByte(i, j, k), pSrc->atByte(i, j, k))
                    << "at " << i << "," << j << "," << k;

    // statistics travel as float32
    EXPECT_NEAR(pDst->getMinDensity(), pSrc->getMinDensity(), 1e-6);
    EXPECT_NEAR(pDst->getMaxDensity(), pSrc->getMaxDensity(), 1e-6);
    EXPECT_NEAR(pDst->getMeanDensity(), pSrc->getMeanDensity(), 1e-6);
    EXPECT_NEAR(pDst->getRmsdDensity(), pSrc->getRmsdDensity(), 1e-6);
    EXPECT_NEAR(pDst->getLevelBase(), pSrc->getLevelBase(), 1e-6);
    EXPECT_NEAR(pDst->getLevelStep(), pSrc->getLevelStep(), 1e-8);

    EXPECT_EQ(pDst->getStartCol(), 2);
    EXPECT_EQ(pDst->getStartRow(), -1);
    EXPECT_EQ(pDst->getStartSec(), 3);
    EXPECT_EQ(pDst->getColInterval(), 10);
    EXPECT_EQ(pDst->getRowInterval(), 8);
    EXPECT_EQ(pDst->getSecInterval(), 6);
    EXPECT_NEAR(pDst->getXtalInfo().gamma(), 120.0, 1e-4);
    EXPECT_EQ(pDst->getXtalInfo().getSG(), 5);
}

TEST(QdfMapRoundTrip, MapKindAndOrigin)
{
    qsys::ObjectPtr pSrcObj, pDstObj;
    DensityMap *pSrc = makeMap(pSrcObj);
    pSrc->setDetectedMapType(DensityMap::MAPTYPE_EM);
    pSrc->setOrigin(Vector4D(12.5, -3.0, 40.0));

    DensityMap *pDst = readQdf(writeQdf(pSrcObj), pDstObj);
    ASSERT_NE(pDst, nullptr);
    EXPECT_EQ(pDst->getDetectedMapType(), DensityMap::MAPTYPE_EM);
    EXPECT_EQ(std::string(pDst->getMapTypeResolvedStr().c_str()), "em");
    const Vector4D o = pDst->getOrigin();
    EXPECT_NEAR(o.x(), 12.5, 1e-6);
    EXPECT_NEAR(o.y(), -3.0, 1e-6);
    EXPECT_NEAR(o.z(), 40.0, 1e-6);

    // the default (crystallographic, zero origin) round-trips as well
    qsys::ObjectPtr pSrc2Obj, pDst2Obj;
    makeMap(pSrc2Obj);
    DensityMap *pDst2 = readQdf(writeQdf(pSrc2Obj), pDst2Obj);
    ASSERT_NE(pDst2, nullptr);
    EXPECT_EQ(pDst2->getDetectedMapType(), DensityMap::MAPTYPE_XTAL);
    EXPECT_TRUE(pDst2->getOrigin().isZero3D());
}

// The default writer keeps the single-chunk MAP1 layout.
TEST(QdfMapRoundTrip, DefaultLayoutIsMap1)
{
    qsys::ObjectPtr pSrcObj;
    makeMap(pSrcObj);
    const std::string image = writeQdf(pSrcObj);
    EXPECT_NE(image.find("MAP1"), std::string::npos);
    EXPECT_EQ(image.find("MAP2"), std::string::npos);
}

// A map with more voxels than one chunk holds is written as MAP2 with the
// samples split into whole-section chunks, and reads back identically.
// The 5x4x3 map (20 samples per section, 60 in total) splits into 2 + 1
// sections under a 40-record limit and into three chunks under 20.
TEST(QdfMapRoundTrip, SplitChunksRoundTrip)
{
    const size_t limits[2] = {40, 20};
    for (size_t il = 0; il < 2; ++il) {
        qsys::ObjectPtr pSrcObj, pDstObj;
        DensityMap *pSrc = makeMap(pSrcObj);
        pSrc->setDetectedMapType(DensityMap::MAPTYPE_EM);
        pSrc->setOrigin(Vector4D(1.0, 2.0, 3.0));

        const std::string image = writeQdf(pSrcObj, limits[il]);
        EXPECT_NE(image.find("MAP2"), std::string::npos) << "limit " << limits[il];
        EXPECT_EQ(image.find("MAP1"), std::string::npos) << "limit " << limits[il];

        DensityMap *pDst = readQdf(image, pDstObj);
        ASSERT_NE(pDst, nullptr) << "limit " << limits[il];
        ASSERT_EQ(pDst->getSecNo(), pSrc->getSecNo());
        for (int k = 0; k < pSrc->getSecNo(); ++k)
            for (int j = 0; j < pSrc->getRowNo(); ++j)
                for (int i = 0; i < pSrc->getColNo(); ++i)
                    ASSERT_EQ(pDst->atByte(i, j, k), pSrc->atByte(i, j, k))
                        << "limit " << limits[il] << " at " << i << "," << j << "," << k;
        EXPECT_NEAR(pDst->getRmsdDensity(), pSrc->getRmsdDensity(), 1e-6);
        EXPECT_EQ(pDst->getStartRow(), -1);
        EXPECT_EQ(pDst->getDetectedMapType(), DensityMap::MAPTYPE_EM);
        EXPECT_NEAR(pDst->getOrigin().z(), 3.0, 1e-6);
    }
}

// A section that does not fit one chunk cannot be written.
TEST(QdfMapRoundTrip, SectionLargerThanChunkThrows)
{
    qsys::ObjectPtr pSrcObj;
    makeMap(pSrcObj);
    QdfDenMapWriter writer;
    writer.setChunkLimit(10);   // 20 samples per section
    writer.attach(pSrcObj);
    StrOutStream outs;
    EXPECT_THROW(writer.write(outs), qlib::FileFormatException);
    writer.detach();
}
