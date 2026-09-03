// -*-Mode: C++;-*-
//
// ScalarColorSupport: the potential ramp, the multi-gradient lookup, the
// ramp_above sampling offset, per-mode target names, scalar object
// resolution in a scene, and the change hook every setter fires.
//

#include <gtest/gtest.h>
#include <common.h>

#include "surface/ScalarColorSupport.hpp"
#include "surface/ElePotMap.hpp"
#include "surface/MolSurfRenderer.hpp"

#include <gfx/SolidColor.hpp>
#include <qsys/MultiGradient.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

#include <vector>

using qlib::Vector4D;
using gfx::ColorPtr;
using surface::ScalarColorSupport;

namespace {

/// Host that only counts change notifications.
class Host : public ScalarColorSupport
{
public:
    int m_nChanged = 0;

protected:
    void scalarColorPropChanged() override { ++m_nChanged; }
};

ColorPtr rgb(double r, double g, double b)
{
    return gfx::SolidColor::createRGB(r, g, b);
}

/// red below -1, white at 0, blue above 1
void setUnitRamp(Host &h, ColorPtr &low, ColorPtr &mid, ColorPtr &high)
{
    low = rgb(1.0, 0.0, 0.0);
    mid = rgb(1.0, 1.0, 1.0);
    high = rgb(0.0, 0.0, 1.0);
    h.setLowPar(-1.0);
    h.setMidPar(0.0);
    h.setHighPar(1.0);
    h.setLowCol(low);
    h.setMidCol(mid);
    h.setHighCol(high);
}

}  // namespace

TEST(ScalarColorSupport, RampReturnsTheStopsOutsideAndInterpolatesInside)
{
    Host h;
    ColorPtr low, mid, high;
    setUnitRamp(h, low, mid, high);

    EXPECT_EQ(h.rampColor(-2.0).get(), low.get());
    EXPECT_EQ(h.rampColor(2.0).get(), high.get());

    // mid..high: white -> blue, so red fades out monotonically
    ColorPtr a = h.rampColor(0.25);
    ColorPtr b = h.rampColor(0.75);
    EXPECT_LT(a->fr(), 1.0);
    EXPECT_GT(a->fr(), b->fr());
    EXPECT_NEAR(a->fb(), 1.0, 1e-6);

    // low..mid: red -> white, so green fades in monotonically
    ColorPtr c = h.rampColor(-0.75);
    ColorPtr d = h.rampColor(-0.25);
    EXPECT_GT(c->fg(), 0.0);
    EXPECT_LT(c->fg(), d->fg());
    EXPECT_NEAR(c->fr(), 1.0, 1e-6);
}

TEST(ScalarColorSupport, RampWithCoincidentStopsDoesNotDivideByZero)
{
    Host h;
    ColorPtr low, mid, high;
    setUnitRamp(h, low, mid, high);
    h.setLowPar(0.0);
    h.setMidPar(0.0);
    h.setHighPar(0.0);
    ColorPtr c = h.rampColor(0.0);
    ASSERT_FALSE(c.isnull());
    EXPECT_TRUE(std::isfinite(c->fr()));
}

TEST(ScalarColorSupport, MultigradModeFollowsTheGradientNodes)
{
    Host h;
    h.getMultiGrad()->insert(0.0, rgb(1.0, 0.0, 0.0));
    h.getMultiGrad()->insert(1.0, rgb(0.0, 0.0, 1.0));

    ColorPtr lo = h.scalarColor(-1.0, ScalarColorSupport::SCM_MULTIGRAD);
    ColorPtr hi = h.scalarColor(2.0, ScalarColorSupport::SCM_MULTIGRAD);
    ASSERT_FALSE(lo.isnull());
    ASSERT_FALSE(hi.isnull());
    EXPECT_GT(lo->fr(), lo->fb());
    EXPECT_GT(hi->fb(), hi->fr());

    // the ramp ignores the gradient nodes
    ColorPtr low, mid, high;
    setUnitRamp(h, low, mid, high);
    EXPECT_EQ(h.scalarColor(-2.0, ScalarColorSupport::SCM_RAMP).get(), low.get());

    EXPECT_TRUE(h.scalarColor(0.5, ScalarColorSupport::SCM_NONE).isnull());
}

TEST(ScalarColorSupport, SamplePosMovesAlongTheNormalOnlyWithRampAbove)
{
    Host h;
    const Vector4D pos(1.0, 2.0, 3.0);
    const Vector4D norm(0.0, 0.0, 1.0);
    h.setRampValue(2.0);

    h.setRampAbove(false);
    EXPECT_TRUE(h.samplePos(pos, norm).equals(pos));

    h.setRampAbove(true);
    EXPECT_TRUE(h.samplePos(pos, norm).equals(Vector4D(1.0, 2.0, 5.0)));
}

