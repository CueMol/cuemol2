// -*-Mode: C++;-*-
//
// Tests for the level range a UI offers (MapRenderer::ui_level_*) and the
// default top-percent level on a masked cryo-EM map, where almost every grid
// point is background and an outlier sets the maximum.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <vector>
#include "xtal/DensityMap.hpp"
#include "xtal/MapRenderer.hpp"

using xtal::DensityMap;
using xtal::MapRenderer;

namespace {

class MapUiLevelTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    DensityMap *m_pMap;
    MapRenderer *m_pMR;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();

        // 40^3 points: background 0, 400 points (0.625%) of density spread
        // over 0.5..2.0 (several 8-bit bins), one outlier at 100 and one
        // point at -1 (so bin 0 starts below 0).
        const int n = 40;
        std::vector<float> data((size_t)n * n * n, 0.0f);
        for (size_t i = 0; i < 400; ++i)
            data[i * 7] = 0.5f + 1.5f * float(i) / 399.0f;
        data[1] = 100.0f;
        data[3] = -1.0f;

        m_pMap = MB_NEW DensityMap();
        m_pMap->setMapFloatArray(data.data(), n, n, n, 0, 1, 2);
        m_pMap->setMapParams(0, 0, 0, n, n, n);
        m_pMap->setXtalParams(double(n), double(n), double(n), 90.0, 90.0, 90.0);
        m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);

        m_pObj = qsys::ObjectPtr(m_pMap);
        m_pObj->setName("maskedmap");
        m_pScene->addObject(m_pObj);

        m_pRend = m_pObj->createRenderer("isosurf");
        m_pMR = dynamic_cast<MapRenderer *>(m_pRend.get());
        ASSERT_NE(m_pMR, nullptr);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }
};

}  // namespace

// The UI range runs from the background (mean + 1 sigma) to the top 0.01%,
// not to the outlier maximum, and the percent range is its inverse.
TEST_F(MapUiLevelTest, RangeSkipsBackgroundAndOutlier)
{
    // mean + 1 sigma, at the 8-bit bin edge the contour is drawn at; the
    // capped default resolves to the same level, so it sits inside the range
    const double bg = m_pMap->getMeanDensity() + m_pMap->getRmsdDensity();
    EXPECT_DOUBLE_EQ(m_pMR->getUiAbsLevelMin(),
                     m_pMap->getLevelAtTopFraction(m_pMap->getTopFractionAtLevel(bg)));
    EXPECT_LE(m_pMR->getUiAbsLevelMin(), bg);
    EXPECT_GT(m_pMR->getUiAbsLevelMin(), 0.0);
    EXPECT_DOUBLE_EQ(m_pMR->resolveLevel(m_pMap), m_pMR->getUiAbsLevelMin());
    EXPECT_LE(m_pMR->getUiAbsLevelMax(), 2.0);  // the density points, not 100

    // percent: everything above the background (401 of 64000 points) at most
    EXPECT_NEAR(m_pMR->getUiLevelMax(), 100.0 * 401 / 64000, 1e-9);
    EXPECT_LT(m_pMR->getUiLevelMin(), m_pMR->getUiLevelMax());
}

// The default top 1% would land in the background (bin 0, whose left edge is
// the -1 minimum); it is capped at the UI range and the level stays positive.
// Once the level is set it is drawn as set.
TEST_F(MapUiLevelTest, DefaultPercentIsCappedUntilSet)
{
    ASSERT_TRUE(m_pMR->isPropDefault("siglevel"));
    EXPECT_NEAR(m_pMR->getEffectiveSigLevel(m_pMap), m_pMR->getUiLevelMax(), 1e-9);
    EXPECT_GT(m_pMR->resolveLevel(m_pMap), 0.0);

    m_pMR->setPropReal("siglevel", 1.0);
    EXPECT_FALSE(m_pMR->isPropDefault("siglevel"));
    EXPECT_DOUBLE_EQ(m_pMR->getEffectiveSigLevel(m_pMap), 1.0);
    EXPECT_DOUBLE_EQ(m_pMR->resolveLevel(m_pMap), m_pMap->getLevelAtTopFraction(0.01));
}
