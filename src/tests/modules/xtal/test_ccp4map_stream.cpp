// -*-Mode: C++;-*-
//
// Tests for the streaming CCP4/MRC reader: section-by-section decoding
// into the map storage must give the same samples as the historical
// whole-array path (setMapFloatArray) for every axis order, byte order
// and data mode; the quantization range comes from the header when it is
// valid, from a two-pass read when the source can seek, and from a
// buffered read otherwise; subsampling, the voxel guard and probeHeader.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/LExceptions.hpp>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>
#include "xtal/CCP4MapReader.hpp"
#include "xtal/DensityMap.hpp"

using qlib::LString;
using qlib::StrInStream;
using xtal::CCP4MapReader;
using xtal::DensityMap;

namespace {

struct MrcSpec {
    int nc, nr, ns;
    int mode;
    int start[3];
    int ncell[3];
    float cell[3];
    int axis[3];        // mapc, mapr, maps (1-based)
    int ispg;
    bool bigEndian;
    bool headerStats;   // write true DMIN/DMAX/DMEAN
    float fakeMin, fakeMax;  // used when headerStats is false and fake != 0
    std::vector<std::string> labels;

    MrcSpec()
    {
        nc = 6; nr = 5; ns = 4;
        mode = 2;
        start[0] = start[1] = start[2] = 0;
        ncell[0] = 6; ncell[1] = 5; ncell[2] = 4;
        cell[0] = 6.0f; cell[1] = 5.0f; cell[2] = 4.0f;
        axis[0] = 1; axis[1] = 2; axis[2] = 3;
        ispg = 1;
        bigEndian = false;
        headerStats = true;
        fakeMin = fakeMax = 0.0f;
    }
};

/// Sample value at file position (i, j, k) (crs order)
inline float sampleAt(int i, int j, int k)
{
    return 0.5f * float((i * 7 + j * 3 + k * 11) % 23) - 4.0f;
}

void putBytes(std::string &buf, size_t off, const void *p, size_t n, bool swap)
{
    const unsigned char *src = (const unsigned char *) p;
    for (size_t i = 0; i < n; ++i)
        buf[off + i] = char(swap ? src[n - 1 - i] : src[i]);
}

/// Complete MRC image (1024-byte header + samples) in the requested mode
std::string makeMrc(const MrcSpec &sp)
{
    std::string buf(1024, '\0');
    const bool swap = sp.bigEndian;  // host is little endian
    auto putI = [&](int word, int v) { putBytes(buf, (word - 1) * 4, &v, 4, swap); };
    auto putF = [&](int word, float v) { putBytes(buf, (word - 1) * 4, &v, 4, swap); };

    float vmin = 1e30f, vmax = -1e30f;
    double sum = 0.0;
    const size_t ntot = size_t(sp.nc) * sp.nr * sp.ns;
    for (int k = 0; k < sp.ns; ++k)
        for (int j = 0; j < sp.nr; ++j)
            for (int i = 0; i < sp.nc; ++i) {
                const float v = sampleAt(i, j, k);
                vmin = std::min(vmin, v);
                vmax = std::max(vmax, v);
                sum += v;
            }

    putI(1, sp.nc); putI(2, sp.nr); putI(3, sp.ns);
    putI(4, sp.mode);
    putI(5, sp.start[0]); putI(6, sp.start[1]); putI(7, sp.start[2]);
    putI(8, sp.ncell[0]); putI(9, sp.ncell[1]); putI(10, sp.ncell[2]);
    putF(11, sp.cell[0]); putF(12, sp.cell[1]); putF(13, sp.cell[2]);
    putF(14, 90.0f); putF(15, 90.0f); putF(16, 90.0f);
    putI(17, sp.axis[0]); putI(18, sp.axis[1]); putI(19, sp.axis[2]);
    if (sp.headerStats) {
        putF(20, vmin); putF(21, vmax); putF(22, float(sum / double(ntot)));
    }
    else if (sp.fakeMin != 0.0f || sp.fakeMax != 0.0f) {
        putF(20, sp.fakeMin); putF(21, sp.fakeMax); putF(22, 0.5f * (sp.fakeMin + sp.fakeMax));
    }
    else {
        // DMIN > DMAX: invalid statistics
        putF(20, 1.0f); putF(21, -1.0f); putF(22, 0.0f);
    }
    putI(23, sp.ispg);
    putI(24, 0);
    std::memcpy(&buf[208], "MAP ", 4);
    if (swap) { buf[212] = 0x11; buf[213] = 0x11; }
    else { buf[212] = 0x44; buf[213] = 0x44; }
    putF(55, 1.0f);  // RMS
    putI(56, int(sp.labels.size()));
    for (size_t i = 0; i < sp.labels.size() && i < 10; ++i) {
        std::string l = sp.labels[i];
        l.resize(80, ' ');
        std::memcpy(&buf[224 + i * 80], l.data(), 80);
    }

    // samples in crs order
    for (int k = 0; k < sp.ns; ++k)
        for (int j = 0; j < sp.nr; ++j)
            for (int i = 0; i < sp.nc; ++i) {
                const float v = sampleAt(i, j, k);
                std::string e;
                if (sp.mode == 2) {
                    e.assign(4, '\0');
                    putBytes(e, 0, &v, 4, swap);
                }
                else if (sp.mode == 1) {
                    const int16_t s = int16_t(std::lround(v * 100.0f));
                    e.assign(2, '\0');
                    putBytes(e, 0, &s, 2, swap);
                }
                else if (sp.mode == 6) {
                    const uint16_t s = uint16_t(std::lround((v + 4.0f) * 100.0f));
                    e.assign(2, '\0');
                    putBytes(e, 0, &s, 2, swap);
                }
                else if (sp.mode == 0) {
                    // mode 0 is unsigned unless the IMOD stamp says otherwise
                    const uint8_t s = uint8_t(std::lround((v + 4.0f) * 10.0f));
                    e.assign(1, char(s));
                }
                buf += e;
            }
    return buf;
}

/// Reference map through the historical whole-array path
DensityMap *makeReference(const MrcSpec &sp, qsys::ObjectPtr &rpObj, float scale = 1.0f,
                          float offset = 0.0f)
{
    std::vector<float> data(size_t(sp.nc) * sp.nr * sp.ns);
    for (int k = 0; k < sp.ns; ++k)
        for (int j = 0; j < sp.nr; ++j)
            for (int i = 0; i < sp.nc; ++i)
                data[size_t(i) + (size_t(j) + size_t(k) * sp.nr) * sp.nc] =
                    sampleAt(i, j, k) * scale + offset;
    DensityMap *pMap = MB_NEW DensityMap();
    rpObj = qsys::ObjectPtr(pMap);
    pMap->setMapFloatArray(data.data(), sp.nc, sp.nr, sp.ns,
                           sp.axis[0] - 1, sp.axis[1] - 1, sp.axis[2] - 1);
    return pMap;
}

DensityMap *readImage(const std::string &image, qsys::ObjectPtr &rpObj,
                      CCP4MapReader *pReader = NULL)
{
    DensityMap *pMap = MB_NEW DensityMap();
    rpObj = qsys::ObjectPtr(pMap);
    CCP4MapReader local;
    CCP4MapReader &reader = pReader ? *pReader : local;
    reader.attach(rpObj);
    StrInStream ins(image.data(), static_cast<int>(image.size()));
    const bool bOK = reader.read(ins);
    reader.detach();
    return bOK ? pMap : NULL;
}

void expectSameSamples(const DensityMap &a, const DensityMap &b, int tolByte = 0)
{
    ASSERT_EQ(a.getColNo(), b.getColNo());
    ASSERT_EQ(a.getRowNo(), b.getRowNo());
    ASSERT_EQ(a.getSecNo(), b.getSecNo());
    EXPECT_NEAR(a.getLevelBase(), b.getLevelBase(), 1e-5);
    EXPECT_NEAR(a.getLevelStep(), b.getLevelStep(), 1e-7);
    for (int k = 0; k < a.getSecNo(); ++k)
        for (int j = 0; j < a.getRowNo(); ++j)
            for (int i = 0; i < a.getColNo(); ++i) {
                const int d = int(a.atByte(i, j, k)) - int(b.atByte(i, j, k));
                ASSERT_LE(std::abs(d), tolByte) << "at " << i << "," << j << "," << k;
            }
}

LString writeTempFile(const std::string &payload, const char *suffix)
{
    static int s_counter = 0;
    const std::string path =
        ::testing::TempDir() + "/ccp4stream_" + std::to_string(++s_counter) + suffix;
    std::ofstream out(path, std::ios::binary);
    out.write(payload.data(), static_cast<std::streamsize>(payload.size()));
    out.close();
    return LString(path.c_str());
}

}  // namespace

