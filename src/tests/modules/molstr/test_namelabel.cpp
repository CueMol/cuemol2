// -*-Mode: C++;-*-
//
//  Tests for LabelFormat and the label format of NameLabelRenderer
//

#include <gtest/gtest.h>
#include <common.h>

#include "molstr/LabelFormat.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/NameLabelRenderer.hpp"
#include "molstr/PDBFileReader.hpp"

#include <qlib/LDOM2Tree.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/StringStream.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

#include <cstring>
#include <map>

using molstr::LabelFormat;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::NameLabelRenderer;
using qlib::LString;

namespace {

// Two atoms of THR A1 and CYS A2 (1CRN), with distinct B-factors.
const char *PDB =
    "ATOM      1  N   THR A   1      17.047  14.099   3.625  1.00 13.79           N\n"
    "ATOM      2  CA  CYS A   2      16.967  12.784   4.338  0.50 10.80           C\n"
    "END\n";

class NameLabelTest : public ::testing::Test
{
protected:
    qsys::ScenePtr m_scene;
    MolCoordPtr m_mol;

    void SetUp() override
    {
        m_scene = qsys::SceneManager::getInstance()->createScene();
        molstr::PDBFileReader reader;
        qlib::StrInStream ins(PDB, static_cast<int>(std::strlen(PDB)));
        m_mol = MolCoordPtr(reader.load(ins));
        m_mol->setName("crn");
        m_scene->addObject(m_mol);
    }

    MolAtomPtr atom(int aid) const { return m_mol->getAtom(aid); }

    NameLabelRenderer *newLabels()
    {
        qsys::RendererPtr r = m_mol->createRenderer("*namelabel");
        return static_cast<NameLabelRenderer *>(r.get());
    }
};

// The `format` attribute of each stored <label>, by atom (empty when absent).
std::map<LString, LString> storedFormats(qlib::LDom2Node &node)
{
    std::map<LString, LString> out;
    for (node.firstChild(); node.hasMoreChild(); node.nextChild()) {
        qlib::LDom2Node *ch = node.getCurChild();
        if (!ch->getTagName().equals("label")) continue;
        const LString aid = ch->getStrAttr("aid");
        out[aid] = ch->findChild("format") ? ch->getStrAttr("format") : LString();
    }
    return out;
}

}  // namespace

// Every field, a spec on each type, and literal braces.
TEST_F(NameLabelTest, FormatFieldsAndSpecs)
{
    const int aid = m_mol->getAtom("A", 2, "CA")->getID();
    const LString text =
        LabelFormat("{molname}:{chain}/{resn}{resi}/{name}({elem}) {bfac:.1f} {occ:.2f} "
                    "[{aid:>3}] {{{alt}}} <{aprop.none}><{rprop.none}>")
            .apply(atom(aid));
    EXPECT_EQ(text, LString::fmtFormat("crn:A/CYS2/CA(C) 10.8 0.50 [{:>3}] {{}} <><>", aid));
}

// A bad format is refused when it is set, with the reason.
TEST_F(NameLabelTest, FormatRejectsUnknownFieldAndMismatchedSpec)
{
    LString err;
    EXPECT_FALSE(LabelFormat::check("{segi}", err));
    EXPECT_NE(err.indexOf("segi"), -1);
    EXPECT_FALSE(LabelFormat::check("{name:.2f}", err));
    EXPECT_FALSE(LabelFormat::check("{resn", err));
    EXPECT_FALSE(LabelFormat::check("a}b", err));
    EXPECT_TRUE(LabelFormat::check("{{literal}}", err));

    NameLabelRenderer *labels = newLabels();
    EXPECT_THROW(labels->setFormat("{nosuch}"), qlib::IllegalArgumentException);
    EXPECT_THROW(labels->setLabelFormat(atom(1)->getID(), "{bfac:s}"),
                 qlib::IllegalArgumentException);
}

// setLabelFormat adds a label or replaces its format, and the format survives
// writing and reading the renderer. A label with the built-in text is stored
// exactly as before (no format attribute), so old files and output are unchanged.
TEST_F(NameLabelTest, LabelFormatRoundTrip)
{
    const int n = m_mol->getAtom("A", 1, "N")->getID();
    const int ca = m_mol->getAtom("A", 2, "CA")->getID();

    NameLabelRenderer *labels = newLabels();
    ASSERT_TRUE(labels->setLabelFormat(n, "{resn}"));
    ASSERT_TRUE(labels->setLabelFormat(n, "{resn}{resi}"));  // replaced, not added
    ASSERT_TRUE(labels->addLabelByID(ca));                   // built-in text

    qlib::LDom2Node written;
    labels->writeTo2(&written);
    std::map<LString, LString> fmts = storedFormats(written);
    ASSERT_EQ(fmts.size(), 2u);
    EXPECT_EQ(fmts[m_mol->toStrAID(n)], LString("{resn}{resi}"));
    EXPECT_EQ(fmts[m_mol->toStrAID(ca)], LString(""));

    NameLabelRenderer *reread = newLabels();
    reread->readFrom2(&written);
    qlib::LDom2Node again;
    reread->writeTo2(&again);
    EXPECT_EQ(storedFormats(again), fmts);
}
