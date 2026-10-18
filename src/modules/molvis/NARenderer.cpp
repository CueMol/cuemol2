// -*-Mode: C++;-*-
//
//  Nucleic acid renderer class
//
//  $Id: NARenderer.cpp,v 1.4 2011/01/31 04:43:49 rishitani Exp $

#include <common.h>

#include "NARenderer.hpp"
#include "BallStickRenderer.hpp"
#include "TubeMeshBuilder.hpp"

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

  m_pDirectDC = NULL;
  m_nStickPass = TubeMeshBuilder::MODE_NONE;
  m_nStickFlags = 0;
  m_nSphCur = 0;
  m_nCylCur = 0;
  m_bStickMismatch = false;
  m_bCheckStickShader = false;
  m_bStickShaderOK = false;

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
    m_pBSRend->getColSchm()->start(getClientMol(), this);

    m_pBSRend->setDetail(m_nBaseDetail);
    m_pBSRend->setBondw(m_bondw);
    m_pBSRend->setSphr(m_bondw);
    m_pBSRend->setRingThick(m_bsthick);
  }
  
  if (m_pBpTmp!=NULL)
    delete m_pBpTmp;
  m_pBpTmp = MB_NEW std::set<MolResidue *>;

  // pdl is null in the GPU traversal (see TubeGpuSupport)
  m_pDirectDC = pdl;
  if (pdl!=NULL) {
    pdl->setDetail(m_nBaseDetail);
  }
  else {
    const TubeMeshBuilder &mb = tubeGpuBuilder();
    m_nStickPass = mb.getMode();
    m_nStickFlags = mb.getUpdateFlags();
    if (m_nStickPass==TubeMeshBuilder::MODE_BUILD) {
      m_sphs.clear();
      m_cyls.clear();
    }
    m_nSphCur = 0;
    m_nCylCur = 0;
    m_bStickMismatch = false;
  }

  TubeRenderer::beginRend(pdl);
}

void NARenderer::endRend(DisplayContext *pdl)
{
  if (m_nType==NAREND_DETAIL1 || m_nType==NAREND_DETAIL2) {
    // finalize the coloring scheme
    m_pBSRend->getColSchm()->end();
  }

  if (m_pBpTmp!=NULL)
    delete m_pBpTmp;
  m_pBpTmp = NULL;

  TubeRenderer::endRend(pdl);
  m_pDirectDC = NULL;
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
    
    tubeGpuBuilder().setLighting(true);
    ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
    ColorPtr pcol2 = ColSchmHolder::getColor(pA3);
    Vector4D pos1 = pA1->getPos();
    Vector4D pos2 = pA3->getPos();
    if ( pcol1->equals(*pcol2.get()) ) {
      stickCyl(pos1, pos2, m_bondw, pcol1, pA1->getID());
    }
    else {
      const Vector4D mpos = (pos1 + pos2).divide(2.0);
      stickCyl(pos1, mpos, m_bondw, pcol1, pA1->getID());
      stickCyl(pos2, mpos, m_bondw, pcol2, pA3->getID());
    }
    tubeGpuBuilder().setLighting(false);
    
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
    tubeGpuBuilder().setLighting(true);
    stickCyl(pA1->getPos(), pA3->getPos(), m_bondw, col, pA1->getID());
    stickSphere(pA3->getPos(), m_bondw, col, pA1->getID());
    tubeGpuBuilder().setLighting(false);
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
    
    tubeGpuBuilder().setLighting(true);
    
    // Get the pivot atom's color --> pA1 is pivot atom
    ColorPtr col1 = ColSchmHolder::getColor(pA1);
    ColorPtr col2 = ColSchmHolder::getColor(pA2_1);
    
    Vector4D pos1 = pA2->getPos();
    Vector4D pos2 = pA2_2->getPos();
    
    if ( col1->equals(*col2.get()) ) {
      const int name = pA1->getID();
      stickCyl(pA1->getPos(), pos1, m_bondw, col1, name);
      stickCyl(pos1, pos2, m_bondw, col1, name);
      stickCyl(pos2, pA2_1->getPos(), m_bondw, col1, name);
      stickSphere(pos1, m_bondw, col1, name);
      stickSphere(pos2, m_bondw, col1, name);
    }
    else {
      Vector4D mpos = (pos1 + pos2).divide(2.0);
      
      const int name1 = pA1->getID();
      stickCyl(pA1->getPos(), pos1, m_bondw, col1, name1);
      stickCyl(pos1, mpos, m_bondw, col1, name1);
      stickSphere(pos1, m_bondw, col1, name1);
      
      const int name2 = pA2_1->getID();
      stickCyl(mpos, pos2, m_bondw, col2, name2);
      stickCyl(pos2, pA2_1->getPos(), m_bondw, col2, name2);
      stickSphere(pos2, m_bondw, col2, name2);
    }
    
    tubeGpuBuilder().setLighting(false);
    
    m_pBpTmp->insert(pPeer.get());
    return; // OK
  }
  
  //
  // Unpaired residues
  //

  // Get the pivot atom's color --> pA1 is pivot atom
  //ColorPtr col = ColSchmHolder::getColor(pRes);
  ColorPtr col = ColSchmHolder::getColor(pA1);
  const int name = pA1->getID();
  tubeGpuBuilder().setLighting(true);
  stickCyl(pA1->getPos(), pA2->getPos(), m_bondw, col, name);
  stickCyl(pA2->getPos(), pA3->getPos(), m_bondw, col, name);
  //pdl->sphere(m_bondw, pA1->getPos());
  stickSphere(pA2->getPos(), m_bondw, col, name);
  stickSphere(pA3->getPos(), m_bondw, col, name);
  tubeGpuBuilder().setLighting(false);

  return;
}


