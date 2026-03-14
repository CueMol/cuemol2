#include <gtest/gtest.h>
#include <common.h>
#include "importers/SDFMolReader.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolBond.hpp"
#include "molstr/ResidIndex.hpp"
#include "molstr/ElemSym.hpp"
#include <qlib/StringStream.hpp>
#include <qsys/ObjReader.hpp>

using importers::SDFMolReader;
using importers::SDFFormatException;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::MolBond;
using molstr::ResidIndex;
using molstr::ElemSym;
using qlib::LString;
using qlib::StrInStream;

// ---- SDF test data ----

// Water (H2O): 3 atoms (O, H, H), 2 single bonds
// CT line: natom(0-2) nbond(3-5) ... version(33-38)
// Atom line: x(0-9) y(10-19) z(20-29) space(30) elem(31-33)
// Bond line: atom1(0-2) atom2(3-5) bondtype(6-8)
static const char* const kWaterSDF =
    "water\n"
    "  testprog\n"
    "  comment\n"
    "  3  2  0  0  0  0  0  0  0  0999 V2000\n"
    "    0.0000    0.0000    0.0000 O  \n"
    "    0.9572    0.0000    0.0000 H  \n"
    "   -0.2399    0.9270    0.0000 H  \n"
    "  1  2  1  0  0  0\n"
    "  1  3  1  0  0  0\n"
    "M  END\n"
    "$$$$\n";

// Formaldehyde (H2CO): 4 atoms, 3 bonds (1 double C=O, 2 single C-H)
static const char* const kFormaldehydeSDF =
    "formaldehyde\n"
    "  testprog\n"
    "  comment\n"
    "  4  3  0  0  0  0  0  0  0  0999 V2000\n"
    "    0.0000    0.0000    0.0000 C  \n"
    "    0.0000    1.2000    0.0000 O  \n"
    "    0.9350   -0.5400    0.0000 H  \n"
    "   -0.9350   -0.5400    0.0000 H  \n"
    "  1  2  2  0  0  0\n"
    "  1  3  1  0  0  0\n"
    "  1  4  1  0  0  0\n"
    "M  END\n"
    "$$$$\n";

// Nitrogen (N2): triple bond
static const char* const kNitrogenSDF =
    "nitrogen\n"
    "  testprog\n"
    "  comment\n"
    "  2  1  0  0  0  0  0  0  0  0999 V2000\n"
    "    0.0000    0.0000    0.0000 N  \n"
    "    1.0975    0.0000    0.0000 N  \n"
    "  1  2  3  0  0  0\n"
    "M  END\n"
    "$$$$\n";

// Benzene-like (C-C): delocalized bond (type 4)
static const char* const kDelocSDF =
    "deloc\n"
    "  testprog\n"
    "  comment\n"
    "  2  1  0  0  0  0  0  0  0  0999 V2000\n"
    "    0.0000    0.0000    0.0000 C  \n"
    "    1.4000    0.0000    0.0000 C  \n"
    "  1  2  4  0  0  0\n"
    "M  END\n"
    "$$$$\n";

// SDF with formal charge: single N atom, charge +1 on atom 1
static const char* const kChargedSDF =
    "charged\n"
    "  testprog\n"
    "  comment\n"
    "  2  1  0  0  0  0  0  0  0  0999 V2000\n"
    "    0.0000    0.0000    0.0000 N  \n"
    "    1.4000    0.0000    0.0000 O  \n"
    "  1  2  1  0  0  0\n"
    "M  CHG  1   1   1\n"
    "M  END\n"
    "$$$$\n";