// Every axis order gives the same stored samples as the whole-array path
// (which performs the same permutation).
TEST(CCP4MapStream, AxisOrdersMatchReference)
{
    const int orders[6][3] = {{1, 2, 3}, {2, 1, 3}, {3, 1, 2}, {1, 3, 2}, {2, 3, 1}, {3, 2, 1}};
    for (int o = 0; o < 6; ++o) {
        MrcSpec sp;
        sp.axis[0] = orders[o][0];
        sp.axis[1] = orders[o][1];
        sp.axis[2] = orders[o][2];
        qsys::ObjectPtr pRefObj, pObj;
        DensityMap *pRef = makeReference(sp, pRefObj);
        DensityMap *pMap = readImage(makeMrc(sp), pObj);
        ASSERT_NE(pMap, nullptr) << "order " << o;
        expectSameSamples(*pMap, *pRef);
        EXPECT_NEAR(pMap->getMinDensity(), pRef->getMinDensity(), 1e-6);
        EXPECT_NEAR(pMap->getMaxDensity(), pRef->getMaxDensity(), 1e-6);
        EXPECT_NEAR(pMap->getMeanDensity(), pRef->getMeanDensity(), 1e-5);
        EXPECT_NEAR(pMap->getRmsdDensity(), pRef->getRmsdDensity(), 1e-5);
    }
}

