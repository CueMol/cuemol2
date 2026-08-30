// -*-Mode: C++;-*-
//
// SDFMolWriter: every residue becomes a molecule block (also residues
// without bonds, e.g. ions), and the M  CHG lines refer to the atom index
// inside the block, not to the MolCoord atom ID.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/StringStream.hpp>
#include <qsys/Object.hpp>
#include <string>
#include <vector>
#include "importers/SDFMolWriter.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"

using importers::SDFMolWriter;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using qlib::LString;
using qlib::StrOutStream;
using qlib::Vector4D;

namespace {

int addAtom(MolCoordPtr pMol, int resi, const char *resn, const char *name,
            const char *elem, double x, double charge)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName(resn);
    pAtom->setResIndex(ResidIndex(resi));
    pAtom->setName(name);
    pAtom->setElementName(elem);
    pAtom->setPos(Vector4D(x, 0.0, 0.0));
    if (charge != 0.0) pAtom->setAtomPropReal("formal_charge", charge);
    return pMol->appendAtom(pAtom);
}

std::vector<std::string> splitBlocks(const std::string &sdf)
{
    std::vector<std::string> blocks;
    size_t pos = 0;
    for (;;) {
        const size_t p = sdf.find("$$$$", pos);
        if (p == std::string::npos) break;
        blocks.push_back(sdf.substr(pos, p - pos));
        pos = p + 4;
    }
    return blocks;
}

}  // namespace

TEST(SDFMolWriter, ChargeLinesUseBlockAtomIndexAndIonsAreWritten)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    // residue 1: C1 - N1(+1)
    const int c1 = addAtom(pMol, 1, "XXX", "C1", "C", 0.0, 0.0);
    const int n1 = addAtom(pMol, 1, "XXX", "N1", "N", 1.5, 1.0);
    pMol->makeBond(c1, n1, true);
    // residue 2: C2 - N2(-1); N2 is the 4th atom of the molecule but the
    // 2nd atom of its block
    const int c2 = addAtom(pMol, 2, "YYY", "C2", "C", 5.0, 0.0);
    const int n2 = addAtom(pMol, 2, "YYY", "N2", "N", 6.5, -1.0);
    pMol->makeBond(c2, n2, true);
    // residue 3: a sodium ion, no bonds
    addAtom(pMol, 3, "NA", "NA", "Na", 10.0, 1.0);

    SDFMolWriter writer;
    writer.attach(qsys::ObjectPtr(pMol));
    StrOutStream outs;
    ASSERT_TRUE(writer.write(outs));
    writer.detach();

    const std::string sdf(outs.getString().c_str());
    std::vector<std::string> blocks = splitBlocks(sdf);
    ASSERT_EQ(blocks.size(), 3u);

    EXPECT_NE(blocks[0].find("M  CHG  1   2   1"), std::string::npos) << blocks[0];
    EXPECT_NE(blocks[1].find("M  CHG  1   2  -1"), std::string::npos) << blocks[1];
    // the ion block has one atom, no bonds and its charge on atom 1
    EXPECT_NE(blocks[2].find("  1  0  0  0  0  0  0  0  0  0999 V2000"),
              std::string::npos)
        << blocks[2];
    EXPECT_NE(blocks[2].find("M  CHG  1   1   1"), std::string::npos) << blocks[2];
    // no empty charge line anywhere
    EXPECT_EQ(sdf.find("M  CHG  0"), std::string::npos);
}

TEST(SDFMolWriter, EightChargesFitOnOneLine)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    int prev = -1;
    for (int i = 0; i < 8; ++i) {
        char name[8];
        std::snprintf(name, sizeof(name), "N%d", i + 1);
        const int aid = addAtom(pMol, 1, "XXX", name, "N", double(i) * 1.5, 1.0);
        if (prev >= 0) pMol->makeBond(prev, aid, true);
        prev = aid;
    }

    SDFMolWriter writer;
    writer.attach(qsys::ObjectPtr(pMol));
    StrOutStream outs;
    ASSERT_TRUE(writer.write(outs));
    writer.detach();

    const std::string sdf(outs.getString().c_str());
    EXPECT_NE(sdf.find("M  CHG  8"), std::string::npos);
    EXPECT_EQ(sdf.find("M  CHG  0"), std::string::npos);
}
