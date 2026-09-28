#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/SelCommand.hpp"
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>
#include <qsys/TTYView.hpp>
#include <qlib/LQuat.hpp>
#include <qlib/Matrix4D.hpp>

#include <cmath>

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using molstr::SelCommand;
using molstr::SelectionPtr;
using qlib::LString;
using qlib::Vector4D;

namespace {

void addAtom(MolCoordPtr pMol, int resid)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("XXX");
    pAtom->setResIndex(ResidIndex(resid));
    pAtom->setName("CA");
    pAtom->setElementName("C");
    pAtom->setPos(Vector4D(double(resid), 0.0, 0.0));
    pMol->appendAtom(pAtom);
}

/// A scene holding one molecule, and a named selection defined in it.
struct Fixture
{
    qsys::ScenePtr pScene;
    MolCoordPtr pMol;

    Fixture()
    {
        pScene = qsys::SceneManager::getInstance()->createScene();
        pMol = MolCoordPtr(MB_NEW MolCoord());
        for (int i = 1; i <= 5; ++i) addAtom(pMol, i);
        pScene->addObject(pMol);

        qsys::StyleMgr *pSM = qsys::StyleMgr::getInstance();
        const qlib::uid_t nScope = pScene->getUID();
        int nSet = pSM->hasStyleSet("user", nScope);
        if (nSet == qlib::invalid_uid) nSet = pSM->createStyleSetScr("user", nScope);
        pSM->setStrData("sel", "twoatoms", "resi 2:3", nScope, nSet);
    }
};

}  // namespace

/**
 * A named selection resolves outside the display path.
 *
 * The name is resolved lazily, on the first isSelected(), and used to be
 * looked up in whatever style context happened to be current then. That only
 * worked inside Scene::display, which pushes the scene while drawing;
 * everything else -- a script, a worker service, a panel button,
 * PDBFileWriter -- got no scope and the name silently matched nothing.
 * SelRefNode now keeps the scope it was compiled in.
 */
TEST(SelRefScopeTest, NamedSelectionResolvesOutsideDisplay)
{
    Fixture f;

    SelCommand *pCom = MB_NEW SelCommand();
    SelectionPtr pSel(pCom);
    ASSERT_TRUE(pCom->compile("twoatoms", f.pScene->getUID()));

    // No style context pushed here on purpose: this is the caller that used
    // to get zero.
    EXPECT_EQ(f.pMol->getAtomSize(pSel), 2);
}

/** A named selection may be written in terms of another one. */
TEST(SelRefScopeTest, NamedSelectionMayReferToAnother)
{
    Fixture f;

    qsys::StyleMgr *pSM = qsys::StyleMgr::getInstance();
    const qlib::uid_t nScope = f.pScene->getUID();
    int nSet = pSM->hasStyleSet("user", nScope);
    ASSERT_NE(nSet, qlib::invalid_uid);
    // The resolved expression is compiled in the same scope, so the inner
    // name is reachable from the outer one.
    pSM->setStrData("sel", "half", "twoatoms and resi 2", nScope, nSet);

    SelCommand *pCom = MB_NEW SelCommand();
    SelectionPtr pSel(pCom);
    ASSERT_TRUE(pCom->compile("half", nScope));

    EXPECT_EQ(f.pMol->getAtomSize(pSel), 1);
}

/** A copy of a compiled selection keeps resolving the same way. */
TEST(SelRefScopeTest, CopyKeepsResolving)
{
    Fixture f;

    SelCommand orig;
    ASSERT_TRUE(orig.compile("twoatoms", f.pScene->getUID()));

    // SelAroundImpl clones the child of an around/expand node, so a copy has
    // to resolve as the original did.
    SelCommand *pCopy = MB_NEW SelCommand(orig);
    SelectionPtr pSel(pCopy);
    EXPECT_EQ(f.pMol->getAtomSize(pSel), 2);
}

/** The reference and the expression it stands for select the same atoms. */
TEST(SelRefScopeTest, NameAndExpressionAgree)
{
    Fixture f;

    SelCommand *pNameCom = MB_NEW SelCommand();
    SelectionPtr pByName(pNameCom);
    ASSERT_TRUE(pNameCom->compile("twoatoms", f.pScene->getUID()));

    SelCommand *pExprCom = MB_NEW SelCommand();
    SelectionPtr pByExpr(pExprCom);
    ASSERT_TRUE(pExprCom->compile("resi 2:3", f.pScene->getUID()));

    EXPECT_EQ(f.pMol->getAtomSize(pByName), f.pMol->getAtomSize(pByExpr));
}

/**
 * fitView leaves the view alone when nothing is selected.
 *
 * A default Box3D is inverted, so the old code carried it straight into the
 * arithmetic and threw the camera to the origin with a zero-size box.
 */
