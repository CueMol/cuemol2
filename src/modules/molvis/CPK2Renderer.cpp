// -*-Mode: C++;-*-
//
//  CPK molecular renderer class (version 2)
//

#include <common.h>
#include "molvis.hpp"
#include <gfx/SphereSet.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "CPK2Renderer.hpp"

using namespace molvis;
using namespace molstr;

CPK2Renderer::CPK2Renderer()
{
  m_pDrawElem = NULL;
}

CPK2Renderer::~CPK2Renderer()
{
}

const char *CPK2Renderer::getTypeName() const
{
  return "cpk2";
}

/////////

void CPK2Renderer::display(DisplayContext *pdc)
{
  if (m_pDrawElem==NULL) {
    renderImpl();
    if (m_pDrawElem==NULL)
      return; // Error, Cannot draw anything (ignore)
  }

  preRender(pdc);
  pdc->drawElem(*m_pDrawElem);
  postRender(pdc);
}

void CPK2Renderer::invalidateDisplayCache()
{
  delete m_pDrawElem;
  m_pDrawElem = NULL;
}

/////////

void CPK2Renderer::renderImpl()
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("CPK2Renderer::render> Client mol is null");
    return;
  }

  // estimate the size of drawing elements
  int nsphs=0;
  {
    AtomIterator iter(pMol, getSelection());
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      ++nsphs;
    }
  }
  
  if (nsphs==0)
    return; // nothing to draw
  
  gfx::SphereSet sphs;
  sphs.create(nsphs, m_nDetail);

  // build meshes / DrawElemVNCI
  {
    AtomIterator iter(pMol, getSelection());
    int i=0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors

      sphs.sphere(i, pAtom->getPos(),
                  getVdWRadius(pAtom),
                  ColSchmHolder::getColor(pAtom));
      ++i;
    }
  }

  m_pDrawElem = sphs.buildDrawElem();
}

/////////

bool CPK2Renderer::isRendBond() const
{
  return false;
}

void CPK2Renderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
}

void CPK2Renderer::beginRend(DisplayContext *pdl)
{
}

void CPK2Renderer::endRend(DisplayContext *pdl)
{
}

void CPK2Renderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
}

double CPK2Renderer::getVdWRadius(MolAtomPtr pAtom)
{

  switch (pAtom->getElement()) {
  case ElemSym::H:
    return m_vdwr_H;

  case ElemSym::C:
    return m_vdwr_C;

  case ElemSym::N:
    return m_vdwr_N;
    
  case ElemSym::O:
    return m_vdwr_O;
    
  case ElemSym::S:
    return m_vdwr_S;
    
  case ElemSym::P:
    return m_vdwr_P;
    
  default:
    return m_vdwr_X;
  }
}

void CPK2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("detail")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().startsWith("vdwr_")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  MolAtomRenderer::propChanged(ev);
}
