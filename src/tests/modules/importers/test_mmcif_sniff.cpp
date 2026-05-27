#include <gtest/gtest.h>
#include <common.h>
#include "importers/MmcifMolReader.hpp"
#include "xtal/MmcifMapReader.hpp"
#include "qsys/StreamManager.hpp"
#include "qsys/InOutHandler.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/LString.hpp>
#include <qlib/StringStream.hpp>
#include <fstream>
#include <string>

using importers::MmcifMolReader;
using xtal::MmcifMapReader;
using qsys::StreamManager;
using qsys::InOutHandler;
using qsys::ObjReader;
using qlib::LString;
using qlib::StrInStream;

// -----------------------------------------------------------------------
// Minimal synthesised CIF fragments. These are *headers only*, sized to
// fit comfortably inside the 8 KB sniff buffer used by StreamManager.
// They're not valid enough to read() into a MolCoord / DensityMap (that
// is the read-path's job), but they are valid enough for the sniffer's
// line-prefix scan.
// -----------------------------------------------------------------------

// Coordinate CIF: contains an `_atom_site.` loop_ header.
static const char *const COORD_CIF =
    "data_test\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "_atom_site.id\n"
    "_atom_site.type_symbol\n"
    "_atom_site.label_atom_id\n"
    "ATOM 1 N N\n";

// Structure-factor CIF: contains a `_refln.` loop_ header.
static const char *const SF_CIF =
    "data_test\n"
    "loop_\n"
    "_refln.index_h\n"
    "_refln.index_k\n"
    "_refln.index_l\n"
    "_refln.F_meas_au\n"
    "1 0 0 12.34\n";

// Mixed header: both categories appear (rare but legal). Each reader
// returns YES on the first prefix it recognises in line order.
static const char *const MIXED_CIF =
    "data_test\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "ATOM 1 N N\n"
    "loop_\n"
    "_refln.index_h\n"
    "0 0 0 1.0\n";

// CIF where `_atom_site.` only appears as a *comment* line. Sniffer
// must skip it and fall through to UNKNOWN (no other category present).
static const char *const COMMENT_ONLY_CIF =
    "data_test\n"
    "# _atom_site.label_atom_id appears only in a comment here\n"
    "# _refln.index_h likewise\n"
    "loop_\n"
    "_something_else.foo\n";

// Non-CIF text: neither category appears. Sniffer returns UNKNOWN.
static const char *const NON_CIF =
    "HEADER    PROTEIN                                   01-JAN-00\n"
    "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00\n";

namespace {

// Run `canHandleContent` on a fresh StrInStream over `payload`.
int sniff(const ObjReader &reader, const char *payload)
{
    StrInStream ins(payload);
    return reader.canHandleContent(ins);
}

// Write payload to a temp file and return its path.
LString writeTempCif(const std::string &suffix, const char *payload)
{
    static int s_counter = 0;
    const std::string dir = ::testing::TempDir();
    const std::string path =
        dir + "/mmcif_sniff_" + std::to_string(++s_counter) + suffix;
    std::ofstream out(path, std::ios::binary);
    out << payload;
    out.close();
    return LString(path.c_str());
}

}  // namespace

// -----------------------------------------------------------------------
// MmcifMolReader::canHandleContent
// -----------------------------------------------------------------------

TEST(MmcifMolReaderSniffTest, CoordCifReturnsYes)
{
    MmcifMolReader reader;
    EXPECT_EQ(sniff(reader, COORD_CIF), ObjReader::CONTENT_YES);
}

TEST(MmcifMolReaderSniffTest, SfCifReturnsNo)
{
    MmcifMolReader reader;
    EXPECT_EQ(sniff(reader, SF_CIF), ObjReader::CONTENT_NO);
}

// Mixed CIF: `_atom_site.` appears first in the mixed sample, so the
// coord reader returns YES on its very first hit.
TEST(MmcifMolReaderSniffTest, MixedCifReturnsYesOnAtomSiteFirst)
{
    MmcifMolReader reader;
    EXPECT_EQ(sniff(reader, MIXED_CIF), ObjReader::CONTENT_YES);
}

