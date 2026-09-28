// -*-Mode: C++;-*-
//
// TraceStickRenderer topology: a sphere per pivot atom, and a stick only
// between consecutive residues the main-chain traversal treats as linked.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include "molvis/TraceStickRenderer.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolResidue.hpp"
#include "molstr/ResidIndex.hpp"

#include <utility>
#include <vector>

using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolResiduePtr;
using molstr::ResidIndex;
using molvis::TraceStickRenderer;
using qlib::Vector4D;

namespace {

int addAtom(MolCoordPtr pMol, const char *ch, int resi, const char *name)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName(ch);
    pAtom->setResName("ALA");
    pAtom->setResIndex(ResidIndex(resi));
    pAtom->setName(name);
    pAtom->setElementName(name[0] == 'O' ? "O" : "C");
    pAtom->setPos(Vector4D(double(resi) * 3.8, ch[0] == 'A' ? 0.0 : 10.0, 0.0));
    return pMol->appendAtom(pAtom);
}

void link(MolCoordPtr pMol, const char *ch1, int r1, const char *ch2, int r2)
{
    pMol->getResidue(ch1, ResidIndex(r1))->setLinkNext(pMol->getResidue(ch2, ResidIndex(r2)));
}

}  // namespace

TEST(TraceStickRendererTest, SticksOnlyBetweenLinkedPivots)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();
    MolCoordPtr pMol(MB_NEW MolCoord());

    // A1-A2 linked; A2 and A3 not linked (chain break inside the chain);
    // A4 has no pivot atom; A3 is linked to B1 across the chain boundary.
    const int a1 = addAtom(pMol, "A", 1, "CA");
    const int a2 = addAtom(pMol, "A", 2, "CA");
    const int a3 = addAtom(pMol, "A", 3, "CA");
    addAtom(pMol, "A", 4, "O");
    const int b1 = addAtom(pMol, "B", 1, "CA");
    const int b2 = addAtom(pMol, "B", 2, "CA");
    link(pMol, "A", 1, "A", 2);
    link(pMol, "A", 3, "B", 1);
    link(pMol, "B", 1, "B", 2);

    pMol->setName("mol");
    pScene->addObject(pMol);
    qsys::RendererPtr pRend = pMol->createRenderer("tracestick");
    auto *pTS = dynamic_cast<TraceStickRenderer *>(pRend.get());
    ASSERT_NE(pTS, nullptr);
    pTS->setPivAtomName("CA");

    pTS->collectTopology();

    EXPECT_EQ(pTS->getPivotAids(), (std::vector<int>{a1, a2, a3, b1, b2}));
    const std::vector<std::pair<int, int>> expected{{a1, a2}, {b1, b2}};
    EXPECT_EQ(pTS->getStickPairs(), expected);

    const qlib::uid_t uid = pScene->getUID();
    pRend = qsys::RendererPtr();
    pMol = MolCoordPtr();
    pScene = qsys::ScenePtr();
    qsys::SceneManager::getInstance()->destroyScene(uid);
}
