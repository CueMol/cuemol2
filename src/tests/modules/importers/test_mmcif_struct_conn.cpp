// -*-Mode: C++;-*-
//
// MmcifMolReader: a _struct_conn row that cannot be resolved (missing
// atom) must not stop the remaining links from being applied.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/StringStream.hpp>
#include "importers/MmcifMolReader.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/ResidIndex.hpp"

using importers::MmcifMolReader;
using molstr::MolAtomPtr;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using qlib::StrInStream;

namespace {

MolCoordPtr loadCif(const char *cifText)
{
    MmcifMolReader reader;
    reader.m_bLoadMultiModel = false;
    reader.m_bAutoTopoGen = false;
    reader.m_bLoadAltConf = true;
    StrInStream ins(cifText);
    return MolCoordPtr(reader.load(ins));
}

// two CYS-like residues; the first covale row names an atom that does not
// exist, the second one is a valid disulfide
const char *const CIF_LINKS =
    "data_test\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "_atom_site.id\n"
    "_atom_site.type_symbol\n"
    "_atom_site.label_atom_id\n"
    "_atom_site.label_comp_id\n"
    "_atom_site.label_asym_id\n"
    "_atom_site.label_seq_id\n"
    "_atom_site.auth_seq_id\n"
    "_atom_site.Cartn_x\n"
    "_atom_site.Cartn_y\n"
    "_atom_site.Cartn_z\n"
    "ATOM 1 C CB XXX A 1 1 0.0 0.0 0.0\n"
    "ATOM 2 S SG XXX A 1 1 1.8 0.0 0.0\n"
    "ATOM 3 C CB XXX A 2 2 5.0 0.0 0.0\n"
    "ATOM 4 S SG XXX A 2 2 3.8 0.0 0.0\n"
    "loop_\n"
    "_struct_conn.id\n"
    "_struct_conn.conn_type_id\n"
    "_struct_conn.ptnr1_label_asym_id\n"
    "_struct_conn.ptnr1_label_seq_id\n"
    "_struct_conn.ptnr1_label_atom_id\n"
    "_struct_conn.ptnr2_label_asym_id\n"
    "_struct_conn.ptnr2_label_seq_id\n"
    "_struct_conn.ptnr2_label_atom_id\n"
    "covale1 covale A 1 ZZ A 2 CB\n"
    "disulf1 disulf A 1 SG A 2 SG\n";

}  // namespace

TEST(MmcifMolReaderLinks, UnresolvedLinkDoesNotStopTheOthers)
{
    MolCoordPtr pMol = loadCif(CIF_LINKS);
    ASSERT_FALSE(pMol.isnull());
    ASSERT_EQ(pMol->getAtomSize(), 4);

    MolAtomPtr pSG1 = pMol->getAtom("A", ResidIndex(1), "SG");
    MolAtomPtr pSG2 = pMol->getAtom("A", ResidIndex(2), "SG");
    ASSERT_FALSE(pSG1.isnull());
    ASSERT_FALSE(pSG2.isnull());

    // the disulfide after the broken covale row must have been applied
    EXPECT_TRUE(pSG1->isBonded(pSG2->getID()));
}
