// MolCoord::removeAtom() with alternate conformations, MolArrayMap keys
// with insertion codes, and the PDB writer facing a secondary-structure
// "end" without a "start".
#include <gtest/gtest.h>
#include <common.h>
#include <string>
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolResidue.hpp"
#include "molstr/MolArrayMap.hpp"
#include "molstr/PDBFileWriter.hpp"
#include "molstr/ResidIndex.hpp"
#include <qlib/StringStream.hpp>

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolResiduePtr;
using molstr::ResidIndex;
using qlib::LString;

namespace {
int addAtom(MolCoordPtr pMol, const char *name, const ResidIndex &ri, char conf)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("ALA");
    pAtom->setResIndex(ri);
    pAtom->setName(name);
    pAtom->setElement(molstr::ElemSym::C);
    pAtom->setConfID(conf);
    pAtom->setPos(qlib::Vector4D(double(ri.first), 0.0, 0.0));
    return pMol->appendAtom(pAtom);
}
}  // namespace

TEST(MolCoordRemoveAtom, AltConfsLeaveThePoolToo)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    const int a0 = addAtom(pMol, "CA", ResidIndex(1), '\0');
    const int a1 = addAtom(pMol, "CA", ResidIndex(1), 'A');
    const int a2 = addAtom(pMol, "CA", ResidIndex(1), 'B');
    ASSERT_GE(a0, 0);
    ASSERT_GE(a1, 0);
    ASSERT_GE(a2, 0);
    ASSERT_EQ(pMol->getAtomSize(), 3);

    // Removing the base atom drops the "CA:A"/"CA:B" entries from the
    // residue; the atoms themselves must leave the pool as well.
    ASSERT_TRUE(pMol->removeAtom(a0));
    EXPECT_EQ(pMol->getAtomSize(), 0);
    EXPECT_TRUE(pMol->getAtom(a1).isnull());
    EXPECT_TRUE(pMol->getAtom(a2).isnull());
}

TEST(MolCoordRemoveAtom, RemovingOneAltConfKeepsTheOthers)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    const int a1 = addAtom(pMol, "CA", ResidIndex(1), 'A');
    const int a2 = addAtom(pMol, "CA", ResidIndex(1), 'B');
    ASSERT_TRUE(pMol->removeAtom(a1));
    EXPECT_EQ(pMol->getAtomSize(), 1);
    EXPECT_FALSE(pMol->getAtom(a2).isnull());
}

TEST(MolArrayMapKey, InsertionCodeKeepsResiduesApart)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    addAtom(pMol, "CA", ResidIndex(100), '\0');
    addAtom(pMol, "CA", ResidIndex(100, 'A'), '\0');
    ASSERT_EQ(pMol->getAtomSize(), 2);

    molstr::MolArrayMap amap;
    amap.setup(pMol);
    // "100" and "100A" are different residues: both CA atoms must be kept
    EXPECT_EQ(amap.size(), 2u);
}

TEST(PDBFileWriterSecStr, HelixEndWithoutStartIsIgnored)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    addAtom(pMol, "CA", ResidIndex(1), '\0');
    addAtom(pMol, "CA", ResidIndex(2), '\0');
    addAtom(pMol, "CA", ResidIndex(3), '\0');

    // "He" (helix end) on residue 2 with no preceding "Hs"
    MolResiduePtr pRes = pMol->getResidue("A", ResidIndex(2));
    ASSERT_FALSE(pRes.isnull());
    pRes->setPropStr("secondary2", "He");
    MolResiduePtr pRes3 = pMol->getResidue("A", ResidIndex(3));
    pRes3->setPropStr("secondary2", "Ee");

    molstr::PDBFileWriter writer;
    writer.attach(pMol);
    qlib::StrOutStream os;
    // used to dereference the null "start" residue
    ASSERT_NO_THROW(writer.write(os));
    writer.detach();

    const std::string out = os.getString().c_str();
    EXPECT_EQ(out.find("HELIX"), std::string::npos);
    EXPECT_EQ(out.find("SHEET"), std::string::npos);
    EXPECT_NE(out.find("ATOM"), std::string::npos);
}
