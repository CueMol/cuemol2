// -*-Mode: C++;-*-
//
//  superclass of molecular atom/bond based renderers
//
//  $Id: MolAtomRenderer.cpp,v 1.13 2011/03/30 14:17:36 rishitani Exp $

#include <common.h>

#include "MolAtomRenderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
//#include "MolEvent.hpp"
#include "AtomIterator.hpp"
#include "BondIterator.hpp"
#include "Selection.hpp"

#include <qlib/Vector4D.hpp>
#include <gfx/DisplayContext.hpp>
#include <gfx/Hittest.hpp>

using namespace molstr;
using qlib::Vector4D;

MolAtomRenderer::MolAtomRenderer()
  : MolRenderer()
{
}

MolAtomRenderer::~MolAtomRenderer()
{
}

void MolAtomRenderer::render(DisplayContext *pdl)
{
  MolCoordPtr rCliMol = getClientMol();
  if (rCliMol.isnull()) {
    MB_DPRINTLN("MolAtomRenderer::render> Client mol is null");
    return;
  }

  // initialize the coloring scheme
  getColSchm()->init(rCliMol, this);
  rCliMol->getColSchm()->init(rCliMol, this);

  beginRend(pdl);
  
  std::set<int> bonded_atoms;

  if (isRendBond()) {
    // Render bonds & nonb-atoms case (e.g. ball & stick model)
    // TO DO: cache the result of iteration (???)
    BondIterator biter(rCliMol, getSelection());
    
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      int aid1 = pMB->getAtom1();
      int aid2 = pMB->getAtom2();
      //biter.getID(aid1, aid2);

      MolAtomPtr pA1 = rCliMol->getAtom(aid1);
      MolAtomPtr pA2 = rCliMol->getAtom(aid2);

      if (pA1.isnull() || pA2.isnull())
        continue; // skip invalid bonds

      // TO DO: check the bond length ??
      rendBond(pdl, pA1, pA2, pMB);

      // mark as bonded
      bonded_atoms.insert(aid1);
      bonded_atoms.insert(aid2);
    }
  }

  // render atoms (e.g. CPK model)
    // TO DO: cache the result of iteration (???)
  AtomIterator iter(rCliMol, getSelection());
    
  bool bbonded;
  for (iter.first(); iter.hasMore(); iter.next()) {
    int aid = iter.getID();
    MolAtomPtr pAtom = rCliMol->getAtom(aid);
    if (pAtom.isnull()) continue; // ignore errors

    if (bonded_atoms.empty()) {
      bbonded = false;
    }
    else {
      // bbonded is true, if aid is found in bonded_atom
      bbonded = bonded_atoms.find(aid)!=bonded_atoms.end();
    }

    rendAtom(pdl, pAtom, bbonded);
  }
  
  endRend(pdl);
  
  // MB_DPRINTLN("MolAtomRenderer::display() end OK.");
}

//////////////////////////////////////////////////////////////////////////

bool MolAtomRenderer::isHitTestSupported() const
{
  return true;
}

void MolAtomRenderer::renderHit(DisplayContext *phl)
{
  beginHitRend(phl);
  
  // visit selected residues
  AtomIterator iter(getClientMol(), getSelection());
    
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolAtomPtr pAtom = iter.get();
    MB_ASSERT(!pAtom.isnull());
    
    rendHitAtom(phl, pAtom);
  }

  if (isRendHitBond()) {
    // TO DO: cache the iterator
    BondIterator iter2(getClientMol(), getSelection());
    
    for (iter2.first(); iter2.hasMore(); iter2.next()) {
      MolAtomPtr pA1, pA2;
      iter2.get(pA1, pA2);
      if (pA1.isnull()||pA2.isnull())
        continue; // skip invalid bond

      rendHitBond(phl, pA1, pA2);
    }
  }


  endHitRend(phl);
  
  // MB_DPRINTLN("MolAtomRenderer::display() end OK.");
}

void MolAtomRenderer::beginHitRend(DisplayContext *phl)
{
  //phl->pushName(-1);
}

void MolAtomRenderer::endHitRend(DisplayContext *phl)
{
  //phl->popName();
}

void MolAtomRenderer::rendHitAtom(DisplayContext *phl, MolAtomPtr pAtom)
{
  int aid = pAtom->getID();
  if (aid<0)
    return;

  const Vector4D pos1 = pAtom->getPos();
  phl->drawPointHit(aid, pos1);
  /*
  phl->loadName(aid);
  phl->startPoints();
  phl->vertex(pos1);
  phl->end();
   */
}

bool MolAtomRenderer::isRendHitBond() const
{
  return false;
}

void MolAtomRenderer::rendHitBond(DisplayContext *phl, MolAtomPtr pAtom1, MolAtomPtr pAtom2)
{
}

/////////////////////////////////