// Multi-compound SDF: two water molecules
static const char* const kMultiSDF =
    "water1\n"
    "  testprog\n"
    "  comment\n"
    "  3  2  0  0  0  0  0  0  0  0999 V2000\n"
    "    0.0000    0.0000    0.0000 O  \n"
    "    0.9572    0.0000    0.0000 H  \n"
    "   -0.2399    0.9270    0.0000 H  \n"
    "  1  2  1  0  0  0\n"
    "  1  3  1  0  0  0\n"
    "M  END\n"
    "$$$$\n"
    "water2\n"
    "  testprog\n"
    "  comment\n"
    "  3  2  0  0  0  0  0  0  0  0999 V2000\n"
    "    5.0000    0.0000    0.0000 O  \n"
    "    5.9572    0.0000    0.0000 H  \n"
    "    4.7601    0.9270    0.0000 H  \n"
    "  1  2  1  0  0  0\n"
    "  1  3  1  0  0  0\n"
    "M  END\n"
    "$$$$\n";

// SDF with unsupported version
static const char* const kBadVersionSDF =
    "bad_version\n"
    "  testprog\n"
    "  comment\n"
    "  2  1  0  0  0  0  0  0  0  0999 V3000\n"
    "    0.0000    0.0000    0.0000 C  \n"
    "    1.0000    0.0000    0.0000 C  \n"
    "  1  2  1  0  0  0\n"
    "M  END\n"
    "$$$$\n";

// Helper: load SDF string and return the resulting MolCoord
static MolCoordPtr loadSDF(SDFMolReader &reader, const char *sdfText)
{
    StrInStream ins(sdfText);
    return MolCoordPtr(reader.load(ins));
}

// ---- Constructor defaults ----

TEST(SDFMolReaderTest, DefaultLoadCmpdIsMinusOne)
{
    SDFMolReader reader;
    EXPECT_EQ(reader.m_iLoadCmpd, -1);
}

TEST(SDFMolReaderTest, DefaultLoadAsChainFalse)
{
    SDFMolReader reader;
    EXPECT_FALSE(reader.m_bLoadAsChain);
}

TEST(SDFMolReaderTest, DefaultChainNameIsA)
{
    SDFMolReader reader;
    EXPECT_EQ(reader.m_chainName, LString("A"));
}

TEST(SDFMolReaderTest, DefaultResIndIsOne)
{
    SDFMolReader reader;
    EXPECT_EQ(reader.m_nResInd, 1);
}

// ---- Info methods ----

TEST(SDFMolReaderTest, GetNameReturnsSdf)
{
    SDFMolReader reader;
    EXPECT_STREQ(reader.getName(), "sdf");
}

TEST(SDFMolReaderTest, GetTypeDescrContainsMOL)
{
    SDFMolReader reader;
    LString descr(reader.getTypeDescr());
    EXPECT_NE(descr.indexOf("MOL"), -1);
}

TEST(SDFMolReaderTest, GetFileExtContainsMolAndSdf)
{
    SDFMolReader reader;
    LString ext(reader.getFileExt());
    EXPECT_NE(ext.indexOf("mol"), -1);
    EXPECT_NE(ext.indexOf("sdf"), -1);
}

// ---- Atom count ----

TEST(SDFMolReaderTest, ReadWaterAtomCount)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 3);
}

TEST(SDFMolReaderTest, ReadFormaldehydeAtomCount)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kFormaldehydeSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 4);
}

// ---- Bond count ----

TEST(SDFMolReaderTest, ReadWaterBondCount)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getBondSize(), 2);
}

TEST(SDFMolReaderTest, ReadFormaldehydeBondCount)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kFormaldehydeSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getBondSize(), 3);
}

// ---- Atom element ----

TEST(SDFMolReaderTest, ReadWaterFirstAtomIsOxygen)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(1), "O1");
    ASSERT_FALSE(pO.isnull());
    EXPECT_EQ(pO->getElement(), (molstr::ElemID)ElemSym::O);
}

TEST(SDFMolReaderTest, ReadWaterSecondAtomIsHydrogen)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pH = mol->getAtom("A", ResidIndex(1), "H1");
    ASSERT_FALSE(pH.isnull());
    EXPECT_EQ(pH->getElement(), (molstr::ElemID)ElemSym::H);
}

