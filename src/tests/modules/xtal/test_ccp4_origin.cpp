// -*-Mode: C++;-*-
//
// Tests for the CCP4/MRC reader's map kind detection and MRC2014 ORIGIN
// handling, on minimal in-memory MRC files (1024-byte header + float
// data in native byte order).
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/Vector4D.hpp>
#include <cstring>
#include <string>
#include <vector>
#include "xtal/CCP4MapReader.hpp"
#include "xtal/DensityMap.hpp"

using qlib::LString;
using qlib::StrInStream;
using qlib::Vector4D;
using xtal::CCP4MapReader;
using xtal::DensityMap;

namespace {

struct MrcSpec {
    int nc, nr, ns;
    int start[3];
    int ncell[3];
    float cell[3];
    float ang[3];
    int ispg;
    int nversion;
    const char *exttyp;
    float origin[3];
    std::vector<std::string> labels;

    MrcSpec()
    {
        nc = nr = ns = 4;
        start[0] = start[1] = start[2] = 0;
        ncell[0] = ncell[1] = ncell[2] = 4;
        cell[0] = cell[1] = cell[2] = 4.0f;
        ang[0] = ang[1] = ang[2] = 90.0f;
        ispg = 1;
        nversion = 0;
        exttyp = NULL;
        origin[0] = origin[1] = origin[2] = 0.0f;
    }
};

/// Build a complete MRC file image: 1024-byte header (mode 2, axis order
/// 1,2,3, no symmetry records) followed by nc*nr*ns floats.
std::string makeMrc(const MrcSpec &sp)
{
    std::string buf(1024, '\0');
    auto putI = [&](int word, int v) { std::memcpy(&buf[(word - 1) * 4], &v, 4); };
    auto putF = [&](int word, float v) { std::memcpy(&buf[(word - 1) * 4], &v, 4); };

    putI(1, sp.nc);
    putI(2, sp.nr);
    putI(3, sp.ns);
    putI(4, 2);  // MODE: float32
    putI(5, sp.start[0]);
    putI(6, sp.start[1]);
    putI(7, sp.start[2]);
    putI(8, sp.ncell[0]);
    putI(9, sp.ncell[1]);
    putI(10, sp.ncell[2]);
    putF(11, sp.cell[0]);
    putF(12, sp.cell[1]);
    putF(13, sp.cell[2]);
    putF(14, sp.ang[0]);
    putF(15, sp.ang[1]);
    putF(16, sp.ang[2]);
    putI(17, 1);
    putI(18, 2);
    putI(19, 3);
    putF(20, -1.0f);
    putF(21, 1.0f);
    putF(22, 0.0f);
    putI(23, sp.ispg);
    putI(24, 0);  // NSYMBT
    if (sp.exttyp != NULL)
        std::memcpy(&buf[(27 - 1) * 4], sp.exttyp, 4);
    putI(28, sp.nversion);
    putF(50, sp.origin[0]);
    putF(51, sp.origin[1]);
    putF(52, sp.origin[2]);
    std::memcpy(&buf[208], "MAP ", 4);
    buf[212] = 0x44;  // MACHST: little endian
    buf[213] = 0x44;
    putF(55, 0.5f);  // RMS
    putI(56, int(sp.labels.size()));
    for (size_t i = 0; i < sp.labels.size() && i < 10; ++i) {
        std::string l = sp.labels[i];
        l.resize(80, ' ');
        std::memcpy(&buf[224 + i * 80], l.data(), 80);
    }

    // data: a smooth ramp so the map has non-degenerate statistics
    const int ntotal = sp.nc * sp.nr * sp.ns;
    for (int i = 0; i < ntotal; ++i) {
        const float v = float(i % 5) - 2.0f;
        buf.append(reinterpret_cast<const char *>(&v), 4);
    }
    return buf;
}

/// Read the MRC image into a fresh DensityMap; returns the map (owned by
/// the ObjectPtr passed back through rpObj).
DensityMap *readMrc(const std::string &image, qsys::ObjectPtr &rpObj)
{
    DensityMap *pMap = MB_NEW DensityMap();
    rpObj = qsys::ObjectPtr(pMap);

    CCP4MapReader reader;
    reader.attach(rpObj);
    StrInStream ins(image.data(), static_cast<int>(image.size()));
    const bool bOK = reader.read(ins);
    reader.detach();
    if (!bOK)
        return NULL;
    return pMap;
}

}  // namespace

// A cropped crystallographic block: the start indices place it, no
// origin, periodic.
TEST(CCP4MapOrigin, CrystalMapKeepsStartIndices)
{
    MrcSpec sp;
    sp.ispg = 19;
    sp.start[0] = 3;
    sp.start[1] = 4;
    sp.start[2] = 5;
    sp.ncell[0] = sp.ncell[1] = sp.ncell[2] = 24;
    sp.cell[0] = sp.cell[1] = sp.cell[2] = 24.0f;

    qsys::ObjectPtr pObj;
    DensityMap *pMap = readMrc(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);

    EXPECT_EQ(std::string(pMap->getMapTypeResolvedStr().c_str()), "xtal");
    EXPECT_TRUE(pMap->isPeriodic());
    EXPECT_EQ(pMap->getStartCol(), 3);
    EXPECT_EQ(pMap->getStartRow(), 4);
    EXPECT_EQ(pMap->getStartSec(), 5);
    EXPECT_TRUE(pMap->getOrigin().isZero3D());
    EXPECT_EQ(pMap->getColNo(), 4);
    EXPECT_EQ(pMap->getColInterval(), 24);
}

