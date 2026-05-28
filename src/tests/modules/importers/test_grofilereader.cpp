#include <gtest/gtest.h>
#include <common.h>

#include "mdtools/GROFileReader.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/ElemSym.hpp"
#include "molstr/ResidIndex.hpp"
#include "symm/CrystalInfo.hpp"

#include <qlib/StringStream.hpp>
#include <qlib/Vector4D.hpp>
#include <qsys/ObjReader.hpp>

#include <cmath>
#include <string>

using mdtools::GROFileReader;
using mdtools::GROFileFormatException;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::ElemSym;
using qlib::LString;
using qlib::StrInStream;

namespace {

// Helper: load a GRO text string and return the constructed MolCoord.
MolCoordPtr loadGRO(GROFileReader &reader, const char *text)
{
    StrInStream ins(text, static_cast<int>(std::string(text).size()));
    qsys::ObjectPtr pObj = reader.load(ins);
    return MolCoordPtr(pObj);
}

// Single H2O frame, no velocity. Coords in nm: OW=(0.100,0.200,0.300).
// After nm->A conversion: OW=(1.0,2.0,3.0) Angstrom.
const char *const kWaterNoVel =
    "water\n"
    "    3\n"
    "    1SOL     OW    1   0.100   0.200   0.300\n"
    "    1SOL    HW1    2   0.110   0.200   0.300\n"
    "    1SOL    HW2    3   0.100   0.210   0.300\n"
    "   2.00000   2.00000   2.00000\n";

// Same water but with velocity fields (length 68).
const char *const kWaterWithVel =
    "water with velocity\n"
    "    3\n"
    "    1SOL     OW    1   0.100   0.200   0.300  0.0100  0.0200  0.0300\n"
    "    1SOL    HW1    2   0.110   0.200   0.300  0.0100  0.0200  0.0300\n"
    "    1SOL    HW2    3   0.100   0.210   0.300  0.0100  0.0200  0.0300\n"
    "   2.00000   2.00000   2.00000\n";

// Triclinic 9-value box: orthogonal-equivalent (zero off-diagonals).
// v1=(2,0,0), v2=(0,3,0), v3=(0,0,4) -> a=2nm, b=3nm, c=4nm, all 90 deg.
const char *const kTriclinicOrthoEquivalent =
    "triclinic ortho\n"
    "    1\n"
    "    1SOL     OW    1   0.500   0.500   0.500\n"
    "   2.00000   3.00000   4.00000   0.00000   0.00000   0.00000   0.00000   0.00000   0.00000\n";

// True triclinic: v1=(2,0,0), v2=(1,2,0), v3=(0.5,0.5,3) in nm.
// GROMACS box order: v1x v2y v3z v1y v1z v2x v2z v3x v3y.
// a=2, b=sqrt(1+4)=sqrt(5), c=sqrt(0.25+0.25+9)=sqrt(9.5)
// gamma = acos(v1.v2/(a*b)) = acos(2/(2*sqrt(5))) = acos(1/sqrt(5))
const char *const kTriclinicSheared =
    "triclinic sheared\n"
    "    1\n"
    "    1SOL     OW    1   0.000   0.000   0.000\n"
    "   2.00000   2.00000   3.00000   0.00000   0.00000   1.00000   0.00000   0.50000   0.50000\n";

// High precision: position width 12 (e.g. -precision 7).
// Layout: %5d%-5s%5s%5d then 3*%12.7f = 20 + 36 = 56 chars (no velocity).
const char *const kHighPrecision =
    "high precision\n"
    "    1\n"
    "    1SOL     OW    1   0.1234567   0.2345678   0.3456789\n"
    "   2.0000000   2.0000000   2.0000000\n";

// Two concatenated frames; first frame has 3 atoms, second has 3 atoms.
const char *const kMultiFrame =
    "frame1 t= 0.0\n"
    "    3\n"
    "    1SOL     OW    1   0.100   0.200   0.300\n"
    "    1SOL    HW1    2   0.110   0.200   0.300\n"
    "    1SOL    HW2    3   0.100   0.210   0.300\n"
    "   2.00000   2.00000   2.00000\n"
    "frame2 t= 1.0\n"
    "    3\n"
    "    1SOL     OW    1   0.500   0.600   0.700\n"
    "    1SOL    HW1    2   0.510   0.600   0.700\n"
    "    1SOL    HW2    3   0.500   0.610   0.700\n"
    "   2.00000   2.00000   2.00000\n";

// Declared 3 atoms but only 2 actually present (negative test).
const char *const kBadAtomCount =
    "broken\n"
    "    3\n"
    "    1SOL     OW    1   0.100   0.200   0.300\n"
    "    1SOL    HW1    2   0.110   0.200   0.300\n";

// Non-numeric atom count.
const char *const kBadCountLine =
    "broken\n"
    "not_a_number\n"
    "    1SOL     OW    1   0.100   0.200   0.300\n";

// Various element-name flavours to exercise the element guesser.
const char *const kElementVariety =
    "elements\n"
    "    5\n"
    "    1RES      C    1   0.100   0.000   0.000\n"
    "    1RES     CA    2   0.200   0.000   0.000\n"
    "    1RES     MG    3   0.300   0.000   0.000\n"
    "    1RES     OW    4   0.400   0.000   0.000\n"
    "    1RES    1HD    5   0.500   0.000   0.000\n"
    "   1.00000   1.00000   1.00000\n";

}  // namespace

