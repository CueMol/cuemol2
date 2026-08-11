// -*-Mode: C++;-*-
//
// Tests for MapSurfRenderer MOLFANC (colormode=molecule) support.
//
// GenerateSurfObjAppliesXformMatrix pins the CPU-side transform
// (setupXformMat with no args): it must apply the object's xform matrix
// consistently with the display-list path, since both the MULTIGRAD /
// MOLFANC color lookups and generateSurfObj() vertices depend on it.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/Matrix4D.hpp>
#include <qlib/Vector4D.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <vector>
#include "molstr/MolCoord.hpp"
#include "surface/MolSurfObj.hpp"
#include "xtal/DensityMap.hpp"
#include "xtal/MapSurfRenderer.hpp"

using qlib::Matrix4D;
using qlib::Vector4D;

namespace {

class MapSurfXformTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    xtal::MapSurfRenderer *m_pMSR;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();

        xtal::DensityMap *pMap = MB_NEW xtal::DensityMap();
        // 4x4x4 ramp covering [0, 63]; the default iso-level
        // (rmsd * siglevel 1.1, about 20) cuts through the cell
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
        // The 4x4x4 map covers the whole cell, which would enable PBC and
        // extend the marching range far beyond the cell; keep it bounded.
        m_pMSR->setUsePBC(false);
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }

    /// Generate the surface and return its vertex count; centroid in rval.
    int calcSurfCentroid(Vector4D &rval)
    {
        qsys::ObjectPtr pSurfObj = m_pMSR->generateSurfObj();
        surface::MolSurfObj *pSurf =
            dynamic_cast<surface::MolSurfObj *>(pSurfObj.get());
        if (pSurf == nullptr)
            return -1;
        const int nvert = pSurf->getVertSize();
        Vector4D sum;
        for (int i = 0; i < nvert; ++i)
            sum += pSurf->getVertAt(i).v3d();
        if (nvert > 0)
            rval = sum.divide(double(nvert));
        return nvert;
    }
};

}  // namespace

TEST_F(MapSurfXformTest, GenerateSurfObjAppliesXformMatrix)
{
    Vector4D c0;
    const int nvert0 = calcSurfCentroid(c0);
    ASSERT_GT(nvert0, 0);

    const Vector4D tr(10.0, -5.0, 3.0);
    m_pObj->setXformMatrix(Matrix4D::makeTransMat(tr));

    Vector4D c1;
    const int nvert1 = calcSurfCentroid(c1);
    ASSERT_EQ(nvert1, nvert0);

    // Vertices are stored as float32; keep the tolerance above that noise.
    EXPECT_NEAR(c1.x() - c0.x(), tr.x(), 1e-4);
    EXPECT_NEAR(c1.y() - c0.y(), tr.y(), 1e-4);
    EXPECT_NEAR(c1.z() - c0.z(), tr.z(), 1e-4);
}

// The target property (MOLFANC coloring mol) resolves a scene object by
// name, keeps it across get, and stays unresolved for unknown names.
TEST_F(MapSurfXformTest, TargetNameResolution)
{
    qsys::ObjectPtr pMol = qsys::ObjectPtr(MB_NEW molstr::MolCoord());
    pMol->setName("testmol");
    m_pScene->addObject(pMol);

    EXPECT_TRUE(m_pMSR->getTgtObjName().isEmpty());

    m_pMSR->setTgtObjName("testmol");
    EXPECT_EQ(m_pMSR->getTgtObjName(), qlib::LString("testmol"));

    // unknown names detach the previous target and stay unresolved
    m_pMSR->setTgtObjName("no_such_mol");
    EXPECT_TRUE(m_pMSR->getTgtObjName().isEmpty());
}
