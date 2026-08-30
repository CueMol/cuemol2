#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolBond.hpp"

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolBond;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using qlib::Vector4D;

namespace {

int addAtom(MolCoordPtr pMol, const char *name, double x)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("XXX");
    pAtom->setResIndex(ResidIndex(1));
    pAtom->setName(name);
    pAtom->setElementName("C");
    pAtom->setPos(Vector4D(x, 0.0, 0.0));
    return pMol->appendAtom(pAtom);
}

// One residue with three carbon atoms and no bonds.
struct ThreeAtoms
{
    MolCoordPtr pMol;
    int a, b, c;

    ThreeAtoms() : pMol(MB_NEW MolCoord())
    {
        a = addAtom(pMol, "C1", 0.0);
        b = addAtom(pMol, "C2", 1.5);
        c = addAtom(pMol, "C3", 3.0);
    }
};

}  // namespace

TEST(MolCoordBond, RemoveBondDetachesBothAtoms)
{
    ThreeAtoms m;
    ASSERT_NE(m.pMol->makeBond(m.a, m.b, true), nullptr);
    ASSERT_TRUE(m.pMol->getAtom(m.a)->isBonded(m.b));

    ASSERT_TRUE(m.pMol->removeBond(m.a, m.b));

    // Neither atom may keep a pointer to the deleted bond.
    EXPECT_EQ(m.pMol->getAtom(m.a)->getBondCount(), 0);
    EXPECT_EQ(m.pMol->getAtom(m.b)->getBondCount(), 0);
    EXPECT_EQ(m.pMol->getAtom(m.a)->getBond(m.b), nullptr);
    EXPECT_FALSE(m.pMol->getAtom(m.b)->isBonded(m.a));
    EXPECT_EQ(m.pMol->getBondSize(), 0);
}

TEST(MolCoordBond, MakeBondAfterRemoveCreatesFreshBond)
{
    // Undo of MolAnlManager::removeBond: makeBond() first looks the pair up
    // through MolAtom::getBond(), which must not find the deleted bond.
    ThreeAtoms m;
    m.pMol->makeBond(m.a, m.b, true);
    ASSERT_TRUE(m.pMol->removeBond(m.a, m.b));

    MolBond *pBond = m.pMol->makeBond(m.a, m.b, true);
    ASSERT_NE(pBond, nullptr);
    EXPECT_TRUE(pBond->isPersist());
    EXPECT_EQ(m.pMol->getBondSize(), 1);
    EXPECT_EQ(m.pMol->getAtom(m.a)->getBond(m.b), pBond);
    EXPECT_EQ(m.pMol->getAtom(m.b)->getBond(m.a), pBond);
}

TEST(MolCoordBond, RemoveBondAcceptsReversedIdsAndRejectsUnknownPair)
{
    ThreeAtoms m;
    m.pMol->makeBond(m.a, m.b);
    EXPECT_FALSE(m.pMol->removeBond(m.a, m.c));
    EXPECT_TRUE(m.pMol->removeBond(m.b, m.a));
    EXPECT_EQ(m.pMol->getBondSize(), 0);
}

TEST(MolCoordBond, RemoveNonpersBondsDropsOrphanPersistentBondFromSurvivor)
{
    ThreeAtoms m;
    m.pMol->makeBond(m.a, m.b, true);   // persistent (SSBOND/LINK style)
    m.pMol->makeBond(m.b, m.c, false);  // non-persistent (topology)

    // removeAtom() leaves the bonds in place; applyTopology() cleans them up
    // through removeNonpersBonds().
    ASSERT_TRUE(m.pMol->removeAtom(m.b));
    m.pMol->removeNonpersBonds();

    EXPECT_EQ(m.pMol->getBondSize(), 0);
    EXPECT_EQ(m.pMol->getAtom(m.a)->getBondCount(), 0);
    EXPECT_EQ(m.pMol->getAtom(m.c)->getBondCount(), 0);

    // The survivors can be bonded again without tripping over stale pointers.
    ASSERT_NE(m.pMol->makeBond(m.a, m.c, true), nullptr);
    EXPECT_EQ(m.pMol->getAtom(m.a)->getBondCount(), 1);
}

TEST(MolCoordBond, RemoveNonpersBondsKeepsValidPersistentBond)
{
    ThreeAtoms m;
    MolBond *pPers = m.pMol->makeBond(m.a, m.b, true);
    m.pMol->makeBond(m.b, m.c, false);

    m.pMol->removeNonpersBonds();

    EXPECT_EQ(m.pMol->getBondSize(), 1);
    EXPECT_EQ(m.pMol->getAtom(m.a)->getBond(m.b), pPers);
    EXPECT_EQ(m.pMol->getAtom(m.b)->getBondCount(), 1);
    EXPECT_EQ(m.pMol->getAtom(m.c)->getBondCount(), 0);
}
