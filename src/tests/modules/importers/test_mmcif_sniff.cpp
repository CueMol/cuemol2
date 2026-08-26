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

// Current PDB entry shape: the coordinate loop sits far past any sniff
// cap, but the coordinate-model categories appear in the header. Both
// sniffers must settle on them (YES for the mol reader, NO for the map
// reader) without reaching `_atom_site.`.
static const char *const COORD_CIF_LATE_ATOM_SITE =
    "data_5IRE\n"
    "_entry.id   5IRE\n"
    "loop_\n"
    "_entity.id\n"
    "_entity.type\n"
    "1 polymer\n"
    "loop_\n"
    "_entity_poly.entity_id\n"
    "1 polypeptide(L)\n"
    "# ... hundreds of KB of header would follow, then _atom_site.\n";

// Structure-factor CIF header before its `_refln.` loop: the coordinate
// categories must NOT appear, so the early markers cannot misfire.
static const char *const SF_CIF_WITH_HEADER =
    "data_r5iresf\n"
    "_cell.length_a   798.72\n"
    "_symmetry.space_group_name_H-M   'P 1'\n"
    "_diffrn_radiation_wavelength.id   1\n"
    "loop_\n"
    "_refln.index_h\n"
    "0 0 0 1.0\n";

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

// A modern PDB mmCIF is recognised from its header categories, without
// the sniffer having to reach the far-away `_atom_site.` loop.
TEST(MmcifMolReaderSniffTest, CoordCifWithLateAtomSiteReturnsYes)
{
    MmcifMolReader reader;
    EXPECT_EQ(sniff(reader, COORD_CIF_LATE_ATOM_SITE), ObjReader::CONTENT_YES);
}

// The early coordinate markers must not fire on a structure-factor CIF.
TEST(MmcifMolReaderSniffTest, SfCifWithHeaderReturnsNo)
{
    MmcifMolReader reader;
    EXPECT_EQ(sniff(reader, SF_CIF_WITH_HEADER), ObjReader::CONTENT_NO);
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

// The coordinate-model categories reject a coordinate CIF long before
// its far-away `_atom_site.` loop.
TEST(MmcifMapReaderSniffTest, CoordCifWithLateAtomSiteReturnsNo)
{
    MmcifMapReader reader;
    EXPECT_EQ(sniff(reader, COORD_CIF_LATE_ATOM_SITE), ObjReader::CONTENT_NO);
}

// ... and they must not fire on a structure-factor header.
TEST(MmcifMapReaderSniffTest, SfCifWithHeaderReturnsYes)
{
    MmcifMapReader reader;
    EXPECT_EQ(sniff(reader, SF_CIF_WITH_HEADER), ObjReader::CONTENT_YES);
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

// -----------------------------------------------------------------------
// Streaming-mode regression: real PDB-derived mmCIF can carry a very
// long metadata header (entity, struct_ref, struct_conn, ...) before
// the first `_atom_site.` token. The previous implementation drained a
// fixed 64 KB head buffer; anything past that boundary was invisible to
// the sniffer. With the streaming refactor each reader reads from a
// FileInStream and breaks on first hit, so arbitrarily long headers
// are handled correctly.
// -----------------------------------------------------------------------

namespace {

// Build a synthetic coord CIF whose `_atom_site.` line sits past
// `padBytes` of leading garbage-but-CIF-shaped lines. The padding lines
// are CIF-comment-shaped and ~256 bytes each so test runs cross byte
// thresholds without piling up an excessive line count (which keeps the
// test independent of any per-reader line-budget that may exist).
std::string makeLongHeaderCif(int padBytes, const std::string &payloadHeader)
{
    std::string padding;
    padding.reserve(padBytes + payloadHeader.size());
    padding.append("data_test\n");
    const std::string line = std::string("# padding line - ignored by the "
                                         "sniffer (long enough to keep the "
                                         "line count low while still pushing "
                                         "byte offsets past the legacy 64 KB "
                                         "peek-buffer boundary in only a few "
                                         "hundred lines)\n");
    while (static_cast<int>(padding.size()) < padBytes) padding += line;
    padding += payloadHeader;
    return padding;
}

}  // namespace

// `_atom_site.` past the 64 KB boundary (~128 KB) -- the streaming code
// must still hit it because no peek-buffer cap exists.
TEST(MmcifSniffIntegration, LongHeaderCifIsFoundBeyondLegacyPeekCap)
{
    const std::string content = makeLongHeaderCif(
        /*padBytes=*/128 * 1024,
        std::string("loop_\n_atom_site.group_PDB\n_atom_site.id\n"
                    "ATOM 1 N N\n"));
    LString path = writeTempCif(".cif", content.c_str());
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcif"));
}

// Symmetric: long-header SF CIF still resolves to mmcifmap.
TEST(MmcifSniffIntegration, LongHeaderSfCifIsFoundBeyondLegacyPeekCap)
{
    const std::string content = makeLongHeaderCif(
        /*padBytes=*/128 * 1024,
        std::string("loop_\n_refln.index_h\n_refln.index_k\n"
                    "0 0 0 1.0\n"));
    LString path = writeTempCif(".cif", content.c_str());
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcifmap"));
}

// maxBytes=0 (the default) means unbounded -- equivalent to omitting
// the parameter. Long-header CIF still hits.
TEST(MmcifSniffIntegration, MaxBytesZeroIsUnbounded)
{
    const std::string content = makeLongHeaderCif(
        /*padBytes=*/64 * 1024,
        std::string("loop_\n_atom_site.group_PDB\nATOM 1 N N\n"));
    LString path = writeTempCif(".cif", content.c_str());
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER,
        /*supportCompression=*/false, /*maxBytes=*/0);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcif"));
}

// maxBytes set to a small cap prevents readers from seeing the hit
// even when content sits later in the file. Result: no YES verdict,
// empty string returned. Acts as the safety knob script callers can
// use against pathological / very large inputs.
TEST(MmcifSniffIntegration, MaxBytesCapPreventsLateHitDiscovery)
{
    const std::string content = makeLongHeaderCif(
        /*padBytes=*/8 * 1024,  // _atom_site. sits past 8 KB
        std::string("loop_\n_atom_site.group_PDB\nATOM 1 N N\n"));
    LString path = writeTempCif(".cif", content.c_str());
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER,
        /*supportCompression=*/false, /*maxBytes=*/1024);
    EXPECT_TRUE(hit.isEmpty());
}

