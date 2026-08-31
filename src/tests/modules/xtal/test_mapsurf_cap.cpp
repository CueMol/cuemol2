// MapSurfRenderer cap_mode: the border cap is an independent policy, not a
// side effect of the region mode, and the cap faces are clipped at the
// molecule boundary like the surface itself.
#include <gtest/gtest.h>
#include <common.h>
#include <qlib/Vector4D.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <vector>
#include "molstr/ElemSym.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/ResidIndex.hpp"
#include "surface/MolSurfObj.hpp"
#include "xtal/DensityMap.hpp"
#include "xtal/MapRenderer.hpp"
#include "xtal/MapSurfRenderer.hpp"

using molstr::MolAtomPtr;
using molstr::MolCoordPtr;
using qlib::Vector4D;

namespace {

class MapSurfCapTest : public ::testing::Test
{
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    xtal::MapSurfRenderer *m_pMSR;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();

        xtal::DensityMap *pMap = MB_NEW xtal::DensityMap();
        // 4x4x4 ramp covering [0, 63]; the default iso-level cuts through
        // the cell, so the surface reaches the range boundary.
        std::vector<float> data(64);
        for (int i = 0; i < 64; ++i) data[i] = float(i);
        pMap->setMapFloatArray(data.data(), 4, 4, 4, 0, 1, 2);
        pMap->setMapParams(0, 0, 0, 4, 4, 4);
        pMap->setXtalParams(4.0, 4.0, 4.0, 90.0, 90.0, 90.0);

        m_pObj = qsys::ObjectPtr(pMap);
        m_pObj->setName("testmap");
        m_pScene->addObject(m_pObj);

        m_pRend = m_pObj->createRenderer("isosurf");
        m_pMSR = dynamic_cast<xtal::MapSurfRenderer *>(m_pRend.get());
        ASSERT_NE(m_pMSR, nullptr);
        m_pMSR->setUsePBC(false);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }

    /// Vertex count of the generated surface (-1 if it could not be made)
    int genSurfVertSize()
    {
        qsys::ObjectPtr pSurfObj = m_pMSR->generateSurfObj();
        surface::MolSurfObj *pSurf =
            dynamic_cast<surface::MolSurfObj *>(pSurfObj.get());
        if (pSurf == nullptr) return -1;
        return pSurf->getVertSize();
    }
};

}  // namespace

TEST_F(MapSurfCapTest, DefaultIsAuto)
{
    EXPECT_EQ(m_pMSR->getCapMode(), xtal::MapSurfRenderer::CAP_AUTO);
}

TEST_F(MapSurfCapTest, CapOffDropsTheBorderFaces)
{
    // The gen-surf path caps by default (CAP_AUTO), so turning the cap off
    // must leave fewer vertices: the border faces are gone.
    m_pMSR->setCapMode(xtal::MapSurfRenderer::CAP_AUTO);
    const int nauto = genSurfVertSize();
    ASSERT_GT(nauto, 0);

    m_pMSR->setCapMode(xtal::MapSurfRenderer::CAP_OFF);
    const int noff = genSurfVertSize();
    ASSERT_GT(noff, 0);
    EXPECT_LT(noff, nauto);
}

TEST_F(MapSurfCapTest, CapPolicyIsIndependentOfTheRegionMode)
{
    // The point of the property: the cap no longer follows region_mode.
    // "on" caps in box region mode, where AUTO would not, and the two
    // explicit settings differ there.
    m_pMSR->setRegionMode(xtal::MapRenderer::REGION_BOX);
    ASSERT_EQ(m_pMSR->getEffectiveRegionMode(), xtal::MapRenderer::REGION_BOX);

    // The display path of the box region mode does not cap under AUTO...
    EXPECT_FALSE(m_pMSR->isCapEnabled(false));
    // ...but "on" does, and "off" turns the gen-surf cap off as well.
    m_pMSR->setCapMode(xtal::MapSurfRenderer::CAP_ON);
    EXPECT_TRUE(m_pMSR->isCapEnabled(false));
    EXPECT_TRUE(m_pMSR->isCapEnabled(true));

    m_pMSR->setCapMode(xtal::MapSurfRenderer::CAP_OFF);
    EXPECT_FALSE(m_pMSR->isCapEnabled(false));
    EXPECT_FALSE(m_pMSR->isCapEnabled(true));
}

