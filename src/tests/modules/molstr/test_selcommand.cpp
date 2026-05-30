#include <gtest/gtest.h>
#include <common.h>
#include "molstr/SelCompiler.hpp"
#include "molstr/SelCommand.hpp"
#include "molstr/SelNodes.hpp"
#include "molstr/MolAtom.hpp"

using molstr::SelCompiler;
using molstr::SelCommand;
using molstr::SelSuperNode;
using molstr::MolAtomPtr;
using molstr::MolAtom;
using qlib::LString;

// ---- SelCompiler tests ----

TEST(SelCompilerTest, CompileAllReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("all");
    ASSERT_NE(pNode, nullptr);
    EXPECT_EQ(pNode->getType(), SelSuperNode::SELNODE_ALL);
    delete pNode;
}

TEST(SelCompilerTest, CompileNoneReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("none");
    ASSERT_NE(pNode, nullptr);
    EXPECT_EQ(pNode->getType(), SelSuperNode::SELNODE_ALL);
    delete pNode;
}

TEST(SelCompilerTest, CompileAtomNameReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("name CA");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

TEST(SelCompilerTest, CompileChainReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("chain A");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

TEST(SelCompilerTest, CompileResidNameReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("resn ALA");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

TEST(SelCompilerTest, CompileResidRangeReturnsNonNull)
{
    // Range separator is ':' (colon), not '-'
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("resi 1:10");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

TEST(SelCompilerTest, CompileInvalidReturnsNull)
{
    SelCompiler::getInstance()->setErrorMsg("");
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("@@@invalid@@@");
    EXPECT_EQ(pNode, nullptr);
}

TEST(SelCompilerTest, ErrorMsgSetOnInvalidInput)
{
    SelCompiler::getInstance()->setErrorMsg("");
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("@@@invalid@@@");
    EXPECT_EQ(pNode, nullptr);
    EXPECT_FALSE(SelCompiler::getInstance()->getErrorMsg().isEmpty());
}

TEST(SelCompilerTest, CompileAndOperatorReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("name CA and chain A");
    ASSERT_NE(pNode, nullptr);
    EXPECT_EQ(pNode->getType(), SelSuperNode::SELNODE_BINOP);
    delete pNode;
}

TEST(SelCompilerTest, CompileOrOperatorReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("name CA or name N");
    ASSERT_NE(pNode, nullptr);
    EXPECT_EQ(pNode->getType(), SelSuperNode::SELNODE_BINOP);
    delete pNode;
}

TEST(SelCompilerTest, CompileNotOperatorReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("not name CA");
    ASSERT_NE(pNode, nullptr);
    EXPECT_EQ(pNode->getType(), SelSuperNode::SELNODE_UOP);
    delete pNode;
}

// ---- SelectionBuilder emitted-syntax guards ----
//
// The tritium SelectionBuilder (widgets/MolSelList/SelectionBuilder.tsx)
// composes selection fragments as `keyword value` (space-separated), quotes
// chain values, and wraps negation as `not (...)`. These tests pin that the
// exact strings it emits remain valid CueMol syntax, so a grammar change is
// caught before the UI emits dead expressions.

TEST(SelCompilerTest, CompileQuotedChainReturnsNonNull)
{
    // Builder quotes chain values: `chain 'A'`.
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("chain 'A'");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

TEST(SelCompilerTest, CompileElementReturnsNonNull)
{
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("elem C");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

TEST(SelCompilerTest, CompileNegatedParenTermReturnsNonNull)
{
    // Builder negation wrap: `not (<frag>)`.
    SelSuperNode *pNode = SelCompiler::getInstance()->compile("not (resn HOH)");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

TEST(SelCompilerTest, CompileBuilderCompositeReturnsNonNull)
{
    // A representative builder output combining a quoted chain term with a
    // negated term via AND.
    SelSuperNode *pNode =
        SelCompiler::getInstance()->compile("chain 'A' and not (resn HOH)");
    ASSERT_NE(pNode, nullptr);
    delete pNode;
}

// ---- SelCommand default constructor tests ----

TEST(SelCommandTest, DefaultConstructorIsEmpty)
{
    SelCommand sel;
    EXPECT_TRUE(sel.isEmpty());
}

TEST(SelCommandTest, DefaultConstructorToStringEmpty)
{
    SelCommand sel;
    EXPECT_TRUE(sel.toString().isEmpty());
}

TEST(SelCommandTest, IsStrConvReturnsTrue)
{
    SelCommand sel;
    EXPECT_TRUE(sel.isStrConv());
}

// ---- SelCommand constructor from string tests ----

TEST(SelCommandTest, ConstructFromEmptyStringIsEmpty)
{
    SelCommand sel("");
    EXPECT_TRUE(sel.isEmpty());
}

TEST(SelCommandTest, ConstructFromAllNotEmpty)
{
    SelCommand sel("all");
    EXPECT_FALSE(sel.isEmpty());
}

TEST(SelCommandTest, ConstructFromAllPreservesOrigCmd)
{
    SelCommand sel("all");
    EXPECT_EQ(sel.toString(), LString("all"));
}

TEST(SelCommandTest, ConstructFromNoneNotEmpty)
{
    SelCommand sel("none");
    EXPECT_FALSE(sel.isEmpty());
}

TEST(SelCommandTest, ConstructFromNonePreservesOrigCmd)
{
    SelCommand sel("none");
    EXPECT_EQ(sel.toString(), LString("none"));
}

TEST(SelCommandTest, ConstructFromComplexExpressionNotEmpty)
{
    SelCommand sel("name CA and chain A");
    EXPECT_FALSE(sel.isEmpty());
}

// ---- SelCommand compile() method tests ----

TEST(SelCommandTest, CompileAllSucceeds)
{
    SelCommand sel;
    EXPECT_TRUE(sel.compile("all"));
    EXPECT_FALSE(sel.isEmpty());
}

TEST(SelCommandTest, CompileEmptyStringMakesEmpty)
{
    SelCommand sel("all");
    EXPECT_FALSE(sel.isEmpty());
    EXPECT_TRUE(sel.compile(""));
    EXPECT_TRUE(sel.isEmpty());
}

TEST(SelCommandTest, CompileInvalidReturnsFalse)
{
    SelCommand sel;
    EXPECT_FALSE(sel.compile("@@@invalid@@@"));
}

TEST(SelCommandTest, CompileInvalidLeavesEmpty)
{
    SelCommand sel;
    sel.compile("@@@invalid@@@");
    EXPECT_TRUE(sel.isEmpty());
}

TEST(SelCommandTest, CompileOverwritesPreviousSelection)
{
    SelCommand sel("all");
    EXPECT_TRUE(sel.compile("none"));
    EXPECT_FALSE(sel.isEmpty());
    EXPECT_EQ(sel.toString(), LString("none"));
}

// ---- SelCommand isSelected() tests ----

TEST(SelCommandTest, DefaultSelectsAllAtoms)
{
    // Empty SelCommand (no root node) selects all atoms
    SelCommand sel;
    MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
    pAtom->setName("CA");
    pAtom->setChainName("A");
    EXPECT_TRUE(sel.isSelected(pAtom));
}

TEST(SelCommandTest, AllSelectsAnyAtom)
{
    SelCommand sel("all");
    MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
    pAtom->setName("CA");
    pAtom->setChainName("A");
    EXPECT_TRUE(sel.isSelected(pAtom));
}

TEST(SelCommandTest, NoneSelectsNoAtom)
{
    SelCommand sel("none");
    MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
    pAtom->setName("CA");
    pAtom->setChainName("A");
    EXPECT_FALSE(sel.isSelected(pAtom));
}

TEST(SelCommandTest, NameSelectionMatchesAtomName)
{
    SelCommand sel("name CA");
    MolAtomPtr pCA = MolAtomPtr(MB_NEW MolAtom());
    pCA->setName("CA");
    MolAtomPtr pN = MolAtomPtr(MB_NEW MolAtom());
    pN->setName("N");
    EXPECT_TRUE(sel.isSelected(pCA));
    EXPECT_FALSE(sel.isSelected(pN));
}

TEST(SelCommandTest, ChainSelectionMatchesChainName)
{
    SelCommand sel("chain A");
    MolAtomPtr pA = MolAtomPtr(MB_NEW MolAtom());
    pA->setChainName("A");
    MolAtomPtr pB = MolAtomPtr(MB_NEW MolAtom());
    pB->setChainName("B");
    EXPECT_TRUE(sel.isSelected(pA));
    EXPECT_FALSE(sel.isSelected(pB));
}

TEST(SelCommandTest, ResidNameSelectionMatchesResName)
{
    SelCommand sel("resn ALA");
    MolAtomPtr pALA = MolAtomPtr(MB_NEW MolAtom());
    pALA->setResName("ALA");
    MolAtomPtr pGLY = MolAtomPtr(MB_NEW MolAtom());
    pGLY->setResName("GLY");
    EXPECT_TRUE(sel.isSelected(pALA));
    EXPECT_FALSE(sel.isSelected(pGLY));
}

TEST(SelCommandTest, NotOperatorInvertsSelection)
{
    SelCommand sel("not name CA");
    MolAtomPtr pCA = MolAtomPtr(MB_NEW MolAtom());
    pCA->setName("CA");
    MolAtomPtr pN = MolAtomPtr(MB_NEW MolAtom());
    pN->setName("N");
    EXPECT_FALSE(sel.isSelected(pCA));
    EXPECT_TRUE(sel.isSelected(pN));
}

TEST(SelCommandTest, AndOperatorRequiresBothConditions)
{
    SelCommand sel("name CA and chain A");
    MolAtomPtr pCAA = MolAtomPtr(MB_NEW MolAtom());
    pCAA->setName("CA");
    pCAA->setChainName("A");
    MolAtomPtr pCAB = MolAtomPtr(MB_NEW MolAtom());
    pCAB->setName("CA");
    pCAB->setChainName("B");
    MolAtomPtr pNA = MolAtomPtr(MB_NEW MolAtom());
    pNA->setName("N");
    pNA->setChainName("A");
    EXPECT_TRUE(sel.isSelected(pCAA));
    EXPECT_FALSE(sel.isSelected(pCAB));
    EXPECT_FALSE(sel.isSelected(pNA));
}

TEST(SelCommandTest, OrOperatorAcceptsEitherCondition)
{
    SelCommand sel("name CA or name N");
    MolAtomPtr pCA = MolAtomPtr(MB_NEW MolAtom());
    pCA->setName("CA");
    MolAtomPtr pN = MolAtomPtr(MB_NEW MolAtom());
    pN->setName("N");
    MolAtomPtr pC = MolAtomPtr(MB_NEW MolAtom());
    pC->setName("C");
    EXPECT_TRUE(sel.isSelected(pCA));
    EXPECT_TRUE(sel.isSelected(pN));
    EXPECT_FALSE(sel.isSelected(pC));
}

// ---- SelCommand copy constructor tests ----

TEST(SelCommandTest, CopyConstructorIsNotEmpty)
{
    SelCommand src("name CA");
    SelCommand copy(src);
    EXPECT_FALSE(copy.isEmpty());
}

TEST(SelCommandTest, CopyConstructorPreservesToString)
{
    SelCommand src("name CA");
    SelCommand copy(src);
    EXPECT_EQ(copy.toString(), src.toString());
}

TEST(SelCommandTest, CopyConstructorPreservesSelectionBehavior)
{
    SelCommand src("name CA");
    SelCommand copy(src);
    MolAtomPtr pCA = MolAtomPtr(MB_NEW MolAtom());
    pCA->setName("CA");
    MolAtomPtr pN = MolAtomPtr(MB_NEW MolAtom());
    pN->setName("N");
    EXPECT_TRUE(copy.isSelected(pCA));
    EXPECT_FALSE(copy.isSelected(pN));
}

TEST(SelCommandTest, CopyOfEmptyIsEmpty)
{
    SelCommand src;
    SelCommand copy(src);
    EXPECT_TRUE(copy.isEmpty());
}

// ---- SelCommand dumpNodes() test ----

TEST(SelCommandTest, DumpNodesNonEmptyForAll)
{
    SelCommand sel("all");
    LString dump = sel.dumpNodes();
    EXPECT_FALSE(dump.isEmpty());
}

TEST(SelCommandTest, DumpNodesNullForEmpty)
{
    SelCommand sel;
    EXPECT_EQ(sel.dumpNodes(), LString("(null)"));
}
