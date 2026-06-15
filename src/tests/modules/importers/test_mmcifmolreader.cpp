#include <gtest/gtest.h>
#include <common.h>
#include "importers/MmcifMolReader.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/ResidIndex.hpp"
#include "molstr/ElemSym.hpp"
#include <qlib/StringStream.hpp>
#include <qsys/ObjReader.hpp>

using importers::MmcifMolReader;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::ResidIndex;
using molstr::ElemSym;
using qlib::LString;
using qlib::StrInStream;

// -----------------------------------------------------------------------
// read() path tests for MmcifMolReader. These pin PDBx/mmCIF compliance
// behaviours: non-mandatory occupancy / B_iso defaulting, residue index
// auth/label fallback, alt-loc filtering, and element guessing when
// type_symbol is absent.
//
// NOTE: directly constructed readers do not get qif property defaults
// (those are applied only through the scripting/registry path), so the
// helper sets the two members the constructor leaves uninitialised.
// -----------------------------------------------------------------------

namespace {

MolCoordPtr loadCif(const char *cifText, bool loadAltConf = true)
{
    MmcifMolReader reader;
    reader.m_bLoadMultiModel = false;
    reader.m_bAutoTopoGen = false;
    reader.m_bLoadAltConf = loadAltConf;
    StrInStream ins(cifText);
    return MolCoordPtr(reader.load(ins));
}

}  // namespace

// ---- A. occupancy / B_iso are non-mandatory (PDBx mandatory:no) ----

// occupancy column absent -> occ defaults to 1.0; B_iso is read.
static const char *const CIF_NO_OCC =
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
    "_atom_site.B_iso_or_equiv\n"
    "ATOM 1 N N  ALA A 1 1 0.0 0.0 0.0 12.5\n"
    "ATOM 2 C CA ALA A 1 1 1.5 0.0 0.0 13.0\n";

TEST(MmcifMolReaderTest, NoOccupancyColumnDefaultsToOne)
{
    auto mol = loadCif(CIF_NO_OCC);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pN = mol->getAtom("A", ResidIndex(1), "N");
    ASSERT_FALSE(pN.isnull());
    EXPECT_NEAR(pN->getOcc(), 1.0, 1e-6);
    EXPECT_NEAR(pN->getBfac(), 12.5, 1e-4);
}

// B_iso column absent -> bfac defaults to 0.0; occupancy is read.
static const char *const CIF_NO_BFAC =
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
    "_atom_site.occupancy\n"
    "ATOM 1 N N ALA A 1 1 0.0 0.0 0.0 0.75\n";

TEST(MmcifMolReaderTest, NoBfacColumnDefaultsToZero)
{
    auto mol = loadCif(CIF_NO_BFAC);
    ASSERT_FALSE(mol.isnull());
    MolAtomPtr pN = mol->getAtom("A", ResidIndex(1), "N");
    ASSERT_FALSE(pN.isnull());
    EXPECT_NEAR(pN->getBfac(), 0.0, 1e-6);
    EXPECT_NEAR(pN->getOcc(), 0.75, 1e-4);
}

// occupancy / B_iso present: numeric values are read verbatim, while
// unknown('?') / inapplicable('.') fall back to the defaults.
static const char *const CIF_OCC_BFAC_VALUES =
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
    "_atom_site.occupancy\n"
    "_atom_site.B_iso_or_equiv\n"
    "ATOM 1 N N  ALA A 1 1 0.0 0.0 0.0 0.50 20.0\n"
    "ATOM 2 C CA ALA A 1 1 1.5 0.0 0.0 ?    .\n";

TEST(MmcifMolReaderTest, OccBfacNumericReadAndUnknownDefaulted)
{
    auto mol = loadCif(CIF_OCC_BFAC_VALUES);
    ASSERT_FALSE(mol.isnull());

    MolAtomPtr pN = mol->getAtom("A", ResidIndex(1), "N");
    ASSERT_FALSE(pN.isnull());
    EXPECT_NEAR(pN->getOcc(), 0.50, 1e-4);
    EXPECT_NEAR(pN->getBfac(), 20.0, 1e-4);

    MolAtomPtr pCA = mol->getAtom("A", ResidIndex(1), "CA");
    ASSERT_FALSE(pCA.isnull());
    EXPECT_NEAR(pCA->getOcc(), 1.0, 1e-6);   // '?' -> default
    EXPECT_NEAR(pCA->getBfac(), 0.0, 1e-6);  // '.' -> default
}

// ---- B. residue index falls back to mandatory label_seq_id ----

