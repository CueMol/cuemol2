#include <gtest/gtest.h>
#include <common.h>
#include <string>
#include "qsys/style/StyleEditInfo.hpp"
#include "qsys/style/StyleMgr.hpp"
#include "qsys/style/StyleSet.hpp"

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