// Same maxBytes cap, but with the hit positioned within the cap range:
// the verdict comes back normally.
TEST(MmcifSniffIntegration, MaxBytesAllowsHitInsideCap)
{
    // No padding: `_atom_site.` is near the top of the file, well
    // within a 1 KB window.
    LString path = writeTempCif(".cif", COORD_CIF);
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER,
        /*supportCompression=*/false, /*maxBytes=*/1024);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcif"));
}

// -----------------------------------------------------------------------
// Reader-side line-budget removal: the readers used to give up after a
// fixed line count (MMCIF_SNIFF_MAX_LINES = 2000). With per-reader caps
// removed, the only safety knob is the caller's maxBytes. These tests
// pin "reader scans until decision or EOF".
// -----------------------------------------------------------------------

namespace {

// Build a CIF with a *line-heavy* preamble: short comment lines that
// quickly exceed the legacy 2000-line per-reader budget without
// crossing the byte-cap. Each padding line is ~10 bytes so 30000 lines
// is only ~300 KB.
std::string makeManyShortLinesCif(int padLines,
                                  const std::string &payloadHeader)
{
    std::string out;
    out.reserve(padLines * 10 + payloadHeader.size());
    out.append("data_test\n");
    for (int i = 0; i < padLines; ++i) out += "# pad\n";
    out += payloadHeader;
    return out;
}

}  // namespace

// 5000 padding lines (>= old MMCIF_SNIFF_MAX_LINES cap) followed by an
// `_atom_site.` block. Pre-refactor the reader would have given up at
// line 2000 and returned UNKNOWN; the streaming refactor scans the
// whole file and finds the hit.
TEST(MmcifSniffIntegration, ReaderScansBeyondLegacyLineBudget)
{
    const std::string content = makeManyShortLinesCif(
        /*padLines=*/5000,
        std::string("loop_\n_atom_site.group_PDB\nATOM 1 N N\n"));
    LString path = writeTempCif(".cif", content.c_str());
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcif"));
}

// Symmetric: line-heavy SF CIF still resolves to mmcifmap.
TEST(MmcifSniffIntegration, MapReaderScansBeyondLegacyLineBudget)
{
    const std::string content = makeManyShortLinesCif(
        /*padLines=*/5000,
        std::string("loop_\n_refln.index_h\n0 0 0 1.0\n"));
    LString path = writeTempCif(".cif", content.c_str());
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(std::string(hit.c_str()), std::string("mmcifmap"));
}

// Pathological: a non-CIF text file that's ~200 KB of ASCII garbage.
// No reader prefix appears anywhere. Both readers must scan to EOF
// without crashing, return UNKNOWN, and the search returns "" in a
// reasonable amount of time (the gtest framework's per-test timeout
// catches runaway scans).
TEST(MmcifSniffIntegration, NonCifGarbageReturnsEmpty)
{
    std::string content;
    content.reserve(200 * 1024);
    // Deterministic ASCII garbage with line breaks every ~80 chars so
    // the LineStream produces a finite, well-formed iteration sequence.
    const std::string line =
        "abcdefghijklmnopqrstuvwxyz 0123456789 !@#$%^&*() ABCDEFGHIJKLMNOPQRSTUV\n";
    while (content.size() < 200 * 1024) content += line;
    LString path = writeTempCif(".dat", content.c_str());
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}
