// -*-Mode: C++;-*-
//
//  Nucleic acid renderer class
//
//  $Id: NARenderer.cpp,v 1.4 2011/01/31 04:43:49 rishitani Exp $

#include <common.h>

#include "NARenderer.hpp"
#include "BallStickRenderer.hpp"

#include <gfx/MolColorRef.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>

using namespace molvis;
using namespace molstr;

NARenderer::NARenderer()
     : TubeRenderer()
{
  m_pBpTmp = NULL;
  m_bondw = 0.5;
  m_bsthick = 0.5;
  m_nType = 0;
  m_fRendTube = true;
  m_nBaseDetail = 3;
  m_bShowBP = true;

  //m_pBSRend = BallStickRendererPtr(MB_NEW BallStickRenderer());
  m_pBSRend = MB_NEW BallStickRenderer();
  m_pBSRend->resetAllProps();
  m_pBSRend->setShowRing(true);
  m_pBSRend->setRingColor(gfx::ColorPtr( MB_NEW gfx::MolColorRef() ));
}

NARenderer::~NARenderer()
{
  delete m_pBSRend;
}

const char *NARenderer::getTypeName() const
{
  return "nucl";
}

//////////////////////////////////////////////////////

void NARenderer::beginRend(DisplayContext *pdl)
{
  if (m_nType==NAREND_DETAIL1 || m_nType==NAREND_DETAIL2) {
    // initialize the coloring scheme
    m_pBSRend->getColSchm()->init(getClientMol(), this);
    m_pBSRend->setDetail(m_nBaseDetail);
    m_pBSRend->setBondw(m_bondw);
    m_pBSRend->setSphr(m_bondw);
    m_pBSRend->setRingThick(m_bsthick);
    // rCliMol->getColSchm()->init(rCliMol, this);
    // m_pBSRend->beginRend(pdl);
  }
  
  if (m_pBpTmp!=NULL)
    delete m_pBpTmp;
  m_pBpTmp = MB_NEW std::set<MolResidue *>;
  pdl->setDetail(m_nBaseDetail);

  TubeRenderer::beginRend(pdl);
}

void NARenderer::endRend(DisplayContext *pdl)
{
  if (m_pBpTmp!=NULL)
    delete m_pBpTmp;
  m_pBpTmp = NULL;

  TubeRenderer::endRend(pdl);
}

void NARenderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  if (m_fRendTube)
    TubeRenderer::beginSegment(pdl, pRes);
}

void NARenderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
  switch (m_nType) {
  default:
  case NAREND_BP:
    rendResidBasePair(pdl, pRes);
    break;

  case NAREND_SIMPLE1:
    rendResidSimple1(pdl, pRes);
    break;

  case NAREND_DETAIL1:
  case NAREND_DETAIL2:
    rendResidDetail1(pdl, pRes);
    break;
  }
  
  if (m_fRendTube)
    TubeRenderer::rendResid(pdl, pRes);
}

void NARenderer::endSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  if (m_fRendTube)
    TubeRenderer::endSegment(pdl, pRes);
}

//////////////////////////////////////////////////////

MolResiduePtr NARenderer::getBPPeerResid(MolResiduePtr pRes) const
{
  LString bpair;
  pRes->getPropStr("basepair", bpair);

  // get peer residue
  MolCoordPtr pMol = pRes->getParent();
  int dotpos = bpair.indexOf('.');
  LString chname = bpair.left(dotpos);
  // chname = chname.toLowerCase();
  LString resids = bpair.mid(dotpos+1);
  MolChainPtr pCh = pMol->getChain(chname);
  if (pCh.isnull())
    return MolResiduePtr();
  
  int nresid;
  if (!resids.toInt(&nresid))
    return MolResiduePtr();
  MolResiduePtr pPeer = pCh->getResidue(nresid);
  if (pPeer.isnull())
    return MolResiduePtr();
  
  if (getSelection()->isSelectedResid(pPeer)==Selection::SEL_NONE)
    return MolResiduePtr();

  return pPeer;
}