// An MRC2014 cryo-EM volume with ORIGIN: the map is non-periodic and grid
// index (0,0,0) sits at ORIGIN.
TEST(CCP4MapOrigin, EMMapUsesOrigin)
{
    MrcSpec sp;
    sp.ispg = 1;
    sp.nversion = 20140;
    sp.exttyp = "MRCO";
    sp.origin[0] = 10.0f;
    sp.origin[1] = 20.0f;
    sp.origin[2] = 30.0f;

    qsys::ObjectPtr pObj;
    DensityMap *pMap = readMrc(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);

    EXPECT_EQ(std::string(pMap->getMapTypeResolvedStr().c_str()), "em");
    EXPECT_FALSE(pMap->isPeriodic());
    const Vector4D o = pMap->getOrigin();
    EXPECT_NEAR(o.x(), 10.0, 1e-6);
    EXPECT_NEAR(o.y(), 20.0, 1e-6);
    EXPECT_NEAR(o.z(), 30.0, 1e-6);

    const Vector4D p0 = pMap->convToOrth(Vector4D(0, 0, 0));
    EXPECT_NEAR(p0.x(), 10.0, 1e-6);
    EXPECT_NEAR(p0.y(), 20.0, 1e-6);
    EXPECT_NEAR(p0.z(), 30.0, 1e-6);

    // 4-grid, 4 A cell: 1 A spacing, block center 2 A from the origin
    const Vector4D c = pMap->getCenter();
    EXPECT_NEAR(c.x(), 12.0, 1e-6);
    EXPECT_NEAR(c.y(), 22.0, 1e-6);
    EXPECT_NEAR(c.z(), 32.0, 1e-6);
}

// ORIGIN takes precedence over non-zero start indices (both set is a
// writer inconsistency; ChimeraX applies the same rule).
TEST(CCP4MapOrigin, OriginOverridesStartIndices)
{
    MrcSpec sp;
    sp.ispg = 1;
    sp.nversion = 20140;
    sp.start[0] = 7;
    sp.start[1] = 8;
    sp.start[2] = 9;
    sp.origin[0] = -5.0f;

    qsys::ObjectPtr pObj;
    DensityMap *pMap = readMrc(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);

    EXPECT_EQ(std::string(pMap->getMapTypeResolvedStr().c_str()), "em");
    EXPECT_EQ(pMap->getStartCol(), 0);
    EXPECT_EQ(pMap->getStartRow(), 0);
    EXPECT_EQ(pMap->getStartSec(), 0);
    EXPECT_NEAR(pMap->getOrigin().x(), -5.0, 1e-6);
}

// A P1 map without MRC2014 evidence stays crystallographic (the
// conservative default), and an ISPG 0 image is EM.
TEST(CCP4MapOrigin, KindFromIspg)
{
    MrcSpec sp;
    sp.ispg = 1;
    qsys::ObjectPtr pObj;
    DensityMap *pMap = readMrc(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);
    EXPECT_EQ(std::string(pMap->getMapTypeResolvedStr().c_str()), "xtal");

    sp.ispg = 0;
    qsys::ObjectPtr pObj2;
    DensityMap *pMap2 = readMrc(makeMrc(sp), pObj2);
    ASSERT_NE(pMap2, nullptr);
    EXPECT_EQ(std::string(pMap2->getMapTypeResolvedStr().c_str()), "em");
}

// Labels are read from the header tail (past the 208-byte block).
TEST(CCP4MapOrigin, KindFromLabels)
{
    MrcSpec sp;
    sp.ispg = 1;
    sp.labels.push_back("::::EMDataBank.org::::EMD-9999::::");
    qsys::ObjectPtr pObj;
    DensityMap *pMap = readMrc(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);
    EXPECT_EQ(std::string(pMap->getMapTypeResolvedStr().c_str()), "em");

    // the data after the labels is still read correctly
    EXPECT_NEAR(pMap->getMaxDensity(), 2.0, 1e-6);
    EXPECT_NEAR(pMap->getMinDensity(), -2.0, 1e-6);
}

// The user override survives on the object: the detection only sets the
// fallback of the auto mode.
TEST(CCP4MapOrigin, UserOverrideWinsOverDetection)
{
    MrcSpec sp;
    sp.ispg = 0;
    qsys::ObjectPtr pObj;
    DensityMap *pMap = readMrc(makeMrc(sp), pObj);
    ASSERT_NE(pMap, nullptr);
    EXPECT_EQ(pMap->getDetectedMapType(), DensityMap::MAPTYPE_EM);

    pMap->setMapType(DensityMap::MAPTYPE_XTAL);
    EXPECT_EQ(std::string(pMap->getMapTypeResolvedStr().c_str()), "xtal");
    EXPECT_TRUE(pMap->isPeriodic());
}
