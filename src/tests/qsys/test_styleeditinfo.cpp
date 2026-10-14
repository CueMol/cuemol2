#include <gtest/gtest.h>
#include <common.h>
#include <string>
#include "qsys/style/StyleEditInfo.hpp"
#include "qsys/style/StyleMgr.hpp"
#include "qsys/style/StyleSet.hpp"
#include "qsys/Scene.hpp"
#include "qsys/SceneManager.hpp"

#include <filesystem>
#include <fstream>

using qlib::LString;
using qsys::StyleCreateEditInfo;
using qsys::StyleMgr;
using qsys::StyleSetPtr;

namespace {

// Position of the style set named `name` in the list of the context
// (from the JSON listing, which follows the list order).
size_t posOf(qlib::uid_t ctxt, const char *name)
{
    const std::string js(StyleMgr::getInstance()->getStyleSetsJSON(ctxt).c_str());
    return js.find(std::string("\"name\":\"") + name + "\"");
}

}  // namespace

// Undo/redo of a style-set creation must put the set back where it was
// (at the end, nbefore = -1), not at the front of the list.
TEST(StyleCreateEditInfo, RedoRestoresListPosition)
{
    // a private context id: no scene is attached, so no events are fired
    const qlib::uid_t ctxt = 987654;
    StyleMgr *pSM = StyleMgr::getInstance();

    StyleSetPtr pA = pSM->createStyleSet("styA", ctxt);
    StyleSetPtr pB = pSM->createStyleSet("styB", ctxt);
    ASSERT_FALSE(pA.isnull());
    ASSERT_FALSE(pB.isnull());
    ASSERT_LT(posOf(ctxt, "styA"), posOf(ctxt, "styB"));

    StyleCreateEditInfo ei;
    ei.setupCreate(ctxt, pB, -1);

    ASSERT_TRUE(ei.undo());
    EXPECT_EQ(posOf(ctxt, "styB"), std::string::npos);

    ASSERT_TRUE(ei.redo());
    EXPECT_NE(posOf(ctxt, "styB"), std::string::npos);
    EXPECT_LT(posOf(ctxt, "styA"), posOf(ctxt, "styB"));

    pSM->destroyStyleSet(ctxt, pB->getUID());
    pSM->destroyStyleSet(ctxt, pA->getUID());
}

// Loading a style file and switching a set's read-only flag from a script,
// inside a scene's undo txn, are one undo step each that undo and redo replay.
TEST(StyleCreateEditInfo, LoadAndReadOnlyAreUndoable)
{
    qsys::ScenePtr scene = qsys::SceneManager::getInstance()->createScene();
    const qlib::uid_t ctxt = scene->getUID();
    StyleMgr *pSM = StyleMgr::getInstance();

    const auto path = std::filesystem::temp_directory_path() / "cuemol_test_styload.xml";
    {
        std::ofstream out(path);
        out << "<styles id=\"styLoad\"><color id=\"c1\" value=\"#FF0000\"/></styles>\n";
    }

    scene->startUndoTxn("Load style file");
    const qlib::uid_t uid = pSM->loadStyleSetFromFile(ctxt, path.string().c_str(), true);
    scene->commitUndoTxn();
    std::filesystem::remove(path);
    ASSERT_NE(posOf(ctxt, "styLoad"), std::string::npos);
    StyleSetPtr pSet = pSM->getStyleSetById2(uid);
    ASSERT_TRUE(pSet->isReadOnly());

    scene->startUndoTxn("Toggle style read-only");
    pSet->setReadOnlyScr(false);
    scene->commitUndoTxn();
    EXPECT_EQ(scene->getUndoSize(), 2);

    scene->undo(0);
    EXPECT_TRUE(pSet->isReadOnly());
    scene->undo(0);
    EXPECT_EQ(posOf(ctxt, "styLoad"), std::string::npos);
    scene->redo(0);
    EXPECT_NE(posOf(ctxt, "styLoad"), std::string::npos);
    scene->redo(0);
    EXPECT_FALSE(pSet->isReadOnly());

    qsys::SceneManager::getInstance()->destroyScene(ctxt);
}

// Colour, string data and style removal edits made from a script are undo
// steps of the set's scene; a global set has no scene, so its edits are not.
TEST(StyleCreateEditInfo, SceneSetEntryEditsAreUndoable)
{
    qsys::ScenePtr scene = qsys::SceneManager::getInstance()->createScene();
    const qlib::uid_t ctxt = scene->getUID();
    StyleMgr *pSM = StyleMgr::getInstance();

    const auto path = std::filesystem::temp_directory_path() / "cuemol_test_styentry.xml";
    {
        std::ofstream out(path);
        out << "<styles id=\"styEntry\"><color id=\"c1\" value=\"#FF0000\"/>"
               "<style id=\"s1\" type=\"view\"/></styles>\n";
    }
    StyleSetPtr pSet = pSM->getStyleSetById2(pSM->loadStyleSetFromFile(ctxt, path.string().c_str(), false));
    std::filesystem::remove(path);
    const gfx::ColorPtr red = pSet->getColor("c1");
    ASSERT_FALSE(red.isnull());
    ASSERT_TRUE(pSet->hasStyle("s1"));

    scene->clearUndoDataScr();
    scene->startUndoTxn("Set style color");
    pSet->setColorScr("C2", red);
    scene->commitUndoTxn();
    scene->startUndoTxn("Remove style color");
    pSet->removeColorScr("c1");
    scene->commitUndoTxn();
    scene->startUndoTxn("Set style selection");
    pSet->setStrDataScr("sel", "a", "resid 1");
    scene->commitUndoTxn();
    scene->startUndoTxn("Remove style entry");
    ASSERT_TRUE(pSet->removeStyleScr("s1"));
    scene->commitUndoTxn();
    EXPECT_EQ(scene->getUndoSize(), 4);

    for (int i = 0; i < 4; ++i) scene->undo(0);
    EXPECT_FALSE(pSet->hasColor("c2"));
    EXPECT_TRUE(pSet->hasColor("c1"));
    EXPECT_FALSE(pSet->hasStrData("sel", "a"));
    EXPECT_TRUE(pSet->hasStyle("s1"));

    for (int i = 0; i < 4; ++i) scene->redo(0);
    EXPECT_TRUE(pSet->hasColor("c2"));
    EXPECT_FALSE(pSet->hasColor("c1"));
    EXPECT_EQ(LString(pSet->getStrData("sel", "a")), LString("resid 1"));
    EXPECT_FALSE(pSet->hasStyle("s1"));

    StyleSetPtr pGlobal = pSM->createStyleSet("styEntryGlobal", 0);
    scene->clearUndoDataScr();
    scene->startUndoTxn("Set style color");
    pGlobal->setColorScr("c3", red);
    scene->commitUndoTxn();
    EXPECT_TRUE(pGlobal->hasColor("c3"));
    EXPECT_FALSE(scene->isUndoable());

    pSM->destroyStyleSet(0, pGlobal->getUID());
    qsys::SceneManager::getInstance()->destroyScene(ctxt);
}