void NARenderer::rendResidBasePair(DisplayContext *pdl, MolResiduePtr pRes)
{
  if (m_pBpTmp->find(pRes.get())!=m_pBpTmp->end())
    return; // base-pair is already rendered!!

  /*{
    LOG_DPRINTLN("%s.%d", (const char *)pRes->getChainName(), pRes->getIndex());
    std::set<MolResiduePtr >::const_iterator iter = m_pBpTmp->begin();
    for ( ; iter!=m_pBpTmp->end(); iter++) {
      MolResiduePtr p = *iter;
      LOG_DPRINTLN(">  %s.%d", (const char *)p->getChainName(), p->getIndex());
    }
  }*/

  LString btype;
  pRes->getPropStr("basetype", btype);

  //LString bpair;
  //pRes->getPropStr("basepair", bpair);

  while (m_bShowBP) {
    //
    // base-paired base
    //

    MolResiduePtr pPeer = getBPPeerResid(pRes);
    if (pPeer.isnull())
      break;

    MolAtomPtr pA1, pA3;
    pA1 = getPivotAtom(pRes);
    pA3 = getPivotAtom(pPeer);
    if (pA1.isnull() || pA3.isnull())
      break;
    
    pdl->setLighting(true);
    ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
    ColorPtr pcol2 = ColSchmHolder::getColor(pA3);
    Vector4D pos1 = pA1->getPos();
    Vector4D pos2 = pA3->getPos();
    if ( pcol1->equals(*pcol2.get()) ) {
      pdl->color(pcol1);
      pdl->cylinder(m_bondw, pos1, pos2);
    }
    else {
      const Vector4D mpos = (pos1 + pos2).divide(2.0);
      pdl->color(pcol1);
      pdl->cylinder(m_bondw, pos1, mpos);
      pdl->color(pcol2);
      pdl->cylinder(m_bondw, pos2, mpos);
    }
    pdl->setLighting(false);
    
    m_pBpTmp->insert(pPeer.get());
    return;
  }
  
  //
  // Unpaired base
  //
  MolAtomPtr pA1, pA3;
  if (btype.equals("pur")) {
    //pA1 = pRes->getAtom("C4'");
    pA1 = getPivotAtom(pRes);
    pA3 = pRes->getAtom("N1");
  }
  else if (btype.equals("pyr")) {
    //pA1 = pRes->getAtom("C4'");
    pA1 = getPivotAtom(pRes);
    pA3 = pRes->getAtom("N3");
  }
  
  if (!pA1.isnull() && !pA3.isnull()) {
    //ColorPtr col = ColSchmHolder::getColor(pRes);
    // Get the pivot atom's color --> pA1 is pivot atom
    ColorPtr col = ColSchmHolder::getColor(pA1);
    pdl->setLighting(true);
    pdl->color(col);
    pdl->cylinder(m_bondw, pA1->getPos(), pA3->getPos());
    pdl->sphere(m_bondw, pA3->getPos());
    pdl->setLighting(false);
  }

}

