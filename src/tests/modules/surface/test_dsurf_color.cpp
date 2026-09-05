// -*-Mode: C++;-*-
//
// Colouring contract of the direct surface renderers (dsurface, dsurf2):
// the potential ramp sampled from a scalar field, which property setters
// invalidate the display cache in which colour mode, and the qsc round trip
// of the colouring targets. The fixtures build a two-carbon molecule and a
// synthetic potential map whose value is the x coordinate, so a vertex's
// colour follows from where it sits.
//

#include <gtest/gtest.h>
#include <common.h>

#include "surface/DirectSurfRenderer.hpp"
#include "surface/DirectSurfRenderer2.hpp"
#include "surface/ElePotMap.hpp"
#include "qsc_roundtrip_util.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Mesh.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/RendererFactory.hpp>

#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/ElemSym.hpp"
#include "molstr/ResidIndex.hpp"

#include <utility>
#include <vector>

using qlib::LString;
using qlib::Vector4D;
using gfx::ColorPtr;
using surface::DirectSurfRenderer;
using surface::DirectSurfRenderer2;

namespace {

/// A few carbons along x; every direct surface renderer surfaces them.
molstr::MolCoordPtr makeMol()
{
    const double pos[2][3] = {{-1.5, 0.0, 0.0}, {1.5, 0.0, 0.0}};
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    for (int i = 0; i < 2; ++i) {
        molstr::MolAtomPtr pAtom(MB_NEW molstr::MolAtom());
        pAtom->setParentUID(pMol->getUID());
        pAtom->setName(LString::format("C%d", i));
        pAtom->setElement(molstr::ElemSym::C);
        pAtom->setChainName("A");
        pAtom->setResIndex(molstr::ResidIndex(1));
        pAtom->setResName("RES");
        pAtom->setPos(Vector4D(pos[i][0], pos[i][1], pos[i][2]));
        pMol->appendAtom(pAtom);
    }
    return pMol;
}

/// A potential map on [-6, 6]^3 whose value at (x, y, z) is x.
qsys::ObjectPtr makeXField()
{
    const int n = 49;
    const double g = 0.25;
    const double org = -6.0;
    std::vector<float> data((size_t)n * n * n, 0.0f);
    // Array3D layout: index = i + (j + k * nrow) * ncol, i along x.
    for (int k = 0; k < n; ++k)
        for (int j = 0; j < n; ++j)
            for (int i = 0; i < n; ++i)
                data[(size_t)i + ((size_t)j + (size_t)k * n) * n] = (float)(org + i * g);
    surface::ElePotMap *pMap = MB_NEW surface::ElePotMap();
    pMap->setMapFloatArray(data.data(), n, n, n, g, g, g, Vector4D(org, org, org));
    pMap->setName("pot");
    return qsys::ObjectPtr(pMap);
}

/// Apply fn to a direct surface renderer as its concrete type (both share the API).
template <class F>
void visitDsurf(const qsys::RendererPtr &pRend, F fn)
{
    if (DirectSurfRenderer *p = dynamic_cast<DirectSurfRenderer *>(pRend.get()))
        fn(*p);
    else if (DirectSurfRenderer2 *p = dynamic_cast<DirectSurfRenderer2 *>(pRend.get()))
        fn(*p);
    else
        FAIL() << "not a direct surface renderer";
}

/// Display context that only records the mesh it is handed.
class CaptureDC : public gfx::DisplayContext
{
public:
    std::vector<std::pair<Vector4D, ColorPtr> > m_verts;

    void drawMesh(const gfx::Mesh &mesh) override
    {
        const int nv = mesh.getVertSize();
        for (int i = 0; i < nv; ++i) {
            ColorPtr c;
            mesh.getCol(c, i);
            m_verts.push_back(std::make_pair(mesh.getVertex(i), c));
        }
    }

