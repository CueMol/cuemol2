#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolChain.hpp"
#include "molstr/MolResidue.hpp"

using molstr::MolChain;
using molstr::MolResidue;
using molstr::MolResiduePtr;
using molstr::ResidIndex;
using qlib::LString;

// ---- Default constructor ----

TEST(MolChainTest, DefaultNameIsEmpty)
{
    MolChain chain;
    EXPECT_TRUE(chain.getName().isEmpty());
}

TEST(MolChainTest, DefaultSizeIsZero)
{
    MolChain chain;
    EXPECT_EQ(chain.getSize(), 0);
}

// ---- Property setters/getters ----

TEST(MolChainTest, SetGetName)
{
    MolChain chain;
    chain.setName("A");
    EXPECT_EQ(chain.getName(), LString("A"));
}

TEST(MolChainTest, SetGetParentUID)
{
    MolChain chain;
    chain.setParentUID(123);
    EXPECT_EQ(chain.getParentUID(), (qlib::uid_t)123);
}

// ---- appendResidue ----

TEST(MolChainTest, AppendResidueIncreasesSize)
{
    MolChain chain;
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(1));
    EXPECT_TRUE(chain.appendResidue(pRes));
    EXPECT_EQ(chain.getSize(), 1);
}

TEST(MolChainTest, AppendDuplicateIndexReturnsFalse)
{
    MolChain chain;
    MolResiduePtr pRes1(new MolResidue());
    pRes1->setIndex(ResidIndex(1));
    chain.appendResidue(pRes1);

    MolResiduePtr pRes2(new MolResidue());
    pRes2->setIndex(ResidIndex(1));
    EXPECT_FALSE(chain.appendResidue(pRes2));
    EXPECT_EQ(chain.getSize(), 1);
}

TEST(MolChainTest, AppendResidueSetsChainName)
{
    MolChain chain;
    chain.setName("B");
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(1));
    chain.appendResidue(pRes);
    EXPECT_EQ(pRes->getChainName(), LString("B"));
}

TEST(MolChainTest, AppendMultipleResidues)
{
    MolChain chain;
    for (int i = 1; i <= 5; ++i) {
        MolResiduePtr pRes(new MolResidue());
        pRes->setIndex(ResidIndex(i));
        EXPECT_TRUE(chain.appendResidue(pRes));
    }
    EXPECT_EQ(chain.getSize(), 5);
}

// ---- removeResidue ----

TEST(MolChainTest, RemoveResidueByPtrDecreasesSize)
{
    MolChain chain;
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(1));
    chain.appendResidue(pRes);
    EXPECT_TRUE(chain.removeResidue(pRes));
    EXPECT_EQ(chain.getSize(), 0);
}

TEST(MolChainTest, RemoveResidueByIndexDecreasesSize)
{
    MolChain chain;
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(1));
    chain.appendResidue(pRes);
    EXPECT_TRUE(chain.removeResidue(ResidIndex(1)));
    EXPECT_EQ(chain.getSize(), 0);
}

TEST(MolChainTest, RemoveNonexistentResidueReturnsFalse)
{
    MolChain chain;
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(1));
    // Not appended -> map lookup returns end -> false
    EXPECT_FALSE(chain.removeResidue(pRes));
}

TEST(MolChainTest, RemoveOneOfTwoResidues)
{
    MolChain chain;
    MolResiduePtr pRes1(new MolResidue());
    pRes1->setIndex(ResidIndex(1));
    MolResiduePtr pRes2(new MolResidue());
    pRes2->setIndex(ResidIndex(2));
    chain.appendResidue(pRes1);
    chain.appendResidue(pRes2);

    EXPECT_TRUE(chain.removeResidue(pRes1));
    EXPECT_EQ(chain.getSize(), 1);
    EXPECT_TRUE(chain.getResidue(ResidIndex(2)).get() == pRes2.get());
}

// ---- getResidue ----

TEST(MolChainTest, GetResidueByIndexReturnsCorrect)
{
    MolChain chain;
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(10));
    pRes->setName("GLY");
    chain.appendResidue(pRes);

    MolResiduePtr found = chain.getResidue(ResidIndex(10));
    EXPECT_FALSE(found.isnull());
    EXPECT_EQ(found->getName(), LString("GLY"));
}

TEST(MolChainTest, GetResidueByStringReturnsCorrect)
{
    MolChain chain;
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(10));
    pRes->setName("ALA");
    chain.appendResidue(pRes);

    MolResiduePtr found = chain.getResidue("10");
    EXPECT_FALSE(found.isnull());
    EXPECT_EQ(found->getName(), LString("ALA"));
}

TEST(MolChainTest, GetResidueNotFoundReturnsNull)
{
    MolChain chain;
    EXPECT_TRUE(chain.getResidue(ResidIndex(99)).isnull());
}

TEST(MolChainTest, GetResidueWithInsCode)
{
    MolChain chain;
    MolResiduePtr pRes(new MolResidue());
    pRes->setIndex(ResidIndex(5, 'A'));
    pRes->setName("SER");
    chain.appendResidue(pRes);

    MolResiduePtr found = chain.getResidue(ResidIndex(5, 'A'));
    EXPECT_FALSE(found.isnull());
    EXPECT_EQ(found->getName(), LString("SER"));

    // Without ins code should not match
    EXPECT_TRUE(chain.getResidue(ResidIndex(5)).isnull());
}

// ---- Iterators ----

TEST(MolChainTest, BeginEndIteratorCount)
{
    MolChain chain;
    for (int i = 1; i <= 3; ++i) {
        MolResiduePtr pRes(new MolResidue());
        pRes->setIndex(ResidIndex(i));
        chain.appendResidue(pRes);
    }
    int count = 0;
    for (auto it = chain.begin(); it != chain.end(); ++it)
        ++count;
    EXPECT_EQ(count, 3);
}

TEST(MolChainTest, Begin2End2IteratorCount)
{
    MolChain chain;
    for (int i = 1; i <= 3; ++i) {
        MolResiduePtr pRes(new MolResidue());
        pRes->setIndex(ResidIndex(i));
        chain.appendResidue(pRes);
    }
    int count = 0;
    for (auto it = chain.begin2(); it != chain.end2(); ++it)
        ++count;
    EXPECT_EQ(count, 3);
}

TEST(MolChainTest, DequeOrderPreservesInsertionOrder)
{
    MolChain chain;
    // Append in reverse index order
    for (int i = 3; i >= 1; --i) {
        MolResiduePtr pRes(new MolResidue());
        pRes->setIndex(ResidIndex(i));
        chain.appendResidue(pRes);
    }
    // begin()/end() (deque) should reflect insertion order: 3, 2, 1
    auto it = chain.begin();
    EXPECT_EQ((*it)->getIndex(), ResidIndex(3));
    ++it;
    EXPECT_EQ((*it)->getIndex(), ResidIndex(2));
    ++it;
    EXPECT_EQ((*it)->getIndex(), ResidIndex(1));
}

TEST(MolChainTest, Begin2End2IteratorInIndexOrder)
{
    MolChain chain;
    // Append in reverse index order
    for (int i = 3; i >= 1; --i) {
        MolResiduePtr pRes(new MolResidue());
        pRes->setIndex(ResidIndex(i));
        chain.appendResidue(pRes);
    }
    // begin2()/end2() (map) should be sorted by index: 1, 2, 3
    auto it = chain.begin2();
    EXPECT_EQ(it->first, ResidIndex(1));
    ++it;
    EXPECT_EQ(it->first, ResidIndex(2));
    ++it;
    EXPECT_EQ(it->first, ResidIndex(3));
}
