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

std::string writeQdf(const qsys::ObjectPtr &pObj)
{
    QdfDenMapWriter writer;
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