// ---- nm -> Angstrom conversion (the most important correctness pin) ----

TEST(GROFileReaderTest, NmToAngstromConversionOnPositions)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kWaterNoVel);
    ASSERT_FALSE(pMol.isnull());
    ASSERT_EQ(pMol->getAtomSize(), 3);

    MolAtomPtr pOW = pMol->getAtom(0);
    ASSERT_FALSE(pOW.isnull());
    qlib::Vector4D pos = pOW->getPos();
    // Source 0.100 nm should become 1.0 A.
    EXPECT_NEAR(pos.x(), 1.0, 1e-4);
    EXPECT_NEAR(pos.y(), 2.0, 1e-4);
    EXPECT_NEAR(pos.z(), 3.0, 1e-4);
}

TEST(GROFileReaderTest, AtomNamesAndResidueNamesPreserved)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kWaterNoVel);
    ASSERT_FALSE(pMol.isnull());

    EXPECT_EQ(pMol->getAtomSize(), 3);
    EXPECT_EQ(pMol->getAtom(0)->getName(), LString("OW"));
    EXPECT_EQ(pMol->getAtom(1)->getName(), LString("HW1"));
    EXPECT_EQ(pMol->getAtom(2)->getName(), LString("HW2"));
    EXPECT_EQ(pMol->getAtom(0)->getResName(), LString("SOL"));
}

// ---- Velocity present: positions must still be correct ----

TEST(GROFileReaderTest, VelocityFieldsDoNotCorruptPositions)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kWaterWithVel);
    ASSERT_FALSE(pMol.isnull());
    ASSERT_EQ(pMol->getAtomSize(), 3);

    qlib::Vector4D pos = pMol->getAtom(0)->getPos();
    EXPECT_NEAR(pos.x(), 1.0, 1e-4);
    EXPECT_NEAR(pos.y(), 2.0, 1e-4);
    EXPECT_NEAR(pos.z(), 3.0, 1e-4);
}

// ---- Chain assignment: all atoms get chain "A" ----

TEST(GROFileReaderTest, AllAtomsAssignedToSingleChain)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kWaterNoVel);
    ASSERT_FALSE(pMol.isnull());

    for (int i = 0; i < pMol->getAtomSize(); ++i) {
        EXPECT_EQ(pMol->getAtom(i)->getChainName(), LString("A"));
    }
}

// ---- Box: rectangular orthogonal ----

TEST(GROFileReaderTest, RectangularBoxStoredAsAngstrom)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kWaterNoVel);
    ASSERT_FALSE(pMol.isnull());

    symm::CrystalInfoPtr pci = pMol->getExtData("CrystalInfo");
    ASSERT_FALSE(pci.isnull());
    // 2.0 nm -> 20.0 A in each direction.
    EXPECT_NEAR(pci->a(), 20.0, 1e-4);
    EXPECT_NEAR(pci->b(), 20.0, 1e-4);
    EXPECT_NEAR(pci->c(), 20.0, 1e-4);
    EXPECT_NEAR(pci->alpha(), 90.0, 1e-4);
    EXPECT_NEAR(pci->beta(),  90.0, 1e-4);
    EXPECT_NEAR(pci->gamma(), 90.0, 1e-4);
}

// ---- Box: triclinic 9-value with zero off-diagonals (ortho-equivalent) ----

