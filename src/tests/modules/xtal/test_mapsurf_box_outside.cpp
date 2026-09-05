// -*-Mode: C++;-*-
//
// MapSurfRenderer in box region mode: a display box that lies entirely
// outside a non-periodic map must give an empty region, not a negative
// size (which used to throw from vector::resize on every frame).
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/Vector4D.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <vector>
#include "xtal/DensityMap.hpp"
#include "xtal/MapRenderer.hpp"
#include "xtal/MapSurfRenderer.hpp"
#include "surface/MolSurfObj.hpp"

using qlib::Vector4D;
using xtal::DensityMap;
using xtal::MapRenderer;
using xtal::MapSurfRenderer;

namespace {

class MapBoxOutsideTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    MapSurfRenderer *m_pMSR;

    static const int N = 16;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();

        DensityMap *pMap = MB_NEW DensityMap();
        std::vector<float> data((size_t)N * N * N);
        for (size_t i = 0; i < data.size(); ++i) data[i] = float(i % 7) - 3.0f;
        pMap->setMapFloatArray(data.data(), N, N, N, 0, 1, 2);
        pMap->setMapParams(0, 0, 0, N, N, N);
        pMap->setXtalParams(double(N), double(N), double(N), 90.0, 90.0, 90.0);
        pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);

        m_pObj = qsys::ObjectPtr(pMap);
        m_pObj->setName("boxmap");
        m_pScene->addObject(m_pObj);

        m_pRend = m_pObj->createRenderer("isosurf");
        m_pMSR = dynamic_cast<MapSurfRenderer *>(m_pRend.get());
        ASSERT_NE(m_pMSR, nullptr);
        m_pMSR->setRegionMode(MapRenderer::REGION_BOX);
        m_pMSR->setExtent(5.0);
        // On an EM map siglevel is the top percent of grid points. The seven
        // values here are equally populated, so the default (top 1.1%) sits
        // at the maximum and yields no surface; top 20% cuts at value 2.
        m_pMSR->setSigLevel(20.0);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }
};

}  // namespace

TEST_F(MapBoxOutsideTest, BoxInsideMapProducesSurface)
{
    m_pMSR->setCenter(Vector4D(8.0, 8.0, 8.0));
    qsys::ObjectPtr pSurf;
    ASSERT_NO_THROW(pSurf = m_pMSR->generateSurfObj());
    ASSERT_FALSE(pSurf.isnull());
    surface::MolSurfObj *pMS = dynamic_cast<surface::MolSurfObj *>(pSurf.get());
    ASSERT_NE(pMS, nullptr);
    EXPECT_GT(pMS->getVertSize(), 0);
}

TEST_F(MapBoxOutsideTest, BoxOutsideMapGivesEmptySurface)
{
    // far beyond the 16 A block along every axis
    m_pMSR->setCenter(Vector4D(200.0, 200.0, 200.0));
    qsys::ObjectPtr pSurf;
    ASSERT_NO_THROW(pSurf = m_pMSR->generateSurfObj());
    ASSERT_FALSE(pSurf.isnull());
    surface::MolSurfObj *pMS = dynamic_cast<surface::MolSurfObj *>(pSurf.get());
    ASSERT_NE(pMS, nullptr);
    EXPECT_EQ(pMS->getVertSize(), 0);
    EXPECT_EQ(pMS->getFaceSize(), 0);
}
