#include <gtest/gtest.h>
#include <vector>
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

namespace {

/// A texture backend that exposes its upload buffer, as the Electron one does.
class StagingFloatDataTexture : public MockFloatDataTexture
{
public:
    bool create(int w, int h, int ncomp) override
    {
        m_buf.assign(size_t(w) * size_t(h) * size_t(ncomp), 0.0f);
        return true;
    }
    void *getStagingData() override { return m_buf.data(); }
    void updateFromStaging() override { ++m_nStagedUploads; }

    std::vector<float> m_buf;
    int m_nStagedUploads = 0;
};

class StagingDisplayContext : public MockDisplayContext
{
public:
    gfx::FloatDataTexture *createFloatDataTexture() override
    {
        m_pTex = new StagingFloatDataTexture();
        return m_pTex;
    }
    /// Owned by the CoordTexSupport it was handed to.
    StagingFloatDataTexture *m_pTex = nullptr;
};

}  // namespace

/**
 * Positions are gathered straight into a backend's staging buffer.
 *
 * Going through update() instead copies the whole array once more per frame;
 * on a 2.4M-atom morph that copy, plus the fresh buffer it used to be made
 * into, was what kept the frame over its budget.
 */
TEST(CoordTexSupport, StagingBufferIsWrittenInPlace)
{
    StagingDisplayContext dc;
    MolCoordPtr pMol = makeMol(3);

    CoordTexSupport ct;
    addAll(ct, pMol);
    ASSERT_TRUE(ct.ctAlloc(&dc, pMol));
    StagingFloatDataTexture *pTex = dc.m_pTex;
    ASSERT_NE(pTex, nullptr);
    EXPECT_EQ(pTex->m_nUpdates, 0);
    EXPECT_EQ(pTex->m_nStagedUploads, 1);

    const int aid = ct.ctAtomIDAt(0);
    MolAtomPtr pAtom = pMol->getAtom(aid);
    pAtom->setPos(Vector4D(42.0, 0.0, 0.0));
    ASSERT_TRUE(ct.ctUpdate(pMol));

    EXPECT_EQ(pTex->m_nUpdates, 0);
    EXPECT_EQ(pTex->m_nStagedUploads, 2);
    EXPECT_FLOAT_EQ(pTex->m_buf[ct.ctIndexOf(aid) * 3], 42.0f);
}
