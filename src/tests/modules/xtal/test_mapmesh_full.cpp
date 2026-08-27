// -*-Mode: C++;-*-
//
// Tests for the contour renderer (MapMeshRenderer) in full region mode:
// the whole block is generated at the budget-derived stride with the
// crossing buffers grown to the sample count, an explicit lod stride is
// honored, and crystallographic maps keep the box path untouched.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/Vector4D.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <cmath>
#include <vector>
#include "xtal/DensityMap.hpp"
#include "xtal/MapMeshRenderer.hpp"
#include "xtal/MapRenderer.hpp"

using qlib::Vector4D;
using xtal::DensityMap;
using xtal::MapMeshRenderer;
using xtal::MapRenderer;

namespace {

class MapMeshFullTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    DensityMap *m_pMap;
    MapMeshRenderer *m_pMMR;

    /// 128 nodes: 127^3 = 2.05 M cells, above a 1 Mcell budget at stride 1
    /// (the tests lower the contour budget from its 2 Mcell default)
    static constexpr int N = 128;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pMap = MB_NEW DensityMap();
        std::vector<float> data((size_t)N * N * N);
        for (int k = 0; k < N; ++k)
            for (int j = 0; j < N; ++j)
                for (int i = 0; i < N; ++i) {
                    const double d = (i - 64.0) * (i - 64.0) + (j - 64.0) * (j - 64.0) +
                                     (k - 64.0) * (k - 64.0);
                    data[(size_t)(k * N + j) * N + i] = float(100.0 * std::exp(-d / 200.0) - 40.0);
                }
        m_pMap->setMapFloatArray(data.data(), N, N, N, 0, 1, 2);
        m_pMap->setMapParams(0, 0, 0, N, N, N);
        m_pMap->setXtalParams(double(N), double(N), double(N), 90.0, 90.0, 90.0);
        m_pObj = qsys::ObjectPtr(m_pMap);
        m_pObj->setName("meshmap");
        m_pScene->addObject(m_pObj);
        m_pRend = m_pObj->createRenderer("contour");
        m_pMMR = dynamic_cast<MapMeshRenderer *>(m_pRend.get());
        ASSERT_NE(m_pMMR, nullptr);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }
};

}  // namespace

TEST_F(MapMeshFullTest, FullRegionUsesBudgetStride)
{
    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);
    ASSERT_EQ(m_pMMR->getEffectiveRegionMode(), MapRenderer::REGION_FULL);
    // the 2 Mcell default budget holds 127^3 at stride 1; a 1 Mcell budget
    // forces stride 2 (aligned span 126 -> 64 samples per axis)
    m_pMMR->setLodBudget(1);
    ASSERT_TRUE(m_pMMR->generate(m_pMap, m_pMap));

    EXPECT_EQ(m_pMMR->getStep(), 2);
    EXPECT_EQ(m_pMMR->getStCol(), 0);
    EXPECT_EQ(m_pMMR->getActCol(), 64);
    EXPECT_EQ(m_pMMR->getActRow(), 64);
    EXPECT_EQ(m_pMMR->getActSec(), 64);
    // the crossing buffers hold the samples (default buffers are 100^3)
    EXPECT_GE(m_pMMR->getColCrsSize(), 64);
}

TEST_F(MapMeshFullTest, ExplicitStrideAndBufferGrowth)
{
    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);
    m_pMMR->setLod(1);
    ASSERT_TRUE(m_pMMR->generate(m_pMap, m_pMap));
    EXPECT_EQ(m_pMMR->getStep(), 1);
    EXPECT_EQ(m_pMMR->getActCol(), N);
    // grown past the default 100 to hold 128 samples
    EXPECT_GE(m_pMMR->getColCrsSize(), N);

    m_pMMR->setLod(4);
    ASSERT_TRUE(m_pMMR->generate(m_pMap, m_pMap));
    EXPECT_EQ(m_pMMR->getStep(), 4);
    EXPECT_EQ(m_pMMR->getActCol(), 32);  // aligned span 124 / 4 + 1
}

// A crystallographic map keeps the historical box range (center +- extent
// clipped to the buffers) at stride 1.
TEST_F(MapMeshFullTest, CrystalMapKeepsBoxRange)
{
    ASSERT_EQ(m_pMMR->getEffectiveRegionMode(), MapRenderer::REGION_BOX);
    m_pMMR->setUsePBC(false);
    m_pMMR->setCenter(Vector4D(64, 64, 64));
    m_pMMR->setExtent(10.0);
    ASSERT_TRUE(m_pMMR->generate(m_pMap, m_pMap));
    EXPECT_EQ(m_pMMR->getStep(), 1);
    EXPECT_EQ(m_pMMR->getActCol(), 20);
    EXPECT_EQ(m_pMMR->getStCol(), 54);
}
