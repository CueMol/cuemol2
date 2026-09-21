#include <gtest/gtest.h>
#include <common.h>

#include "molstr/AnimMol.hpp"
#include "molstr/MolAtom.hpp"

using molstr::AnimMol;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using qlib::Vector4D;

namespace {

/// The smallest AnimMol there can be: the array is laid out in AID order and
/// filled by hand, standing in for a trajectory frame or a morph step.
class StubAnimMol : public AnimMol
{
public:
    void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) override
    {
        indmap.clear();
        aidmap.resize(getAtomSize());
        quint32 ind = 0;
        for (AtomIter i = beginAtom(); i != endAtom(); ++i, ++ind) {
            indmap.insert(CrdIndexMap::value_type(i->first, ind));
            aidmap[ind] = i->first;
        }
    }

    /// Put `x` in every atom's x slot and publish, as an update() would.
    void setAllX(double x)
    {
        allocCrdArray();
        qfloat32 *p = mutableCrdArray();
        for (size_t i = 0; i < getCrdArraySize(); i += 3) {
            p[i] = qfloat32(x);
            p[i + 1] = 0.0f;
            p[i + 2] = 0.0f;
        }
        commitCrdArray();
    }

    using AnimMol::getAtomIDByArrayInd;
};

MolAtomPtr addAtom(MolCoordPtr pMol, int resid)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("XXX");
    pAtom->setResIndex(ResidIndex(resid));
    pAtom->setName("CA");
    pAtom->setElementName("C");
    pAtom->setPos(Vector4D(-1.0, 0.0, 0.0));
    pMol->appendAtom(pAtom);
    return pAtom;
}

}  // namespace

/**
 * A bound atom reports what the coordinate array holds, not its own field.
 *
 * This is what lets every getPos()-based consumer -- selections, measurement,
 * the mesh renderers -- follow playback without the animated molecule having
 * to write back into several hundred thousand atoms each frame.
 */
TEST(MolAtomCrdBind, BoundAtomReadsTheArray)
{
    qlib::LScrSp<StubAnimMol> pMol(MB_NEW StubAnimMol());
    MolAtomPtr pAtom = addAtom(MolCoordPtr(pMol.get()), 1);
    EXPECT_NEAR(pAtom->getPos().x(), -1.0, 1.0e-6);

    pMol->setAllX(7.0);

    EXPECT_TRUE(pAtom->isCrdArrayBound());
    EXPECT_NEAR(pAtom->getPos().x(), 7.0, 1.0e-6);
    EXPECT_NEAR(pAtom->getRawPos().x(), 7.0, 1.0e-6);
}

/**
 * Writing a bound atom's position is refused rather than silently dropped.
 */
TEST(MolAtomCrdBind, BoundAtomRefusesWrites)
{
    qlib::LScrSp<StubAnimMol> pMol(MB_NEW StubAnimMol());
    MolAtomPtr pAtom = addAtom(MolCoordPtr(pMol.get()), 1);
    pMol->setAllX(7.0);

    EXPECT_THROW(pAtom->setPos(Vector4D(1.0, 2.0, 3.0)), qlib::RuntimeException);
    EXPECT_THROW(pAtom->setRawPos(Vector4D(1.0, 2.0, 3.0)), qlib::RuntimeException);
    EXPECT_NEAR(pAtom->getPos().x(), 7.0, 1.0e-6);
}

/**
 * Unbinding leaves the atom where the array had it.
 *
 * invalidateCrdArray() and ~AnimMol() both unbind, and an atom a script still
 * holds afterwards must neither read freed memory nor jump back to whatever
 * position it had before it was ever animated.
 */
TEST(MolAtomCrdBind, UnbindKeepsTheLastPosition)
{
    qlib::LScrSp<StubAnimMol> pMol(MB_NEW StubAnimMol());
    MolAtomPtr pAtom = addAtom(MolCoordPtr(pMol.get()), 1);
    pMol->setAllX(7.0);

    pMol->invalidateCrdArray();

    EXPECT_FALSE(pAtom->isCrdArrayBound());
    EXPECT_NEAR(pAtom->getPos().x(), 7.0, 1.0e-6);
    // ... and it is writable again.
    pAtom->setPos(Vector4D(3.0, 0.0, 0.0));
    EXPECT_NEAR(pAtom->getPos().x(), 3.0, 1.0e-6);
}

/**
 * A copied atom owns its coordinates.
 *
 * Copies are handed out to code that builds free-standing molecules (frame
 * ingestion, superposition), which would otherwise be writing into -- or
 * outliving -- the animated molecule's array.
 */
TEST(MolAtomCrdBind, CopyIsFreeStanding)
{
    qlib::LScrSp<StubAnimMol> pMol(MB_NEW StubAnimMol());
    MolAtomPtr pAtom = addAtom(MolCoordPtr(pMol.get()), 1);
    pMol->setAllX(7.0);

    MolAtom copy(*pAtom.get());

    EXPECT_FALSE(copy.isCrdArrayBound());
    EXPECT_NEAR(copy.getPos().x(), 7.0, 1.0e-6);
    copy.setPos(Vector4D(3.0, 0.0, 0.0));
    EXPECT_NEAR(copy.getPos().x(), 3.0, 1.0e-6);
    EXPECT_NEAR(pAtom->getPos().x(), 7.0, 1.0e-6);
}
