// -*-Mode: C++;-*-
//
// Degrade-detection pins for the MapSurfRenderer marching-cubes path.
//
// These tests pin the observable output of generateSurfObj() (vertex/face
// counts, geometry aggregates, and an order-sensitive checksum) on a fixed
// synthetic density map, so that the MC kernel unification and the TBB
// two-phase restructuring can be verified to preserve the output exactly,
// including the vertex emission order.
//
// The golden values were captured from the serial pre-refactor build; the
// same values must hold for the parallel build (any thread count), since
// the parallel driver is required to reproduce the serial emission order.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <cmath>
#include <vector>
#include "molstr/ElemSym.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/ResidIndex.hpp"
#include "surface/MolSurfObj.hpp"
#include "xtal/DensityMap.hpp"
#include "xtal/MapSurfRenderer.hpp"

using qlib::LString;
using qlib::Vector4D;

namespace {

// Set to 1 to print the actual values for (re-)capturing the goldens.
#define MAPSURF_PIN_CAPTURE 0

/// Aggregate summary of a generated surface, comparable against goldens.
struct SurfSummary {
    int nverts;
    int nfaces;
    Vector4D vmin, vmax;
    Vector4D centroid;
    double area;
    /// Order-sensitive checksum over positions and normals; pins the
    /// emission order, not only the vertex set.
    double checksum;
};

/// Fill an n^3 grid with the pinned analytic field: two Gaussians on a
/// negative background, so both positive and negative iso-levels cut real
/// surfaces. The Gaussian centers are fixed in grid units, independent of n.
void fillPinField(std::vector<float> &data, int n)
{
    data.resize((size_t)n * n * n);
    for (int k = 0; k < n; ++k)
        for (int j = 0; j < n; ++j)
            for (int i = 0; i < n; ++i) {
                const double d1 = (i - 4.0) * (i - 4.0) +
                                  (j - 5.0) * (j - 5.0) +
                                  (k - 6.0) * (k - 6.0);
                const double d2 = (i - 8.0) * (i - 8.0) +
                                  (j - 3.5) * (j - 3.5) +
                                  (k - 4.5) * (k - 4.5);
                data[(size_t)(k * n + j) * n + i] =
                    float(100.0 * std::exp(-d1 / 8.0) +
                          60.0 * std::exp(-d2 / 5.0) - 40.0);
            }
}

class MapSurfPin : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    xtal::MapSurfRenderer *m_pMSR;

    /// Extra fixture created by makeFixture() (kept alive for the test).
    qsys::ObjectPtr m_pObj2;
    qsys::RendererPtr m_pRend2;

    static const int N = 12;

