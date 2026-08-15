// -*-Mode: C++;-*-
//
// Tests for AtomPosMap2 (CGAL Kd-tree nearest-atom lookup).
//
// Pins the behavior the MapSurfRenderer atom-map cache relies on:
// generate() + ensureBuilt() produce a queryable tree whose
// searchNearestAtom() returns the id of the geometrically nearest atom,
// and ensureBuilt() is safe on an empty map.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include "molstr/AtomPosMap2.hpp"
#include "molstr/ElemSym.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/ResidIndex.hpp"

using qlib::LString;
using qlib::Vector4D;

namespace {

molstr::MolCoordPtr makeMol(const double (*pos)[3], int natoms)
{
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    for (int i = 0; i < natoms; ++i) {
        molstr::MolAtomPtr pAtom(MB_NEW molstr::MolAtom());
        pAtom->setParentUID(pMol->getUID());
        pAtom->setName(LString::format("A%d", i));
        pAtom->setElement(molstr::ElemSym::C);
        pAtom->setChainName("A");
        pAtom->setResIndex(molstr::ResidIndex(1));
        pAtom->setResName("RES");
        pAtom->setPos(Vector4D(pos[i][0], pos[i][1], pos[i][2]));
        pMol->appendAtom(pAtom);
    }
    return pMol;
}

}  // namespace

TEST(AtomPosMap2Test, NearestAtomAfterEnsureBuilt)
{
    const double pos[3][3] = {
        {0.0, 0.0, 0.0}, {10.0, 0.0, 0.0}, {0.0, 10.0, 0.0}};
    molstr::MolCoordPtr pMol = makeMol(pos, 3);

    molstr::AtomPosMap2 amap;
    amap.setTarget(pMol);
    amap.generate();
    amap.ensureBuilt();

    // A query point near each atom must resolve to an atom at that position.
    for (int i = 0; i < 3; ++i) {
        const Vector4D q(pos[i][0] + 0.4, pos[i][1] - 0.3, pos[i][2] + 0.2);
        const int aid = amap.searchNearestAtom(q);
        ASSERT_GE(aid, 0) << "query " << i;
        molstr::MolAtomPtr pA = pMol->getAtom(aid);
        ASSERT_FALSE(pA.isnull()) << "query " << i;
        EXPECT_NEAR(pA->getPos().x(), pos[i][0], 1e-10) << "query " << i;
        EXPECT_NEAR(pA->getPos().y(), pos[i][1], 1e-10) << "query " << i;
        EXPECT_NEAR(pA->getPos().z(), pos[i][2], 1e-10) << "query " << i;
    }
}

TEST(AtomPosMap2Test, RegenerateReplacesTree)
{
    const double pos1[1][3] = {{0.0, 0.0, 0.0}};
    const double pos2[1][3] = {{100.0, 0.0, 0.0}};
    molstr::MolCoordPtr pMol1 = makeMol(pos1, 1);
    molstr::MolCoordPtr pMol2 = makeMol(pos2, 1);

    molstr::AtomPosMap2 amap;
    amap.setTarget(pMol1);
    amap.generate();
    amap.ensureBuilt();
    ASSERT_GE(amap.searchNearestAtom(Vector4D(1, 0, 0)), 0);

    // Regenerating against another mol replaces the tree contents.
    amap.setTarget(pMol2);
    amap.generate();
    amap.ensureBuilt();
    const int aid2 = amap.searchNearestAtom(Vector4D(99, 0, 0));
    ASSERT_GE(aid2, 0);
    molstr::MolAtomPtr pA2 = pMol2->getAtom(aid2);
    ASSERT_FALSE(pA2.isnull());
    EXPECT_NEAR(pA2->getPos().x(), 100.0, 1e-10);
}

TEST(AtomPosMap2Test, EnsureBuiltOnEmptyMolIsSafe)
{
    // Zero atoms --> empty tree; ensureBuilt must be a safe no-op.
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    molstr::AtomPosMap2 amap;
    amap.setTarget(pMol);
    amap.generate();
    amap.ensureBuilt();
    SUCCEED();
}
