// -*-Mode: C++;-*-
//
// Tests for the view-driven region refinement of MapSurfRenderer in full
// region mode: the marched region is the map block clipped to the padded
// view box (and the molecule boundary box), the stride follows the cell
// budget of that region, and a view change rebuilds only when the box
// left the marched region or a finer stride became possible.
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
#include "xtal/DensityMap.hpp"
#include "xtal/MapRenderer.hpp"
#include "xtal/MapSurfRenderer.hpp"

using qlib::LString;
using qlib::Vector4D;
using xtal::DensityMap;
using xtal::MapRenderer;
using xtal::MapSurfRenderer;

namespace {

class MapViewRegionTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    DensityMap *m_pMap;
    MapSurfRenderer *m_pMSR;

    /// 128 nodes per axis at 1 A spacing: 127^3 = 2.05 M cells, above the
    /// 1 Mcell budget at stride 1 and below it at stride 2.
    static const int N = 128;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();

        m_pMap = MB_NEW DensityMap();
        std::vector<float> data((size_t)N * N * N);
        for (int k = 0; k < N; ++k)
            for (int j = 0; j < N; ++j)
                for (int i = 0; i < N; ++i) {
                    const double d = (i - 64.0) * (i - 64.0) +
                                     (j - 64.0) * (j - 64.0) +
                                     (k - 64.0) * (k - 64.0);
                    data[(size_t)(k * N + j) * N + i] =
                        float(100.0 * std::exp(-d / 200.0) - 40.0);
                }
        m_pMap->setMapFloatArray(data.data(), N, N, N, 0, 1, 2);
        m_pMap->setMapParams(0, 0, 0, N, N, N);
        m_pMap->setXtalParams(double(N), double(N), double(N), 90.0, 90.0, 90.0);
        m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);

        m_pObj = qsys::ObjectPtr(m_pMap);
        m_pObj->setName("viewmap");
        m_pScene->addObject(m_pObj);

        m_pRend = m_pObj->createRenderer("isosurf");
        m_pMSR = dynamic_cast<MapSurfRenderer *>(m_pRend.get());
        ASSERT_NE(m_pMSR, nullptr);
        ASSERT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_FULL);
        m_pMSR->setLodBudget(1);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }

    void region(int lo[3], int hi[3], int &step)
    {
        m_pMSR->computeFullRegion(m_pMap, lo, hi, step);
    }

    static void expectRange(const int lo[3], const int hi[3], int elo, int ehi)
    {
        for (int a = 0; a < 3; ++a) {
            EXPECT_EQ(lo[a], elo) << "axis " << a;
            EXPECT_EQ(hi[a], ehi) << "axis " << a;
        }
    }

    /// Run the gen-surf path, which sets the marched region like a render
    void march()
    {
        qsys::ObjectPtr pSurf = m_pMSR->generateSurfObj();
        ASSERT_FALSE(pSurf.isnull());
    }
};

}  // namespace

// Without a view box the whole block is marched at the budget stride.
TEST_F(MapViewRegionTest, WholeBlockWithoutViewBox)
{
    int lo[3], hi[3], step;
    region(lo, hi, step);
    expectRange(lo, hi, 0, N - 1);
    EXPECT_EQ(step, 2);
}

// The padded view box (1.5x) clips the region, and the smaller region
// fits the budget at stride 1.
TEST_F(MapViewRegionTest, ViewBoxClipsAndRefines)
{
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    int lo[3], hi[3], step;
    region(lo, hi, step);
    expectRange(lo, hi, 34, 94);
    EXPECT_EQ(step, 1);
}

// A view box at the block edge is clipped to the block.
TEST_F(MapViewRegionTest, ViewBoxClippedAtBlockEdge)
{
    m_pMSR->setViewBox(Vector4D(0, 0, 0), 20.0);
    int lo[3], hi[3], step;
    region(lo, hi, step);
    expectRange(lo, hi, 0, 30);
    EXPECT_EQ(step, 1);
}

// A view box that misses the block falls back to the whole block.
TEST_F(MapViewRegionTest, ViewBoxOutsideFallsBackToBlock)
{
    m_pMSR->setViewBox(Vector4D(1000, 1000, 1000), 20.0);
    int lo[3], hi[3], step;
    region(lo, hi, step);
    expectRange(lo, hi, 0, N - 1);
    EXPECT_EQ(step, 2);
}