TEST(SDFMolReaderTest, ReadWaterHydrogenNaming)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pH1 = mol->getAtom("A", ResidIndex(1), "H1");
    MolAtomPtr pH2 = mol->getAtom("A", ResidIndex(1), "H2");
    EXPECT_FALSE(pH1.isnull());
    EXPECT_FALSE(pH2.isnull());
}

// ---- Atom position ----

TEST(SDFMolReaderTest, ReadWaterOxygenAtOrigin)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(1), "O1");
    ASSERT_FALSE(pO.isnull());
    qlib::Vector4D pos = pO->getPos();
    EXPECT_NEAR(pos.x(), 0.0, 1e-4);
    EXPECT_NEAR(pos.y(), 0.0, 1e-4);
    EXPECT_NEAR(pos.z(), 0.0, 1e-4);
}

TEST(SDFMolReaderTest, ReadWaterHydrogenPosition)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pH1 = mol->getAtom("A", ResidIndex(1), "H1");
    ASSERT_FALSE(pH1.isnull());
    qlib::Vector4D pos = pH1->getPos();
    EXPECT_NEAR(pos.x(), 0.9572, 1e-4);
    EXPECT_NEAR(pos.y(), 0.0, 1e-4);
    EXPECT_NEAR(pos.z(), 0.0, 1e-4);
}

// ---- Residue name ----

TEST(SDFMolReaderTest, ReadWaterResidueNameIsCompoundName)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(1), "O1");
    ASSERT_FALSE(pO.isnull());
    EXPECT_EQ(pO->getResName(), LString("water"));
}

// ---- Bond types ----

TEST(SDFMolReaderTest, ReadWaterBondIsSingle)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(1), "O1");
    MolAtomPtr pH1 = mol->getAtom("A", ResidIndex(1), "H1");
    ASSERT_FALSE(pO.isnull());
    ASSERT_FALSE(pH1.isnull());
    MolBond *pBond = pO->getBond(pH1->getID());
    ASSERT_NE(pBond, nullptr);
    EXPECT_EQ(pBond->getType(), MolBond::SINGLE);
}

TEST(SDFMolReaderTest, ReadFormaldehydeDoubleBond)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kFormaldehydeSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pC = mol->getAtom("A", ResidIndex(1), "C1");
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(1), "O1");
    ASSERT_FALSE(pC.isnull());
    ASSERT_FALSE(pO.isnull());
    MolBond *pBond = pC->getBond(pO->getID());
    ASSERT_NE(pBond, nullptr);
    EXPECT_EQ(pBond->getType(), MolBond::DOUBLE);
}

TEST(SDFMolReaderTest, ReadNitrogenTripleBond)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kNitrogenSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pN1 = mol->getAtom("A", ResidIndex(1), "N1");
    MolAtomPtr pN2 = mol->getAtom("A", ResidIndex(1), "N2");
    ASSERT_FALSE(pN1.isnull());
    ASSERT_FALSE(pN2.isnull());
    MolBond *pBond = pN1->getBond(pN2->getID());
    ASSERT_NE(pBond, nullptr);
    EXPECT_EQ(pBond->getType(), MolBond::TRIPLE);
}

TEST(SDFMolReaderTest, ReadDelocBond)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kDelocSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pC1 = mol->getAtom("A", ResidIndex(1), "C1");
    MolAtomPtr pC2 = mol->getAtom("A", ResidIndex(1), "C2");
    ASSERT_FALSE(pC1.isnull());
    ASSERT_FALSE(pC2.isnull());
    MolBond *pBond = pC1->getBond(pC2->getID());
    ASSERT_NE(pBond, nullptr);
    EXPECT_EQ(pBond->getType(), MolBond::DELOC);
}

// ---- Formal charge (M  CHG line) ----