TEST(ScalarColorSupport, TargetNamesAreKeptPerMode)
{
    Host h;
    h.setTgtElePotName("pot.dx");
    EXPECT_TRUE(h.getColorMapName().isEmpty());
    h.setColorMapName("map.cif");
    EXPECT_TRUE(h.getTgtElePotName().equals("pot.dx"));

    EXPECT_TRUE(h.getScalarTargetName(ScalarColorSupport::SCM_RAMP).equals("pot.dx"));
    EXPECT_TRUE(h.getScalarTargetName(ScalarColorSupport::SCM_MULTIGRAD).equals("map.cif"));
    EXPECT_TRUE(h.getScalarTargetName(ScalarColorSupport::SCM_NONE).isEmpty());
}

TEST(ScalarColorSupport, EverySetterNotifiesTheHostOnce)
{
    Host h;
    int expected = 0;
    auto check = [&](const char *what) {
        ++expected;
        EXPECT_EQ(h.m_nChanged, expected) << what;
    };
    h.setTgtElePotName("a");
    check("elepot");
    h.setLowPar(-1.0);
    check("lowpar");
    h.setMidPar(0.0);
    check("midpar");
    h.setHighPar(1.0);
    check("highpar");
    h.setLowCol(rgb(1, 0, 0));
    check("lowcol");
    h.setMidCol(rgb(1, 1, 1));
    check("midcol");
    h.setHighCol(rgb(0, 0, 1));
    check("highcol");
    h.setRampAbove(true);
    check("ramp_above");
    h.setRampValue(2.0);
    check("ramp_value");
    h.setMultiGrad(qsys::MultiGradientPtr(MB_NEW qsys::MultiGradient()));
    check("multi_grad");
    h.setColorMapName("b");
    check("color_mapname");
}

TEST(ScalarColorSupport, ResolvesTheModeTargetInTheScene)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();
    {
        std::vector<float> data(8, 0.5f);
        surface::ElePotMap *pMap = MB_NEW surface::ElePotMap();
        pMap->setMapFloatArray(data.data(), 2, 2, 2, 1.0, 1.0, 1.0, Vector4D(0, 0, 0));
        pMap->setName("pot");
        pScene->addObject(qsys::ObjectPtr(pMap));
    }

    Host h;
    h.setTgtElePotName("pot");
    EXPECT_NE(h.resolveScalarObj(pScene, ScalarColorSupport::SCM_RAMP), nullptr);
    EXPECT_EQ(h.resolveScalarObj(pScene, ScalarColorSupport::SCM_MULTIGRAD), nullptr)
        << "color_mapname is unset";
    EXPECT_EQ(h.resolveScalarObj(pScene, ScalarColorSupport::SCM_NONE), nullptr);
    EXPECT_EQ(h.resolveScalarObj(qsys::ScenePtr(), ScalarColorSupport::SCM_RAMP), nullptr);

    h.setColorMapName("nope");
    EXPECT_EQ(h.resolveScalarObj(pScene, ScalarColorSupport::SCM_MULTIGRAD), nullptr);
    EXPECT_TRUE(h.getColorMapObjImpl(pScene).isnull());
    h.setColorMapName("pot");
    EXPECT_NE(h.resolveScalarObj(pScene, ScalarColorSupport::SCM_MULTIGRAD), nullptr);
    EXPECT_FALSE(h.getColorMapObjImpl(pScene).isnull());

    // sampling through the resolved object
    const qsys::ScalarObject *pSca = h.resolveScalarObj(pScene, ScalarColorSupport::SCM_RAMP);
    ColorPtr col;
    EXPECT_TRUE(h.getScalarColor(pSca, Vector4D(0.5, 0.5, 0.5), Vector4D(0, 0, 1),
                                 ScalarColorSupport::SCM_RAMP, col));
    EXPECT_FALSE(col.isnull());
    EXPECT_FALSE(h.getScalarColor(nullptr, Vector4D(0.5, 0.5, 0.5), Vector4D(0, 0, 1),
                                  ScalarColorSupport::SCM_RAMP, col));

    qsys::SceneManager::getInstance()->destroyScene(pScene->getUID());
}

// --- host wiring: molsurf redraws ramp changes in either scalar mode ---

namespace {

class CountingMolSurf : public surface::MolSurfRenderer
{
public:
    int m_nInvalidates = 0;
    void invalidateDisplayCache() override
    {
        ++m_nInvalidates;
        MolSurfRenderer::invalidateDisplayCache();
    }
};

}  // namespace

TEST(ScalarColorSupport, MolSurfRedrawsRampChangesInBothScalarModes)
{
    CountingMolSurf r;

    r.setColorMode(surface::MolSurfRenderer::SFREND_MULTIGRAD);
    r.m_nInvalidates = 0;
    r.setRampAbove(true);
    EXPECT_EQ(r.m_nInvalidates, 1) << "multigrad mode samples with ramp_above too";

    r.setColorMode(surface::MolSurfRenderer::SFREND_SCAPOT);
    r.m_nInvalidates = 0;
    r.setLowPar(-2.0);
    EXPECT_EQ(r.m_nInvalidates, 1);

    r.setColorMode(surface::MolSurfRenderer::SFREND_MOLFANC);
    r.m_nInvalidates = 0;
    r.setLowPar(-3.0);
    r.setRampAbove(false);
    r.setColorMapName("x");
    EXPECT_EQ(r.m_nInvalidates, 0) << "no scalar colouring drawn in molecule mode";
}
