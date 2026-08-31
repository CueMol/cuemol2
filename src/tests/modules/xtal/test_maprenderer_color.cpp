// -*-Mode: C++;-*-
//
// Regression tests for MapRenderer color-property cache invalidation and for
// the per-renderer default colors declared in the .qif files.
//

#include <gtest/gtest.h>
#include <common.h>
#include <gfx/SolidColor.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <vector>
#include "xtal/DensityMap.hpp"
#include "xtal/MapSurfRenderer.hpp"
#include "xtal/MapRenderer.hpp"

using xtal::MapRenderer;
using xtal::MapSurfRenderer;

namespace {

// MapSurfRenderer is the concrete renderer used to exercise the shared
// MapRenderer property setters. invalidateDisplayCache() is virtual, so we
// override it to count invocations.
class CountingMapSurfRenderer : public MapSurfRenderer {
public:
    int m_nInvalidates = 0;
    void invalidateDisplayCache() override {
        ++m_nInvalidates;
        MapSurfRenderer::invalidateDisplayCache();
    }
};

}  // namespace

// In the display-list rendering path the color is baked into the cached display
// list, so changing the color property must invalidate the cache. Otherwise the
// stale list is reused and the surface color never updates (rendered gray).
// setColor must behave like its sibling setters (setColorMode etc.).
TEST(MapRendererColorTest, SetColorInvalidatesDisplayCache)
{
    CountingMapSurfRenderer r;
    r.m_nInvalidates = 0;

    gfx::ColorPtr col = gfx::SolidColor::createRGB(1.0, 0.0, 0.0);
    r.setColor(col);

    EXPECT_EQ(r.getColor().get(), col.get());
    EXPECT_GT(r.m_nInvalidates, 0);
}

// Sanity check on a known-correct sibling setter, confirming the test observes
// the right signal.
TEST(MapRendererColorTest, SetColorModeInvalidatesDisplayCache)
{
    CountingMapSurfRenderer r;
    r.m_nInvalidates = 0;

    r.setColorMode(MapRenderer::MAPREND_MULTIGRAD);

    EXPECT_GT(r.m_nInvalidates, 0);
}

namespace {

// The qif default color is only applied through RendererFactory::create()
// (which calls resetAllProps()), so the fixture builds a real scene object and
// asks it for renderers instead of constructing them directly.
class MapDefaultColorTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();

        const int n = 4;
        xtal::DensityMap *pMap = MB_NEW xtal::DensityMap();
        std::vector<float> data((size_t)n * n * n, 0.0f);
        pMap->setMapFloatArray(data.data(), n, n, n, 0, 1, 2);
        pMap->setMapParams(0, 0, 0, n, n, n);
        pMap->setXtalParams(double(n), double(n), double(n), 90.0, 90.0, 90.0);

        m_pObj = qsys::ObjectPtr(pMap);
        m_pObj->setName("colmap");
        m_pScene->addObject(m_pObj);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }

    gfx::ColorPtr defaultColorOf(const char *type_name)
    {
        qsys::RendererPtr pRend = m_pObj->createRenderer(type_name);
        MapRenderer *pMR = dynamic_cast<MapRenderer *>(pRend.get());
        if (pMR == NULL) return gfx::ColorPtr();
        return pMR->getColor();
    }
};

}  // namespace

// A filled isosurface in the MapRenderer blue is hard to read, so isosurf
// overrides the inherited default with a neutral light gray. Pins the
// override itself: changing the MapRenderer blue must not move this value.
TEST_F(MapDefaultColorTest, IsosurfDefaultsToLightGray)
{
    gfx::ColorPtr col = defaultColorOf("isosurf");
    ASSERT_FALSE(col.isnull());
    EXPECT_EQ(col->r(), 217);
    EXPECT_EQ(col->g(), 217);
    EXPECT_EQ(col->b(), 217);
}

// The contour mesh keeps the crystallographic blue (2Fo-Fc convention); only
// isosurf was recolored.
TEST_F(MapDefaultColorTest, ContourKeepsTheInheritedBlue)
{
    gfx::ColorPtr col = defaultColorOf("contour");
    ASSERT_FALSE(col.isnull());
    EXPECT_EQ(col->r(), 0);
    EXPECT_EQ(col->g(), 0);
    EXPECT_EQ(col->b(), 255);
}
