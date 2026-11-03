// SelCommand::simplify() and the context-menu edits built on it: equivalent
// rewriting of a selection, written back as text that compiles to the same
// atoms.
#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolResidue.hpp"
#include "molstr/SelCommand.hpp"

#include <set>
#include <string>

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using molstr::SelCommand;
using qlib::LString;

namespace {

std::string simplify(const char *expr)
{
    SelCommand sel;
    EXPECT_TRUE(sel.compile(expr)) << expr;
    return sel.simplify().c_str();
}

/// Chain A: residues 12, 12A, 13, 20, each N / CA / CB, named ALA, GLY, ALA,
/// HOH; residue 12A carries the property tag = "alpha beta".
MolCoordPtr makeMol()
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    struct R { int num; char ins; const char *resn; };
    const R res[] = {{12, '\0', "ALA"}, {12, 'A', "GLY"}, {13, '\0', "ALA"}, {20, '\0', "HOH"}};
    const char *names[] = {"N", "CA", "CB"};
    double x = 0.0;
    for (const R &r : res) {
        for (const char *nm : names) {
            MolAtomPtr pAtom(MB_NEW MolAtom());
            pAtom->setChainName("A");
            pAtom->setResName(r.resn);
            pAtom->setResIndex(ResidIndex(r.num, r.ins));
            pAtom->setName(nm);
            pAtom->setElementName(nm[0] == 'N' ? "N" : "C");
            pAtom->setPos(qlib::Vector4D(x, 0.0, 0.0));
            x += 1.0;
            pMol->appendAtom(pAtom);
        }
    }
    pMol->getResidue("A", ResidIndex(12, 'A'))->setPropStr("tag", "alpha beta");
    return pMol;
}

std::set<int> selected(MolCoordPtr pMol, const LString &expr)
{
    SelCommand sel;
    EXPECT_TRUE(sel.compile(expr)) << expr.c_str();
    std::set<int> ids;
    for (int aid = 0; aid < pMol->getAtomSize(); ++aid) {
        MolAtomPtr pAtom = pMol->getAtom(aid);
        if (!pAtom.isnull() && sel.isSelected(pAtom))
            ids.insert(aid);
    }
    return ids;
}

}  // namespace

// One case per rewriting rule.
TEST(SelSimplify, Rules)
{
    const std::pair<const char *, const char *> cases[] = {
        // 1 flatten (and 8 merge the names)
        {"(name CA or elem N) or name CB", "name CA,CB or elem N"},
        // 2 constants
        {"resn ALA and *", "resn ALA"},
        {"resn ALA and none", "none"},
        {"not not resn ALA", "resn ALA"},
        // 3 duplicates, whatever the operand order
        {"(resn ALA and chain A) or (chain A and resn ALA)", "resn ALA and chain A"},
        // 4 complement
        {"chain A or not chain A", "*"},
        // 5 absorption
        {"chain A or (chain A and resn ALA)", "chain A"},
        // 6 absorption with a complement
        {"(chain A or resn ALA) and not resn ALA", "chain A and not resn ALA"},
        {"(chain A and not resn ALA) or resn ALA", "chain A or resn ALA"},
        // 7 common part with a complement
        {"(chain A and not resn GLY) or (chain A and resn GLY)", "chain A"},
        // 8 leaves of one kind; adjacent residue numbers are not joined
        {"aid 5 or aid 9 or aid 1:3", "aid 1:3,5,9"},
        {"resi 1:10 or resi 5:20", "resi 1:20"},
        {"A.12.* or A.13.* or A.20.*", "A.12,13,20.*"},
        // 9 byres of byres
        {"byres byres resn ALA", "byres resn ALA"},
        // values differing in the 7th decimal are not duplicates
        {"((resn ALA) around 3.0000001) or ((resn ALA) around 3.0000002)",
         "((resn ALA) around 3.0000001) or ((resn ALA) around 3.0000002)"},
    };
    for (const auto &c : cases)
        EXPECT_EQ(simplify(c.first), c.second) << c.first;
}

// The console's show / hide, repeated on the same spec, keeps the expression
// from growing (rules 6 and 7).
TEST(SelSimplify, ShowHideAndStyleRoundTripsDoNotGrow)
{
    std::string cur = "chain A";
    for (int i = 0; i < 3; ++i) {
        cur = simplify(("(" + cur + ") or (resn ALA)").c_str());
        EXPECT_EQ(cur, "chain A or resn ALA");
        cur = simplify(("(" + cur + ") and not (resn ALA)").c_str());
        EXPECT_EQ(cur, "chain A and not resn ALA");
    }

    // ChX style S sphere -> style S stick: the stick expression comes back
    std::string stick = "chain A";
    for (int i = 0; i < 3; ++i) {
        const std::string sphere = simplify(("(resn GLY) and (" + stick + ")").c_str());
        stick = simplify(("(" + stick + ") and not (resn GLY)").c_str());
        stick = simplify(("(" + stick + ") or ((resn GLY) and (" + sphere + "))").c_str());
        EXPECT_EQ(stick, "chain A");
    }
}

// Simplified, written back and compiled again, an expression selects the
// same atoms: names with spaces stay quoted, and joining residues 12 and 13
// does not take 12A.
TEST(SelSimplify, TextCompilesBackToTheSameAtoms)
{
    MolCoordPtr pMol = makeMol();
    const char *exprs[] = {
        "A.12.* or A.13.*",
        "resi 12 or resi 13",
        "rprop tag=\"alpha beta\" or resn HOH",
        "(chain A and not resn GLY) or (chain A and resn GLY and name CA)",
        "not (name CA or name CB) and not resn HOH",
        "bfac > 0.5 or occ < 2",
    };
    for (const char *expr : exprs) {
        SelCommand sel;
        ASSERT_TRUE(sel.compile(expr)) << expr;
        const LString text = sel.simplify();
        EXPECT_EQ(selected(pMol, text), selected(pMol, expr)) << expr << " -> " << text.c_str();
    }
}

// Invert / toggle sidechain / around of the context menu work on the tree,
// so an inner "not" or "bysidech" is not mistaken for the outer one, and a
// second distance replaces the first.
TEST(SelSimplify, ContextMenuEdits)
{
    SelCommand sel;
    ASSERT_TRUE(sel.compile("not chain A or not chain B"));
    const LString inv = sel.invertSimplified();
    EXPECT_STREQ(inv.c_str(), "not (not chain A or not chain B)");
    SelCommand inv2;
    ASSERT_TRUE(inv2.compile(inv));
    EXPECT_STREQ(inv2.invertSimplified().c_str(), "not chain A or not chain B");

    ASSERT_TRUE(sel.compile("chain A or bysidech chain B"));
    const LString side = sel.toggleSidechain();
    EXPECT_STREQ(side.c_str(), "bysidech (chain A or (bysidech chain B))");
    SelCommand side2;
    ASSERT_TRUE(side2.compile(side));
    EXPECT_STREQ(side2.toggleSidechain().c_str(), "chain A or (bysidech chain B)");

    ASSERT_TRUE(sel.compile("byres resn ALA around 3"));
    EXPECT_STREQ(sel.rewriteAround(5.0, false).c_str(), "(resn ALA) around 5.0");
}