    /// Build an n^3 map of the pinned field placed at grid start
    /// (stcol,strow,stsec) inside a cubic cell of ncell grid points per axis
    /// (1 A grid spacing), attach an isosurf renderer to it and return the
    /// renderer. The default fixture is makeFixture(12, 0,0,0, 12, ...).
    xtal::MapSurfRenderer *makeFixture(int n, int stcol, int strow, int stsec,
                                       int ncell, const char *name,
                                       qsys::ObjectPtr &rpObj,
                                       qsys::RendererPtr &rpRend)
    {
        xtal::DensityMap *pMap = MB_NEW xtal::DensityMap();
        std::vector<float> data;
        fillPinField(data, n);
        pMap->setMapFloatArray(data.data(), n, n, n, 0, 1, 2);
        pMap->setMapParams(stcol, strow, stsec, ncell, ncell, ncell);
        pMap->setXtalParams(double(ncell), double(ncell), double(ncell),
                            90.0, 90.0, 90.0);

        rpObj = qsys::ObjectPtr(pMap);
        rpObj->setName(name);
        m_pScene->addObject(rpObj);

        rpRend = rpObj->createRenderer("isosurf");
        xtal::MapSurfRenderer *pMSR =
            dynamic_cast<xtal::MapSurfRenderer *>(rpRend.get());
        if (pMSR == nullptr)
            return nullptr;
        // A map covering the whole cell would enable PBC and extend the
        // marching range; keep it bounded like a real cropped map view.
        pMSR->setUsePBC(false);
        // Center the display extent on the map block so the whole field is
        // covered (default extent 15 A exceeds the block half-size).
        pMSR->setCenter(Vector4D(stcol + n / 2.0, strow + n / 2.0,
                                 stsec + n / 2.0));
        return pMSR;
    }

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pMSR = makeFixture(N, 0, 0, 0, N, "pinmap", m_pObj, m_pRend);
        ASSERT_NE(m_pMSR, nullptr);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }

    SurfSummary summarize(xtal::MapSurfRenderer *pMSR = nullptr)
    {
        if (pMSR == nullptr)
            pMSR = m_pMSR;

        SurfSummary s;
        s.nverts = -1;
        s.nfaces = -1;
        s.area = 0.0;
        s.checksum = 0.0;

        qsys::ObjectPtr pSurfObj = pMSR->generateSurfObj();
        surface::MolSurfObj *pSurf =
            dynamic_cast<surface::MolSurfObj *>(pSurfObj.get());
        if (pSurf == nullptr)
            return s;

        s.nverts = pSurf->getVertSize();
        s.nfaces = pSurf->getFaceSize();

        Vector4D sum;
        for (int i = 0; i < s.nverts; ++i) {
            const surface::MSVert &v = pSurf->getVertAt(i);
            const Vector4D p = v.v3d();
            if (i == 0) {
                s.vmin = p;
                s.vmax = p;
            }
            else {
                s.vmin.x() = std::min(s.vmin.x(), p.x());
                s.vmin.y() = std::min(s.vmin.y(), p.y());
                s.vmin.z() = std::min(s.vmin.z(), p.z());
                s.vmax.x() = std::max(s.vmax.x(), p.x());
                s.vmax.y() = std::max(s.vmax.y(), p.y());
                s.vmax.z() = std::max(s.vmax.z(), p.z());
            }
            sum += p;
            s.checksum += double(i + 1) *
                (p.x() + 2.0 * p.y() + 3.0 * p.z() +
                 4.0 * double(v.nx) + 5.0 * double(v.ny) + 6.0 * double(v.nz));
        }
        if (s.nverts > 0)
            s.centroid = sum.divide(double(s.nverts));

        for (int i = 0; i < s.nfaces; ++i) {
            const surface::MSFace &f = pSurf->getFaceAt(i);
            const Vector4D a = pSurf->getVertAt((int)f.id1).v3d();
            const Vector4D b = pSurf->getVertAt((int)f.id2).v3d();
            const Vector4D c = pSurf->getVertAt((int)f.id3).v3d();
            const Vector4D ab = b - a;
            const Vector4D ac = c - a;
            s.area += 0.5 * (ab.cross(ac)).length();
        }
        return s;
    }

    static void expectSummary(const SurfSummary &s, const char *tag,
                              int nverts, double minx, double miny, double minz,
                              double maxx, double maxy, double maxz,
                              double cx, double cy, double cz,
                              double area, double checksum)
    {
#if MAPSURF_PIN_CAPTURE
        printf("PIN %s: nverts=%d\n", tag, s.nverts);
        printf("PIN %s: bbox min=(%.6f, %.6f, %.6f) max=(%.6f, %.6f, %.6f)\n",
               tag, s.vmin.x(), s.vmin.y(), s.vmin.z(),
               s.vmax.x(), s.vmax.y(), s.vmax.z());
        printf("PIN %s: centroid=(%.6f, %.6f, %.6f) area=%.6f\n",
               tag, s.centroid.x(), s.centroid.y(), s.centroid.z(), s.area);
        printf("PIN %s: checksum=%.6f\n", tag, s.checksum);
#else
        (void)tag;
        EXPECT_EQ(s.nverts, nverts);
        EXPECT_EQ(s.nfaces, s.nverts / 3);
        // Vertices are stored as float32; keep tolerances above that noise.
        EXPECT_NEAR(s.vmin.x(), minx, 1e-4);
        EXPECT_NEAR(s.vmin.y(), miny, 1e-4);
        EXPECT_NEAR(s.vmin.z(), minz, 1e-4);
        EXPECT_NEAR(s.vmax.x(), maxx, 1e-4);
        EXPECT_NEAR(s.vmax.y(), maxy, 1e-4);
        EXPECT_NEAR(s.vmax.z(), maxz, 1e-4);
        EXPECT_NEAR(s.centroid.x(), cx, 1e-4);
        EXPECT_NEAR(s.centroid.y(), cy, 1e-4);
        EXPECT_NEAR(s.centroid.z(), cz, 1e-4);
        EXPECT_NEAR(s.area, area, area * 1e-6 + 1e-4);
        const double ctol = std::abs(checksum) * 1e-6 + 1e-3;
        EXPECT_NEAR(s.checksum, checksum, ctol);
#endif
    }
};

}  // namespace

// P1: default settings (siglevel 1.1, no binning, no boundary).
TEST_F(MapSurfPin, DefaultSurface)
{
    const SurfSummary s = summarize();
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P1",
                  /*nverts*/ 684,
                  /*bbox*/ 1.906816, 2.831297, 3.831297,
                  8.409676, 7.105779, 8.105779,
                  /*centroid*/ 5.004821, 4.650756, 5.644807,
                  /*area*/ 69.305242, /*checksum*/ 7610693.011298);
}