TEST(CCP4MapStream, BigEndianFile)
{
    MrcSpec sp;
    sp.bigEndian = true;
    sp.axis[0] = 2; sp.axis[1] = 1; sp.axis[2] = 3;
    qsys::ObjectPtr pRefObj, pObj;
    DensityMap *pRef = makeReference(sp, pRefObj);
    DensityMap *pMap = readImage(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);
    expectSameSamples(*pMap, *pRef);
}

// int16 / uint16 / int8 modes decode to the scaled values
TEST(CCP4MapStream, IntegerModes)
{
    {
        MrcSpec sp;
        sp.mode = 1;
        qsys::ObjectPtr pRefObj, pObj;
        DensityMap *pRef = makeReference(sp, pRefObj, 100.0f);
        DensityMap *pMap = readImage(makeMrc(sp), pObj);
        ASSERT_NE(pMap, nullptr);
        expectSameSamples(*pMap, *pRef);
    }
    {
        MrcSpec sp;
        sp.mode = 6;
        qsys::ObjectPtr pRefObj, pObj;
        DensityMap *pRef = makeReference(sp, pRefObj, 100.0f, 400.0f);
        DensityMap *pMap = readImage(makeMrc(sp), pObj);
        ASSERT_NE(pMap, nullptr);
        expectSameSamples(*pMap, *pRef);
    }
    {
        MrcSpec sp;
        sp.mode = 0;
        qsys::ObjectPtr pRefObj, pObj;
        DensityMap *pRef = makeReference(sp, pRefObj, 10.0f, 40.0f);
        DensityMap *pMap = readImage(makeMrc(sp), pObj);
        ASSERT_NE(pMap, nullptr);
        // uint8 rounding of (v+4)*10 loses up to half a unit per sample
        expectSameSamples(*pMap, *pRef, 1);
    }
}

TEST(CCP4MapStream, UnsupportedModeThrows)
{
    MrcSpec sp;
    sp.mode = 4;
    qsys::ObjectPtr pObj;
    EXPECT_THROW(readImage(makeMrc(sp), pObj), qlib::FileFormatException);
}