void NARenderer::rendResidSimple1(DisplayContext *pdl, MolResiduePtr pRes)
{
  if (m_pBpTmp->find(pRes.get())!=m_pBpTmp->end())
    return; // base-pair is already rendered!!

  LString btype;
  pRes->getPropStr("basetype", btype);

  //LString bpair;
  //pRes->getPropStr("basepair", bpair);

  MolAtomPtr pA1, pA2, pA3;
  if (btype.equals("pur")) {
    //pA1 = pRes->getAtom("C4'");
    pA1 = getPivotAtom(pRes);
    pA2 = pRes->getAtom("N9");
    pA3 = pRes->getAtom("N1");
  }
  else if (btype.equals("pyr")) {
    //pA1 = pRes->getAtom("c4'");
    pA1 = getPivotAtom(pRes);
    pA2 = pRes->getAtom("N1");
    pA3 = pRes->getAtom("N3");
  }
  
  if (pA1.isnull() || pA2.isnull() || pA3.isnull())
    return;

  while (m_bShowBP) {
    //
    // Base-paired base
    //

    // get peer residue
    MolResiduePtr pPeer = getBPPeerResid(pRes);
    if (pPeer.isnull())
      break;
    
    LString btype2;
    pPeer->getPropStr("basetype", btype2);
    
    MolAtomPtr pA2_1, pA2_2, pA2_3;
    if (btype2.equals("pur")) {
      pA2_1 = getPivotAtom(pPeer);
      pA2_2 = pPeer->getAtom("N9");
      // pA2_3 = pPeer->getAtom("N1");
    }
    else if (btype2.equals("pyr")) {
      pA2_1 = getPivotAtom(pPeer);
      pA2_2 = pPeer->getAtom("N1");
      // pA2_3 = pPeer->getAtom("N3");
    }
    
    if (pA2_1.isnull() || pA2_2.isnull()) // || pA2_3.isnull())
      break;
    
    pdl->setLighting(true);
    
    // Get the pivot atom's color --> pA1 is pivot atom
    ColorPtr col1 = ColSchmHolder::getColor(pA1);
    ColorPtr col2 = ColSchmHolder::getColor(pA2_1);
    
    Vector4D pos1 = pA2->getPos();
    Vector4D pos2 = pA2_2->getPos();
    
    if ( col1->equals(*col2.get()) ) {
      pdl->color(col1);
      pdl->cylinder(m_bondw, pA1->getPos(), pos1);
      pdl->cylinder(m_bondw, pos1, pos2);
      pdl->cylinder(m_bondw, pos2, pA2_1->getPos());
      pdl->sphere(m_bondw, pos1);
      pdl->sphere(m_bondw, pos2);
    }
    else {
      Vector4D mpos = (pos1 + pos2).divide(2.0);
      
      pdl->color(col1);
      pdl->cylinder(m_bondw, pA1->getPos(), pos1);
      pdl->cylinder(m_bondw, pos1, mpos);
      pdl->sphere(m_bondw, pos1);
      
      pdl->color(col2);
      pdl->cylinder(m_bondw, mpos, pos2);
      pdl->cylinder(m_bondw, pos2, pA2_1->getPos());
      pdl->sphere(m_bondw, pos2);
    }
    
    pdl->setLighting(false);
    
    m_pBpTmp->insert(pPeer.get());
    return; // OK
  }
  
  //
  // Unpaired residues
  //

  // Get the pivot atom's color --> pA1 is pivot atom
  //ColorPtr col = ColSchmHolder::getColor(pRes);
  ColorPtr col = ColSchmHolder::getColor(pA1);
  pdl->setLighting(true);
  pdl->color(col);
  pdl->cylinder(m_bondw, pA1->getPos(), pA2->getPos());
  pdl->cylinder(m_bondw, pA2->getPos(), pA3->getPos());
  //pdl->sphere(m_bondw, pA1->getPos());
  pdl->sphere(m_bondw, pA2->getPos());
  pdl->sphere(m_bondw, pA3->getPos());
  pdl->setLighting(false);

  return;
}


namespace {
  void renderBondImpl(DisplayContext *pdl, BallStickRenderer *pBSRend,
                      const std::map<LString, MolAtomPtr> &atoms,
                      const LString &anam1, const LString &anam2)
  {
    if (anam1.equals(anam2))
      return;
    
    std::map<LString, MolAtomPtr>::const_iterator iter;

    iter = atoms.find(anam1);
    if (iter==atoms.end())
      return;
    MolAtomPtr pA1 = iter->second;

    iter = atoms.find(anam2);
    if (iter==atoms.end())
      return;
    MolAtomPtr pA2 = iter->second;

    pBSRend->rendBond(pdl, pA1, pA2, NULL);
  }
}

