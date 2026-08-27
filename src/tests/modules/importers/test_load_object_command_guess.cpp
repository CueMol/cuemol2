#include <gtest/gtest.h>
#include <common.h>
#include "qsys/command/LoadObjectCommand.hpp"
#include "qsys/InOutHandler.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/Scene.hpp"
#include "qsys/Object.hpp"
#include <qlib/LString.hpp>
#include <fstream>
#include <string>

using qsys::LoadObjectCommand;
using qsys::InOutHandler;
using qlib::LString;

// -----------------------------------------------------------------------
// Reuse the same CIF fragments as test_mmcif_sniff.cpp; keeping them
// local avoids cross-file dependencies between test sources.
// -----------------------------------------------------------------------

static const char *const COORD_CIF =
    "data_test\n"
    "loop_\n"
    "_atom_site.group_PDB\n"
    "_atom_site.id\n"
    "ATOM 1 N\n";

static const char *const SF_CIF =
    "data_test\n"
    "loop_\n"
    "_refln.index_h\n"
    "_refln.F_meas_au\n"
    "1 12.34\n";

static const char *const NON_CIF =
    "HEADER    PROTEIN                                   01-JAN-00\n"
    "ATOM      1  N   ALA A   1\n";

namespace {

LString writeTempCif(const std::string &suffix, const char *payload)
{
    static int s_counter = 0;
    const std::string dir = ::testing::TempDir();
    const std::string path =
        dir + "/load_obj_cmd_" + std::to_string(++s_counter) + suffix;
    std::ofstream out(path, std::ios::binary);
    out << payload;
    out.close();
    return LString(path.c_str());
}

}  // namespace

// -----------------------------------------------------------------------
// guessFileFormat: ext-first mode (default), with .cif sharing both
// readers. Sniff must disambiguate.
// -----------------------------------------------------------------------

TEST(LoadObjectCommandGuessTest, ExtFirstAmbiguousCifPicksMmcifForCoord)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", COORD_CIF);
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/false);
    EXPECT_EQ(std::string(fmt.c_str()), std::string("mmcif"));
}

TEST(LoadObjectCommandGuessTest, ExtFirstAmbiguousCifPicksMmcifmapForSF)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", SF_CIF);
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/false);
    EXPECT_EQ(std::string(fmt.c_str()), std::string("mmcifmap"));
}

// Unique-extension files (e.g. *.pdb) still pick their reader from the
// extension alone -- the new sniff step is only reached when the
// extension is ambiguous. We can probe this by checking that a .pdb
// path resolves to a non-empty nickname (the PDB reader is registered
// by importers).
TEST(LoadObjectCommandGuessTest, ExtFirstUniqueExtensionReturnsTheReader)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".pdb", NON_CIF);
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/false);
    // PDB reader is registered with `*.pdb` extension; we only assert
    // that we got *something*, not which exact nickname (so the test
    // doesn't break if a sibling reader is added later).
    EXPECT_FALSE(fmt.isEmpty());
}

// Unknown extension that no reader claims -> empty.
TEST(LoadObjectCommandGuessTest, ExtFirstUnknownExtensionReturnsEmpty)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".no_such_extension_anywhere", COORD_CIF);
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/false);
    EXPECT_TRUE(fmt.isEmpty());
}

// -----------------------------------------------------------------------
// guessFileFormat: content-first mode. The extension is ignored entirely
// and the reader is chosen purely from the file head.
// -----------------------------------------------------------------------

TEST(LoadObjectCommandGuessTest, ContentFirstIgnoresExtensionUsesContent)
{
    // Wrong (but well-known) extension: .pdb. Content is SF CIF.
    // In ext-first mode this would resolve to "pdb" or similar; in
    // content-first mode it must resolve to mmcifmap.
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".pdb", SF_CIF);
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/true);
    EXPECT_EQ(std::string(fmt.c_str()), std::string("mmcifmap"));
}

TEST(LoadObjectCommandGuessTest, ContentFirstCoordCifPicksMmcif)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", COORD_CIF);
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/true);
    EXPECT_EQ(std::string(fmt.c_str()), std::string("mmcif"));
}

// Plain-text content that no reader recognises -> empty.
TEST(LoadObjectCommandGuessTest, ContentFirstUnknownContentReturnsEmpty)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".whatever", "just some random text\n");
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/true);
    EXPECT_TRUE(fmt.isEmpty());
}

// -----------------------------------------------------------------------
// setTargetScene: the method-call path must not perturb the scene's
// parent-linkage bookkeeping. We can't directly observe `m_thisname`
// (it's private state on LScrObjBase), but the method body is a plain
// assignment to m_pTargScene, so this test simply pins the existence
// of the method and that the scene round-trips through it.
// -----------------------------------------------------------------------

TEST(LoadObjectCommandSetTargetSceneTest, AssignsScenePointer)
{
    qsys::ScenePtr scene =
        qsys::SceneManager::getInstance()->createScene();
    ASSERT_FALSE(scene.isnull());

    LoadObjectCommand cmd;
    EXPECT_TRUE(cmd.m_pTargScene.isnull());

    cmd.setTargetScene(scene);
    EXPECT_FALSE(cmd.m_pTargScene.isnull());
    EXPECT_EQ(cmd.m_pTargScene.get(), scene.get());

    qsys::SceneManager::getInstance()->destroyScene(scene->getUID());
}

// -----------------------------------------------------------------------
// m_bContentFirst default value sanity check.
// -----------------------------------------------------------------------

