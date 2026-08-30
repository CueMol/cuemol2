// -*-Mode: C++;-*-
//
// PDBFileReader multi-model handling: the first model of the file is the
// unprefixed default model whatever its number, later models get a
// distinct chain prefix, and atoms outside any MODEL block belong to the
// default model.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/StringStream.hpp>
#include <qsys/Object.hpp>
#include <cstdio>
#include <string>
#include "molstr/MolCoord.hpp"
#include "molstr/MolChain.hpp"
#include "molstr/PDBFileReader.hpp"

using molstr::MolCoordPtr;
using molstr::PDBFileReader;
using qlib::StrInStream;

namespace {

std::string atomLine(int serial, const char *name, const char *resn, char chain,
                     int resi, double x, double y, double z)
{
    char buf[128];
    std::snprintf(
        buf, sizeof(buf),
        "ATOM  %5d %-4s %-3s %c%4d    %8.3f%8.3f%8.3f%6.2f%6.2f          %2s\n", serial,
        name, resn, chain, resi, x, y, z, 1.0, 20.0, "C");
    return buf;
}

std::string modelLine(int n)
{
    char buf[32];
    std::snprintf(buf, sizeof(buf), "MODEL     %4d\n", n);
    return buf;
}

MolCoordPtr readPdb(const std::string &text, bool bMultiModel)
{
    PDBFileReader reader;
    reader.m_bLoadMultiModel = bMultiModel;
    reader.m_bBuild2ndry = false;
    StrInStream ins(text.data(), static_cast<int>(text.size()));
    return MolCoordPtr(reader.load(ins));
}

}  // namespace

TEST(PDBFileReaderModels, ModelsNumberedFromZeroStayDistinct)
{
    const std::string text =
        modelLine(0) + atomLine(1, " CA ", "ALA", 'A', 1, 0.0, 0.0, 0.0) + "ENDMDL\n" +
        modelLine(1) + atomLine(2, " CA ", "ALA", 'A', 1, 1.0, 0.0, 0.0) +
        "ENDMDL\n"
        "END\n";

    MolCoordPtr pMol = readPdb(text, true);
    ASSERT_FALSE(pMol.isnull());
    EXPECT_EQ(pMol->getAtomSize(), 2);
    EXPECT_EQ(pMol->getChainSize(), 2);
    // the first model keeps the plain chain name, the second is prefixed
    EXPECT_FALSE(pMol->getChain("A").isnull());
    EXPECT_FALSE(pMol->getChain("02_A").isnull());
}

TEST(PDBFileReaderModels, AtomsAfterLastEndmdlBelongToDefaultModel)
{
    const std::string text =
        modelLine(1) + atomLine(1, " CA ", "ALA", 'A', 1, 0.0, 0.0, 0.0) + "ENDMDL\n" +
        atomLine(2, " O  ", "HOH", 'A', 2, 5.0, 0.0, 0.0).replace(0, 6, "HETATM") +
        "END\n";

    MolCoordPtr pMol;
    ASSERT_NO_THROW(pMol = readPdb(text, true));
    ASSERT_FALSE(pMol.isnull());
    EXPECT_EQ(pMol->getAtomSize(), 2);
    EXPECT_EQ(pMol->getChainSize(), 1);
    EXPECT_FALSE(pMol->getChain("A").isnull());

    // the same holds when only the default model is loaded
    pMol = readPdb(text, false);
    ASSERT_FALSE(pMol.isnull());
    EXPECT_EQ(pMol->getAtomSize(), 2);
}

TEST(PDBFileReaderModels, SingleModelLoadKeepsFirstModelOnly)
{
    const std::string text =
        modelLine(0) + atomLine(1, " CA ", "ALA", 'A', 1, 0.0, 0.0, 0.0) + "ENDMDL\n" +
        modelLine(1) + atomLine(2, " CA ", "ALA", 'A', 1, 1.0, 0.0, 0.0) +
        "ENDMDL\n"
        "END\n";

    MolCoordPtr pMol = readPdb(text, false);
    ASSERT_FALSE(pMol.isnull());
    EXPECT_EQ(pMol->getAtomSize(), 1);
    EXPECT_EQ(pMol->getChainSize(), 1);
}