// P2: binning factor 2 exercises the strided cell iteration. The
// checksum was re-captured when the vertex normals became central
// differences over one stride (they were +-1 node at any stride); the
// vertex positions are unchanged.
TEST_F(MapSurfPin, BinFac2)
{
    m_pMSR->setBinFac(2);
    const SurfSummary s = summarize();
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P2",
                  /*nverts*/ 120,
                  /*bbox*/ 2.247477, 2.872503, 3.843344,
                  8.187305, 7.093184, 7.771781,
                  /*centroid*/ 5.691435, 4.680012, 5.422827,
                  /*area*/ 52.900922, /*checksum*/ 242977.127854);
}

// P3: negative iso-level exercises the normal-flip branch.
TEST_F(MapSurfPin, NegativeLevel)
{
    m_pMSR->setSigLevel(-0.5);
    const SurfSummary s = summarize();
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P3",
                  /*nverts*/ 1392,
                  /*bbox*/ 0.977932, 1.630540, 2.630540,
                  9.702794, 8.022068, 9.022068,
                  /*centroid*/ 5.044657, 4.599363, 5.599923,
                  /*area*/ 148.692445, /*checksum*/ 29333588.014872);
}

// P4: mol-boundary masking; also pins BSPTree::collChk semantics.
// Note generateSurfObj() itself never calls setupMolBndry(); it uses the
// boundary state left by the last render/setup, which we set up explicitly
// here (this leftover-state behavior is itself part of the pinned contract).
TEST_F(MapSurfPin, MolBoundary)
{
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    const double apos[2][3] = {{4.0, 5.0, 6.0}, {8.0, 3.5, 4.5}};
    for (int i = 0; i < 2; ++i) {
        molstr::MolAtomPtr pAtom(MB_NEW molstr::MolAtom());
        pAtom->setParentUID(pMol->getUID());
        pAtom->setName(LString::format("A%d", i));
        pAtom->setElement(molstr::ElemSym::C);
        pAtom->setChainName("A");
        pAtom->setResIndex(molstr::ResidIndex(1));
        pAtom->setResName("RES");
        pAtom->setPos(Vector4D(apos[i][0], apos[i][1], apos[i][2]));
        pMol->appendAtom(pAtom);
    }
    qsys::ObjectPtr pMolObj = qsys::ObjectPtr(pMol);
    pMolObj->setName("bndmol");
    m_pScene->addObject(pMolObj);

    m_pMSR->setBndryMolName("bndmol");
    m_pMSR->setBndryRng(3.0);
    m_pMSR->setupMolBndry();

    const SurfSummary s = summarize();
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P4",
                  /*nverts*/ 582,
                  /*bbox*/ 1.906816, 2.831297, 3.831297,
                  8.409676, 7.000000, 8.000000,
                  /*centroid*/ 4.995943, 4.581498, 5.608023,
                  /*area*/ 63.268962, /*checksum*/ 5370513.295668);
}

// P5: periodic-boundary path. The 12^3 block spans the whole 12 A cell, so
// use_pbc enables PBC: makerange() stops clamping to the block and getDen()
// wraps by modulo, so the default 15 A extent around (6,6,6) marches the
// grid range [-9, 21) and the field is replicated across cell images.
TEST_F(MapSurfPin, PeriodicBoundary)
{
    m_pMSR->setUsePBC(true);
    const SurfSummary s = summarize();
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P5",
                  /*nverts*/ 18252,
                  /*bbox*/ -9.000000, -9.000000, -8.168703,
                  20.409676, 19.105778, 20.105778,
                  /*centroid*/ 5.200788, 4.648226, 5.641436,
                  /*area*/ 1841.648228, /*checksum*/ 6273541076.147788);
}

// P7: non-zero block start inside a larger cell (a cropped map, as written
// by CCP4 with NCSTART != 0). The block is 12^3 at grid (3,4,5) in a 24-grid
// cell, so the surface must be the P1 surface translated by (3,4,5) A;
// pins the start-offset handling of makerange()/runMarchingCubes()/xform.
TEST_F(MapSurfPin, NonZeroStart)
{
    xtal::MapSurfRenderer *pMSR =
        makeFixture(N, 3, 4, 5, 24, "offmap", m_pObj2, m_pRend2);
    ASSERT_NE(pMSR, nullptr);
    const SurfSummary s = summarize(pMSR);
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P7",
                  /*nverts*/ 684,
                  /*bbox*/ 4.906816, 6.831297, 8.831297,
                  11.409676, 11.105779, 13.105779,
                  /*centroid*/ 8.004821, 8.650756, 10.644808,
                  /*area*/ 69.305244, /*checksum*/ 13701713.042362);
}

