// Undo / redo of MolCoord::deleteAtoms() and copyAtoms() (merge): atoms put
// back keep their atom IDs, so the edit records after them (coordinate undo,
// a later deletion) still reach them, and the recorded atoms are what is
// taken out and put back, never a selection evaluated again.
#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/SelCommand.hpp"
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/UndoManager.hpp>
#include <qlib/Matrix4D.hpp>

#include <functional>

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

int addAtom(MolCoordPtr pMol, const char *chain, int resid, const char *name,
            const Vector4D &pos, char conf = '\0')
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName(chain);
    pAtom->setResName("ALA");
    pAtom->setResIndex(ResidIndex(resid));
    pAtom->setName(name);
    pAtom->setElementName("C");
    pAtom->setConfID(conf);
    pAtom->setPos(pos);
    return pMol->appendAtom(pAtom);
}

/// A scene holding chain A: residues 1-5, each N / CA / CB, 2 A apart along x.
struct Fixture
{
    qsys::ScenePtr pScene;
    MolCoordPtr pMol;

    Fixture()
    {
        pScene = qsys::SceneManager::getInstance()->createScene();
        pMol = MolCoordPtr(MB_NEW MolCoord());
        const char *names[] = {"N", "CA", "CB"};
        for (int r = 1; r <= 5; ++r)
            for (int k = 0; k < 3; ++k)
                addAtom(pMol, "A", r, names[k], Vector4D(2.0 * r, 0.5 * k, 0.0));
        pScene->addObject(pMol);
    }

    SelectionPtr sel(const char *expr)
    {
        SelCommand *pCom = MB_NEW SelCommand();
        SelectionPtr pSel(pCom);
        EXPECT_TRUE(pCom->compile(expr, pScene->getUID())) << expr;
        return pSel;
    }

    void txn(const char *desc, const std::function<void()> &edit)
    {
        qsys::UndoManager *pUM = pScene->getUndoMgr();
        pUM->startTxn(desc);
        edit();
        pUM->commitTxn();
    }

    bool undo() { return pScene->getUndoMgr()->undo(); }
    bool redo() { return pScene->getUndoMgr()->redo(); }
};

}  // namespace

// The reported bug: part of a residue deleted could not be put back. The
// atoms come back under their own IDs, so the coordinate undo recorded
// before the deletion reaches them.
TEST(MolDeleteUndo, PartialResidueComesBackUnderItsIDs)
{
    Fixture f;
    const int nAll = f.pMol->getAtomSize();
    const int aid = f.pMol->getAtom("A", ResidIndex(3), "CA")->getID();
    const Vector4D pos0 = f.pMol->getAtom(aid)->getPos();

    f.txn("move", [&] {
        f.pMol->xformByMat(qlib::Matrix4D::makeTransMat(Vector4D(10.0, 0.0, 0.0)), f.sel("*"));
    });
    f.txn("delete", [&] { f.pMol->deleteAtoms(f.sel("resi 2:3 and name CA")); });
    ASSERT_EQ(f.pMol->getAtomSize(), nAll - 2);
    ASSERT_TRUE(f.pMol->getAtom(aid).isnull());

    ASSERT_TRUE(f.undo());  // delete
    EXPECT_EQ(f.pMol->getAtomSize(), nAll);
    MolAtomPtr pBack = f.pMol->getAtom(aid);
    ASSERT_FALSE(pBack.isnull());
    EXPECT_EQ(pBack, f.pMol->getAtom("A", ResidIndex(3), "CA"));

    ASSERT_TRUE(f.undo());  // move
    EXPECT_NEAR(f.pMol->getAtom(aid)->getPos().x(), pos0.x(), 1e-9);

    // redo runs from the last one undone: the move, then the deletion
    ASSERT_TRUE(f.redo());
    EXPECT_NEAR(f.pMol->getAtom(aid)->getPos().x(), pos0.x() + 10.0, 1e-9);
    ASSERT_TRUE(f.redo());
    EXPECT_EQ(f.pMol->getAtomSize(), nAll - 2);
    EXPECT_TRUE(f.pMol->getAtom(aid).isnull());
}

// A selection that depends on atoms it does not select is not evaluated
// again on undo: every atom deleted comes back.
TEST(MolDeleteUndo, NeighbourhoodSelectionComesBackWhole)
{
    Fixture f;
    const int nAll = f.pMol->getAtomSize();
    f.txn("delete", [&] { f.pMol->deleteAtoms(f.sel("(resi 3 around 2.1) and not resi 3")); });
    ASSERT_LT(f.pMol->getAtomSize(), nAll);

    ASSERT_TRUE(f.undo());
    EXPECT_EQ(f.pMol->getAtomSize(), nAll);
}

// Deleting an atom without a conformation ID takes its alternate
// conformations with it; undo puts all of them back.
TEST(MolDeleteUndo, AltConfsDraggedAlongComeBack)
{
    Fixture f;
    const int a = addAtom(f.pMol, "A", 1, "CA", Vector4D(2.0, 0.5, 0.0), 'A');
    const int b = addAtom(f.pMol, "A", 1, "CA", Vector4D(2.0, 0.6, 0.0), 'B');
    const int base = f.pMol->getAtom("A", ResidIndex(1), "CA")->getID();
    const int nAll = f.pMol->getAtomSize();

    LString expr = LString::format("aid %d", base);
    f.txn("delete", [&] { f.pMol->deleteAtoms(f.sel(expr.c_str())); });
    ASSERT_EQ(f.pMol->getAtomSize(), nAll - 3);

    ASSERT_TRUE(f.undo());
    EXPECT_EQ(f.pMol->getAtomSize(), nAll);
    EXPECT_FALSE(f.pMol->getAtom(base).isnull());
    EXPECT_FALSE(f.pMol->getAtom(a).isnull());
    EXPECT_FALSE(f.pMol->getAtom(b).isnull());
}

// Redoing a merge puts its atoms back under the IDs they got first, so a
// deletion recorded after the merge still finds them when it is redone.
TEST(MolDeleteUndo, MergeRedoKeepsIDsForLaterEdits)
{
    Fixture f;
    const int nAll = f.pMol->getAtomSize();
    MolCoordPtr pMol2(MB_NEW MolCoord());
    addAtom(pMol2, "B", 1, "CA", Vector4D(0.0, 5.0, 0.0));
    addAtom(pMol2, "B", 2, "CA", Vector4D(2.0, 5.0, 0.0));
    f.pScene->addObject(pMol2);

    f.txn("merge", [&] { ASSERT_TRUE(f.pMol->copyAtoms(pMol2, f.sel("*"))); });
    ASSERT_EQ(f.pMol->getAtomSize(), nAll + 2);
    const int aid = f.pMol->getAtom("B", ResidIndex(1), "CA")->getID();

    f.txn("delete", [&] { f.pMol->deleteAtoms(f.sel("chain B")); });
    ASSERT_TRUE(f.undo());  // delete
    ASSERT_TRUE(f.undo());  // merge
    EXPECT_EQ(f.pMol->getAtomSize(), nAll);

    ASSERT_TRUE(f.redo());  // merge
    EXPECT_FALSE(f.pMol->getAtom(aid).isnull());
    ASSERT_TRUE(f.redo());  // delete
    EXPECT_EQ(f.pMol->getAtomSize(), nAll);
    EXPECT_TRUE(f.pMol->getChain("B").isnull());
}
