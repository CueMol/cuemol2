// -*-Mode: C++;-*-
//
//    backbone trace molecular renderer
//
// $Id: TraceRenderer.cpp,v 1.11 2011/03/06 16:27:15 rishitani Exp $

#include <common.h>
#include "TraceRenderer.hpp"

//#include "MolSelection.hpp"
//#include "AtomSel.h"
#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "ResiToppar.hpp"

#include <gfx/DisplayContext.hpp>

using namespace molstr;

TraceRenderer::TraceRenderer()
{
  //m_bUseVBO = true;
  m_bUseVBO = false;
  m_pVBO = NULL;
}

TraceRenderer::~TraceRenderer()
{
}

const char *TraceRenderer::getTypeName() const
{
  return "trace";
}

void TraceRenderer::display(DisplayContext *pdc)
{
  if (!m_bUseVBO) {
    super_t::display(pdc);
    return;
  }
  else {

    if (pdc->isFile() || !pdc->isDrawElemSupported()) {
      // case of the file (non-ogl) rendering
      // always use the old version.
      m_bUseVBO = false;
      super_t::display(pdc);
      m_bUseVBO = true;
      return;
    }

    // new rendering routine using VBO (DrawElem)
    
    if (m_pVBO==NULL) {
      render(pdc);
      if (m_pVBO==NULL)
        return; // Error, Cannot draw anything (ignore)
    }
    
    preRender(pdc);
    m_pVBO->setLineWidth(m_lw);
    pdc->drawElem(*m_pVBO);
    postRender(pdc);

    return;
  }
}

void TraceRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

//////////

void TraceRenderer::beginRend(DisplayContext *pdl)
{
  if (!m_bUseVBO) {
    pdl->setLineWidth(m_lw);
    return;
  }

  m_bPrevAidValid = false;
  m_nVA = 0;
}

void TraceRenderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  if (!m_bUseVBO) {
    pdl->startLineStrip();
    return;
  }

  m_bPrevAidValid = false;
  m_nBonds = 0;
}

void TraceRenderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
  MolAtomPtr pAtom1 = getPivotAtom(pRes);

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
}

void TraceRenderer::endSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
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

}

void TraceRenderer::endRend(DisplayContext *pdl)
{
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
}

/*
void TraceRenderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
}
  */

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

