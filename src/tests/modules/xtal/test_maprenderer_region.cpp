// -*-Mode: C++;-*-
//
// Tests for the map kind (DensityMap::map_type) and the display region
// policy (MapRenderer::region_mode) resolution, and the periodic-boundary
// eligibility that combines them with use_pbc.
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

using qlib::Vector4D;
using xtal::DensityMap;
using xtal::MapRenderer;
using xtal::MapSurfRenderer;

namespace {

class MapRegionTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    DensityMap *m_pMap;
    MapSurfRenderer *m_pMSR;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();

        const int n = 4;
        m_pMap = MB_NEW DensityMap();
        std::vector<float> data((size_t)n * n * n);
        for (size_t i = 0; i < data.size(); ++i)
            data[i] = float(i % 7) - 3.0f;
        m_pMap->setMapFloatArray(data.data(), n, n, n, 0, 1, 2);
        m_pMap->setMapParams(0, 0, 0, n, n, n);
        m_pMap->setXtalParams(double(n), double(n), double(n), 90.0, 90.0, 90.0);

        m_pObj = qsys::ObjectPtr(m_pMap);
        m_pObj->setName("regmap");
        m_pScene->addObject(m_pObj);

        m_pRend = m_pObj->createRenderer("isosurf");
        m_pMSR = dynamic_cast<MapSurfRenderer *>(m_pRend.get());
        ASSERT_NE(m_pMSR, nullptr);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }
};

}  // namespace

// A map without reader evidence is crystallographic: periodic, and the
// renderer keeps the historical box region (the crystal user's default).
TEST_F(MapRegionTest, DefaultIsXtalAndBox)
{
    EXPECT_EQ(m_pMap->getMapType(), DensityMap::MAPTYPE_AUTO);
    EXPECT_EQ(m_pMap->getEffectiveMapType(), DensityMap::MAPTYPE_XTAL);
    EXPECT_TRUE(m_pMap->isPeriodic());
    EXPECT_EQ(std::string(m_pMap->getMapTypeResolvedStr().c_str()), "xtal");

    EXPECT_EQ(m_pMSR->getRegionMode(), MapRenderer::REGION_AUTO);
    EXPECT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_BOX);
    EXPECT_EQ(std::string(m_pMSR->getRegionModeResolvedStr().c_str()), "box");
}

// The reader's EM detection flips the auto region policy to full.
TEST_F(MapRegionTest, DetectedEMResolvesToFull)
{
    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);

    EXPECT_EQ(m_pMap->getMapType(), DensityMap::MAPTYPE_AUTO);
    EXPECT_EQ(m_pMap->getEffectiveMapType(), DensityMap::MAPTYPE_EM);
    EXPECT_FALSE(m_pMap->isPeriodic());
    EXPECT_EQ(std::string(m_pMap->getMapTypeResolvedStr().c_str()), "em");
    EXPECT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_FULL);
    EXPECT_EQ(std::string(m_pMSR->getRegionModeResolvedStr().c_str()), "full");
}

// An explicit map_type overrides the detection in both directions.
TEST_F(MapRegionTest, MapTypeOverridesDetection)
{
    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);
    m_pMap->setMapType(DensityMap::MAPTYPE_XTAL);
    EXPECT_TRUE(m_pMap->isPeriodic());
    EXPECT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_BOX);

    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_XTAL);
    m_pMap->setMapType(DensityMap::MAPTYPE_EM);
    EXPECT_FALSE(m_pMap->isPeriodic());
    EXPECT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_FULL);
}

// The renderer forwards the object's effective map kind so the GUI can show
// it without reaching for the parent object, and follows both the reader's
// detection and an explicit override.
TEST_F(MapRegionTest, RendererForwardsTheResolvedMapKind)
{
    EXPECT_EQ(std::string(m_pMSR->getMapTypeResolvedStr().c_str()), "xtal");

    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);
    EXPECT_EQ(std::string(m_pMSR->getMapTypeResolvedStr().c_str()), "em");

    m_pMap->setMapType(DensityMap::MAPTYPE_XTAL);
    EXPECT_EQ(std::string(m_pMSR->getMapTypeResolvedStr().c_str()), "xtal");
}