TEST(MmcifMolReaderSniffTest, CommentOnlyReturnsUnknown)
{
    MmcifMolReader reader;
    EXPECT_EQ(sniff(reader, COMMENT_ONLY_CIF), ObjReader::CONTENT_UNKNOWN);
}

TEST(MmcifMolReaderSniffTest, NonCifReturnsUnknown)
{
    MmcifMolReader reader;
    EXPECT_EQ(sniff(reader, NON_CIF), ObjReader::CONTENT_UNKNOWN);
}

// -----------------------------------------------------------------------
// MmcifMapReader::canHandleContent (symmetric)
// -----------------------------------------------------------------------

TEST(MmcifMapReaderSniffTest, SfCifReturnsYes)
{
    MmcifMapReader reader;
    EXPECT_EQ(sniff(reader, SF_CIF), ObjReader::CONTENT_YES);
}

TEST(MmcifMapReaderSniffTest, CoordCifReturnsNo)
{
    MmcifMapReader reader;
    EXPECT_EQ(sniff(reader, COORD_CIF), ObjReader::CONTENT_NO);
}

// In the mixed sample, the coord category appears *before* the refln
// one, so the map reader returns NO at the first hit.
TEST(MmcifMapReaderSniffTest, MixedCifReturnsNoOnAtomSiteFirst)
{
    MmcifMapReader reader;
    EXPECT_EQ(sniff(reader, MIXED_CIF), ObjReader::CONTENT_NO);
}

TEST(MmcifMapReaderSniffTest, CommentOnlyReturnsUnknown)
{
    MmcifMapReader reader;
    EXPECT_EQ(sniff(reader, COMMENT_ONLY_CIF), ObjReader::CONTENT_UNKNOWN);
}

TEST(MmcifMapReaderSniffTest, NonCifReturnsUnknown)
{
    MmcifMapReader reader;
    EXPECT_EQ(sniff(reader, NON_CIF), ObjReader::CONTENT_UNKNOWN);
}

// -----------------------------------------------------------------------
// End-to-end via StreamManager::searchReaderByContent: this is the
// regression test for the bug that drove the whole change. With both
// readers registered, an ambiguous `.cif` file resolves to the right
// nickname purely from content, not extension.
// -----------------------------------------------------------------------

TEST(MmcifSniffIntegration, StreamManagerPicksMmcifForCoordCif)
{
    LString path = writeTempCif(".cif", COORD_CIF);
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcif"));
}

TEST(MmcifSniffIntegration, StreamManagerPicksMmcifmapForSfCif)
{
    LString path = writeTempCif(".cif", SF_CIF);
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcifmap"));
}

// Filter the candidate set to just the two CIF readers: same result.
TEST(MmcifSniffIntegration, StreamManagerCsvFilterPicksCorrectCifReader)
{
    LString path = writeTempCif(".cif", SF_CIF);
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString("mmcif,mmcifmap"),
        InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcifmap"));
}

// searchReadersByContent() returns *all* YES matches. For a mixed CIF,
// both readers' canHandleContent() runs against the same head buffer:
// MmcifMolReader hits `_atom_site.` first and returns YES, while
// MmcifMapReader hits `_atom_site.` first and returns NO -- so only
// one reader appears in the multi-match result.
TEST(MmcifSniffIntegration, MixedCifMultiMatchReturnsOnlyMmcif)
{
    LString path = writeTempCif(".cif", MIXED_CIF);
    LString csv = StreamManager::getInstance()->searchReadersByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    // Only mmcif is expected because mmcifmap saw `_atom_site.` first
    // and returned NO.
    EXPECT_NE(std::string(csv.c_str()).find("mmcif"), std::string::npos);
    EXPECT_EQ(std::string(csv.c_str()).find("mmcifmap"), std::string::npos);
}
