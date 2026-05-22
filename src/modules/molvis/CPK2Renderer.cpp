// -*-Mode: C++;-*-
//
//  CPK molecular renderer class (version 2)
//

#include <common.h>
#include "molvis.hpp"
#include <gfx/SphereSet.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "CPK2Renderer.hpp"

#include <gfx/GpuPrim.hpp>

using namespace molvis;
using namespace molstr;

CPK2Renderer::CPK2Renderer()
{
    m_bUseShader = false;
    m_bCheckShaderOK = false;
    m_nGlRendMode = REND_DEFAULT;
}

CPK2Renderer::~CPK2Renderer()
{
}

const char *CPK2Renderer::getTypeName() const
{
  return "cpk";
}

/////////

void CPK2Renderer::display(DisplayContext *pdc)
{
  if (pdc->isFile()) {
    // case of the file (non-ogl) rendering
    // always use the old version.
    super_t::display(pdc);
    return;
  }

  if (!m_bCheckShaderOK) {
    m_bUseShader = m_sphGpuPrim.init(pdc);
    if (m_bUseShader)
      MB_DPRINTLN("CPK2 sphere shader OK");
    m_bCheckShaderOK = true;
  }

  if (m_bUseShader &&
      (m_nGlRendMode==REND_DEFAULT ||
       m_nGlRendMode==REND_SHADER)) {
    // shader rendering mode
    if (!m_sphGpuPrim.isValid()) {
      renderShaderImpl(pdc);
      if (!m_sphGpuPrim.isValid())
        return; // Error, Cannot draw anything (ignore)
    }
    preRender(pdc);
    m_sphGpuPrim.draw(pdc);
    postRender(pdc);
  }
  else {
    // old version (uses DisplayContext::sphere)
    super_t::display(pdc);
  }
}

void CPK2Renderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
  m_sphGpuPrim.invalidate();
}

void CPK2Renderer::unloading()
{
  m_sphGpuPrim.invalidate();
  super_t::unloading();
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
  m_nDetailOld = pdl->getDetail();
  setupDetail(pdl, m_nDetail);
}

void CPK2Renderer::endRend(DisplayContext *pdl)
{
  pdl->setDetail(m_nDetailOld);
}

void CPK2Renderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  pdl->color(ColSchmHolder::getColor(pAtom));
  pdl->sphere(getVdWRadius(pAtom), pAtom->getPos());
}

//////////////////////
// Shader implementation

void CPK2Renderer::renderShaderImpl(DisplayContext *pdc)
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

  // initialize the coloring scheme
  getColSchm()->start(pMol, this);
  pMol->getColSchm()->start(pMol, this);

  m_sphGpuPrim.alloc(pdc, nsphs);

  {
    AtomIterator iter(pMol, getSelection());
    int i=0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors

      quint32 devcode = ColSchmHolder::getColor(pAtom)->getDevCode(getSceneID());
      m_sphGpuPrim.setData(i, pAtom->getPos(), static_cast<float>(getVdWRadius(pAtom)), devcode);
      ++i;
    }
  }

  // finalize the coloring scheme
  getColSchm()->end();
  pMol->getColSchm()->end();

  LOG_DPRINTLN("CPK2Renderer> rendered sphere atoms=%d", nsphs);
}

