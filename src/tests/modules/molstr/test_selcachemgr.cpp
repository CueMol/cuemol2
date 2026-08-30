#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/SelCommand.hpp"
#include "molstr/SelCacheMgr.hpp"

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using molstr::SelCacheData;
using molstr::SelCacheMgr;
using molstr::SelCommand;
using molstr::SelectionPtr;
using qlib::LString;
using qlib::Vector4D;

namespace {

int addAtom(MolCoordPtr pMol, int resid, double x)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("XXX");
    pAtom->setResIndex(ResidIndex(resid));
    pAtom->setName("CA");
    pAtom->setElementName("C");
    pAtom->setPos(Vector4D(x, 0.0, 0.0));
    return pMol->appendAtom(pAtom);
}

// Selects every atom, and while doing so builds a fresh cache entry for
// another selection per atom. This is what a nested around/byres
// selection does through findOrMakeCacheData(), and it used to evict the
// entry that was still being filled once the cache limit was reached.
class NestingSel : public SelCommand
{
public:
    MolCoordPtr m_pMol;
    int m_nCalls;

    NestingSel() : SelCommand(LString("*")), m_nCalls(0) {}

    bool isSelected(MolAtomPtr) override
    {
        ++m_nCalls;
        SelectionPtr pSub(new SelCommand(LString::format("resi %d", m_nCalls)));
        SelCacheMgr::getInstance()->findOrMakeCacheData(m_pMol, pSub);
        return true;
    }
};

}  // namespace

TEST(SelCacheMgr, EntryUnderConstructionSurvivesNestedCacheBuilds)
{
    const int natoms = 16;  // more than the cache limit (10)
    MolCoordPtr pMol(MB_NEW MolCoord());
    for (int i = 0; i < natoms; ++i) addAtom(pMol, i + 1, double(i));

    NestingSel *pNest = new NestingSel();
    pNest->m_pMol = pMol;
    SelectionPtr pSel(pNest);

    SelCacheMgr *pMgr = SelCacheMgr::getInstance();
    const SelCacheData *pEnt = pMgr->makeCache(pMol, pSel);
    ASSERT_NE(pEnt, nullptr);
    EXPECT_EQ(pNest->m_nCalls, natoms);

    // The outer entry must still be registered and complete.
    EXPECT_EQ(pMgr->getCacheEntry(pEnt->getCacheID()), pEnt);
    EXPECT_EQ(int(pEnt->getAtomIdSet().size()), natoms);
    EXPECT_EQ(pMgr->findCacheData(pMol, pSel), pEnt);
}

TEST(SelCacheMgr, CacheLimitStillEvictsFinishedEntries)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    addAtom(pMol, 1, 0.0);

    SelCacheMgr *pMgr = SelCacheMgr::getInstance();
    SelectionPtr pFirst(new SelCommand(LString("resi 1")));
    const SelCacheData *pEnt = pMgr->makeCache(pMol, pFirst);
    const int firstId = pEnt->getCacheID();

    // Fill the cache well past its limit with finished entries.
    for (int i = 2; i < 30; ++i) {
        SelectionPtr pSel(new SelCommand(LString::format("resi %d", i)));
        pMgr->makeCache(pMol, pSel);
    }
    EXPECT_EQ(pMgr->getCacheEntry(firstId), nullptr);
}
