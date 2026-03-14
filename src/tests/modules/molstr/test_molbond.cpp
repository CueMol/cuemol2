#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolBond.hpp"

using molstr::MolBond;

// ---- Default constructor ----

TEST(MolBondTest, DefaultAtom1IsMinusOne)
{
    MolBond bond;
    EXPECT_EQ(bond.getAtom1(), -1);
}

TEST(MolBondTest, DefaultAtom2IsMinusOne)
{
    MolBond bond;
    EXPECT_EQ(bond.getAtom2(), -1);
}

TEST(MolBondTest, DefaultIsPersistFalse)
{
    MolBond bond;
    EXPECT_FALSE(bond.isPersist());
}

TEST(MolBondTest, DefaultTypeIsSingle)
{
    MolBond bond;
    EXPECT_EQ(bond.getType(), MolBond::SINGLE);
}

// ---- Setters/getters ----

TEST(MolBondTest, SetGetAtom1)
{
    MolBond bond;
    bond.setAtom1(5);
    EXPECT_EQ(bond.getAtom1(), 5);
}

TEST(MolBondTest, SetGetAtom2)
{
    MolBond bond;
    bond.setAtom2(7);
    EXPECT_EQ(bond.getAtom2(), 7);
}

TEST(MolBondTest, SetBothAtoms)
{
    MolBond bond;
    bond.setAtom1(3);
    bond.setAtom2(8);
    EXPECT_EQ(bond.getAtom1(), 3);
    EXPECT_EQ(bond.getAtom2(), 8);
}

TEST(MolBondTest, SetPersistTrue)
{
    MolBond bond;
    bond.setPersist(true);
    EXPECT_TRUE(bond.isPersist());
}

TEST(MolBondTest, SetPersistFalse)
{
    MolBond bond;
    bond.setPersist(true);
    bond.setPersist(false);
    EXPECT_FALSE(bond.isPersist());
}

TEST(MolBondTest, SetGetTypeSingle)
{
    MolBond bond;
    bond.setType(MolBond::SINGLE);
    EXPECT_EQ(bond.getType(), MolBond::SINGLE);
}

TEST(MolBondTest, SetGetTypeDouble)
{
    MolBond bond;
    bond.setType(MolBond::DOUBLE);
    EXPECT_EQ(bond.getType(), MolBond::DOUBLE);
}

TEST(MolBondTest, SetGetTypeTriple)
{
    MolBond bond;
    bond.setType(MolBond::TRIPLE);
    EXPECT_EQ(bond.getType(), MolBond::TRIPLE);
}

TEST(MolBondTest, SetGetTypeDeloc)
{
    MolBond bond;
    bond.setType(MolBond::DELOC);
    EXPECT_EQ(bond.getType(), MolBond::DELOC);
}

// ---- Enum values ----

TEST(MolBondTest, TypeEnumValuesAreDistinct)
{
    EXPECT_NE(MolBond::SINGLE, MolBond::DOUBLE);
    EXPECT_NE(MolBond::DOUBLE, MolBond::TRIPLE);
    EXPECT_NE(MolBond::SINGLE, MolBond::TRIPLE);
    EXPECT_NE(MolBond::SINGLE, MolBond::DELOC);
    EXPECT_NE(MolBond::DOUBLE, MolBond::DELOC);
}