// Only label_seq_id is present (no auth_seq_id). Residues must keep their
// distinct indices (1, 2) instead of collapsing to index 0.
static const char *const CIF_LABEL_SEQ_ONLY =
    "data_test\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "_atom_site.id\n"
    "_atom_site.type_symbol\n"
    "_atom_site.label_atom_id\n"
    "_atom_site.label_comp_id\n"
    "_atom_site.label_asym_id\n"
    "_atom_site.label_seq_id\n"
    "_atom_site.Cartn_x\n"
    "_atom_site.Cartn_y\n"
    "_atom_site.Cartn_z\n"
    "ATOM 1 C CA ALA A 1 0.0 0.0 0.0\n"
    "ATOM 2 C CA GLY A 2 3.8 0.0 0.0\n";

TEST(MmcifMolReaderTest, LabelSeqIdOnlyKeepsDistinctResidues)
{
    auto mol = loadCif(CIF_LABEL_SEQ_ONLY);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 2);

    MolAtomPtr pRes1 = mol->getAtom("A", ResidIndex(1), "CA");
    MolAtomPtr pRes2 = mol->getAtom("A", ResidIndex(2), "CA");
    ASSERT_FALSE(pRes1.isnull());
    ASSERT_FALSE(pRes2.isnull());
    EXPECT_EQ(std::string(pRes1->getResName().c_str()), std::string("ALA"));
    EXPECT_EQ(std::string(pRes2->getResName().c_str()), std::string("GLY"));
}

// ---- C. alt-loc filtering (loadAltConf == false keeps primary 'A') ----

static const char *const CIF_ALTLOC =
    "data_test\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "_atom_site.id\n"
    "_atom_site.type_symbol\n"
    "_atom_site.label_atom_id\n"
    "_atom_site.label_alt_id\n"
    "_atom_site.label_comp_id\n"
    "_atom_site.label_asym_id\n"
    "_atom_site.label_seq_id\n"
    "_atom_site.auth_seq_id\n"
    "_atom_site.Cartn_x\n"
    "_atom_site.Cartn_y\n"
    "_atom_site.Cartn_z\n"
    "ATOM 1 C CA A ALA A 1 1 1.0 0.0 0.0\n"
    "ATOM 2 C CA B ALA A 1 1 2.0 0.0 0.0\n";

TEST(MmcifMolReaderTest, AltConfDisabledKeepsPrimaryConformer)
{
    auto mol = loadCif(CIF_ALTLOC, /*loadAltConf=*/false);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 1);

    MolAtomPtr pCA = mol->getAtom("A", ResidIndex(1), "CA");
    ASSERT_FALSE(pCA.isnull());
    // altloc 'A' (x=1.0) is kept, 'B' (x=2.0) dropped.
    EXPECT_NEAR(pCA->getPos().x(), 1.0, 1e-6);
}

// ---- D. element guessing when type_symbol is absent ----

static const char *const CIF_NO_TYPE_SYMBOL =
    "data_test\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "_atom_site.id\n"
    "_atom_site.label_atom_id\n"
    "_atom_site.label_comp_id\n"
    "_atom_site.label_asym_id\n"
    "_atom_site.label_seq_id\n"
    "_atom_site.auth_seq_id\n"
    "_atom_site.Cartn_x\n"
    "_atom_site.Cartn_y\n"
    "_atom_site.Cartn_z\n"
    "ATOM 1 N  ALA A 1 1 0.0 0.0 0.0\n"
    "ATOM 2 CB ALA A 1 1 1.5 0.0 0.0\n"
    "ATOM 3 O  ALA A 1 1 2.5 0.0 0.0\n";

TEST(MmcifMolReaderTest, MissingTypeSymbolGuessesElementFromName)
{
    auto mol = loadCif(CIF_NO_TYPE_SYMBOL);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtom("A", ResidIndex(1), "N")->getElement(),
              (molstr::ElemID)ElemSym::N);
    EXPECT_EQ(mol->getAtom("A", ResidIndex(1), "CB")->getElement(),
              (molstr::ElemID)ElemSym::C);
    EXPECT_EQ(mol->getAtom("A", ResidIndex(1), "O")->getElement(),
              (molstr::ElemID)ElemSym::O);
}

// ---- General: real predicted-model shape (non-standard column order,
//      no occupancy column, no unit cell). ----

static const char *const CIF_NONSTD_ORDER =
    "data_structure\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "_atom_site.type_symbol\n"
    "_atom_site.label_atom_id\n"
    "_atom_site.label_alt_id\n"
    "_atom_site.label_comp_id\n"
    "_atom_site.label_asym_id\n"
    "_atom_site.label_seq_id\n"
    "_atom_site.auth_seq_id\n"
    "_atom_site.B_iso_or_equiv\n"
    "_atom_site.Cartn_x\n"
    "_atom_site.Cartn_y\n"
    "_atom_site.Cartn_z\n"
    "_atom_site.id\n"
    "ATOM N N  . ALA A 1 1 12.5 0.0 0.0 0.0 1\n"
    "ATOM C CA . ALA A 1 1 13.0 1.5 0.0 0.0 2\n";