void NARenderer::rendDetailBond(const std::map<LString, MolAtomPtr> &atoms,
                                const LString &anam1, const LString &anam2,
                                int nPivName)
{
  if (anam1.equals(anam2) || m_bondw<=0.0)
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

  // Same as BallStickRenderer::drawInterAtomLine(), with the colors of the
  // helper renderer
  const Vector4D pos1 = pA1->getPos();
  const Vector4D pos2 = pA2->getPos();
  ColorPtr pcol1 = m_pBSRend->ColSchmHolder::getColor(pA1);
  ColorPtr pcol2 = m_pBSRend->ColSchmHolder::getColor(pA2);

  if ( pcol1->equals(*pcol2.get()) ) {
    stickCyl(pos1, pos2, m_bondw, pcol1, nPivName);
  }
  else {
    const Vector4D mpos = (pos1 + pos2).divide(2.0);
    stickCyl(pos1, mpos, m_bondw, pcol1, pA1->getID());
    stickCyl(pos2, mpos, m_bondw, pcol2, pA2->getID());
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
  // The base atoms, the same-color bonds and the base ring take the pivot
  // atom's name (residue-level pick).
  const int nPivName = pPivAtom->getID();
  m_pBSRend->setDefaultColor(col);
  m_pBSRend->setRingColor(col);
  atoms.insert(std::pair<LString, MolAtomPtr>(pPivAtom->getName(), pPivAtom));

  // Same as BallStickRenderer::rendAtom() (sphere radius = bond width)
  auto rendAtom = [&](MolAtomPtr pAtom) {
    m_pBSRend->collectRingAtom(pAtom->getID());
    if (m_bondw>0.0)
      stickSphere(pAtom->getPos(), m_bondw,
                  m_pBSRend->ColSchmHolder::getColor(pAtom), nPivName);
  };

  int i;
  for (i=0; ;i++) {
    LString nam = anames[i];
    if (nam.isEmpty())
      break;

    MolAtomPtr pAtom = pRes->getAtom(nam);
    if (pAtom.isnull())
      continue;
    atoms.insert(std::pair<LString, MolAtomPtr>(nam, pAtom));

    rendAtom(pAtom);
  }

  LString btype;
  pRes->getPropStr("basetype", btype);
  if (btype.equals("pur")) {
    rendDetailBond(atoms, "C1'", "N9", nPivName);
    rendDetailBond(atoms, "N9", "C8", nPivName);
    rendDetailBond(atoms, "C8", "N7", nPivName);
    rendDetailBond(atoms, "N7", "C5", nPivName);
    rendDetailBond(atoms, "C4", "N9", nPivName);

    rendDetailBond(atoms, "N1", "C2", nPivName);
    rendDetailBond(atoms, "C2", "N3", nPivName);
    rendDetailBond(atoms, "N3", "C4", nPivName);
    rendDetailBond(atoms, "C4", "C5", nPivName);
    rendDetailBond(atoms, "C5", "C6", nPivName);
    rendDetailBond(atoms, "C6", "N1", nPivName);
  }
  else if (btype.equals("pyr")) {
    rendDetailBond(atoms, "C1'", "N1", nPivName);
    rendDetailBond(atoms, "N1", "C2", nPivName);
    rendDetailBond(atoms, "C2", "N3", nPivName);
    rendDetailBond(atoms, "N3", "C4", nPivName);
    rendDetailBond(atoms, "C4", "C5", nPivName);
    rendDetailBond(atoms, "C5", "C6", nPivName);
    rendDetailBond(atoms, "C6", "N1", nPivName);
  }

  if (m_nType==NAREND_DETAIL1) {
    rendDetailBond(atoms, pPivAtom->getName(), "C1'", nPivName);
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
      rendAtom(pAtom);
    }

    rendDetailBond(atoms, "C1'", "C2'", nPivName);
    rendDetailBond(atoms, "C2'", "C3'", nPivName);
    rendDetailBond(atoms, "C3'", "C4'", nPivName);
    rendDetailBond(atoms, "C4'", "O4'", nPivName);
    rendDetailBond(atoms, "O4'", "C1'", nPivName);

    rendDetailBond(atoms, pPivAtom->getName(), "C4'", nPivName);
  }

  // draw rings (to the tube mesh)
  tubeGpuBuilder().loadName(nPivName);
  m_pBSRend->drawCollectedRings(&tubeGpuBuilder());
}

