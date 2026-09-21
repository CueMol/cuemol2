// -*-Mode: C++;-*-
//
//  CPK molecular renderer class (version 2)
//

#include <common.h>
#include "molvis.hpp"
#include <gfx/SphereSet.hpp>
#include <gfx/FloatDataTexture.hpp>
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

CPK2Renderer::~CPK2Renderer() {}

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
    // Try the coordinate texture path; falls back silently when unavailable.
    if (!m_bUseShader || !m_sphIdxGpuPrim.init(pdc)) ctDisable();
    m_bCheckShaderOK = true;
  }

  if (m_bUseShader &&
      (m_nGlRendMode==REND_DEFAULT ||
       m_nGlRendMode==REND_SHADER)) {
    if (ctUsable()) {
      // Nothing matched the selection last time it was built. Rebuilding would
      // walk the whole molecule again, evaluate the selection again and emit
      // nothing again, every frame, for as long as the selection stays empty.
      if (ctNothingToDraw()) return;

      if (!m_sphIdxGpuPrim.isValid()) {
        renderCoordTexImpl(pdc);
        // renderCoordTexImpl stops the mixin being usable when the backend
        // cannot provide a float data texture.
      }
      if (ctUsable() && m_sphIdxGpuPrim.isValid()) {
        // Deferred coordinate upload (see plan section 3.9): runs at most once
        // per frame, inside the rAF tick, right before the draw.
        if (ctIsDirty()) {
          if (!updateCoordTex()) {
            // Topology changed under us: fall back to a full rebuild.
            invalidateDisplayCache();
            return;
          }
        }
        preRender(pdc);
        m_sphIdxGpuPrim.draw(pdc);
        postRender(pdc);
        return;
      }
      if (ctNothingToDraw()) return;
    }

    // shader rendering mode (non-texture fallback)
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
  m_sphIdxGpuPrim.invalidate();
  ctInvalidate();
}

void CPK2Renderer::unloading()
{
  m_sphGpuPrim.invalidate();
  m_sphIdxGpuPrim.invalidate();
  ctInvalidate();
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

  // Layout pass: which atoms get a texel, and in what order.
  ctBegin();
  {
    AtomIterator iter(pMol, getSelection());
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      ctAddAtom(aid);
    }
  }

  // Creates the texture and fills it with the current positions. False means
  // either nothing is selected or the backend has no float textures; both are
  // recorded in the mixin and read back by display().
  if (!ctAlloc(pdc, pMol))
    return;

  const int nsphs = ctAtomCount();

  // initialize the coloring scheme
  getColSchm()->start(pMol, this);
  pMol->getColSchm()->start(pMol, this);

  m_sphIdxGpuPrim.alloc(pdc, nsphs);

  // Per-atom vertex data. Positions are not here: they live in the texture,
  // which is the whole point -- moving the atoms re-sends only that.
  for (int i = 0; i < nsphs; ++i) {
    const int aid = ctAtomIDAt(i);
    MolAtomPtr pAtom = pMol->getAtom(aid);
    if (pAtom.isnull()) continue;

    quint32 devcode = ColSchmHolder::getColor(pAtom)->getDevCode(getSceneID());
    // The texel index is the enumeration order i itself (see plan section 3.4).
    m_sphIdxGpuPrim.setData(i, i, static_cast<float>(getVdWRadius(pAtom)), devcode,
                            gfx::encodeHitName(aid));
  }

  // finalize the coloring scheme
  getColSchm()->end();
  pMol->getColSchm()->end();

  LOG_DPRINTLN("CPK2Renderer> rendered sphere atoms=%d", nsphs);
}

//////////////////////
// Coordinate texture (direct update) implementation

void CPK2Renderer::renderCoordTexImpl(DisplayContext *pdc)
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("CPK2Renderer::renderCoordTex> Client mol is null");
    return;
  }

  // Layout pass: which atoms get a texel, and in what order.
  ctBegin();
  {
    AtomIterator iter(pMol, getSelection());
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      ctAddAtom(aid);
    }
  }

  // Creates the texture and fills it with the current positions. False means
  // either nothing was selected or the backend has no float textures; the two
  // are told apart by ctNothingToDraw(), which display() reads.
  if (!ctAlloc(pdc, pMol))
    return;

  const int nsphs = ctAtomCount();

  // initialize the coloring scheme
  getColSchm()->start(pMol, this);
  pMol->getColSchm()->start(pMol, this);

  m_sphIdxGpuPrim.alloc(pdc, nsphs);

  // Per-atom vertex data. Positions are not among it: they are in the texture,
  // which is the point -- when the atoms move only that is sent again.
  for (int i = 0; i < nsphs; ++i) {
    const int aid = ctAtomIDAt(i);
    MolAtomPtr pAtom = pMol->getAtom(aid);
    if (pAtom.isnull()) continue; // ignore errors

    quint32 devcode = ColSchmHolder::getColor(pAtom)->getDevCode(getSceneID());
    // The texel index is the enumeration order i itself (see plan section 3.4).
    m_sphIdxGpuPrim.setData(i, i, static_cast<float>(getVdWRadius(pAtom)), devcode,
                            gfx::encodeHitName(aid));
  }

  // finalize the coloring scheme
  getColSchm()->end();
  pMol->getColSchm()->end();

  m_sphIdxGpuPrim.setCoordTex(ctTexture(), 0);

  LOG_DPRINTLN("CPK2Renderer> rendered sphere atoms=%d (coord texture)", nsphs);
}

// Re-gather atom positions into the coordinate texture.
// Only positions are touched; the VBO (index/radius/colour) stays as is.
bool CPK2Renderer::updateCoordTex()
{
  return ctUpdate(getClientMol());
}

void CPK2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {
    // Positions changed but topology/colour did not. Mark the coordinate
    // texture dirty and let display() do the upload: this runs inside the
    // rAF tick, has a DisplayContext, and coalesces repeated writes in one
    // task (e.g. drag preview) into a single upload per frame.
    // "Nothing to draw" is handled here too: moving atoms cannot make an empty
    // selection non-empty, so falling through to the base class -- which
    // invalidates on any OBE_CHANGED -- would put the rebuild loop back for the
    // duration of the playback.
    if (ctUsable() && (m_sphIdxGpuPrim.isValid() || ctNothingToDraw())) {
      ctMarkDirty();
      qsys::ScenePtr pScene = getScene();
      if (!pScene.isnull()) pScene->setUpdateFlag();
      invalidateHittestCache();
      return;
    }
  }
  super_t::objectChanged(ev);
}

