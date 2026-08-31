#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/SelCommand.hpp"

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using molstr::SelCommand;
using qlib::LString;

namespace {

MolAtomPtr addAtom(MolCoordPtr pMol, const char *name)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("G");
    pAtom->setResIndex(ResidIndex(1));
    pAtom->setName(name);
    pAtom->setElementName("C");
    pMol->appendAtom(pAtom);
    return pAtom;
}

}  // namespace

// Old nucleic-acid naming uses '*' where the current convention uses a
// prime; a selection written with the prime must still match those atoms.
TEST(SelNamesNode, PrimeMatchesAsteriskAtomName)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    MolAtomPtr pStar = addAtom(pMol, "C1*");
    MolAtomPtr pPrime = addAtom(pMol, "C2'");
    MolAtomPtr pOther = addAtom(pMol, "N1");

    SelCommand sel(LString("name C1'"));
    EXPECT_TRUE(sel.isSelected(pStar));
    EXPECT_FALSE(sel.isSelected(pPrime));
    EXPECT_FALSE(sel.isSelected(pOther));

    SelCommand sel2(LString("name C2'"));
    EXPECT_TRUE(sel2.isSelected(pPrime));
    EXPECT_FALSE(sel2.isSelected(pStar));
}