    bool setCurrent() override { return true; }
    bool isCurrent() const override { return true; }
    bool isFile() const override { return true; }
    void vertex(const Vector4D &) override {}
    void normal(const Vector4D &) override {}
    void color(const ColorPtr &) override {}
    void pushMatrix() override {}
    void popMatrix() override {}
    void multMatrix(const qlib::Matrix4D &) override {}
    void loadMatrix(const qlib::Matrix4D &) override {}
    void setPolygonMode(int) override {}
    void startPoints() override {}
    void startPolygon() override {}
    void startLines() override {}
    void startLineStrip() override {}
    void startTriangles() override {}
    void startTriangleStrip() override {}
    void startTriangleFan() override {}
    void startQuadStrip() override {}
    void startQuads() override {}
    void end() override {}
};

/// Scene + molecule + x-field, with a renderer of the type under test.
class DsurfColorFixture : public ::testing::TestWithParam<const char *>
{
protected:
    qsys::ScenePtr m_pScene;
    molstr::MolCoordPtr m_pMol;
    qsys::RendererPtr m_pRend;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pScene->addObject(makeXField());
        m_pMol = makeMol();
        m_pMol->setName("mol");
        m_pScene->addObject(m_pMol);
        m_pRend = m_pMol->createRenderer(GetParam());
        ASSERT_FALSE(m_pRend.isnull());
        // A coarse surface keeps the run short; the test only looks at signs.
        m_pRend->setPropInt("detail", 2);
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            const qlib::uid_t uid = m_pScene->getUID();
            m_pRend = qsys::RendererPtr();
            m_pMol = molstr::MolCoordPtr();
            m_pScene = qsys::ScenePtr();
            qsys::SceneManager::getInstance()->destroyScene(uid);
        }
    }

    /// Apply fn to the renderer as its concrete type (both share the API).
    template <class F>
    void visit(F fn)
    {
        visitDsurf(m_pRend, fn);
    }

    /// Run the display-list path and collect the coloured vertices.
    void renderInto(CaptureDC &dc)
    {
        visit([&](auto &r) { r.render(&dc); });
    }
};

}  // namespace

// The potential ramp: a vertex below the low stop takes lowcol, above the high
// stop highcol, sampled at the vertex position (ramp_above off).
TEST_P(DsurfColorFixture, PotentialModeColorsBySignOfTheField)
{
    ColorPtr lowcol = gfx::SolidColor::createRGB(1.0, 0.0, 0.0);
    ColorPtr highcol = gfx::SolidColor::createRGB(0.0, 0.0, 1.0);
    m_pRend->setPropStr("colormode", "potential");
    m_pRend->setPropStr("elepot", "pot");
    m_pRend->setPropReal("lowpar", -1.0);
    m_pRend->setPropReal("midpar", 0.0);
    m_pRend->setPropReal("highpar", 1.0);
    visit([&](auto &r) {
        r.setLowCol(lowcol);
        r.setHighCol(highcol);
    });

    CaptureDC dc;
    renderInto(dc);
    ASSERT_GT(dc.m_verts.size(), 0u);

    int nlow = 0, nhigh = 0;
    for (const auto &v : dc.m_verts) {
        const double x = v.first.x();
        if (x < -1.0) {
            EXPECT_EQ(v.second.get(), lowcol.get()) << "x=" << x;
            ++nlow;
        }
        else if (x > 1.0) {
            EXPECT_EQ(v.second.get(), highcol.get()) << "x=" << x;
            ++nhigh;
        }
    }
    EXPECT_GT(nlow, 0);
    EXPECT_GT(nhigh, 0);
}

// Without a resolvable map every vertex keeps the default colour.
TEST_P(DsurfColorFixture, PotentialModeWithoutAMapFallsBackToDefaultColor)
{
    ColorPtr defcol = gfx::SolidColor::createRGB(0.2, 0.4, 0.6);
    m_pRend->setPropStr("colormode", "potential");
    m_pRend->setPropStr("elepot", "");
    visit([&](auto &r) { r.setDefaultColor(defcol); });

    CaptureDC dc;
    renderInto(dc);
    ASSERT_GT(dc.m_verts.size(), 0u);
    for (const auto &v : dc.m_verts)
        EXPECT_EQ(v.second.get(), defcol.get());
}

// The potential target survives write -> read -> reapplyStyle.
TEST_P(DsurfColorFixture, ElepotRoundTrip)
{
    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pSrc = pRF->create(GetParam());
    ASSERT_FALSE(pSrc.isnull());
    pSrc->setPropStr("colormode", "potential");
    pSrc->setPropStr("elepot", "my_pot.dx");
    pSrc->setPropReal("lowpar", -3.0);

    qsys::RendererPtr pOut = surftest::roundTrip(pRF, GetParam(), pSrc);
    visitDsurf(pOut, [](auto &r) {
        EXPECT_EQ(r.getColorMode(), (int)r.DS_SCAPOT);
        EXPECT_TRUE(r.getTgtElePotName().equals("my_pot.dx")) << r.getTgtElePotName().c_str();
        EXPECT_DOUBLE_EQ(r.getLowPar(), -3.0);
    });
}