// The explicit lod stride wins over the budget; the view box still clips.
TEST_F(MapViewRegionTest, ExplicitLodOverridesBudget)
{
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    m_pMSR->setLod(4);
    int lo[3], hi[3], step;
    region(lo, hi, step);
    expectRange(lo, hi, 34, 94);
    EXPECT_EQ(step, 4);
}

// zoom_refine off: the view box is ignored and no view update rebuilds.
TEST_F(MapViewRegionTest, DisabledRefineIgnoresViewBox)
{
    m_pMSR->setZoomRefine(false);
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    int lo[3], hi[3], step;
    region(lo, hi, step);
    expectRange(lo, hi, 0, N - 1);
    EXPECT_EQ(step, 2);
    march();
    EXPECT_FALSE(m_pMSR->updateViewRegion());
}

// The molecule boundary box clips the region (the boundary masks every
// cell outside it anyway).
TEST_F(MapViewRegionTest, BoundaryBoxClipsRegion)
{
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    const double apos[2][3] = {{60.0, 60.0, 60.0}, {70.0, 70.0, 70.0}};
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
    m_pMSR->setBndryRng(5.0);
    m_pMSR->setupMolBndry();

    int lo[3], hi[3], step;
    region(lo, hi, step);
    expectRange(lo, hi, 55, 75);
    EXPECT_EQ(step, 1);
}

// Before the first march every view update requests a build.
TEST_F(MapViewRegionTest, FirstViewUpdateRequestsBuild)
{
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    EXPECT_TRUE(m_pMSR->updateViewRegion());
}

// A pan that keeps the (unpadded) view box inside the marched region
// does not rebuild; leaving the region does.
TEST_F(MapViewRegionTest, PanInsidePaddingDoesNotRebuild)
{
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    march();  // region [34,94], stride 1

    m_pMSR->setViewBox(Vector4D(66, 64, 64), 20.0);   // box [46,86]
    EXPECT_FALSE(m_pMSR->updateViewRegion());

    m_pMSR->setViewBox(Vector4D(72, 64, 64), 20.0);   // box [52,92]
    EXPECT_FALSE(m_pMSR->updateViewRegion());

    m_pMSR->setViewBox(Vector4D(90, 64, 64), 20.0);   // box [70,110] > 94
    EXPECT_TRUE(m_pMSR->updateViewRegion());
}

// Zooming in shrinks the region so a finer stride fits: rebuild.
TEST_F(MapViewRegionTest, ZoomInRefines)
{
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 100.0);
    march();  // whole block, stride 2

    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    EXPECT_TRUE(m_pMSR->updateViewRegion());
    march();  // [34,94], stride 1
    int lo[3], hi[3], step;
    region(lo, hi, step);
    EXPECT_EQ(step, 1);
}

// Zooming out keeps the finer surface while the view box stays inside
// the marched region, and rebuilds once it leaves.
TEST_F(MapViewRegionTest, ZoomOutKeepsFinerSurfaceWhileContained)
{
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    march();  // [34,94], stride 1

    m_pMSR->setViewBox(Vector4D(64, 64, 64), 25.0);   // box [39,89]
    EXPECT_FALSE(m_pMSR->updateViewRegion());

    m_pMSR->setViewBox(Vector4D(64, 64, 64), 40.0);   // box [24,104]
    EXPECT_TRUE(m_pMSR->updateViewRegion());
}

// A view that left the map keeps what is shown.
TEST_F(MapViewRegionTest, ViewOutsideMapKeepsSurface)
{
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    march();
    m_pMSR->setViewBox(Vector4D(1000, 1000, 1000), 20.0);
    EXPECT_FALSE(m_pMSR->updateViewRegion());
}

// Box region mode (a crystallographic map) never refines from the view.
TEST_F(MapViewRegionTest, BoxModeIgnoresViewUpdates)
{
    m_pMap->setMapType(DensityMap::MAPTYPE_XTAL);
    ASSERT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_BOX);
    m_pMSR->setViewBox(Vector4D(64, 64, 64), 20.0);
    EXPECT_FALSE(m_pMSR->updateViewRegion());
}
