// -*-Mode: C++;-*-
//
//  Ball & Stick model renderer class version 2
//

#include <common.h>
#include "molvis.hpp"

#include "BallStick2Renderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResiToppar.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/BondIterator.hpp>

#include <gfx/DrawAttrArray.hpp>

using namespace molvis;
using namespace molstr;

using gfx::DisplayContext;
using gfx::ColorPtr;

BallStick2Renderer::BallStick2Renderer()
{
}

BallStick2Renderer::~BallStick2Renderer()
{
  MB_DPRINTLN("BallStick2Renderer destructed %p", this);
}

const char *BallStick2Renderer::getTypeName() const
{
  return "ballstick2";
}

void BallStick2Renderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
}

void BallStick2Renderer::preRender(DisplayContext *pdc)
{
  MB_DPRINTLN("BallStick2Renderer::preRender setLit TRUE");
  pdc->setLighting(true);
}

void BallStick2Renderer::postRender(DisplayContext *pdc)
{
  MB_DPRINTLN("BallStick2Renderer::postRender setLit FALSE");
  pdc->setLighting(false);
}

////////////

void BallStick2Renderer::beginRend(DisplayContext *pdl)
{
  //if (m_atoms.size()>0)
  //m_atoms.clear();

  pdl->setDetail(m_nDetail);

  m_sphrdat.clear();
  m_cyldat.clear();
}

void BallStick2Renderer::endRend(DisplayContext *pdl)
{
  /*if ( m_fRing && !qlib::isNear4(m_tickness, 0.0) ) {
    drawRings(pdl);
    if (m_atoms.size()>0)
      m_atoms.clear();
  }*/

  return;
}

bool BallStick2Renderer::isRendBond() const
{
  if (m_bDrawRingOnly)
    return false;

  return true;
}

void BallStick2Renderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  //checkRing(pAtom->getID());

  //if (m_bDrawRingOnly)
  //return;

  if (m_sphr>0.0) {
    Sphr s;
    s.aid = pAtom->getID();
    s.rad = m_sphr;
    //ColorPtr pCol = ColSchmHolder::getColor(pAtom);
    s.col = 0; //pCol->getDevCode(getSceneID());
    m_sphrdat.push_back(s);
  }
}

void BallStick2Renderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
  if (m_bDrawRingOnly)
    return;

  if (m_bondw>0.0) {
    //if (m_nVBMode==VBMODE_TYPE1)
    //drawVBondType1(pAtom1, pAtom2, pMB, pdl);
    //else
    drawInterAtomLine(pAtom1, pAtom2, pdl);
  }
}

void BallStick2Renderer::drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                                          DisplayContext *pdl)
{
  if (pAtom1.isnull() || pAtom2.isnull()) return;

  const Vector4D pos1 = pAtom1->getPos();
  const Vector4D pos2 = pAtom2->getPos();

  ColorPtr pcol1 = ColSchmHolder::getColor(pAtom1);
  ColorPtr pcol2 = ColSchmHolder::getColor(pAtom2);

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
}

////////////////////////////////////////////////
// Ring plate drawing

void BallStick2Renderer::drawRings(DisplayContext *pdl)
{
  int i, j;
  MolCoordPtr pMol = getClientMol();

  while (m_atoms.size()>0) {
    std::set<int>::iterator iter = m_atoms.begin();
    int aid = *iter;
    m_atoms.erase(iter);

    MolAtomPtr pa = pMol->getAtom(aid);
    if (pa.isnull()) continue;

    MolResiduePtr pres = pa->getParentResidue();
    
    ResiToppar *ptop = pres->getTopologyObj();
    if (ptop==NULL)
      continue;

    // draw rings
    int nrings = ptop->getRingCount();
    for (i=0; i<nrings; i++) {
      const ResiToppar::RingAtomArray *pmembs = ptop->getRing(i);
      std::list<int> ring_atoms;

      // completeness flag of the ring
      bool fcompl = true;

      for (j=0; j<pmembs->size(); j++) {
        LString nm = pmembs->at(j);
        int maid = pres->getAtomID(nm);
        if (maid<=0) {
          fcompl = false;
          break;
        }

        std::set<int>::const_iterator miter = m_atoms.find(maid);
        if (miter==m_atoms.end()) {
          if (aid!=maid) {
            fcompl = false;
            break;
          }
          else {
            ring_atoms.push_back(aid);
            continue;
          }
        }

        ring_atoms.push_back(*miter);
      }

      if (fcompl)
        drawRingImpl(ring_atoms, pdl);
    }

    // remove drawn ring members from m_atoms
    for (i=0; i<nrings; i++) {
      const ResiToppar::RingAtomArray *pmembs = ptop->getRing(i);
      for (j=0; j<pmembs->size(); j++) {
        LString nm = pmembs->at(j);
        int maid = pres->getAtomID(nm);
        if (maid<=0)
          continue;

        std::set<int>::iterator miter = m_atoms.find(maid);
        if (miter==m_atoms.end())
          continue;

        m_atoms.erase(miter);
      }
    }
  }

}

