// -*-Mode: C++;-*-
//
//    backbone trace molecular renderer
//
// $Id: TraceRenderer.cpp,v 1.11 2011/03/06 16:27:15 rishitani Exp $

#include <common.h>
#include <qlib/Vector3F.hpp>

#include "TraceRenderer.hpp"

//#include "MolSelection.hpp"
//#include "AtomSel.h"
#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
//#include "ResiToppar.hpp"
#include "ResidIterator.hpp"
#include "AnimMol.hpp"

#include <gfx/DisplayContext.hpp>

using namespace molstr;

using qlib::Vector4D;
using qlib::Vector3F;
using gfx::ColorPtr;

TraceRenderer::TraceRenderer()
     : m_pVBO(NULL)
{
  //resetAllProps();
}

TraceRenderer::~TraceRenderer()
{
}

const char *TraceRenderer::getTypeName() const
{
  return "trace";
}

void TraceRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

//////////

void TraceRenderer::beginRend(DisplayContext *pdl)
{
  pdl->setLineWidth(m_lw);
  return;

/*
  if (!m_bUseVBO) {
    pdl->setLineWidth(m_lw);
    return;
  }

  m_bPrevAidValid = false;
  m_nVA = 0;
*/
}

void TraceRenderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  pdl->startLineStrip();
  return;

/*
  if (!m_bUseVBO) {
    pdl->startLineStrip();
    return;
  }

  m_bPrevAidValid = false;
  m_nBonds = 0;
*/
}

void TraceRenderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
  MolAtomPtr pAtom1 = getPivotAtom(pRes);

  Vector4D curpt = pAtom1->getPos();
  pdl->color(ColSchmHolder::getColor(pRes));
  pdl->vertex(curpt);
  return;

/*
  if (!m_bUseVBO) {
    Vector4D curpt = pAtom1->getPos();
    pdl->color(ColSchmHolder::getColor(pRes));
    pdl->vertex(curpt);
    return;
  }

  // VBO implementation

  if (!m_bPrevAidValid) {
    m_nPrevAid = pAtom1->getID();
    m_bPrevAidValid = true;
  }
  else {
    IntBond val;
    val.aid1 = m_nPrevAid;
    val.aid2 = pAtom1->getID();
    m_bonds.push_back(val);
    m_nPrevAid = val.aid2;
    m_nBonds ++;
  }
*/
}

void TraceRenderer::endSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  pdl->end();
  return;

/*
  if (!m_bUseVBO) {
    pdl->end();
    return;
  }

  // VBO implementation
  if (m_nBonds>0) {
    m_nVA += m_nBonds * 2;
  }
  else if (m_bPrevAidValid) {
    // isolated segment
    m_nVA += 3*2;
    m_atoms.push_back(m_nPrevAid);
  }
*/
}

void TraceRenderer::endRend(DisplayContext *pdl)
{
  pdl->setLineWidth(1.0f);
  return;

/*
  if (!m_bUseVBO) {
    pdl->setLineWidth(1.0f);
    return;
  }

  if (m_pVBO!=NULL)
    delete m_pVBO;
    
  m_pVBO = MB_NEW gfx::DrawElemVC();
  m_pVBO->alloc(m_nVA);
  m_pVBO->setDrawMode(gfx::DrawElemVC::DRAW_LINES);
  
  MB_DPRINTLN("TraceRend> %d elems VBO created", m_nVA);

  quint32 i, j, nbonds = m_bonds.size();
  MolCoordPtr pMol = getClientMol();

  j=0;

  for (i=0; i<nbonds; ++i) {
    MolAtomPtr pA1 = pMol->getAtom(m_bonds[i].aid1);
    MolAtomPtr pA2 = pMol->getAtom(m_bonds[i].aid2);
    
    quint32 cc1 = ColSchmHolder::getColor(pA1)->getCode();
    quint32 cc2 = ColSchmHolder::getColor(pA2)->getCode();

    Vector4D pos1 = pA1->getPos();
    Vector4D pos2 = pA2->getPos();

    m_pVBO->color(j, cc1);
    m_pVBO->vertex(j, pos1);
    ++j;
    m_pVBO->color(j, cc2);
    m_pVBO->vertex(j, pos2);
    ++j;
  }

  quint32 natoms = m_atoms.size();

  // size of the star
  const double rad = 0.25;
  const Vector4D xdel(rad,0,0);
  const Vector4D ydel(0,rad,0);
  const Vector4D zdel(0,0,rad);

  for (i=0; i<natoms; ++i) {
    MolAtomPtr pA1 = pMol->getAtom(m_atoms[i]);
    quint32 cc1 = ColSchmHolder::getColor(pA1)->getCode();
    Vector4D pos1 = pA1->getPos();

    m_pVBO->color(j, cc1);
    m_pVBO->vertex(j, pos1-xdel);
    ++j;

    m_pVBO->color(j, cc1);
    m_pVBO->vertex(j, pos1+xdel);
    ++j;

    m_pVBO->color(j, cc1);
    m_pVBO->vertex(j, pos1-ydel);
    ++j;

    m_pVBO->color(j, cc1);
    m_pVBO->vertex(j, pos1+ydel);
    ++j;
    
    m_pVBO->color(j, cc1);
    m_pVBO->vertex(j, pos1-zdel);
    ++j;

    m_pVBO->color(j, cc1);
    m_pVBO->vertex(j, pos1+zdel);
    ++j;

  }
*/
}