TEST(FitViewGuardTest, EmptySelectionLeavesTheViewAlone)
{
    Fixture f;
    // The view factory is not registered in this environment, so the scene
    // cannot make one; TTYView is the headless View the qsys tests use.
    qsys::ViewPtr pView(MB_NEW qsys::TTYView());
    pView->setViewCenter(qlib::Vector4D(1.0, 2.0, 3.0));
    pView->setZoom(50.0);
    const double slab0 = pView->getSlabDepth();

    SelCommand *pCom = MB_NEW SelCommand();
    SelectionPtr pSel(pCom);
    ASSERT_TRUE(pCom->compile("resi 999", f.pScene->getUID()));
    ASSERT_EQ(f.pMol->getAtomSize(pSel), 0);
    f.pMol->setSelection(pSel);

    f.pMol->fitView(pView, true);

    EXPECT_DOUBLE_EQ(pView->getZoom(), 50.0);
    EXPECT_DOUBLE_EQ(pView->getSlabDepth(), slab0);
    EXPECT_DOUBLE_EQ(pView->getViewCenter().x(), 1.0);
}

/**
 * A single atom is framed at the minimum extent, not at infinite
 * magnification.
 *
 * The 20 percent margin is a fraction of the box, so it adds nothing to a
 * box with no size: the zoom came out zero and View::setZoom clamped it to
 * F_EPS4.
 */
TEST(FitViewGuardTest, SingleAtomGetsAWorkableZoom)
{
    Fixture f;
    qsys::ViewPtr pView(MB_NEW qsys::TTYView());

    SelCommand *pCom = MB_NEW SelCommand();
    SelectionPtr pSel(pCom);
    ASSERT_TRUE(pCom->compile("resi 3", f.pScene->getUID()));
    ASSERT_EQ(f.pMol->getAtomSize(pSel), 1);
    f.pMol->setSelection(pSel);

    f.pMol->fitView(pView, true);

    EXPECT_GE(pView->getZoom(), 1.0);
    EXPECT_GE(pView->getSlabDepth(), 1.0);
    // Centred on the atom (added at x = resid).
    EXPECT_NEAR(pView->getViewCenter().x(), 3.0, 1.0e-6);
}

/**
 * orientView lays the principal axes of the atoms along the screen axes,
 * the longest along x and the thinnest along z (PyMOL's orient).
 *
 * The atoms form a slab whose long side runs diagonally in the xy plane, so
 * a view that kept any part of the starting rotation, or mixed up the order
 * of the axes, maps the long direction somewhere other than screen x.
 */
TEST(OrientViewTest, PrincipalAxesLieAlongTheScreenAxes)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();
    MolCoordPtr pMol(MB_NEW MolCoord());
    const double r = 1.0 / std::sqrt(2.0);
    const Vector4D uLong(r, r, 0.0), uMid(-r, r, 0.0), uThin(0.0, 0.0, 1.0);
    int resid = 1;
    for (int i = -5; i <= 5; ++i) {
        for (int j = -2; j <= 2; ++j) {
            for (int k = 0; k <= 1; ++k) {
                MolAtomPtr pAtom(MB_NEW MolAtom());
                pAtom->setChainName("A");
                pAtom->setResName("XXX");
                pAtom->setResIndex(ResidIndex(resid++));
                pAtom->setName("CA");
                pAtom->setElementName("C");
                pAtom->setPos(uLong.scale(2.0 * i) + uMid.scale(1.0 * j) +
                              uThin.scale(0.5 * k));
                pMol->appendAtom(pAtom);
            }
        }
    }
    pScene->addObject(pMol);

    qsys::ViewPtr pView(MB_NEW qsys::TTYView());
    // Start from an arbitrary rotation, which orientView must replace.
    pView->setRotQuat(qlib::LQuat(Vector4D(1.0, 2.0, 3.0).normalize(), 0.4));

    SelCommand *pCom = MB_NEW SelCommand();
    SelectionPtr pSel(pCom);
    ASSERT_TRUE(pCom->compile("*", pScene->getUID()));
    pMol->orientView(pView, pSel);

    // fitView's convention: view coordinates are makeRotMat(q).mulvec(p).
    const qlib::Matrix4D rmat = qlib::Matrix4D::makeRotMat(pView->getRotQuat());
    const Vector4D vLong = rmat.mulvec(uLong);
    const Vector4D vMid = rmat.mulvec(uMid);
    const Vector4D vThin = rmat.mulvec(uThin);
    // The sign of an eigenvector is arbitrary, as in PyMOL.
    EXPECT_NEAR(std::abs(vLong.x()), 1.0, 1.0e-6);
    EXPECT_NEAR(std::abs(vMid.y()), 1.0, 1.0e-6);
    EXPECT_NEAR(std::abs(vThin.z()), 1.0, 1.0e-6);
}
