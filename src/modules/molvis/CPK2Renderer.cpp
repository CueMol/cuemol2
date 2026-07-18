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

namespace {
// Fixed coordinate texture width (matches TEX2D_WIDTH in lib_atoms.glsl).
constexpr int TEX2D_WIDTH = 1024;
}  // namespace

CPK2Renderer::CPK2Renderer()
{
    m_bUseShader = false;
    m_bCheckShaderOK = false;
    m_nGlRendMode = REND_DEFAULT;
    m_pCoordTex = nullptr;
    m_nTexW = 0;
    m_nTexH = 0;
    m_bUseCoordTex = false;
    m_bCoordDirty = false;
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
    // Try the coordinate texture path; falls back silently when unavailable.
    m_bUseCoordTex = m_bUseShader && m_sphIdxGpuPrim.init(pdc);
    m_bCheckShaderOK = true;
  }

  if (m_bUseShader &&
      (m_nGlRendMode==REND_DEFAULT ||
       m_nGlRendMode==REND_SHADER)) {
    if (m_bUseCoordTex) {
      if (!m_sphIdxGpuPrim.isValid()) {
        renderCoordTexImpl(pdc);
        // renderCoordTexImpl clears m_bUseCoordTex when the backend
        // cannot provide a float data texture.
      }
      if (m_bUseCoordTex && m_sphIdxGpuPrim.isValid()) {
        // Deferred coordinate upload (see plan section 3.9): runs at most once
        // per frame, inside the rAF tick, right before the draw.
        if (m_bCoordDirty) {
          if (!updateCoordTex()) {
            // Topology changed under us: fall back to a full rebuild.
            invalidateDisplayCache();
            return;
          }
          m_bCoordDirty = false;
        }
        preRender(pdc);
        m_sphIdxGpuPrim.draw(pdc);
        postRender(pdc);
        return;
      }
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
  if (m_pCoordTex != nullptr) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
  }
  m_aidcache.clear();
  m_coordbuf.clear();
  m_bCoordDirty = false;
}

void CPK2Renderer::unloading()
{
  m_sphGpuPrim.invalidate();
  m_sphIdxGpuPrim.invalidate();
  if (m_pCoordTex != nullptr) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
  }
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

//////////////////////
// Coordinate texture (direct update) implementation

void CPK2Renderer::renderCoordTexImpl(DisplayContext *pdc)
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("CPK2Renderer::renderCoordTex> Client mol is null");
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

  // allocate the coordinate texture (RGB32F, one texel per atom, width 1024)
  m_nTexW = TEX2D_WIDTH;
  m_nTexH = (nsphs + TEX2D_WIDTH - 1) / TEX2D_WIDTH;
  m_coordbuf.resize(static_cast<size_t>(m_nTexW) * m_nTexH * 3);
  m_aidcache.resize(nsphs);

  m_pCoordTex = pdc->createFloatDataTexture();
  if (m_pCoordTex == nullptr) {
    // backend does not support float data textures; fall back
    m_bUseCoordTex = false;
    m_aidcache.clear();
    m_coordbuf.clear();
    return;
  }
  if (!m_pCoordTex->create(m_nTexW, m_nTexH, 3)) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
    m_bUseCoordTex = false;
    m_aidcache.clear();
    m_coordbuf.clear();
    return;
  }

  // initialize the coloring scheme
  getColSchm()->start(pMol, this);
  pMol->getColSchm()->start(pMol, this);

  m_sphIdxGpuPrim.alloc(pdc, nsphs);

  {
    AtomIterator iter(pMol, getSelection());
    int i=0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors

      m_aidcache[i] = aid;
      const qlib::Vector4D pos = pAtom->getPos();
      m_coordbuf[i*3+0] = static_cast<qfloat32>(pos.x());
      m_coordbuf[i*3+1] = static_cast<qfloat32>(pos.y());
      m_coordbuf[i*3+2] = static_cast<qfloat32>(pos.z());

      quint32 devcode = ColSchmHolder::getColor(pAtom)->getDevCode(getSceneID());
      // The texel index is the enumeration order i itself (see plan section 3.4).
      m_sphIdxGpuPrim.setData(i, i, static_cast<float>(getVdWRadius(pAtom)), devcode);
      ++i;
    }
  }

  // finalize the coloring scheme
  getColSchm()->end();
  pMol->getColSchm()->end();

  m_pCoordTex->update(&m_coordbuf[0]);
  m_sphIdxGpuPrim.setCoordTex(m_pCoordTex, 0);
  m_bCoordDirty = false;

  LOG_DPRINTLN("CPK2Renderer> rendered sphere atoms=%d (coord texture %dx%d)",
               nsphs, m_nTexW, m_nTexH);
}

// Re-gather atom positions into the coordinate texture.
// Only positions are touched; the VBO (index/radius/colour) stays as is.
bool CPK2Renderer::updateCoordTex()
{
  if (!m_bUseCoordTex || m_pCoordTex == nullptr) return false;
  if (m_aidcache.empty()) return false;

  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return false;

  const int nsphs = static_cast<int>(m_aidcache.size());
  for (int i = 0; i < nsphs; ++i) {
    MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
    if (pAtom.isnull()) return false;   // topology changed; force rebuild
    const qlib::Vector4D pos = pAtom->getPos();
    m_coordbuf[i * 3 + 0] = static_cast<qfloat32>(pos.x());
    m_coordbuf[i * 3 + 1] = static_cast<qfloat32>(pos.y());
    m_coordbuf[i * 3 + 2] = static_cast<qfloat32>(pos.z());
  }
  m_pCoordTex->update(&m_coordbuf[0]);
  return true;
}

void CPK2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {
    // Positions changed but topology/colour did not. Mark the coordinate
    // texture dirty and let display() do the upload: this runs inside the
    // rAF tick, has a DisplayContext, and coalesces repeated writes in one
    // task (e.g. drag preview) into a single upload per frame.
    if (m_bUseCoordTex && m_sphIdxGpuPrim.isValid()) {
      m_bCoordDirty = true;
      qsys::ScenePtr pScene = getScene();
      if (!pScene.isnull()) pScene->setUpdateFlag();
      invalidateHittestCache();
      return;
    }
  }
  super_t::objectChanged(ev);
}

