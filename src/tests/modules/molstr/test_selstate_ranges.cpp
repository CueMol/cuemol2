#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolCoord.hpp"
#include "molstr/MolChain.hpp"
#include "molstr/MolResidue.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/SelCommand.hpp"
#include "molstr/Selection.hpp"
#include "molstr/ResidRangeSet.hpp"

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolResiduePtr;
using molstr::ResidIndex;
using molstr::ResidRangeSet;
using molstr::SelCommand;
using molstr::Selection;
using qlib::LString;
using qlib::Vector4D;

namespace {

int addAtom(MolCoordPtr pMol, const char *name, const ResidIndex &resid, double x)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("XXX");
    pAtom->setResIndex(resid);
    pAtom->setName(name);
    pAtom->setElementName("C");
    pAtom->setPos(Vector4D(x, 0.0, 0.0));
    return pMol->appendAtom(pAtom);
}

}  // namespace

// isSelectedResid() returns SEL_PART (2) for a residue with some atoms
// selected; isSelectedChain()/isSelectedMol() used it as a bool and reported
// the chain / molecule as fully selected.
TEST(SelCommandState, PartiallySelectedResidueMakesChainPartial)
{
    // copies: the in-class constants have no out-of-line definition to bind to
    const int kNone = Selection::SEL_NONE;
    const int kAll = Selection::SEL_ALL;
    const int kPart = Selection::SEL_PART;
    MolCoordPtr pMol(MB_NEW MolCoord());
    addAtom(pMol, "C1", ResidIndex(1), 0.0);
    addAtom(pMol, "C2", ResidIndex(1), 1.5);
    molstr::MolChainPtr pCh = pMol->getChain("A");
    ASSERT_FALSE(pCh.isnull());

    SelCommand selOne("name C1");
    EXPECT_EQ(selOne.isSelectedChain(pCh), kPart);
    EXPECT_EQ(selOne.isSelectedMol(pMol), kPart);

    SelCommand selAll("all");
    EXPECT_EQ(selAll.isSelectedChain(pCh), kAll);
    EXPECT_EQ(selAll.isSelectedMol(pMol), kAll);

    SelCommand selNone("name XX");
    EXPECT_EQ(selNone.isSelectedChain(pCh), kNone);
    EXPECT_EQ(selNone.isSelectedMol(pMol), kNone);
}

// The one-residue range of 10A ended at 11A and therefore also covered
// 10B and 11; residues without an insertion code keep the (n+1) end so
// that consecutive residues still merge.
TEST(ResidRangeSetTest, InsertionCodeResidueCoversOnlyItself)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    addAtom(pMol, "C1", ResidIndex(10, 'A'), 0.0);
    addAtom(pMol, "C1", ResidIndex(10, 'B'), 1.0);
    addAtom(pMol, "C1", ResidIndex(11), 2.0);
    addAtom(pMol, "C1", ResidIndex(12), 3.0);
    MolResiduePtr p10A = pMol->getResidue("A", ResidIndex(10, 'A'));
    MolResiduePtr p10B = pMol->getResidue("A", ResidIndex(10, 'B'));
    MolResiduePtr p11 = pMol->getResidue("A", ResidIndex(11));
    MolResiduePtr p12 = pMol->getResidue("A", ResidIndex(12));
    ASSERT_FALSE(p10A.isnull());
    ASSERT_FALSE(p10B.isnull());
    ASSERT_FALSE(p11.isnull());
    ASSERT_FALSE(p12.isnull());

    ResidRangeSet rs;
    rs.append(p10A);
    EXPECT_TRUE(rs.contains(p10A));
    EXPECT_FALSE(rs.contains(p10B));
    EXPECT_FALSE(rs.contains(p11));

    ResidRangeSet rs2;
    rs2.append(p11);
    rs2.append(p12);
    EXPECT_TRUE(rs2.contains(p11));
    EXPECT_TRUE(rs2.contains(p12));
    EXPECT_FALSE(rs2.contains(p10B));
    // consecutive plain residues still merge into one range
    EXPECT_TRUE(rs2.toString().indexOf("11-12") >= 0 || rs2.toString().indexOf("11:12") >= 0)
        << rs2.toString().c_str();
}