void NARenderer::rendResidDetail1(DisplayContext *pdl, MolResiduePtr pRes)
{
  std::map<LString, MolAtomPtr> atoms;
  const char *anames[] = {
    // "C1'","C2'","C3'","C4'","O4'",
    "C1'",
    "C4","C5","N7","C8","N9",
    "N1","C2","N3","C6",""
  };

  MolAtomPtr pPivAtom = getPivotAtom(pRes);
  ColorPtr col = ColSchmHolder::getColor(pPivAtom);
  m_pBSRend->setDefaultColor(col);
  m_pBSRend->setRingColor(col);
  atoms.insert(std::pair<LString, MolAtomPtr>(pPivAtom->getName(), pPivAtom));

  m_pBSRend->beginRend(pdl);

  int i, j;
  for (i=0; ;i++) {
    LString nam = anames[i];
    if (nam.isEmpty())
      break;

    MolAtomPtr pAtom = pRes->getAtom(nam);
    if (pAtom.isnull())
      continue;
    atoms.insert(std::pair<LString, MolAtomPtr>(nam, pAtom));

    m_pBSRend->rendAtom(pdl, pAtom, false);
  }

  LString btype;
  pRes->getPropStr("basetype", btype);
  if (btype.equals("pur")) {
    renderBondImpl(pdl, m_pBSRend, atoms, "C1'", "N9");
    renderBondImpl(pdl, m_pBSRend, atoms, "N9", "C8");
    renderBondImpl(pdl, m_pBSRend, atoms, "C8", "N7");
    renderBondImpl(pdl, m_pBSRend, atoms, "N7", "C5");
    renderBondImpl(pdl, m_pBSRend, atoms, "C4", "N9");

    renderBondImpl(pdl, m_pBSRend, atoms, "N1", "C2");
    renderBondImpl(pdl, m_pBSRend, atoms, "C2", "N3");
    renderBondImpl(pdl, m_pBSRend, atoms, "N3", "C4");
    renderBondImpl(pdl, m_pBSRend, atoms, "C4", "C5");
    renderBondImpl(pdl, m_pBSRend, atoms, "C5", "C6");
    renderBondImpl(pdl, m_pBSRend, atoms, "C6", "N1");
  }
  else if (btype.equals("pyr")) {
    renderBondImpl(pdl, m_pBSRend, atoms, "C1'", "N1");
    renderBondImpl(pdl, m_pBSRend, atoms, "N1", "C2");
    renderBondImpl(pdl, m_pBSRend, atoms, "C2", "N3");
    renderBondImpl(pdl, m_pBSRend, atoms, "N3", "C4");
    renderBondImpl(pdl, m_pBSRend, atoms, "C4", "C5");
    renderBondImpl(pdl, m_pBSRend, atoms, "C5", "C6");
    renderBondImpl(pdl, m_pBSRend, atoms, "C6", "N1");
  }

  if (m_nType==NAREND_DETAIL1) {
    renderBondImpl(pdl, m_pBSRend, atoms, pPivAtom->getName(), "C1'");
  }
  else if (m_nType==NAREND_DETAIL2) {
    // draw riboses
    const char *anames2[] = {
      "C2'","C3'","C4'","O4'", ""
      };
    for (i=0; ;i++) {
      LString nam = anames2[i];
      if (nam.isEmpty()) break;
      MolAtomPtr pAtom = pRes->getAtom(nam);
      if (pAtom.isnull())
        continue;
      atoms.insert(std::pair<LString, MolAtomPtr>(nam, pAtom));
      m_pBSRend->rendAtom(pdl, pAtom, false);
    }

    renderBondImpl(pdl, m_pBSRend, atoms, "C1'", "C2'");
    renderBondImpl(pdl, m_pBSRend, atoms, "C2'", "C3'");
    renderBondImpl(pdl, m_pBSRend, atoms, "C3'", "C4'");
    renderBondImpl(pdl, m_pBSRend, atoms, "C4'", "O4'");
    renderBondImpl(pdl, m_pBSRend, atoms, "O4'", "C1'");

    renderBondImpl(pdl, m_pBSRend, atoms, pPivAtom->getName(), "C4'");
  }

  // draw rings
  m_pBSRend->endRend(pdl);
}

void NARenderer::attachObj(qlib::uid_t obj_uid)
{
  super_t::attachObj(obj_uid);
  m_pBSRend->attachObj(obj_uid);
}

qlib::uid_t NARenderer::detachObj()
{
  m_pBSRend->detachObj();
  return super_t::detachObj();
}

