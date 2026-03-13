#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolResidue.hpp"
#include "molstr/MolAtom.hpp"

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolResidue;
using molstr::MolResiduePtr;
using molstr::ResidIndex;
using qlib::LString;

// ---- Default constructor ----

TEST(MolResidueTest, DefaultTopologyIsNull)
{
    MolResidue res;
    EXPECT_EQ(res.getTopologyObj(), nullptr);
}

TEST(MolResidueTest, DefaultAtomSizeIsZero)
{
    MolResidue res;
    EXPECT_EQ(res.getAtomSize(), 0);
}

TEST(MolResidueTest, DefaultNameIsEmpty)
{
    MolResidue res;
    EXPECT_TRUE(res.getName().isEmpty());
}

TEST(MolResidueTest, DefaultTypeIsEmpty)
{
    MolResidue res;
    EXPECT_TRUE(res.getType().isEmpty());
}

TEST(MolResidueTest, DefaultChainIsEmpty)
{
    MolResidue res;
    EXPECT_TRUE(res.getChainName().isEmpty());
}

TEST(MolResidueTest, DefaultIndexIsZero)
{
    MolResidue res;
    EXPECT_EQ(res.getIndex(), ResidIndex(0));
}

// ---- Property setters/getters ----

TEST(MolResidueTest, SetGetName)
{
    MolResidue res;
    res.setName("ALA");
    EXPECT_EQ(res.getName(), LString("ALA"));
}

TEST(MolResidueTest, SetGetType)
{
    MolResidue res;
    res.setType("protein");
    EXPECT_EQ(res.getType(), LString("protein"));
}

TEST(MolResidueTest, SetGetIndex)
{
    MolResidue res;
    res.setIndex(ResidIndex(42));
    EXPECT_EQ(res.getIndex(), ResidIndex(42));
}

TEST(MolResidueTest, SetGetIndexWithInsCode)
{
    MolResidue res;
    res.setIndex(ResidIndex(100, 'A'));
    EXPECT_EQ(res.getIndex(), ResidIndex(100, 'A'));
}

TEST(MolResidueTest, SetGetChainName)
{
    MolResidue res;
    res.setChainName("A");
    EXPECT_EQ(res.getChainName(), LString("A"));
}

TEST(MolResidueTest, SetGetParentUID)
{
    MolResidue res;
    res.setParentUID(42);
    EXPECT_EQ(res.getParentUID(), (qlib::uid_t)42);
    res.setParentUID(0);
    EXPECT_EQ(res.getParentUID(), (qlib::uid_t)0);
}

TEST(MolResidueTest, SetScrIndexRoundTrips)
{
    MolResidue res;
    res.setScrIndex(7);
    EXPECT_EQ(res.getScrIndex(), 7);
}

TEST(MolResidueTest, SetStrIndexRoundTrips)
{
    MolResidue res;
    res.setStrIndex("15A");
    EXPECT_EQ(res.getStrIndex(), LString("15A"));
}

// ---- Atom operations ----

// Helper: build a MolAtomPtr with fields matching the given residue's defaults.
static MolAtomPtr makeAtom(const char *name, int id,
                            qlib::uid_t molID = qlib::invalid_uid,
                            ResidIndex resIdx = ResidIndex(0),
                            const char *chain = "")
{
    MolAtomPtr p(new MolAtom());
    p->setName(name);
    p->setID(id);
    p->setParentUID(molID);
    p->setResIndex(resIdx);
    p->setChainName(chain);
    return p;
}

TEST(MolResidueTest, AppendAtomIncreasesSize)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    EXPECT_TRUE(res.appendAtom(makeAtom("CA", 1)));
    EXPECT_EQ(res.getAtomSize(), 1);
}

TEST(MolResidueTest, AppendDuplicateAtomReturnsFalse)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    res.appendAtom(makeAtom("CA", 1));
    EXPECT_FALSE(res.appendAtom(makeAtom("CA", 2)));
    EXPECT_EQ(res.getAtomSize(), 1);
}

TEST(MolResidueTest, AppendMultipleAtoms)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    res.appendAtom(makeAtom("CA", 1));
    res.appendAtom(makeAtom("CB", 2));
    res.appendAtom(makeAtom("N",  3));
    EXPECT_EQ(res.getAtomSize(), 3);
}

TEST(MolResidueTest, GetAtomIDReturnsValidID)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    res.appendAtom(makeAtom("CA", 5));
    EXPECT_EQ(res.getAtomID("CA"), 5);
}

TEST(MolResidueTest, GetAtomIDUnknownReturnsMinusOne)
{
    MolResidue res;
    EXPECT_EQ(res.getAtomID("CA"), -1);
}

TEST(MolResidueTest, RemoveAtomDecreasesSize)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    res.appendAtom(makeAtom("CA", 1));
    EXPECT_TRUE(res.removeAtom("CA"));
    EXPECT_EQ(res.getAtomSize(), 0);
}