TEST_F(MapSurfCapTest, CapFacesAreClippedAtTheMoleculeBoundary)
{
    // The border cap used to be emitted without consulting the molecule
    // boundary, so it stuck out where the surface itself had been clipped
    // away (and, on a partially filled cell, reused an edge whose
    // intersection was never computed).
    //
    // Geometry: an 8x8x8 map whose density falls off along x, so the
    // iso-surface is the plane x = 6.5 and everything at low x is inside.
    // The boundary is a 1.2 angstrom sphere around (3.5, 0.5, 3.5), which
    // the map's own y = 0 face cuts through: the cells on that face are
    // inside the surface (so they cap) and straddle the sphere.
    xtal::DensityMap *pMap = MB_NEW xtal::DensityMap();
    std::vector<float> data(8 * 8 * 8);
    for (int k = 0; k < 8; ++k)
        for (int j = 0; j < 8; ++j)
            for (int i2 = 0; i2 < 8; ++i2)
                data[i2 + 8 * (j + 8 * k)] = float(7 - i2) * 10.0f;
    pMap->setMapFloatArray(data.data(), 8, 8, 8, 0, 1, 2);
    pMap->setMapParams(0, 0, 0, 8, 8, 8);
    pMap->setXtalParams(8.0, 8.0, 8.0, 90.0, 90.0, 90.0);

    qsys::ObjectPtr pMapObj(pMap);
    pMapObj->setName("rampmap");
    m_pScene->addObject(pMapObj);
    qsys::RendererPtr pRend = pMapObj->createRenderer("isosurf");
    xtal::MapSurfRenderer *pMSR =
        dynamic_cast<xtal::MapSurfRenderer *>(pRend.get());
    ASSERT_NE(pMSR, nullptr);
    pMSR->setUsePBC(false);
    pMSR->setLevel(5.0);

    MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    MolAtomPtr pAtom(MB_NEW molstr::MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("ALA");
    pAtom->setResIndex(molstr::ResidIndex(1));
    pAtom->setName("CA");
    pAtom->setElement(molstr::ElemSym::C);
    pAtom->setPos(Vector4D(3.5, 0.5, 3.5));
    ASSERT_GE(pMol->appendAtom(pAtom), 0);

    qsys::ObjectPtr pMolObj(pMol);
    pMolObj->setName("testmol");
    m_pScene->addObject(pMolObj);

    pMSR->setBndryMolName("testmol");
    pMSR->setBndryRng(1.2);
    pMSR->setCapMode(xtal::MapSurfRenderer::CAP_ON);
    // generateSurfObj() calls makerange() but not setupMolBndry(), so the
    // boundary has to be resolved explicitly here (the display path does
    // it in render()).
    pMSR->setupMolBndry();

    qsys::ObjectPtr pSurfObj = pMSR->generateSurfObj();
    surface::MolSurfObj *pSurf =
        dynamic_cast<surface::MolSurfObj *>(pSurfObj.get());
    ASSERT_NE(pSurf, nullptr);
    const int nvert = pSurf->getVertSize();
    ASSERT_GT(nvert, 0);

    // The surface is clipped at the boundary (an edge with an outside
    // endpoint is dropped), so with the cap clipped the same way no vertex
    // may sit outside the sphere. An unclipped border face reaches the
    // corners of the cells it covers, well beyond it.
    const Vector4D vCen(3.5, 0.5, 3.5);
    const double kMaxDist = 1.4;  // boundary range 1.2 plus a margin
    for (int i2 = 0; i2 < nvert; ++i2) {
        const Vector4D v = pSurf->getVertAt(i2).v3d();
        EXPECT_LT((v - vCen).length(), kMaxDist)
            << "vertex " << i2 << " at " << v.x() << "," << v.y() << "," << v.z();
    }
}