// Invalid header statistics on a seekable source: two-pass read gives
// the measured range.
TEST(CCP4MapStream, InvalidHeaderStatsTwoPass)
{
    MrcSpec sp;
    sp.headerStats = false;
    qsys::ObjectPtr pRefObj, pObj;
    DensityMap *pRef = makeReference(sp, pRefObj);
    DensityMap *pMap = readImage(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);
    expectSameSamples(*pMap, *pRef);
}

// Header statistics that do not cover the data are detected after the
// first pass and the map is re-read with the measured range.
TEST(CCP4MapStream, LyingHeaderStatsRereadOnSeekable)
{
    MrcSpec sp;
    sp.headerStats = false;
    sp.fakeMin = -1.0f;
    sp.fakeMax = 1.0f;
    qsys::ObjectPtr pRefObj, pObj;
    DensityMap *pRef = makeReference(sp, pRefObj);
    DensityMap *pMap = readImage(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);
    expectSameSamples(*pMap, *pRef);
    EXPECT_NEAR(pMap->getMaxDensity(), pRef->getMaxDensity(), 1e-6);
}

// A gzip source cannot seek: the decoded map is buffered and the result
// is still the reference.
TEST(CCP4MapStream, GzipSourceBuffered)
{
    MrcSpec sp;
    sp.headerStats = false;
    sp.axis[0] = 3; sp.axis[1] = 1; sp.axis[2] = 2;
    const std::string image = makeMrc(sp);

    // gzip the image with the library's own stream
    const LString rawPath = writeTempFile(image, ".map");
    const LString gzPath = writeTempFile(std::string(), ".map.gz");
    {
        qlib::FileOutStream fos;
        fos.open(gzPath);
        qlib::GzipOutStream gz(fos);
        gz.write(image.data(), 0, int(image.size()));
        gz.close();
        fos.close();
    }

    qsys::ObjectPtr pRefObj, pObj;
    DensityMap *pRef = makeReference(sp, pRefObj);

    DensityMap *pMap = MB_NEW DensityMap();
    pObj = qsys::ObjectPtr(pMap);
    CCP4MapReader reader;
    reader.attach(pObj);
    qlib::FileInStream fis;
    fis.open(gzPath);
    qlib::GzipInStream gz(fis);
    ASSERT_FALSE(gz.isSeekable());
    ASSERT_TRUE(reader.read(gz));
    reader.detach();
    fis.close();

    expectSameSamples(*pMap, *pRef);
}

TEST(CCP4MapStream, TruncateAndNormalizeMatchReference)
{
    MrcSpec sp;
    // reference: clamp to [-2*rms, 2*rms] (rms in the header is 1.0) and
    // normalize by (v - mean)/rms with the header mean
    std::vector<float> data(size_t(sp.nc) * sp.nr * sp.ns);
    double sum = 0.0;
    for (size_t idx = 0; idx < data.size(); ++idx) {
        const int i = int(idx % sp.nc), j = int((idx / sp.nc) % sp.nr), k = int(idx / (sp.nc * sp.nr));
        data[idx] = sampleAt(i, j, k);
        sum += data[idx];
    }
    const float mean = float(sum / double(data.size()));
    for (size_t idx = 0; idx < data.size(); ++idx) {
        float v = data[idx];
        v = std::max(v, -2.0f);
        v = std::min(v, 2.0f);
        data[idx] = (v - mean) / 1.0f;
    }
    qsys::ObjectPtr pRefObj(MB_NEW DensityMap());
    DensityMap *pRef = static_cast<DensityMap *>(pRefObj.get());
    pRef->setMapFloatArray(data.data(), sp.nc, sp.nr, sp.ns, 0, 1, 2);

    CCP4MapReader reader;
    reader.setProperty("truncate_min", qlib::LVariant(true));
    reader.setProperty("min", qlib::LVariant(-2.0));
    reader.setProperty("truncate_max", qlib::LVariant(true));
    reader.setProperty("max", qlib::LVariant(2.0));
    reader.setProperty("normalize", qlib::LVariant(true));
    qsys::ObjectPtr pObj;
    DensityMap *pMap = readImage(makeMrc(sp), pObj, &reader);
    ASSERT_NE(pMap, nullptr);
    expectSameSamples(*pMap, *pRef, 1);
}

