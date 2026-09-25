#include <gtest/gtest.h>
#include <common.h>

#include "anim/MorphMol.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

using anim::MorphMol;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using qlib::Vector4D;

namespace {

void addAtom(MolCoordPtr pMol, int resid, const Vector4D &pos)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("XXX");
    pAtom->setResIndex(ResidIndex(resid));
    pAtom->setName("CA");
    pAtom->setElementName("C");
    pAtom->setPos(pos);
    pMol->appendAtom(pAtom);
}

const int NATOMS = 3;

/// A morph between the structure as loaded and a copy displaced along x.
struct Fixture
{
    qsys::ScenePtr pScene;
    qlib::LScrSp<MorphMol> pMorph;

    Fixture()
    {
        pScene = qsys::SceneManager::getInstance()->createScene();

        pMorph = qlib::LScrSp<MorphMol>(MB_NEW MorphMol());
        for (int i = 1; i <= NATOMS; ++i)
            addAtom(MolCoordPtr(pMorph.get()), i, Vector4D(0.0, double(i), 0.0));
        pScene->addObject(pMorph);

        // Frame 0 is this structure; frame 1 is the same atoms 10 A along x.
        pMorph->appendThisFrame();

        MolCoordPtr pTgt = MolCoordPtr(MB_NEW MolCoord());
        for (int i = 1; i <= NATOMS; ++i)
            addAtom(pTgt, i, Vector4D(10.0, double(i), 0.0));
        pMorph->insertBefore(pTgt, -1);
    }
};

}  // namespace

/**
 * Interpolation lands in the coordinate array, and the atoms report it.
 *
 * The array is what the coordinate-texture renderers read by index and what
 * MolAtom::getPos() reads through the per-atom binding, so the two have to
 * agree; if update() ever went back to writing the atoms directly, the array
 * would silently hold the previous frame.
 */
TEST(MorphMolCrdArray, InterpolatesIntoTheArrayThatAtomsRead)
{
    Fixture f;

    f.pMorph->setFrame(0.5);

    const qfloat32 *pcrd = f.pMorph->getAtomCrdArray();
    ASSERT_NE(pcrd, nullptr);
    ASSERT_EQ(f.pMorph->getCrdArraySize(), size_t(NATOMS * 3));

    for (int i = 0; i < NATOMS; ++i) {
        EXPECT_NEAR(pcrd[i * 3 + 0], 5.0, 1.0e-4);

        const int aid = f.pMorph->getAtomIDByArrayInd(quint32(i));
        MolAtomPtr pAtom = f.pMorph->getAtom(aid);
        ASSERT_FALSE(pAtom.isnull());
        EXPECT_NEAR(pAtom->getPos().x(), 5.0, 1.0e-4);
    }
}

/**
 * An atom addressed by array index is the one the AID maps to.
 *
 * A renderer resolves each atom to an index once when it builds its texture
 * and then only ever uses the index, so a map that did not round-trip would
 * draw every atom at some other atom's position.
 */
TEST(MorphMolCrdArray, AtomIndexRoundTrips)
{
    Fixture f;
    f.pMorph->setFrame(0.0);

    for (int i = 0; i < NATOMS; ++i) {
        const int aid = f.pMorph->getAtomIDByArrayInd(quint32(i));
        EXPECT_EQ(f.pMorph->getCrdArrayInd(aid), quint32(i));
    }
}

/**
 * The atoms of a morph cannot be moved one at a time.
 *
 * Their coordinates are defined by the frames, so a write has nowhere to go:
 * before, it went into MolAtom::m_pos, appeared to work, and was discarded at
 * the next frame change.
 */
TEST(MorphMolCrdArray, AtomsAreNotIndividuallyMovable)
{
    Fixture f;
    f.pMorph->setFrame(0.0);

    const int aid = f.pMorph->getAtomIDByArrayInd(0);
    MolAtomPtr pAtom = f.pMorph->getAtom(aid);
    ASSERT_FALSE(pAtom.isnull());

    EXPECT_FALSE(f.pMorph->isCoordEditable());
    EXPECT_THROW(pAtom->setPos(Vector4D(1.0, 2.0, 3.0)), qlib::RuntimeException);
    EXPECT_THROW(f.pMorph->xformByMat(qlib::Matrix4D()), qlib::RuntimeException);
}

/**
 * A morph's xformMat moves every frame, applied exactly once.
 *
 * Bound atoms take the transform from the morph instead of holding a copy
 * each; a matrix set before the atoms bind to the array (the .qsc restore
 * order) must not end up applied twice, nor lost, once they do.
 */
TEST(MorphMolCrdArray, XformMatAppliesToEveryFrameOnce)
{
    Fixture f;
    f.pMorph->setXformMatrix(qlib::Matrix4D::makeTransMat(Vector4D(1.0, 0.0, 0.0)));
    f.pMorph->setFrame(0.0);

    MolAtomPtr pAtom = f.pMorph->getAtom(f.pMorph->getAtomIDByArrayInd(0));
    ASSERT_FALSE(pAtom.isnull());
    EXPECT_NEAR(pAtom->getPos().x(), 1.0, 1.0e-4);
    EXPECT_NEAR(pAtom->getRawPos().x(), 0.0, 1.0e-4);

    f.pMorph->setFrame(1.0);
    EXPECT_NEAR(pAtom->getPos().x(), 11.0, 1.0e-4);

    f.pMorph->setXformMatrix(qlib::Matrix4D());
    EXPECT_NEAR(pAtom->getPos().x(), 10.0, 1.0e-4);
}
