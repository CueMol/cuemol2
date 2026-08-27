// -*-Mode: C++;-*-
//
// Tests for the view-driven region refinement shared by the map renderers
// (MapRenderer) as used by the contour renderer (MapMeshRenderer) in full
// region mode: the generated range is the block clipped to the padded view
// box at the budget stride, a view change rebuilds only when the box left
// the region or a finer stride became possible, and every map renderer
// exposes the lod / lod_budget / zoom_refine properties.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <cmath>
#include <string>
#include <vector>
#include "xtal/DensityMap.hpp"
#include "xtal/MapMeshRenderer.hpp"
#include "xtal/MapRenderer.hpp"

using qlib::LString;
using qlib::Vector4D;
using xtal::DensityMap;
using xtal::MapMeshRenderer;
using xtal::MapRenderer;

namespace {

class MapMeshViewRegionTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    DensityMap *m_pMap;
    MapMeshRenderer *m_pMMR;

    /// 128 nodes per axis at 1 A spacing: 127^3 = 2.05 M cells, above the
    /// 1 Mcell budget at stride 1 and below it at stride 2.
    static constexpr int N = 128;

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
        m_pObj->setName("meshviewmap");
        m_pScene->addObject(m_pObj);

        m_pRend = m_pObj->createRenderer("contour");
        m_pMMR = dynamic_cast<MapMeshRenderer *>(m_pRend.get());
        ASSERT_NE(m_pMMR, nullptr);
        ASSERT_EQ(m_pMMR->getEffectiveRegionMode(), MapRenderer::REGION_FULL);
        m_pMMR->setLodBudget(1);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }

    /// Generate the contour, which builds the displayed region like a render
    void generate()
    {
        ASSERT_TRUE(m_pMMR->generate(m_pMap, m_pMap));
    }
};

}  // namespace

// Without a view box the whole block is generated at the budget stride.
TEST_F(MapMeshViewRegionTest, WholeBlockWithoutViewBox)
{
    generate();
    EXPECT_EQ(m_pMMR->getStep(), 2);
    EXPECT_EQ(m_pMMR->getStCol(), 0);
    EXPECT_EQ(m_pMMR->getActCol(), 64);
}

// The padded view box (1.5x) clips the range, and the smaller region fits
// the budget at stride 1.
TEST_F(MapMeshViewRegionTest, ViewBoxClipsAndRefines)
{
    m_pMMR->setViewBox(Vector4D(64, 64, 64), 20.0);
    generate();
    EXPECT_EQ(m_pMMR->getStep(), 1);
    EXPECT_EQ(m_pMMR->getStCol(), 34);
    EXPECT_EQ(m_pMMR->getStRow(), 34);
    EXPECT_EQ(m_pMMR->getStSec(), 34);
    EXPECT_EQ(m_pMMR->getActCol(), 61);   // nodes 34..94
    EXPECT_EQ(m_pMMR->getActRow(), 61);
    EXPECT_EQ(m_pMMR->getActSec(), 61);
}

// A view box at the block edge is clipped to the block.
TEST_F(MapMeshViewRegionTest, ViewBoxClippedAtBlockEdge)
{
    m_pMMR->setViewBox(Vector4D(0, 0, 0), 20.0);
    generate();
    EXPECT_EQ(m_pMMR->getStep(), 1);
    EXPECT_EQ(m_pMMR->getStCol(), 0);
    EXPECT_EQ(m_pMMR->getActCol(), 31);   // nodes 0..30
}

// A pan that keeps the (unpadded) view box inside the generated region
// does not rebuild; leaving the region does.
TEST_F(MapMeshViewRegionTest, PanInsidePaddingDoesNotRebuild)
{
    m_pMMR->setViewBox(Vector4D(64, 64, 64), 20.0);
    generate();  // region [34,94], stride 1

    m_pMMR->setViewBox(Vector4D(72, 64, 64), 20.0);   // box [52,92]
    EXPECT_FALSE(m_pMMR->updateViewRegion());

    m_pMMR->setViewBox(Vector4D(90, 64, 64), 20.0);   // box [70,110] > 94
    EXPECT_TRUE(m_pMMR->updateViewRegion());
}