/*void TraceRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("linew")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  MainChainRenderer::propChanged(ev);
}*/

///////////////////////////////////////////////////////////
// New VBO implementation

void TraceRenderer::display(DisplayContext *pdc)
{
  if (!isUseVBO(pdc)) {
    // case of the file (non-ogl) rendering
    // always use the old version.
    super_t::display(pdc);
    return;
  }

  // new rendering routine using VBO (DrawElem)
  if (m_pVBO==NULL) {
    createVBO();
    updateVBOColor();
    if (isUseAnim())
      updateDynamicVBO();
    else
      updateStaticVBO();
    //m_bondAids.clear();
    //m_atomAids.clear();
    if (m_pVBO==NULL)
      return; // Error, Cannot draw anything (ignore)
  }

  preRender(pdc);
  m_pVBO->setLineWidth(m_lw);
  // m_pVBO->setDefColor(m_color);
  pdc->drawElem(*m_pVBO);
  postRender(pdc);

}

void TraceRenderer::invalidateDisplayCache()
{
  if (m_pVBO!=NULL) {
    delete m_pVBO;
    m_pVBO = NULL;

    m_bondAids.clear();
    m_bondInds.clear();
    m_atomAids.clear();
    m_atomInds.clear();
  }

  super_t::invalidateDisplayCache();
}

void TraceRenderer::createVBO()
{
  MolCoordPtr pCMol = getClientMol();

  // visit selected residues
  ResidIterator iter(pCMol, getSelection());

  quint32 nbond = 0, natom = 0;
  MolResiduePtr pPrevRes;
  bool bPrevBonded = false;

  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MB_ASSERT(!pRes.isnull());
    MolAtomPtr pPiv = getPivotAtom(pRes);

    if (pPiv.isnull())
      pRes = MolResiduePtr();

    if (pPrevRes.isnull()) {
      // prev pivot atom does not exist
      // --> always no bond/atom drawing
      bPrevBonded = false;
    }
    else if (!pPiv.isnull() && !isNewSegment(pRes, pPrevRes)) {
      // (next pivot exists and) prev-next pivots are connected
      nbond ++;
      bPrevBonded = true;
    }
    else {
      // next pivot atom does not exist (or not bonded)
      if (!bPrevBonded) {
        // prev pivot atom does not bonded
        // --> prev pivot is isolated atom
        natom ++;
      }
      bPrevBonded = false;
    }
    
    pPrevRes = pRes;
  }

  int nVA = nbond*2 + natom*3*2;
  m_nBonds = nbond;
  m_nAtoms = natom;

  ////////////////////////////////

  m_bondAids.resize(nbond*2);
  m_atomAids.resize(natom);
  AnimMol *pAMol = NULL;
  if (isUseAnim()) {
    m_bondInds.resize(nbond*2);
    m_atomInds.resize(natom);
    pAMol = static_cast<AnimMol *>(pCMol.get());
  }
  
  pPrevRes = MolResiduePtr();
  MolAtomPtr pPrevPiv = MolAtomPtr();
  bPrevBonded = false;
  quint32 i=0, j=0;
  quint32 aid1, aid2;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();

    MolAtomPtr pPiv = getPivotAtom(pRes);

    if (pPiv.isnull())
      pRes = MolResiduePtr();

    if (pPrevRes.isnull()) {
      // prev pivot atom does not exist
      // --> always no bond/atom drawing
      bPrevBonded = false;
    }
    else if (!pPiv.isnull() && !isNewSegment(pRes, pPrevRes)) {
      // (next pivot exists and) prev-next pivots are connected
      m_bondAids[i*2+0] = aid1 = pPrevPiv->getID();
      m_bondAids[i*2+1] = aid2 = pPiv->getID();
      if (isUseAnim()) {
        m_bondInds[i*2+0] = pAMol->getCrdArrayInd(aid1) * 3;
        m_bondInds[i*2+1] = pAMol->getCrdArrayInd(aid2) * 3;
      }
      ++i;
      bPrevBonded = true;
    }
    else {
      // next pivot atom does not exist (or not bonded)
      if (!bPrevBonded) {
        // prev pivot atom does not bonded
        // --> prev pivot is isolated atom
        m_atomAids[j] = aid1 = pPrevPiv->getID();
        if (isUseAnim())
          m_atomInds[j] = pAMol->getCrdArrayInd(aid1) * 3;
        ++j;
      }
      bPrevBonded = false;
    }
    
    pPrevRes = pRes;
    pPrevPiv = pPiv;
  }

  ////////////////////////////////

  if (m_pVBO!=NULL)
    delete m_pVBO;
    
  m_pVBO = MB_NEW gfx::DrawElemVC();
  m_pVBO->alloc(nVA);
  m_pVBO->setDrawMode(gfx::DrawElem::DRAW_LINES);
  LOG_DPRINTLN("TraceRenderer> %d elems VBO created", nVA);
}