// A legacy qsc (UXP-era attributes, incl. the never-read `target`) loads.
TEST_P(DsurfColorFixture, LegacyPotentialQscLoads)
{
    const LString xml = LString::format(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
        "<renderer type=\"%s\" colormode=\"potential\" elepot=\"my_pot.dx\" "
        "group=\"\" name=\"surf1\" sel=\"*\" target=\"mol\" highpar=\"5\">\n"
        "<coloring type=\"CPKColoring\"/>\n"
        "</renderer>\n",
        GetParam());
    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pOut = surftest::loadFromXML(pRF, GetParam(), xml.c_str());
    visitDsurf(pOut, [](auto &r) {
        EXPECT_EQ(r.getColorMode(), (int)r.DS_SCAPOT);
        EXPECT_TRUE(r.getTgtElePotName().equals("my_pot.dx")) << r.getTgtElePotName().c_str();
        EXPECT_DOUBLE_EQ(r.getHighPar(), 5.0);
    });
}

// Multi-gradient: stops at -1 (red) and 1 (blue) on the x field.
TEST_P(DsurfColorFixture, MultigradModeColorsBySignOfTheField)
{
    m_pRend->setPropStr("colormode", "multigrad");
    m_pRend->setPropStr("color_mapname", "pot");
    visit([&](auto &r) {
        r.getMultiGrad()->insert(-1.0, gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
        r.getMultiGrad()->insert(1.0, gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    });

    CaptureDC dc;
    renderInto(dc);
    ASSERT_GT(dc.m_verts.size(), 0u);

    int nlow = 0, nhigh = 0;
    for (const auto &v : dc.m_verts) {
        const double x = v.first.x();
        ASSERT_FALSE(v.second.isnull());
        if (x < -1.0) {
            EXPECT_GT(v.second->fr(), v.second->fb()) << "x=" << x;
            ++nlow;
        }
        else if (x > 1.0) {
            EXPECT_GT(v.second->fb(), v.second->fr()) << "x=" << x;
            ++nhigh;
        }
    }
    EXPECT_GT(nlow, 0);
    EXPECT_GT(nhigh, 0);
}

// An empty color_mapname resolves nothing: every vertex keeps defaultcolor.
TEST_P(DsurfColorFixture, MultigradModeWithoutAMapFallsBackToDefaultColor)
{
    ColorPtr defcol = gfx::SolidColor::createRGB(0.2, 0.4, 0.6);
    m_pRend->setPropStr("colormode", "multigrad");
    m_pRend->setPropStr("color_mapname", "");
    visit([&](auto &r) { r.setDefaultColor(defcol); });

    CaptureDC dc;
    renderInto(dc);
    ASSERT_GT(dc.m_verts.size(), 0u);
    for (const auto &v : dc.m_verts)
        EXPECT_EQ(v.second.get(), defcol.get());
}

// ramp_above moves the sample point ramp_value along the normal: the colours
// change with a non-zero offset and are unchanged with a zero one. (Where
// the offset points is pinned on ScalarColorSupport::samplePos.)
TEST_P(DsurfColorFixture, RampAboveSamplesAlongTheNormal)
{
    m_pRend->setPropStr("colormode", "potential");
    m_pRend->setPropStr("elepot", "pot");
    m_pRend->setPropReal("lowpar", -1.0);
    m_pRend->setPropReal("midpar", 0.0);
    m_pRend->setPropReal("highpar", 1.0);

    const qlib::uid_t sid = m_pScene->getUID();
    auto devCodes = [&]() {
        CaptureDC dc;
        renderInto(dc);
        std::vector<quint32> codes;
        for (const auto &v : dc.m_verts) codes.push_back(v.second->getDevCode(sid));
        return codes;
    };
    auto countDiff = [](const std::vector<quint32> &a, const std::vector<quint32> &b) {
        int n = 0;
        for (size_t i = 0; i < a.size(); ++i)
            if (a[i] != b[i]) ++n;
        return n;
    };

    const std::vector<quint32> off = devCodes();
    ASSERT_GT(off.size(), 0u);

    m_pRend->setPropBool("ramp_above", true);
    m_pRend->setPropReal("ramp_value", 2.0);
    const std::vector<quint32> on = devCodes();
    ASSERT_EQ(on.size(), off.size()) << "same mesh, only colours change";
    EXPECT_GT(countDiff(off, on), 0);

    m_pRend->setPropReal("ramp_value", 0.0);
    const std::vector<quint32> zero = devCodes();
    ASSERT_EQ(zero.size(), off.size());
    EXPECT_EQ(countDiff(off, zero), 0);
}

// The multigrad target survives write -> read -> reapplyStyle and stays
// independent from the (unset) elepot storage.
TEST_P(DsurfColorFixture, ColorMapNameRoundTrip)
{
    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pSrc = pRF->create(GetParam());
    ASSERT_FALSE(pSrc.isnull());
    pSrc->setPropStr("colormode", "multigrad");
    pSrc->setPropStr("color_mapname", "my_map.cif");

    qsys::RendererPtr pOut = surftest::roundTrip(pRF, GetParam(), pSrc);
    visitDsurf(pOut, [](auto &r) {
        EXPECT_EQ(r.getColorMode(), (int)r.DS_MULTIGRAD);
        EXPECT_TRUE(r.getColorMapName().equals("my_map.cif")) << r.getColorMapName().c_str();
        EXPECT_TRUE(r.getTgtElePotName().isEmpty()) << r.getTgtElePotName().c_str();
    });
}

// A multigrad qsc in the molsurf shape (color_mapname + nested multi_grad)
// loads with its target and stops intact.
TEST_P(DsurfColorFixture, LegacyMultiGradQscLoads)
{
    const LString xml = LString::format(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
        "<renderer type=\"%s\" color_mapname=\"my_map.cif\" "
        "colormode=\"multigrad\" group=\"\" name=\"surf1\" sel=\"*\" "
        "target=\"my_mol.pdb\">\n"
        "<coloring type=\"CPKColoring\"/>\n"
        "<multi_grad>\n"
        "<gradnode par=\"-1.000000\" col=\"#0000FF\"/>\n"
        "<gradnode par=\"0.000000\" col=\"#FF0000\"/>\n"
        "<gradnode par=\"0.500000\" col=\"hsb(63.058824,1,1)\"/>\n"
        "</multi_grad>\n"
        "</renderer>\n",
        GetParam());
    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pOut = surftest::loadFromXML(pRF, GetParam(), xml.c_str());
    visitDsurf(pOut, [](auto &r) {
        EXPECT_EQ(r.getColorMode(), (int)r.DS_MULTIGRAD);
        EXPECT_TRUE(r.getColorMapName().equals("my_map.cif")) << r.getColorMapName().c_str();
        ASSERT_FALSE(r.getMultiGrad().isnull());
        EXPECT_EQ(r.getMultiGrad()->getSize(), 3);
    });
}

// `target` is a plain persisted string: it survives the round trip without
// a scene and never needs an object behind it.
TEST_P(DsurfColorFixture, TargetIsAPersistedString)
{
    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pSrc = pRF->create(GetParam());
    ASSERT_FALSE(pSrc.isnull());
    pSrc->setPropStr("target", "some_mol");
    visitDsurf(pSrc, [](auto &r) { EXPECT_TRUE(r.getTgtObjName().equals("some_mol")); });

    qsys::RendererPtr pOut = surftest::roundTrip(pRF, GetParam(), pSrc);
    visitDsurf(pOut, [](auto &r) {
        EXPECT_TRUE(r.getTgtObjName().equals("some_mol")) << r.getTgtObjName().c_str();
    });
}

INSTANTIATE_TEST_SUITE_P(DirectSurfTypes, DsurfColorFixture,
                         ::testing::Values("dsurface", "dsurf2"));

// --- dsurf2: the GPU colour pass and the display-list pass agree ---

namespace {

class ProbeDsurf2 : public DirectSurfRenderer2
{
public:
    using DirectSurfRenderer2::computeShownColors;
};

class Dsurf2PathsFixture : public ::testing::Test
{
protected:
    qsys::ScenePtr m_pScene;
    molstr::MolCoordPtr m_pMol;
    qsys::RendererPtr m_pRend;
    ProbeDsurf2 *m_pProbe = nullptr;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pScene->addObject(makeXField());
        m_pMol = makeMol();
        m_pMol->setName("mol");
        m_pScene->addObject(m_pMol);
        m_pProbe = MB_NEW ProbeDsurf2();
        m_pRend = qsys::RendererPtr(m_pProbe);
        m_pProbe->resetAllProps();
        m_pMol->attachRenderer(m_pRend);
        m_pProbe->setDetail(2);
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            const qlib::uid_t uid = m_pScene->getUID();
            m_pRend = qsys::RendererPtr();
            m_pMol = molstr::MolCoordPtr();
            m_pScene = qsys::ScenePtr();
            qsys::SceneManager::getInstance()->destroyScene(uid);
        }
    }

    /// Every shown vertex gets the same device colour from both passes.
    void expectPathsAgree(const char *what)
    {
        CaptureDC dc;
        m_pProbe->render(&dc);

        std::vector<int> vidmap;
        std::vector<quint32> vcol;
        const int nshown = m_pProbe->computeShownColors(vidmap, vcol);
        ASSERT_GT(nshown, 0) << what;
        ASSERT_EQ((size_t)nshown, dc.m_verts.size()) << what;

        const qlib::uid_t sid = m_pScene->getUID();
        for (size_t i = 0; i < vidmap.size(); ++i) {
            if (vidmap[i] < 0) continue;
            EXPECT_EQ(dc.m_verts[vidmap[i]].second->getDevCode(sid), vcol[i])
                << what << ", vertex " << i;
        }
    }
};

}  // namespace

