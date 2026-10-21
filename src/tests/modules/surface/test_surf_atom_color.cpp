// -*-Mode: C++;-*-
//
// Molecule-mode colouring of molsurf: a vertex takes the colour of the target
// molecule's atom nearest to it, and showsel hides the vertices of the atoms
// it leaves out. Every drawn vertex is compared with the nearest atom found
// by brute force (atom_color_test_util.hpp).
//

#include "atom_color_test_util.hpp"

#include "molstr/SelCommand.hpp"
#include "surface/MolSurfObj.hpp"
#include "surface/MolSurfRenderer.hpp"

using namespace atomcoltest;

namespace {

/// molsurf over the SES of the two atoms, coloured by molecule.
class MolSurfColorFixture : public SceneFixture
{
protected:
    surface::MolSurfRenderer *m_pMSR = nullptr;

    void SetUp() override
    {
        SceneFixture::SetUp();
        surface::MolSurfObjPtr pSurf(MB_NEW surface::MolSurfObj());
        pSurf->createSESFromMol(m_pMol, molstr::SelectionPtr(), 4.0, 1.4);
        pSurf->setName("surf");
        m_pScene->addObject(pSurf);
        qsys::RendererPtr pRend = pSurf->createRenderer("molsurf");
        m_pMSR = dynamic_cast<surface::MolSurfRenderer *>(pRend.get());
        ASSERT_NE(m_pMSR, nullptr);
        m_pMSR->setTgtObjName("mol");
        m_pMSR->setColorMode(surface::MolSurfRenderer::SFREND_MOLFANC);
        m_pMSR->setColSchm(molstr::ColoringSchemePtr(MB_NEW NameColoring()));
    }
};

}  // namespace

TEST_F(MolSurfColorFixture, VertexTakesTheNearestAtomColor)
{
    RecordDC dc(true);
    m_pMSR->render(&dc);

    int nchecked = 0;
    EXPECT_EQ(countMismatches(dc.m_verts, nchecked), 0);
    EXPECT_GT(nchecked, 100);
}

TEST_F(MolSurfColorFixture, ShowselHidesVerticesOfOtherAtoms)
{
    RecordDC dcAll(true);
    m_pMSR->render(&dcAll);

    m_pMSR->setShowSel(molstr::SelectionPtr(MB_NEW molstr::SelCommand("name C0")));
    RecordDC dc(true);
    m_pMSR->render(&dc);

    ASSERT_GT(dc.m_verts.size(), 0u);
    EXPECT_LT(dc.m_verts.size(), dcAll.m_verts.size());
    for (const auto &v : dc.m_verts)
        EXPECT_LE((v.first - POS0).length(), (v.first - POS1).length() + 1e-6);
}