TEST(MmcifMolReaderTest, NonStandardColumnOrderNoCellLoads)
{
    auto mol = loadCif(CIF_NONSTD_ORDER);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 2);
    MolAtomPtr pN = mol->getAtom("A", ResidIndex(1), "N");
    ASSERT_FALSE(pN.isnull());
    EXPECT_NEAR(pN->getOcc(), 1.0, 1e-6);  // no occupancy column -> default
}

// ---- F-a. CIF data names are case-insensitive ----

static const char *const CIF_UPPERCASE_TAGS =
    "data_test\n"
    "loop_\n"
    "_ATOM_SITE.GROUP_PDB\n"
    "_ATOM_SITE.ID\n"
    "_ATOM_SITE.TYPE_SYMBOL\n"
    "_ATOM_SITE.LABEL_ATOM_ID\n"
    "_ATOM_SITE.LABEL_COMP_ID\n"
    "_ATOM_SITE.LABEL_ASYM_ID\n"
    "_ATOM_SITE.LABEL_SEQ_ID\n"
    "_ATOM_SITE.AUTH_SEQ_ID\n"
    "_ATOM_SITE.CARTN_X\n"
    "_ATOM_SITE.CARTN_Y\n"
    "_ATOM_SITE.CARTN_Z\n"
    "ATOM 1 N N ALA A 1 1 0.0 0.0 0.0\n";

TEST(MmcifMolReaderTest, UppercaseTagsAreRecognized)
{
    auto mol = loadCif(CIF_UPPERCASE_TAGS);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 1);
    MolAtomPtr pN = mol->getAtom("A", ResidIndex(1), "N");
    ASSERT_FALSE(pN.isnull());
    EXPECT_EQ(pN->getElement(), (molstr::ElemID)ElemSym::N);
}

// ---- F-b. inline '#' comment runs to end of line ----

static const char *const CIF_INLINE_COMMENT =
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
    "ATOM 1 N N  ALA A 1 1 0.0 0.0 0.0 # trailing comment\n"
    "ATOM 2 C CA ALA A 1 1 1.5 0.0 0.0\n";

TEST(MmcifMolReaderTest, InlineCommentIsIgnored)
{
    auto mol = loadCif(CIF_INLINE_COMMENT);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 2);
    MolAtomPtr pN = mol->getAtom("A", ResidIndex(1), "N");
    ASSERT_FALSE(pN.isnull());
    EXPECT_NEAR(pN->getPos().x(), 0.0, 1e-6);
}

// ---- F-c. multiple data_ blocks merge into one object ----

static const char *const CIF_TWO_BLOCKS =
    "data_block1\n"
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
    "ATOM 1 N N ALA A 1 1 0.0 0.0 0.0\n"
    "#\n"
    "data_block2\n"
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
    "ATOM 1 N N GLY B 1 1 5.0 0.0 0.0\n";

TEST(MmcifMolReaderTest, MultipleDataBlocksAreMerged)
{
    auto mol = loadCif(CIF_TWO_BLOCKS);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 2);
    ASSERT_FALSE(mol->getAtom("A", ResidIndex(1), "N").isnull());  // block1
    ASSERT_FALSE(mol->getAtom("B", ResidIndex(1), "N").isnull());  // block2
}

// ---- F-d. semicolon-delimited multi-line text blocks are consumed ----

// The text block deliberately contains lines starting with '_' and 'loop_'
// to prove they are not misinterpreted as data items / loop starts. The
// real _atom_site loop after the block must still parse.
static const char *const CIF_SEMICOLON_BLOCK =
    "data_test\n"
    "_struct.title\n"
    ";This is a long multi-line title\n"
    "_atom_site is only mentioned in prose here\n"
    "loop_ also appears as plain text\n"
    ";\n"
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
    "ATOM 1 N N ALA A 1 1 0.0 0.0 0.0\n";

TEST(MmcifMolReaderTest, SemicolonTextBlockIsConsumed)
{
    auto mol = loadCif(CIF_SEMICOLON_BLOCK);
    ASSERT_FALSE(mol.isnull());
    EXPECT_EQ(mol->getAtomSize(), 1);
    ASSERT_FALSE(mol->getAtom("A", ResidIndex(1), "N").isnull());
}