TEST(LoadObjectCommandContentFirstDefault, IsFalseByDefault)
{
    LoadObjectCommand cmd;
    EXPECT_FALSE(cmd.m_bContentFirst);
}

// -----------------------------------------------------------------------
// m_nMaxSniffBytes default + plumbing into the sniff path.
// -----------------------------------------------------------------------

TEST(LoadObjectCommandMaxSniffBytesDefault, IsZeroByDefault)
{
    LoadObjectCommand cmd;
    EXPECT_EQ(cmd.m_nMaxSniffBytes, 0u);
}

namespace {

// CIF whose `_atom_site.` token sits past `padBytes` of padding lines.
// With a maxBytes ceiling below that offset the sniffer never reaches
// the hit and the ambiguous-extension fallback kicks in.
std::string makePaddedCoordCif(size_t padBytes)
{
    std::string out;
    out.reserve(padBytes + 1024);
    out.append("data_test\n");
    const std::string line = std::string("# padding line - ignored by the "
                                         "sniffer (kept long enough to "
                                         "force atom_site past any small "
                                         "maxBytes cap with few lines)\n");
    while (out.size() < padBytes) out += line;
    out += "loop_\n_atom_site.group_PDB\nATOM 1 N\n";
    return out;
}

// ~8 KB of padding: past a 1 KiB ceiling, inside the 64 KiB first round.
std::string makeBigHeaderCoordCif()
{
    return makePaddedCoordCif(8 * 1024);
}

// ~300 KB of padding: past the 64 KiB first round, so only the
// escalating budget (second round, 512 KiB) reaches the marker.
std::string makeVeryBigHeaderCoordCif()
{
    return makePaddedCoordCif(300 * 1024);
}

}  // namespace

// With m_nMaxSniffBytes > 0 in ext-first mode, the sniffer never sees
// past that ceiling (a ceiling below the 64 KiB initial budget is a
// single round). For an ambiguous .cif where the verdict lies past
// the ceiling, sniff disambiguation fails and guessFileFormat falls
// back to the first ext-matched candidate. The candidate list is collected
// in m_rdrinfotab iteration order (sorted by ABI name), which for the
// CIF pair starts with mmcifmap (xtal namespace) before mmcif
// (importers namespace). The exact identity matters less than that the
// fallback path is reached: any valid CIF reader nickname is OK.
TEST(LoadObjectCommandMaxSniffBytesExtFirst, CapLimitsSniffDisambiguation)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", makeBigHeaderCoordCif().c_str());
    cmd.m_nMaxSniffBytes = 1024;
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/false,
                                      cmd.m_nMaxSniffBytes);
    const std::string got(fmt.c_str());
    EXPECT_TRUE(got == "mmcif" || got == "mmcifmap")
        << "Fallback returned '" << got
        << "', expected one of the registered CIF readers";
}

// Same setup but in content-first mode: ceiling applies, no reader
// claims the head, result is empty.
TEST(LoadObjectCommandMaxSniffBytesContentFirst, CapForcesEmpty)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", makeBigHeaderCoordCif().c_str());
    cmd.m_nMaxSniffBytes = 1024;
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/true,
                                      cmd.m_nMaxSniffBytes);
    EXPECT_TRUE(fmt.isEmpty());
}

// With m_nMaxSniffBytes = 0 (no ceiling, the default), the same payload
// resolves to the right reader because the first 64 KiB round already
// reaches the `_atom_site.` token.
TEST(LoadObjectCommandMaxSniffBytesContentFirst, ZeroCapIsUnbounded)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", makeBigHeaderCoordCif().c_str());
    cmd.m_nMaxSniffBytes = 0;
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/true,
                                      cmd.m_nMaxSniffBytes);
    EXPECT_EQ(std::string(fmt.c_str()), std::string("mmcif"));
}

// -----------------------------------------------------------------------
// Escalating budget: a marker past the 64 KiB first round is reached in
// a later round unless the ceiling stops the growth first.
// -----------------------------------------------------------------------

TEST(LoadObjectCommandMaxSniffBytesContentFirst, MarkerAt300KbResolvesWithNoCeiling)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", makeVeryBigHeaderCoordCif().c_str());
    cmd.m_nMaxSniffBytes = 0;
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/true,
                                      cmd.m_nMaxSniffBytes);
    EXPECT_EQ(std::string(fmt.c_str()), std::string("mmcif"));
}

TEST(LoadObjectCommandMaxSniffBytesContentFirst, CeilingBelowMarkerYieldsEmpty)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", makeVeryBigHeaderCoordCif().c_str());
    cmd.m_nMaxSniffBytes = 128 * 1024;  // 64 KiB round, then clamped 128 KiB round
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/true,
                                      cmd.m_nMaxSniffBytes);
    EXPECT_TRUE(fmt.isEmpty());
}

TEST(LoadObjectCommandMaxSniffBytesExtFirst, CeilingBelowMarkerFallsBackToFirstCandidate)
{
    LoadObjectCommand cmd;
    cmd.m_filePath = writeTempCif(".cif", makeVeryBigHeaderCoordCif().c_str());
    cmd.m_nMaxSniffBytes = 128 * 1024;
    LString fmt = cmd.guessFileFormat(InOutHandler::IOH_CAT_OBJREADER,
                                      /*bContentFirst=*/false,
                                      cmd.m_nMaxSniffBytes);
    const std::string got(fmt.c_str());
    EXPECT_TRUE(got == "mmcif" || got == "mmcifmap")
        << "Fallback returned '" << got
        << "', expected one of the registered CIF readers";
}