TEST_F(Dsurf2PathsFixture, GpuAndDisplayListColorsAgree)
{
    expectPathsAgree("molecule");

    m_pProbe->setColorMode(DirectSurfRenderer2::DS_SCAPOT);
    m_pProbe->setTgtElePotName("pot");
    m_pProbe->setLowPar(-1.0);
    m_pProbe->setMidPar(0.0);
    m_pProbe->setHighPar(1.0);
    expectPathsAgree("potential");

    m_pProbe->setTgtElePotName("");
    expectPathsAgree("potential without a map");
}

// --- cache invalidation of the potential-ramp setters ---

namespace {

template <class R>
class Counting : public R
{
public:
    int m_nInvalidates = 0;
    void invalidateDisplayCache() override
    {
        ++m_nInvalidates;
        R::invalidateDisplayCache();
    }
};

template <class R>
void runRampSetters(R &r)
{
    r.setLowPar(-2.0);
    r.setMidPar(0.5);
    r.setHighPar(2.0);
    r.setLowCol(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
    r.setMidCol(gfx::SolidColor::createRGB(0.0, 1.0, 0.0));
    r.setHighCol(gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    r.setRampAbove(true);
    r.setRampValue(2.0);
}

template <class R>
void expectRampSettersInvalidateOnlyInPotentialMode()
{
    Counting<R> r;
    r.setColorMode(R::DS_SCAPOT);
    r.m_nInvalidates = 0;
    runRampSetters(r);
    EXPECT_EQ(r.m_nInvalidates, 8) << "each ramp setter redraws in potential mode";

    r.setColorMode(R::DS_MOLFANC);
    r.m_nInvalidates = 0;
    runRampSetters(r);
    EXPECT_EQ(r.m_nInvalidates, 0) << "the ramp is not drawn in molecule mode";
}

}  // namespace

TEST(DsurfRampSetters, DsurfaceInvalidatesOnlyInPotentialMode)
{
    expectRampSettersInvalidateOnlyInPotentialMode<DirectSurfRenderer>();
}

TEST(DsurfRampSetters, Dsurf2InvalidatesOnlyInPotentialMode)
{
    expectRampSettersInvalidateOnlyInPotentialMode<DirectSurfRenderer2>();
}

// --- multigrad mode: the same setters redraw, plus the map name and the stops ---

namespace {

template <class R>
void expectMultigradSettersInvalidate()
{
    Counting<R> r;
    r.setColorMode(R::DS_MULTIGRAD);
    r.m_nInvalidates = 0;
    runRampSetters(r);
    EXPECT_EQ(r.m_nInvalidates, 8) << "ramp_above / ramp_value apply in multigrad mode too";

    r.m_nInvalidates = 0;
    r.setColorMapName("map1");
    EXPECT_EQ(r.m_nInvalidates, 1);

    // editing the gradient stops is a nested property change
    r.m_nInvalidates = 0;
    r.getMultiGrad()->setNodesJSON(
        "[{\"value\":0.0,\"color\":\"#FF0000\"},{\"value\":1.0,\"color\":\"#0000FF\"}]");
    EXPECT_GE(r.m_nInvalidates, 1) << "multi_grad edits recolour in multigrad mode";

    r.setColorMode(R::DS_MOLFANC);
    r.m_nInvalidates = 0;
    r.setColorMapName("map2");
    r.getMultiGrad()->setNodesJSON("[{\"value\":0.5,\"color\":\"#00FF00\"}]");
    EXPECT_EQ(r.m_nInvalidates, 0) << "nothing to recolour in molecule mode";
}

}  // namespace

TEST(DsurfRampSetters, DsurfaceMultigradSettersInvalidate)
{
    expectMultigradSettersInvalidate<DirectSurfRenderer>();
}

TEST(DsurfRampSetters, Dsurf2MultigradSettersInvalidate)
{
    expectMultigradSettersInvalidate<DirectSurfRenderer2>();
}