void TraceRenderer::updateDynamicVBO()
{
  quint32 i = 0, j = 0;
  quint32 ind1, ind2;
  
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pMol->getAtomCrdArray();
  Vector3F pos1, pos2;

  // Single bonds
  for (i=0; i<m_nBonds; ++i) {
    ind1 = m_bondInds[i*2+0];
    ind2 = m_bondInds[i*2+1];

    m_pVBO->vertexfp(j, &crd[ind1]);
    ++j;
    m_pVBO->vertexfp(j, &crd[ind2]);
    ++j;
  }

  // Isolated atoms
  
  // size of the star
  const qfloat32 rad = 0.25;
  const qfloat32 rad2 = rad*2.0f;

  for (i=0; i<m_nAtoms; ++i) {
    quint32 ind1 = m_atomInds[i];

    pos1.set(&crd[ind1]);

    pos1.x() -= rad;
    m_pVBO->vertex3f(j, pos1);
    ++j;
    pos1.x() += rad2;
    m_pVBO->vertex3f(j, pos1);
    pos1.x() -= rad;
    ++j;

    pos1.y() -= rad;
    m_pVBO->vertex3f(j, pos1);
    ++j;
    pos1.y() += rad2;
    m_pVBO->vertex3f(j, pos1);
    ++j;
    pos1.y() -= rad;

    pos1.z() -= rad;
    m_pVBO->vertex3f(j, pos1);
    ++j;
    pos1.z() += rad2;
    m_pVBO->vertex3f(j, pos1);
    ++j;
  }
}

void TraceRenderer::updateStaticVBO()
{
  quint32 i = 0, j = 0;
  quint32 aid1, aid2;
  
  MolCoordPtr pCMol = getClientMol();

  MolAtomPtr pA1, pA2;
  Vector4D pos1, pos2;

  // Single bonds
  for (i=0; i<m_nBonds; ++i) {
    m_pVBO->vertex(j, pCMol->getAtom( m_bondAids[i*2+0])->getPos() );
    ++j;
    m_pVBO->vertex(j, pCMol->getAtom( m_bondAids[i*2+1])->getPos() );
    ++j;
  }

  // Isolated atoms
  
  // size of the star
  const qfloat32 rad = 0.25;
  const qfloat32 rad2 = rad*2.0f;

  for (i=0; i<m_nAtoms; ++i) {
    pos1 = pCMol->getAtom(m_atomAids[i])->getPos();

    pos1.x() -= rad;
    m_pVBO->vertex(j, pos1);
    ++j;
    pos1.x() += rad2;
    m_pVBO->vertex(j, pos1);
    pos1.x() -= rad;
    ++j;

    pos1.y() -= rad;
    m_pVBO->vertex(j, pos1);
    ++j;
    pos1.y() += rad2;
    m_pVBO->vertex(j, pos1);
    ++j;
    pos1.y() -= rad;

    pos1.z() -= rad;
    m_pVBO->vertex(j, pos1);
    ++j;
    pos1.z() += rad2;
    m_pVBO->vertex(j, pos1);
    ++j;
  }
}

void TraceRenderer::updateVBOColor()
{
  quint32 i;
  quint32 j = 0;
  
  MolCoordPtr pCMol = getClientMol();
  MolAtomPtr pA1, pA2;

  quint32 cc1, cc2;
  quint32 aid1, aid2;

  // initialize the coloring scheme
  getColSchm()->start(pCMol, this);
  pCMol->getColSchm()->start(pCMol, this);

  // Bond colors
  for (i=0; i<m_nBonds; ++i) {
    aid1 = m_bondAids[i*2+0];
    aid2 = m_bondAids[i*2+1];
    
    pA1 = pCMol->getAtom(aid1);
    pA2 = pCMol->getAtom(aid2);
    cc1 = ColSchmHolder::getColor(pA1)->getCode();
    cc2 = ColSchmHolder::getColor(pA2)->getCode();

    m_pVBO->color(j, cc1);
    ++j;
    m_pVBO->color(j, cc2);
    ++j;
  }

  // Isolated atom colors
  for (i=0; i<m_nAtoms; ++i) {
    aid1 = m_atomAids[i];

    pA1 = pCMol->getAtom(aid1);
    cc1 = ColSchmHolder::getColor(pA1)->getCode();

    for (int k=0; k<6; ++k,++j)
      m_pVBO->color(j, cc1);
  }

  // finalize the coloring scheme
  getColSchm()->end();
  pCMol->getColSchm()->end();
}

void TraceRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {

    // OBE_CHANGED && descr=="atomsMoved"
    if (m_pVBO!=NULL && isUseAnim() ) {
      // only update positions
      updateDynamicVBO();
      m_pVBO->setUpdated(true);
      return;
    }

  }

  super_t::objectChanged(ev);
}