// P8: odd grid size with binning 2. With 13 nodes per axis the last stride
// cube [10,12] is complete, so no cube may read past the block; pins the
// tail-cube boundary test of the strided iteration (P2 covers the even case
// where the last stride cube is incomplete). Checksum re-captured with the
// stride-wide normals (see P2).
TEST_F(MapSurfPin, OddSizeBinFac2)
{
    xtal::MapSurfRenderer *pMSR =
        makeFixture(13, 0, 0, 0, 13, "oddmap", m_pObj2, m_pRend2);
    ASSERT_NE(pMSR, nullptr);
    pMSR->setBinFac(2);
    const SurfSummary s = summarize(pMSR);
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P8",
                  /*nverts*/ 132,
                  /*bbox*/ 2.166022, 2.820098, 3.775218,
                  8.268761, 7.145958, 7.854132,
                  /*centroid*/ 5.630172, 4.618672, 5.305923,
                  /*area*/ 56.548720, /*checksum*/ 285869.518535);
}

// P9: full region mode (the map is flagged cryo-EM): the whole block is
// marched at stride 1 with the surface closed at the block boundary. The
// field never reaches the block boundary above the level, so no caps are
// emitted and the result must equal P1 (box mode covering the same block).
TEST_F(MapSurfPin, FullRegion)
{
    xtal::DensityMap *pMap = dynamic_cast<xtal::DensityMap *>(m_pObj.get());
    ASSERT_NE(pMap, nullptr);
    pMap->setDetectedMapType(xtal::DensityMap::MAPTYPE_EM);
    ASSERT_EQ(m_pMSR->getEffectiveRegionMode(), xtal::MapRenderer::REGION_FULL);

    const SurfSummary s = summarize();
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P9",
                  /*nverts*/ 684,
                  /*bbox*/ 1.906816, 2.831297, 3.831297,
                  8.409676, 7.105779, 8.105779,
                  /*centroid*/ 5.004821, 4.650756, 5.644807,
                  /*area*/ 69.305242, /*checksum*/ 7610693.011298);
}

// P10: full region mode with an explicit stride of 2. On the 12-node
// block the aligned span is 10 nodes, i.e. the same five complete stride
// cubes per axis that the box path marches after its tail-cube check, so
// the result must equal P2.
TEST_F(MapSurfPin, FullRegionStep2)
{
    xtal::DensityMap *pMap = dynamic_cast<xtal::DensityMap *>(m_pObj.get());
    ASSERT_NE(pMap, nullptr);
    pMap->setDetectedMapType(xtal::DensityMap::MAPTYPE_EM);
    m_pMSR->setLod(2);

    const SurfSummary s = summarize();
    ASSERT_GT(s.nverts, 0);
    expectSummary(s, "P10",
                  /*nverts*/ 120,
                  /*bbox*/ 2.247477, 2.872503, 3.843344,
                  8.187305, 7.093184, 7.771781,
                  /*centroid*/ 5.691435, 4.680012, 5.422827,
                  /*area*/ 52.900922, /*checksum*/ 242977.127854);
}

// P6: two runs must be bitwise identical (catches nondeterminism in-process).
TEST_F(MapSurfPin, RunTwiceBitwise)
{
    qsys::ObjectPtr pSurfObj0 = m_pMSR->generateSurfObj();
    qsys::ObjectPtr pSurfObj1 = m_pMSR->generateSurfObj();
    surface::MolSurfObj *pS0 =
        dynamic_cast<surface::MolSurfObj *>(pSurfObj0.get());
    surface::MolSurfObj *pS1 =
        dynamic_cast<surface::MolSurfObj *>(pSurfObj1.get());
    ASSERT_NE(pS0, nullptr);
    ASSERT_NE(pS1, nullptr);

    ASSERT_EQ(pS0->getVertSize(), pS1->getVertSize());
    ASSERT_GT(pS0->getVertSize(), 0);
    for (int i = 0; i < pS0->getVertSize(); ++i) {
        const surface::MSVert &a = pS0->getVertAt(i);
        const surface::MSVert &b = pS1->getVertAt(i);
        ASSERT_EQ(a.x, b.x) << "vertex " << i;
        ASSERT_EQ(a.y, b.y) << "vertex " << i;
        ASSERT_EQ(a.z, b.z) << "vertex " << i;
        ASSERT_EQ(a.nx, b.nx) << "vertex " << i;
        ASSERT_EQ(a.ny, b.ny) << "vertex " << i;
        ASSERT_EQ(a.nz, b.nz) << "vertex " << i;
    }
}