TEST(MolResidueTest, RemoveNonexistentAtomReturnsFalse)
{
    MolResidue res;
    EXPECT_FALSE(res.removeAtom("CA"));
}

// ---- Alternate conformations ----

TEST(MolResidueTest, AppendAtomWithConfID)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    MolAtomPtr pA = makeAtom("CA", 10);
    pA->setConfID('A');
    EXPECT_TRUE(res.appendAtom(pA));
    EXPECT_EQ(res.getAtomID("CA", 'A'), 10);
}

TEST(MolResidueTest, RemoveAtomWithConfID)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    MolAtomPtr pA = makeAtom("CA", 10);
    pA->setConfID('A');
    res.appendAtom(pA);
    EXPECT_TRUE(res.removeAtom("CA", 'A'));
    EXPECT_EQ(res.getAtomSize(), 0);
}

TEST(MolResidueTest, GetAltConfsFindsMultipleConfs)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    MolAtomPtr pA = makeAtom("CA", 1);
    pA->setConfID('A');
    MolAtomPtr pB = makeAtom("CA", 2);
    pB->setConfID('B');
    res.appendAtom(pA);
    res.appendAtom(pB);
    std::set<char> confs;
    EXPECT_EQ(res.getAltConfs("CA", confs), 2);
    EXPECT_NE(confs.find('A'), confs.end());
    EXPECT_NE(confs.find('B'), confs.end());
}

TEST(MolResidueTest, GetAltConfsEmptyForNoAltConf)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    res.appendAtom(makeAtom("CA", 1));
    std::set<char> confs;
    EXPECT_EQ(res.getAltConfs("CA", confs), 0);
    EXPECT_TRUE(confs.empty());
}

// ---- Atom iterator ----

TEST(MolResidueTest, AtomIteratorCoversAllAtoms)
{
    MolResidue res;
    res.setParentUID(qlib::invalid_uid);
    res.appendAtom(makeAtom("CA", 1));
    res.appendAtom(makeAtom("CB", 2));
    int count = 0;
    for (auto it = res.atomBegin(); it != res.atomEnd(); ++it)
        ++count;
    EXPECT_EQ(count, 2);
}

// ---- String properties ----

TEST(MolResidueTest, SetGetPropStr)
{
    MolResidue res;
    res.setPropStr("color", "red");
    LString val;
    EXPECT_TRUE(res.getPropStr("color", val));
    EXPECT_EQ(val, LString("red"));
}

TEST(MolResidueTest, GetPropStrNotFoundReturnsFalse)
{
    MolResidue res;
    LString val;
    EXPECT_FALSE(res.getPropStr("noexist", val));
}

TEST(MolResidueTest, RemovePropStr)
{
    MolResidue res;
    res.setPropStr("color", "blue");
    EXPECT_TRUE(res.removePropStr("color"));
    LString val;
    EXPECT_FALSE(res.getPropStr("color", val));
}

TEST(MolResidueTest, GetResPropNamesReturnsAll)
{
    MolResidue res;
    res.setPropStr("color", "red");
    res.setPropStr("single", "A");
    std::set<LString> names;
    EXPECT_EQ(res.getResPropNames(names), 2);
    EXPECT_NE(names.find(LString("color")), names.end());
    EXPECT_NE(names.find(LString("single")), names.end());
}

TEST(MolResidueTest, GetResPropNamesEmptyWhenNone)
{
    MolResidue res;
    std::set<LString> names;
    EXPECT_EQ(res.getResPropNames(names), 0);
    EXPECT_TRUE(names.empty());
}

// ---- Pivot atom ----

TEST(MolResidueTest, SetGetPivotAtomName)
{
    MolResidue res;
    res.setPivotAtomName("CA");
    EXPECT_EQ(res.getPivotAtomName(), LString("CA"));
}

TEST(MolResidueTest, DefaultPivotAtomNameIsEmpty)
{
    MolResidue res;
    EXPECT_TRUE(res.getPivotAtomName().isEmpty());
}

// ---- Link ----

TEST(MolResidueTest, IsLinkedToNullReturnsFalse)
{
    MolResidue res;
    MolResiduePtr nullPtr;
    EXPECT_FALSE(res.isLinkedTo(nullPtr));
}

TEST(MolResidueTest, IsLinkedToCorrectResidue)
{
    MolResidue res;
    MolResiduePtr pNext(new MolResidue());
    res.setLinkNext(pNext);
    EXPECT_TRUE(res.isLinkedTo(pNext));
}

TEST(MolResidueTest, IsLinkedToWrongResidueReturnsFalse)
{
    MolResidue res;
    MolResiduePtr pNext(new MolResidue());
    MolResiduePtr pOther(new MolResidue());
    res.setLinkNext(pNext);
    EXPECT_FALSE(res.isLinkedTo(pOther));
}