void BallStick2Renderer::drawRingImpl(const std::list<int> atoms, DisplayContext *pdl)
{
  MolCoordPtr pMol = getClientMol();

  double len;
  int i, nsize = atoms.size();
  Vector4D *pvecs = MB_NEW Vector4D[nsize];
  Vector4D cen;
  std::list<int>::const_iterator iter = atoms.begin();
  std::list<int>::const_iterator eiter = atoms.end();
  MolAtomPtr pPivAtom, pAtom;
  for (i=0; iter!=eiter; ++iter, i++) {
    MolAtomPtr pAtom = pMol->getAtom(*iter);
    if (pAtom.isnull()) return;
    MolResiduePtr pres = pAtom->getParentResidue();
    MolChainPtr pch = pAtom->getParentChain();
    MB_DPRINTLN("RING %s %s", pres->toString().c_str(), pAtom->getName().c_str());
    pvecs[i] = pAtom->getPos();
    cen += pvecs[i];
    if (pPivAtom.isnull() && pAtom->getElement()==ElemSym::C)
      pPivAtom = pAtom;
  }

  if (pPivAtom.isnull())
    pPivAtom = pAtom; // no carbon atom --> last atom becomes pivot

  cen = cen.divide(nsize);

  // calculate the normal vector
  Vector4D norm;
  for (i=0; i<nsize; i++) {
    int ni = (i+1)%nsize;
    Vector4D v1 = pvecs[ni] - pvecs[i];
    Vector4D v2 = cen - pvecs[i];
    Vector4D ntmp;
    ntmp = v1.cross(v2);
    len = ntmp.length();
    if (len<=F_EPS8) {
      LOG_DPRINTLN("BallStick> *****");
      return;
    }
    //ntmp.scale(1.0/len);
    ntmp = ntmp.divide(len);
    norm += ntmp;
  }
  len = norm.length();
  norm = norm.divide(len);
  Vector4D dv = norm.scale(m_tickness);

  ColorPtr col = evalMolColor(m_ringcol, ColSchmHolder::getColor(pPivAtom));

  /*
  ColorPtr col = m_ringcol;

  // check molcol reference
  gfx::MolColorRef *pMolCol = dynamic_cast<gfx::MolColorRef *>(col.get());
  if (pMolCol!=NULL) {
    // molcol ref case --> resolve the pivot's color
    col = ColSchmHolder::getColor(pPivAtom);
  }
  */
  
  pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
  pdl->startTriangleFan();
  pdl->normal(norm);
  pdl->color(col);
  pdl->vertex(cen+dv);
  for (i=0; i<=nsize; i++) {
    pdl->vertex(pvecs[i%nsize]+dv);
  }
  pdl->end();

  pdl->startTriangleFan();
  pdl->normal(-norm);
  pdl->color(col);
  pdl->vertex(cen-dv);
  for (i=nsize; i>=0; i--) {
    pdl->vertex(pvecs[i%nsize]-dv);
  }
  pdl->end();
  pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  
  delete [] pvecs;

}

void BallStick2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("bondw") ||
      ev.getName().equals("sphr") ||
      ev.getName().equals("detail") ||
      ev.getName().equals("ring") ||
      ev.getName().equals("thickness") ||
      ev.getName().equals("ringcolor") ||
      ev.getName().equals("glrender_mode")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  MolAtomRenderer::propChanged(ev);
}

////////////

#ifdef USE_OPENGL
void BallStick2Renderer::renderShaderImpl()
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("BallStick2Renderer.render> Client mol is null");
    return;
  }

  // initialize the coloring scheme
  //getColSchm()->start(pMol, this);
  //pMol->getColSchm()->start(pMol, this);
  startColorCalc(pMol);

  // estimate the size of drawing elements for spheres
  int nsphs = 0;
  {
    AtomIterator iter(pMol, getSelection());
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      ++nsphs;
    }
  }
  
  if (nsphs!=0) {
    m_pSlSph->alloc(nsphs);

    AtomIterator iter(pMol, getSelection());
    int i=0, j, ifc=0;
    Vector4D pos;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors

      m_pSlSph->setData(i, pAtom->getPos(), m_sphr, ColSchmHolder::getColor(pAtom), getSceneID());
      ++i;
    }
  }

  /////////////////////////////////////////////////////////

  // estimate the size of drawing elements for bonds
  int nbons = 0;
  {
    BondIterator biter(pMol, getSelection());
    
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      int aid1 = pMB->getAtom1();
      int aid2 = pMB->getAtom2();

      MolAtomPtr pA1 = pMol->getAtom(aid1);
      MolAtomPtr pA2 = pMol->getAtom(aid2);

      if (pA1.isnull() || pA2.isnull())
        continue; // skip invalid bonds

      ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
      ColorPtr pcol2 = ColSchmHolder::getColor(pA2);
      if ( pcol1->equals(*pcol2.get()) ) {
        // same color --> one bond
        ++nbons;
      }
      else {
        // different color --> two bonds
        ++nbons;
        ++nbons;
      }
    }
  }

  if (nbons!=0) {
    m_pSlCyl->alloc(nbons);

    BondIterator biter(pMol, getSelection());
    int i=0;
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      int aid1 = pMB->getAtom1();
      int aid2 = pMB->getAtom2();

      MolAtomPtr pA1 = pMol->getAtom(aid1);
      MolAtomPtr pA2 = pMol->getAtom(aid2);

      if (pA1.isnull() || pA2.isnull())
        continue; // skip invalid bonds

      const Vector4D pos1 = pA1->getPos();
      const Vector4D pos2 = pA2->getPos();

      ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
      ColorPtr pcol2 = ColSchmHolder::getColor(pA2);

      if ( pcol1->equals(*pcol2.get()) ) {
        // same color --> one bond
        m_pSlCyl->setData(i, pos1, pos2, m_bondw, pcol1, getSceneID());
        ++i;
      }
      else {
        // different color --> two bonds
        const Vector4D mpos = (pos1 + pos2).divide(2.0);
        m_pSlCyl->setData(i, pos1, mpos, m_bondw, pcol1, getSceneID());
        ++i;
        m_pSlCyl->setData(i, mpos, pos2, m_bondw, pcol2, getSceneID());
        ++i;
      }

    }
  } // if (nbons!=0)


  // initialize the coloring scheme
  //getColSchm()->end();
  //pMol->getColSchm()->end();
  endColorCalc(pMol);
}

#endif