// Zooming in shrinks the region so a finer stride fits: rebuild with the
// finer stride.
TEST_F(MapMeshViewRegionTest, ZoomInRefines)
{
    m_pMMR->setViewBox(Vector4D(64, 64, 64), 100.0);
    generate();  // whole block, stride 2
    EXPECT_EQ(m_pMMR->getStep(), 2);

    m_pMMR->setViewBox(Vector4D(64, 64, 64), 20.0);
    EXPECT_TRUE(m_pMMR->updateViewRegion());
    generate();
    EXPECT_EQ(m_pMMR->getStep(), 1);
    EXPECT_EQ(m_pMMR->getActCol(), 61);
}

// Zooming out keeps the finer contour while the view box stays inside the
// generated region, and rebuilds once it leaves.
TEST_F(MapMeshViewRegionTest, ZoomOutKeepsFinerContourWhileContained)
{
    m_pMMR->setViewBox(Vector4D(64, 64, 64), 20.0);
    generate();  // [34,94], stride 1

    m_pMMR->setViewBox(Vector4D(64, 64, 64), 25.0);   // box [39,89]
    EXPECT_FALSE(m_pMMR->updateViewRegion());

    m_pMMR->setViewBox(Vector4D(64, 64, 64), 40.0);   // box [24,104]
    EXPECT_TRUE(m_pMMR->updateViewRegion());
}

// zoom_refine off: the view box is ignored and no view update rebuilds.
TEST_F(MapMeshViewRegionTest, DisabledRefineIgnoresViewBox)
{
    m_pMMR->setZoomRefine(false);
    m_pMMR->setViewBox(Vector4D(64, 64, 64), 20.0);
    generate();
    EXPECT_EQ(m_pMMR->getStep(), 2);
    EXPECT_EQ(m_pMMR->getActCol(), 64);
    EXPECT_FALSE(m_pMMR->updateViewRegion());
}

// Box region mode (a crystallographic map) never refines from the view.
TEST_F(MapMeshViewRegionTest, BoxModeIgnoresViewUpdates)
{
    m_pMap->setMapType(DensityMap::MAPTYPE_XTAL);
    ASSERT_EQ(m_pMMR->getEffectiveRegionMode(), MapRenderer::REGION_BOX);
    m_pMMR->setViewBox(Vector4D(64, 64, 64), 20.0);
    EXPECT_FALSE(m_pMMR->updateViewRegion());
    m_pMMR->setUsePBC(false);
    m_pMMR->setCenter(Vector4D(64, 64, 64));
    m_pMMR->setExtent(10.0);
    generate();
    EXPECT_EQ(m_pMMR->getStep(), 1);
    EXPECT_EQ(m_pMMR->getActCol(), 20);
}

// The level-of-detail properties live on MapRenderer, so every map
// renderer exposes them; the contour keeps its smaller default budget.
// gpu_mapmesh is only registered in OpenGL-enabled builds, so the map's
// own list of compatible renderers decides which types are checked.
TEST_F(MapMeshViewRegionTest, LodPropertiesOnAllMapRenderers)
{
    const std::string compat =
        "," + std::string(m_pObj->searchCompatibleRendererNames().c_str()) + ",";
    const char *types[3] = {"contour", "isosurf", "gpu_mapmesh"};
    const int budgets[3] = {2, 16, 16};
    for (int i = 0; i < 3; ++i) {
        if (compat.find("," + std::string(types[i]) + ",") == std::string::npos) {
            // only the GL-only renderer may be absent from a build
            EXPECT_STREQ(types[i], "gpu_mapmesh");
            continue;
        }
        qsys::RendererPtr pRend = (i == 0) ? m_pRend : m_pObj->createRenderer(types[i]);
        ASSERT_FALSE(pRend.isnull()) << types[i];
        EXPECT_TRUE(pRend->hasProperty("lod")) << types[i];
        EXPECT_TRUE(pRend->hasProperty("lod_budget")) << types[i];
        EXPECT_TRUE(pRend->hasProperty("zoom_refine")) << types[i];
        MapRenderer *pMR = dynamic_cast<MapRenderer *>(pRend.get());
        ASSERT_NE(pMR, nullptr) << types[i];
        if (i > 0) EXPECT_EQ(pMR->getLodBudget(), budgets[i]) << types[i];
        EXPECT_TRUE(pMR->isZoomRefine()) << types[i];
        EXPECT_EQ(pMR->getLod(), MapRenderer::LOD_AUTO) << types[i];
    }
}