//////////////////////////////////////////////////////
// Base sticks

void NARenderer::stickSphere(const Vector4D &pos, double rad,
                             const ColorPtr &col, int name)
{
  if (m_pDirectDC!=NULL) {
    m_pDirectDC->loadName(name);
    m_pDirectDC->color(col);
    m_pDirectDC->sphere(rad, pos);
    return;
  }
  recordStick(m_sphs, m_nSphCur, pos, pos, rad, col, name);
}

void NARenderer::stickCyl(const Vector4D &pos1, const Vector4D &pos2, double rad,
                          const ColorPtr &col, int name)
{
  if (m_pDirectDC!=NULL) {
    m_pDirectDC->loadName(name);
    m_pDirectDC->color(col);
    m_pDirectDC->cylinder(rad, pos1, pos2);
    return;
  }
  recordStick(m_cyls, m_nCylCur, pos1, pos2, rad, col, name);
}

void NARenderer::recordStick(std::vector<Stick> &recs, int &nCur,
                             const Vector4D &pos1, const Vector4D &pos2,
                             double rad, const ColorPtr &col, int name)
{
  if (m_nStickPass==TubeMeshBuilder::MODE_BUILD) {
    Stick st;
    st.pos1 = pos1;
    st.pos2 = pos2;
    st.rad = float(rad);
    st.col = col->getDevCode(getSceneID());
    st.name = name;
    recs.push_back(st);
    return;
  }

  if (m_nStickPass!=TubeMeshBuilder::MODE_UPDATE)
    return;

  const int i = nCur;
  ++nCur;
  if (i>=int(recs.size())) {
    m_bStickMismatch = true;
    return;
  }
  if (m_nStickFlags & TubeMeshBuilder::UPD_GEOM) {
    recs[i].pos1 = pos1;
    recs[i].pos2 = pos2;
  }
  if (m_nStickFlags & TubeMeshBuilder::UPD_COLOR)
    recs[i].col = col->getDevCode(getSceneID());
}