TEST(GROFileReaderTest, TriclinicOrthogonalEquivalentBox)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kTriclinicOrthoEquivalent);
    ASSERT_FALSE(pMol.isnull());

    symm::CrystalInfoPtr pci = pMol->getExtData("CrystalInfo");
    ASSERT_FALSE(pci.isnull());
    EXPECT_NEAR(pci->a(), 20.0, 1e-4);  // 2.0 nm
    EXPECT_NEAR(pci->b(), 30.0, 1e-4);  // 3.0 nm
    EXPECT_NEAR(pci->c(), 40.0, 1e-4);  // 4.0 nm
    EXPECT_NEAR(pci->alpha(), 90.0, 1e-4);
    EXPECT_NEAR(pci->beta(),  90.0, 1e-4);
    EXPECT_NEAR(pci->gamma(), 90.0, 1e-4);
}

// ---- Box: true triclinic with shear ----

TEST(GROFileReaderTest, TriclinicShearedBoxAnglesCorrect)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kTriclinicSheared);
    ASSERT_FALSE(pMol.isnull());

    symm::CrystalInfoPtr pci = pMol->getExtData("CrystalInfo");
    ASSERT_FALSE(pci.isnull());
    // v1=(2,0,0), v2=(1,2,0), v3=(0.5,0.5,3) in nm.
    const double la = 2.0, lb = std::sqrt(5.0), lc = std::sqrt(9.5);
    EXPECT_NEAR(pci->a(), la * 10.0, 1e-3);
    EXPECT_NEAR(pci->b(), lb * 10.0, 1e-3);
    EXPECT_NEAR(pci->c(), lc * 10.0, 1e-3);

    const double rad2deg = 180.0 / M_PI;
    const double expected_gamma = std::acos(2.0 / (la * lb)) * rad2deg;
    EXPECT_NEAR(pci->gamma(), expected_gamma, 1e-3);
}

// ---- High precision (%12.7f) dynamic field-width detection ----

TEST(GROFileReaderTest, HighPrecisionFieldsParsed)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kHighPrecision);
    ASSERT_FALSE(pMol.isnull());
    ASSERT_EQ(pMol->getAtomSize(), 1);

    qlib::Vector4D pos = pMol->getAtom(0)->getPos();
    // 0.1234567 nm -> 1.234567 A.
    EXPECT_NEAR(pos.x(), 1.234567, 1e-6);
    EXPECT_NEAR(pos.y(), 2.345678, 1e-6);
    EXPECT_NEAR(pos.z(), 3.456789, 1e-6);
}

// ---- Multi-frame: only first frame is loaded ----

TEST(GROFileReaderTest, MultiFrameLoadsOnlyFirstFrame)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kMultiFrame);
    ASSERT_FALSE(pMol.isnull());
    EXPECT_EQ(pMol->getAtomSize(), 3);

    // Verify positions belong to frame 1 (0.100), not frame 2 (0.500).
    qlib::Vector4D pos = pMol->getAtom(0)->getPos();
    EXPECT_NEAR(pos.x(), 1.0, 1e-4);
}

// ---- Negative tests: malformed files raise an exception ----

TEST(GROFileReaderTest, AtomCountMismatchThrows)
{
    GROFileReader reader;
    StrInStream ins(kBadAtomCount, static_cast<int>(std::string(kBadAtomCount).size()));
    EXPECT_THROW(reader.load(ins), GROFileFormatException);
}

TEST(GROFileReaderTest, NonNumericAtomCountThrows)
{
    GROFileReader reader;
    StrInStream ins(kBadCountLine, static_cast<int>(std::string(kBadCountLine).size()));
    EXPECT_THROW(reader.load(ins), GROFileFormatException);
}

// ---- Element guessing from atom name ----

TEST(GROFileReaderTest, ElementGuessFromAtomName)
{
    GROFileReader reader;
    MolCoordPtr pMol = loadGRO(reader, kElementVariety);
    ASSERT_FALSE(pMol.isnull());
    ASSERT_EQ(pMol->getAtomSize(), 5);

    // "C"   -> C
    EXPECT_EQ(pMol->getAtom(0)->getElement(), ElemSym::C);
    // "CA"  -> Ca (two-letter element match wins)
    EXPECT_EQ(pMol->getAtom(1)->getElement(), ElemSym::Ca);
    // "MG"  -> Mg
    EXPECT_EQ(pMol->getAtom(2)->getElement(), ElemSym::Mg);
    // "OW"  -> two-letter "Ow" unknown, falls back to first char "O" = O
    EXPECT_EQ(pMol->getAtom(3)->getElement(), ElemSym::O);
    // "1HD" -> skip digit, "HD" two-letter unknown, fall back to "H" = H
    EXPECT_EQ(pMol->getAtom(4)->getElement(), ElemSym::H);
}