TEST(SDFMolReaderTest, ReadChargeLineSetsFormalCharge)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kChargedSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pN = mol->getAtom("A", ResidIndex(1), "N1");
    ASSERT_FALSE(pN.isnull());
    EXPECT_TRUE(pN->hasAtomProp("formal_charge"));
    EXPECT_DOUBLE_EQ(pN->getAtomPropReal("formal_charge"), 1.0);
}

TEST(SDFMolReaderTest, ReadChargeLineUnchargedAtomHasNoProperty)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kChargedSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(1), "O1");
    ASSERT_FALSE(pO.isnull());
    EXPECT_FALSE(pO->hasAtomProp("formal_charge"));
}

// ---- Multi-compound SDF ----

TEST(SDFMolReaderTest, ReadMultiCompoundAtomCount)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kMultiSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 6);
}

TEST(SDFMolReaderTest, ReadMultiCompoundBondCount)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kMultiSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getBondSize(), 4);
}

TEST(SDFMolReaderTest, ReadMultiCompoundDifferentResidueIndices)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kMultiSDF);
    ASSERT_FALSE(mol.isnull());
    // First compound: ResidIndex(1), second: ResidIndex(2)
    MolAtomPtr pO1 = mol->getAtom("A", ResidIndex(1), "O1");
    MolAtomPtr pO2 = mol->getAtom("A", ResidIndex(2), "O1");
    EXPECT_FALSE(pO1.isnull());
    EXPECT_FALSE(pO2.isnull());
}

// ---- m_iLoadCmpd: select specific compound ----

TEST(SDFMolReaderTest, LoadCmpdSelectsOnlySpecifiedCompound)
{
    SDFMolReader reader;
    reader.m_iLoadCmpd = 1;  // load only second compound (0-based index 1)
    auto mol = loadSDF(reader, kMultiSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 3);
}

TEST(SDFMolReaderTest, LoadCmpdFirstCompound)
{
    SDFMolReader reader;
    reader.m_iLoadCmpd = 0;  // load only first compound
    auto mol = loadSDF(reader, kMultiSDF);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 3);
}

TEST(SDFMolReaderTest, LoadCmpdSecondCompoundHasCorrectResidIndex)
{
    SDFMolReader reader;
    reader.m_iLoadCmpd = 1;
    auto mol = loadSDF(reader, kMultiSDF);
    ASSERT_FALSE(mol.isnull());
    // cmpd_id=1, m_nResInd=1 => m_nCurrResid = 1+1 = 2
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(2), "O1");
    EXPECT_FALSE(pO.isnull());
}

// ---- m_nResInd: residue index offset ----

TEST(SDFMolReaderTest, ResIndOffsetApplied)
{
    SDFMolReader reader;
    reader.m_nResInd = 5;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    // cmpd_id=0, m_nResInd=5 => m_nCurrResid = 0+5 = 5
    MolAtomPtr pO = mol->getAtom("A", ResidIndex(5), "O1");
    EXPECT_FALSE(pO.isnull());
}

// ---- m_chainName ----

TEST(SDFMolReaderTest, CustomChainName)
{
    SDFMolReader reader;
    reader.m_chainName = "B";
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pO = mol->getAtom("B", ResidIndex(1), "O1");
    EXPECT_FALSE(pO.isnull());
}

// ---- noautogen residue property ----

TEST(SDFMolReaderTest, ResidueHasNoautogenProperty)
{
    SDFMolReader reader;
    auto mol = loadSDF(reader, kWaterSDF);
    ASSERT_FALSE(mol.isnull());
    auto pRes = mol->getResidue("A", ResidIndex(1));
    ASSERT_FALSE(pRes.isnull());
    LString val;
    EXPECT_TRUE(pRes->getPropStr("noautogen", val));
    EXPECT_EQ(val, LString("true"));
}

// ---- Error handling ----

TEST(SDFMolReaderTest, UnsupportedVersionThrows)
{
    SDFMolReader reader;
    StrInStream ins(kBadVersionSDF);
    EXPECT_THROW(reader.load(ins), SDFFormatException);
}