void NARenderer::tubeGpuRenderMesh()
{
  render(nullptr);
  if (m_nStickPass==TubeMeshBuilder::MODE_UPDATE &&
      (m_nSphCur!=int(m_sphs.size()) || m_nCylCur!=int(m_cyls.size())))
    m_bStickMismatch = true;
}

bool NARenderer::prepareGpu(DisplayContext *pdc)
{
  if (pdc->isFile())
    return false;

  if (!m_bCheckStickShader) {
    m_bStickShaderOK = m_sphPrim.init(pdc) && m_cylPrim.init(pdc);
    m_bCheckStickShader = true;
  }
  if (!m_bStickShaderOK)
    return false;

  if (!tubeGpuPrepare(pdc))
    return false;

  if (m_nStickPass==TubeMeshBuilder::MODE_UPDATE && m_bStickMismatch) {
    // The sticks changed although the mesh did not: rebuild both
    MB_DPRINTLN("NARenderer> stick topology changed, rebuild");
    tubeGpuInvalidate();
    if (!tubeGpuPrepare(pdc))
      return false;
  }

  if (m_nStickPass==TubeMeshBuilder::MODE_BUILD) {
    m_sphPrim.invalidate();
    if (!m_sphs.empty()) {
      m_sphPrim.alloc(pdc, int(m_sphs.size()));
      for (int i=0; i<int(m_sphs.size()); ++i)
        m_sphPrim.setData(i, m_sphs[i].pos1, m_sphs[i].rad, m_sphs[i].col,
                          gfx::encodeHitName(m_sphs[i].name));
    }
    m_cylPrim.invalidate();
    if (!m_cyls.empty()) {
      m_cylPrim.alloc(pdc, int(m_cyls.size()));
      for (int i=0; i<int(m_cyls.size()); ++i)
        m_cylPrim.setData(i, m_cyls[i].pos1, m_cyls[i].pos2, m_cyls[i].rad,
                          m_cyls[i].col, gfx::encodeHitName(m_cyls[i].name),
                          gfx::encodeHitName(m_cyls[i].name));
    }
  }
  else if (m_nStickPass==TubeMeshBuilder::MODE_UPDATE) {
    if (m_sphPrim.isValid()) {
      for (int i=0; i<int(m_sphs.size()); ++i)
        m_sphPrim.setData(i, m_sphs[i].pos1, m_sphs[i].rad, m_sphs[i].col,
                          gfx::encodeHitName(m_sphs[i].name));
      m_sphPrim.setUpdated(true);
    }
    if (m_cylPrim.isValid()) {
      for (int i=0; i<int(m_cyls.size()); ++i)
        m_cylPrim.setData(i, m_cyls[i].pos1, m_cyls[i].pos2, m_cyls[i].rad,
                          m_cyls[i].col, gfx::encodeHitName(m_cyls[i].name),
                          gfx::encodeHitName(m_cyls[i].name));
      m_cylPrim.setUpdated(true);
    }
  }
  m_nStickPass = TubeMeshBuilder::MODE_NONE;
  return true;
}

void NARenderer::display(DisplayContext *pdc)
{
  if (!prepareGpu(pdc)) {
    // file context or no shader --> display-list path
    SplineRenderer::display(pdc);
    return;
  }
  preRender(pdc);
  tubeGpuDraw(pdc);
  if (m_sphPrim.isValid())
    m_sphPrim.draw(pdc);
  if (m_cylPrim.isValid())
    m_cylPrim.draw(pdc);
  postRender(pdc);
}

void NARenderer::displayPick(DisplayContext *pdc)
{
  if (!prepareGpu(pdc)) {
    SplineRenderer::displayPick(pdc);
    return;
  }
  // Each primitive switches to its pick program (DisplayContext::isPickDraw)
  tubeGpuDraw(pdc);
  if (m_sphPrim.isValid())
    m_sphPrim.draw(pdc);
  if (m_cylPrim.isValid())
    m_cylPrim.draw(pdc);
}

void NARenderer::unloading()
{
  m_sphPrim.invalidate();
  m_cylPrim.invalidate();
  super_t::unloading();
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