// An explicit region_mode overrides the map kind on the renderer side, so
// a crystallographic map can be shown in full and an EM map in a box.
TEST_F(MapRegionTest, RegionModeOverridesMapKind)
{
    m_pMSR->setRegionMode(MapRenderer::REGION_FULL);
    EXPECT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_FULL);

    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);
    m_pMSR->setRegionMode(MapRenderer::REGION_BOX);
    EXPECT_EQ(m_pMSR->getEffectiveRegionMode(), MapRenderer::REGION_BOX);
}

// PBC needs all of: a periodic map, a block spanning the whole cell,
// use_pbc on, and a box region. The first three are the historical rule;
// the map kind and the region policy are the new terms.
TEST_F(MapRegionTest, PBCEligibility)
{
    EXPECT_TRUE(m_pMSR->isUsePBC());
    EXPECT_TRUE(m_pMSR->isPBCEligible(m_pMap, true));
    EXPECT_FALSE(m_pMSR->isPBCEligible(m_pMap, false));

    m_pMSR->setUsePBC(false);
    EXPECT_FALSE(m_pMSR->isPBCEligible(m_pMap, true));
    m_pMSR->setUsePBC(true);

    // EM map: never periodic, even when the block spans the "cell"
    m_pMap->setDetectedMapType(DensityMap::MAPTYPE_EM);
    EXPECT_FALSE(m_pMSR->isPBCEligible(m_pMap, true));
    // ... unless the user forces the crystallographic kind
    m_pMap->setMapType(DensityMap::MAPTYPE_XTAL);
    EXPECT_TRUE(m_pMSR->isPBCEligible(m_pMap, true));

    // full region never wraps
    m_pMSR->setRegionMode(MapRenderer::REGION_FULL);
    EXPECT_FALSE(m_pMSR->isPBCEligible(m_pMap, true));

    // non-DensityMap scalar objects are never periodic
    EXPECT_FALSE(m_pMSR->isPBCEligible(nullptr, true));
}

// The block center must not halve the start index along with the size
// (a cropped block starting at (3,4,5) in a 24-grid, 24 A cell).
TEST_F(MapRegionTest, BlockCenterWithNonZeroStart)
{
    m_pMap->setMapParams(3, 4, 5, 24, 24, 24);
    m_pMap->setXtalParams(24.0, 24.0, 24.0, 90.0, 90.0, 90.0);
    const Vector4D c = m_pMap->getCenter();
    EXPECT_NEAR(c.x(), 3.0 + 2.0, 1e-9);
    EXPECT_NEAR(c.y(), 4.0 + 2.0, 1e-9);
    EXPECT_NEAR(c.z(), 5.0 + 2.0, 1e-9);
}

// The map origin shifts every grid <-> orthogonal conversion.
TEST_F(MapRegionTest, OriginShiftsConversions)
{
    const Vector4D vorig(10.0, 20.0, 30.0);
    m_pMap->setOrigin(vorig);
    EXPECT_TRUE(m_pMap->getOrigin().equals(vorig));

    const Vector4D o = m_pMap->convToOrth(Vector4D(0, 0, 0));
    EXPECT_NEAR(o.x(), 10.0, 1e-9);
    EXPECT_NEAR(o.y(), 20.0, 1e-9);
    EXPECT_NEAR(o.z(), 30.0, 1e-9);

    const Vector4D c = m_pMap->getCenter();
    EXPECT_NEAR(c.x(), 12.0, 1e-9);
    EXPECT_NEAR(c.y(), 22.0, 1e-9);
    EXPECT_NEAR(c.z(), 32.0, 1e-9);

    // grid node (1,2,3) sits at origin + (1,2,3) A; getValueAt truncates
    // to the node, so sample half a grid past it to stay off the edge
    EXPECT_TRUE(m_pMap->isInRange(Vector4D(11.5, 22.5, 33.5)));
    EXPECT_FALSE(m_pMap->isInRange(Vector4D(1.5, 2.5, 3.5)));
    EXPECT_NEAR(m_pMap->getValueAt(Vector4D(11.5, 22.5, 33.5)),
                m_pMap->atFloat(1, 2, 3), 1e-9);
}