TEST(CCP4MapStream, Subsample)
{
    MrcSpec sp;
    sp.nc = 8; sp.nr = 6; sp.ns = 4;
    sp.ncell[0] = 8; sp.ncell[1] = 6; sp.ncell[2] = 4;
    sp.cell[0] = 8.0f; sp.cell[1] = 6.0f; sp.cell[2] = 4.0f;
    sp.start[0] = 2; sp.start[1] = 0; sp.start[2] = 0;
    sp.axis[0] = 2; sp.axis[1] = 1; sp.axis[2] = 3;

    qsys::ObjectPtr pFullObj, pObj;
    DensityMap *pFull = readImage(makeMrc(sp), pFullObj);
    ASSERT_NE(pFull, nullptr);

    CCP4MapReader reader;
    reader.setProperty("subsample", qlib::LVariant(2));
    DensityMap *pMap = readImage(makeMrc(sp), pObj, &reader);
    ASSERT_NE(pMap, nullptr);

    // rotated storage: (row, col, sec) file axes -> x = file row
    EXPECT_EQ(pMap->getColNo(), pFull->getColNo() / 2);
    EXPECT_EQ(pMap->getRowNo(), pFull->getRowNo() / 2);
    EXPECT_EQ(pMap->getSecNo(), pFull->getSecNo() / 2);
    EXPECT_EQ(pMap->getColInterval(), pFull->getColInterval() / 2);
    EXPECT_EQ(pMap->getStartRow(), pFull->getStartRow() / 2);
    EXPECT_NEAR(pMap->getColGridSize(), 2.0 * pFull->getColGridSize(), 1e-9);
    for (int k = 0; k < pMap->getSecNo(); ++k)
        for (int j = 0; j < pMap->getRowNo(); ++j)
            for (int i = 0; i < pMap->getColNo(); ++i)
                EXPECT_NEAR(pMap->atFloat(i, j, k), pFull->atFloat(2 * i, 2 * j, 2 * k),
                            pFull->getLevelStep() + 1e-6);

    // a size the step does not divide is refused
    CCP4MapReader bad;
    bad.setProperty("subsample", qlib::LVariant(3));
    qsys::ObjectPtr pObj2;
    EXPECT_THROW(readImage(makeMrc(sp), pObj2, &bad), qlib::FileFormatException);
}

TEST(CCP4MapStream, MaxVoxelsGuard)
{
    MrcSpec sp;
    CCP4MapReader reader;
    reader.setProperty("max_voxels", qlib::LVariant(50.0));
    qsys::ObjectPtr pObj;
    EXPECT_THROW(readImage(makeMrc(sp), pObj, &reader), qlib::FileFormatException);
    reader.setProperty("max_voxels", qlib::LVariant(200.0));
    EXPECT_NE(readImage(makeMrc(sp), pObj, &reader), nullptr);
}

TEST(CCP4MapStream, ProbeHeader)
{
    MrcSpec sp;
    sp.ispg = 0;
    sp.labels.push_back("::::EMDataBank.org::::EMD-1::::");
    const LString path = writeTempFile(makeMrc(sp), ".mrc");
    CCP4MapReader reader;
    const std::string json(reader.probeHeader(path).c_str());
    EXPECT_NE(json.find("\"nc\":6"), std::string::npos);
    EXPECT_NE(json.find("\"nr\":5"), std::string::npos);
    EXPECT_NE(json.find("\"ns\":4"), std::string::npos);
    EXPECT_NE(json.find("\"mode\":2"), std::string::npos);
    EXPECT_NE(json.find("\"nvoxels\":120"), std::string::npos);
    EXPECT_NE(json.find("\"ispg\":0"), std::string::npos);
    EXPECT_NE(json.find("\"supported\":true"), std::string::npos);
}
