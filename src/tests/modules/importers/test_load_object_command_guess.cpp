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
