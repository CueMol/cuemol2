#include <gtest/gtest.h>
#include <common.h>

#include "molstr/CoordTexSupport.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"

#include "../../gfx/mock_display_context.hpp"

using molstr::CoordTexSupport;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using qlib::Vector4D;

namespace {

MolCoordPtr makeMol(int natoms)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    for (int i = 1; i <= natoms; ++i) {
        MolAtomPtr pAtom(MB_NEW MolAtom());
        pAtom->setChainName("A");
        pAtom->setResName("XXX");
        pAtom->setResIndex(ResidIndex(i));
        pAtom->setName("CA");
        pAtom->setElementName("C");
        pAtom->setPos(Vector4D(double(i), 0.0, 0.0));
        pMol->appendAtom(pAtom);
    }
    return pMol;
}

/// Adds every atom of the molecule, as a renderer's layout pass would.
void addAll(CoordTexSupport &ct, MolCoordPtr pMol)
{
    ct.ctBegin();
    for (MolCoord::AtomIter i = pMol->beginAtom(); i != pMol->endAtom(); ++i)
        ct.ctAddAtom(i->first);
}

}  // namespace

/**
 * An empty layout is remembered as "nothing to draw".
 *
 * Without this a renderer whose selection matches no atoms rebuilds its whole
 * layout every frame -- walking the molecule, evaluating the selection, and
 * emitting nothing -- for as long as the selection stays empty, which for a
 * selection renderer is most of the time.
 */
TEST(CoordTexSupport, EmptyLayoutIsRemembered)
{
    MockDisplayContext dc;
    MolCoordPtr pMol = makeMol(3);

    CoordTexSupport ct;
    ct.ctBegin();
    EXPECT_FALSE(ct.ctAlloc(&dc, pMol));
    EXPECT_TRUE(ct.ctNothingToDraw());
    // Still usable: the backend was fine, there was simply nothing to put in
    // the texture.
    EXPECT_TRUE(ct.ctUsable());
}

/**
 * Invalidating clears it, which is how a new selection gets drawn.
 *
 * Every route that can change what should be drawn -- a selection change, a
 * topology change, a renderer property -- ends at invalidateDisplayCache(),
 * which the host renderer forwards here.
 */
TEST(CoordTexSupport, InvalidateClearsNothingToDraw)
{
    MockDisplayContext dc;
    MolCoordPtr pMol = makeMol(3);

    CoordTexSupport ct;
    ct.ctBegin();
    ct.ctAlloc(&dc, pMol);
    ASSERT_TRUE(ct.ctNothingToDraw());

    ct.ctInvalidate();
    EXPECT_FALSE(ct.ctNothingToDraw());

    addAll(ct, pMol);
    EXPECT_TRUE(ct.ctAlloc(&dc, pMol));
    EXPECT_FALSE(ct.ctNothingToDraw());
    EXPECT_EQ(ct.ctAtomCount(), 3);
}

/**
 * An atom offered twice keeps its first texel.
 *
 * A renderer that walks bonds reaches the same atom from both ends and would
 * otherwise give it two texels, leaving the second holding a stale position
 * once the atoms move.
 */
TEST(CoordTexSupport, RepeatedAtomKeepsItsIndex)
{
    MolCoordPtr pMol = makeMol(2);
    MolCoord::AtomIter i = pMol->beginAtom();
    const int aid = i->first;

    CoordTexSupport ct;
    ct.ctBegin();
    const int idx = ct.ctAddAtom(aid);
    EXPECT_EQ(ct.ctAddAtom(aid), idx);
    EXPECT_EQ(ct.ctAtomCount(), 1);
    EXPECT_EQ(ct.ctIndexOf(aid), idx);
}

/**
 * A structure that is not animated is read through its atoms.
 *
 * That path is slower -- a std::map lookup per atom -- but it is the only
 * correct one for a molecule whose atoms own their coordinates, and it has to
 * keep working: only trajectories and morphs have a coordinate array.
 */
TEST(CoordTexSupport, PlainMoleculeIsReadThroughItsAtoms)
{
    MockDisplayContext dc;
    MolCoordPtr pMol = makeMol(3);

    CoordTexSupport ct;
    addAll(ct, pMol);
    ASSERT_TRUE(ct.ctAlloc(&dc, pMol));

    // Moving an atom and re-gathering picks the new position up.
    MolAtomPtr pAtom = pMol->getAtom(ct.ctAtomIDAt(0));
    pAtom->setPos(Vector4D(42.0, 0.0, 0.0));
    EXPECT_TRUE(ct.ctUpdate(pMol));
}

/**
 * A layout that no longer matches the molecule asks for a rebuild.
 */
TEST(CoordTexSupport, MissingAtomForcesRebuild)
{
    MockDisplayContext dc;
    MolCoordPtr pMol = makeMol(3);

    CoordTexSupport ct;
    addAll(ct, pMol);
    ASSERT_TRUE(ct.ctAlloc(&dc, pMol));

    pMol->removeAtom(ct.ctAtomIDAt(0));
    EXPECT_FALSE(ct.ctUpdate(pMol));
}
