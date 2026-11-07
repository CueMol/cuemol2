//
// BfacColoring with a multi-colour gradient (multi_grad).
//
// Pins what would break quietly: the two-colour ramp must stay as it was when
// the gradient has no nodes (existing scenes and styles); a node edit must
// reach the renderer as a "coloring.multi_grad" change and be undoable, which
// needs the root and the dotted name passed down two levels
// (LScrObjBase::setupParentData -> parentDataChanged); the nodes must survive
// a qsc round trip (readFrom2 + reapplyStyle); and a copied coloring must own
// its nodes.
//

#include <gtest/gtest.h>
#include <common.h>

#include "molstr/BfacColoring.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/RendererFactory.hpp>
#include <qsys/MultiGradient.hpp>
#include <qlib/LPropEvent.hpp>
#include <gfx/SolidColor.hpp>

#include "../surface/qsc_roundtrip_util.hpp"

using molstr::BfacColoring;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using qsys::MultiGradient;
using qsys::MultiGradientPtr;

namespace {

/// ChimeraX's `alphafold` colormap: pLDDT 0 red, 50 orange, 70 yellow, 90 cornflowerblue, 100 blue.
MultiGradientPtr plddtGradient()
{
    MultiGradientPtr p(MB_NEW MultiGradient());
    p->insert(0.0, gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
    p->insert(50.0, gfx::SolidColor::createRGB(1.0, 165.0 / 255.0, 0.0));
    p->insert(70.0, gfx::SolidColor::createRGB(1.0, 1.0, 0.0));
    p->insert(90.0, gfx::SolidColor::createRGB(100.0 / 255.0, 149.0 / 255.0, 237.0 / 255.0));
    p->insert(100.0, gfx::SolidColor::createRGB(0.0, 0.0, 1.0));
    return p;
}

MolAtomPtr atomWithBfac(double b)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setBfac(b);
    return pAtom;
}

/// The colour BfacColoring gives an atom of B-factor `b`, as 0xRRGGBB.
unsigned rgb(BfacColoring &c, double b)
{
    gfx::ColorPtr col;
    EXPECT_TRUE(c.getAtomColor(atomWithBfac(b), col));
    return (unsigned(col->r()) << 16) | (unsigned(col->g()) << 8) | unsigned(col->b());
}

/// A scene with a molecule and a simple renderer coloured by a BfacColoring.
struct Fixture
{
    qsys::ScenePtr pScene;
    qsys::RendererPtr pRend;
    BfacColoring *pBfac = nullptr;

    Fixture()
    {
        pScene = qsys::SceneManager::getInstance()->createScene();
        molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
        pMol->setName("mol");
        pScene->addObject(pMol);
        pRend = pMol->createRenderer("simple");

        qlib::LScrSp<molstr::ColoringScheme> pSchm(MB_NEW BfacColoring());
        qlib::LVariant var;
        var.setObjectPtr(pSchm.copy());
        EXPECT_TRUE(pRend->setProperty("coloring", var));
        auto *pHolder = dynamic_cast<molstr::ColSchmHolder *>(pRend.get());
        pBfac = dynamic_cast<BfacColoring *>(pHolder->getColSchm().get());
    }

    ~Fixture() { qsys::SceneManager::getInstance()->destroyScene(pScene->getUID()); }
};

/// Records the prop-changed events a renderer fires.
struct EventLog : public qlib::LPropEventListener
{
    std::vector<std::string> parents;
    void propChanged(qlib::LPropEvent &ev) override { parents.push_back(ev.getParentName().c_str()); }
};

}  // namespace

// No nodes: the two-colour ramp as before. Nodes: the gradient, interpolated
// between the nodes around the value and clamped at the ends.
TEST(BfacColoringMultiGrad, ColoursByTheGradientOnlyWhenItHasNodes)
{
    BfacColoring c;
    c.setPropStr("auto", "none");
    // Default ramp: lowpar 20 blue, highpar 80 red.
    EXPECT_EQ(rgb(c, 90.0), 0xFF0000u);
    EXPECT_EQ(rgb(c, 10.0), 0x0000FFu);

    c.getMultiGrad()->copyFromImpl(plddtGradient().get());
    EXPECT_EQ(rgb(c, -5.0), 0xFF0000u);   // below the first node: red
    EXPECT_EQ(rgb(c, 100.0), 0x0000FFu);  // at the last node: blue
    // 60: halfway from orange (255,165,0) to yellow (255,255,0)
    unsigned mid = rgb(c, 60.0);
    EXPECT_EQ(mid >> 16, 0xFFu);
    EXPECT_NEAR(int((mid >> 8) & 0xFF), 210, 1);
    EXPECT_EQ(mid & 0xFF, 0u);
}

// The nested gradient knows its root and dotted name once the coloring is the
// renderer's, so an edit reaches the renderer as coloring.multi_grad and is
// one undo step.
TEST(BfacColoringMultiGrad, NodeEditReachesTheRendererAndIsUndoable)
{
    Fixture f;
    ASSERT_NE(f.pBfac, nullptr);
    MultiGradientPtr pGrad = f.pBfac->getMultiGrad();
    EXPECT_STREQ(pGrad->getThisName().c_str(), "coloring.multi_grad");
    EXPECT_EQ(pGrad->getRootUID(), f.pRend->getUID());

    EventLog log;
    f.pRend->addPropListener(&log);
    f.pScene->startUndoTxn("set nodes");
    pGrad->copyFrom(plddtGradient());
    f.pScene->commitUndoTxn();
    f.pRend->removePropListener(&log);

    ASSERT_EQ(pGrad->getSize(), 5);
    EXPECT_NE(std::find(log.parents.begin(), log.parents.end(), "coloring.multi_grad"), log.parents.end());

    f.pScene->undo(0);
    EXPECT_EQ(pGrad->getSize(), 0);
    f.pScene->redo(0);
    EXPECT_EQ(pGrad->getSize(), 5);
}

// The nodes survive a qsc save and load (readFrom2 + reapplyStyle), and a
// copied coloring owns its nodes.
TEST(BfacColoringMultiGrad, NodesSurviveQscAndCopiesOwnTheirNodes)
{
    Fixture f;
    ASSERT_NE(f.pBfac, nullptr);
    f.pBfac->getMultiGrad()->copyFromImpl(plddtGradient().get());

    qsys::RendererPtr pBack = surftest::roundTrip(qsys::RendererFactory::getInstance(), "simple", f.pRend);
    auto *pHolder = dynamic_cast<molstr::ColSchmHolder *>(pBack.get());
    auto *pBfac2 = dynamic_cast<BfacColoring *>(pHolder->getColSchm().get());
    ASSERT_NE(pBfac2, nullptr);
    ASSERT_EQ(pBfac2->getMultiGrad()->getSize(), 5);
    EXPECT_DOUBLE_EQ(pBfac2->getMultiGrad()->getValueAt(3), 90.0);

    BfacColoring copy(*f.pBfac);
    copy.getMultiGrad()->clear();
    EXPECT_EQ(f.pBfac->getMultiGrad()->getSize(), 5);
}
