#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LDOM2Tree.hpp"
#include "qsys/style/StyleFile.hpp"
#include "qsys/style/StyleMgr.hpp"

using qlib::LString;
using qsys::StyleMgr;

namespace {

// Value of one style property, as the renderer style sheet resolves it.
std::string styleValue(qlib::uid_t ctxt, const char *style, const char *prop)
{
    qlib::LDom2Node *pNode = StyleMgr::getInstance()->getStyleNode2(style, prop, ctxt);
    return pNode == NULL ? std::string() : std::string(pNode->getValue().c_str());
}

}  // namespace

// CueMol3 loads cuemol3_style.xml over default_style.xml (sysconfig_cuemol3.xml):
// a property it defines wins, one it leaves out falls back to default_style.xml,
// and default_style.xml alone (CueMol2) keeps its own values.
TEST(Cuemol3StyleFile, OverridesPerPropertyOverDefaultStyle)
{
    // a private context id, so the global style sets are left alone
    const qlib::uid_t ctxt = 987655;
    const LString dir(CUEMOL2_DATA_DIR);

    qsys::StyleFile sfile;
    sfile.loadFile(dir + "/default_style.xml", ctxt);
    EXPECT_EQ(styleValue(ctxt, "DefaultRibbon", "helix.width"), "0.2");
    EXPECT_EQ(StyleMgr::getInstance()->getStyleNode("DefaultPymRendPreset", ctxt), nullptr);

    sfile.loadFile(dir + "/cuemol3_style.xml", ctxt);
    EXPECT_EQ(styleValue(ctxt, "DefaultRibbon", "helix.width"), "0.18");
    EXPECT_EQ(styleValue(ctxt, "DefaultRibbon", "helix.type"), "rectangle");
    EXPECT_EQ(styleValue(ctxt, "DefaultNucl", "section.tuber"), "2.5");
    EXPECT_NE(StyleMgr::getInstance()->getStyleNode("DefaultPymRendPreset", ctxt), nullptr);
}
