// -*-Mode: C++;-*-
//
//  Ball & stick version of the backbone trace renderer
//

#include <common.h>
#include "molvis.hpp"

#include "TraceStickRenderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>

#include <gfx/DisplayContext.hpp>
#include <gfx/FloatDataTexture.hpp>
#include <qsys/Scene.hpp>

using namespace molvis;
using namespace molstr;

using gfx::DisplayContext;
using gfx::ColorPtr;

TraceStickRenderer::TraceStickRenderer()
{
  m_bUseShader = false;
  m_bCheckShaderOK = false;
  m_bCollecting = false;
  m_nDetailOld = 0;
}

TraceStickRenderer::~TraceStickRenderer()
{
}

const char *TraceStickRenderer::getTypeName() const
{
  return "tracestick";
}

//////////////////////////////////////////////////////////////////////////

void TraceStickRenderer::display(DisplayContext *pdc)
{
  if (pdc->isFile()) {
    // file (non-ogl) rendering always uses the display-list version
    super_t::display(pdc);
    return;
  }

  if (!m_bCheckShaderOK) {
    m_bUseShader = m_sphIdxGpuPrim.init(pdc) && m_cylIdxGpuPrim.init(pdc);
    if (!m_bUseShader) ctDisable();
    m_bCheckShaderOK = true;
  }

  if (ctUsable()) {
    // Nothing matched the selection last time: see CPK2Renderer::display.
    if (ctNothingToDraw()) return;

    if (!m_sphIdxGpuPrim.isValid() && !m_cylIdxGpuPrim.isValid()) {
      renderCoordTexImpl(pdc);
      // renderCoordTexImpl stops the mixin being usable if the backend cannot
      // provide a float data texture.
    }
    if (ctUsable()) {
      // Both radii zero: the layout is built but there is nothing to draw.
      if (!m_sphIdxGpuPrim.isValid() && !m_cylIdxGpuPrim.isValid()) return;
      if (ctIsDirty()) {
        if (!ctUpdate(getClientMol())) {
          invalidateDisplayCache();
          return;
        }
      }
      preRender(pdc);
      if (m_sphIdxGpuPrim.isValid()) m_sphIdxGpuPrim.draw(pdc);
      if (m_cylIdxGpuPrim.isValid()) m_cylIdxGpuPrim.draw(pdc);
      postRender(pdc);
      return;
    }
  }

  super_t::display(pdc);
}

void TraceStickRenderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
  m_sphIdxGpuPrim.invalidate();
  m_cylIdxGpuPrim.invalidate();
  ctInvalidate();
  clearTopology();
}

void TraceStickRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {
    // Positions changed but topology/colour did not. Mark the coordinate
    // texture dirty and let display() do the upload once per frame.
    if (ctUsable() && (m_sphIdxGpuPrim.isValid() || m_cylIdxGpuPrim.isValid() ||
                       ctNothingToDraw())) {
      ctMarkDirty();
      qsys::ScenePtr pScene = getScene();
      if (!pScene.isnull()) pScene->setUpdateFlag();
      invalidateHittestCache();
      return;
    }
  }
  super_t::objectChanged(ev);
}

void TraceStickRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("bondw") ||
      ev.getName().equals("sphr") ||
      ev.getName().equals("detail")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring") ||
           ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void TraceStickRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void TraceStickRenderer::postRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

//////////////////////////////////////////////////////////////////////////
// MainChainRenderer interface
//  In collect mode only the topology is recorded; otherwise the spheres and
//  cylinders are drawn through the DisplayContext (display list / file).

void TraceStickRenderer::beginRend(DisplayContext *pdl)
{
  m_pPrevRes = MolResiduePtr();
  if (m_bCollecting) return;

  m_nDetailOld = pdl->getDetail();
  pdl->setDetail(m_nDetail);
}

void TraceStickRenderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  m_pPrevRes = MolResiduePtr();
}

void TraceStickRenderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
  MolAtomPtr pAtom = getPivotAtom(pRes);
  if (pAtom.isnull()) return;
  MolResiduePtr pPrevRes = m_pPrevRes;
  m_pPrevRes = pRes;
  MolAtomPtr pPrevAtom;
  if (!pPrevRes.isnull())
    pPrevAtom = getPivotAtom(pPrevRes);

  const int aid = pAtom->getID();
  ColorPtr pcol = ColSchmHolder::getColor(pRes);

  if (m_bCollecting) {
    ctAddAtom(aid);
    m_pivots.push_back(aid);
    m_aidColor[aid] = pcol;
    if (!pPrevAtom.isnull())
      m_sticks.push_back(std::make_pair(pPrevAtom->getID(), aid));
    return;
  }

  const Vector4D pos = pAtom->getPos();
  if (m_sphr > 0.0) {
    pdl->loadName(aid);
    pdl->color(pcol);
    pdl->sphere(m_sphr, pos);
  }

  if (pPrevAtom.isnull() || m_bondw <= 0.0) return;

  const int prev_aid = pPrevAtom->getID();
  const Vector4D prev_pos = pPrevAtom->getPos();
  ColorPtr prev_col = ColSchmHolder::getColor(pPrevRes);

  if (prev_col->equals(*pcol.get())) {
    pdl->loadName(aid);
    pdl->color(pcol);
    pdl->cylinder(m_bondw, prev_pos, pos);
  }
  else {
    const Vector4D mpos = (prev_pos + pos).divide(2.0);
    pdl->loadName(prev_aid);
    pdl->color(prev_col);
    pdl->cylinder(m_bondw, prev_pos, mpos);
    pdl->loadName(aid);
    pdl->color(pcol);
    pdl->cylinder(m_bondw, mpos, pos);
  }
}

void TraceStickRenderer::endRend(DisplayContext *pdl)
{
  m_pPrevRes = MolResiduePtr();
  if (m_bCollecting) return;

  pdl->setDetail(m_nDetailOld);
}

//////////////////////////////////////////////////////////////////////////
// Topology collection

void TraceStickRenderer::clearTopology()
{
  m_pivots.clear();
  m_sticks.clear();
  m_aidColor.clear();
}

void TraceStickRenderer::collectTopology()
{
  clearTopology();
  ctBegin();

  // render() starts/ends the coloring scheme itself, so getColor() is valid
  // inside the collect callbacks. No DisplayContext call is made in collect
  // mode.
  m_bCollecting = true;
  render(nullptr);
  m_bCollecting = false;
}

//////////////////////////////////////////////////////////////////////////
// Coordinate texture (direct update) implementation

void TraceStickRenderer::renderCoordTexImpl(DisplayContext *pdc)
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return;

  collectTopology();

  const int natoms = ctAtomCount();
  // Allocates the coordinate texture (one texel per pivot atom) and fills it
  // with the current positions. With no atoms this records that there is
  // nothing to draw, so display() stops asking.
  if (!ctAlloc(pdc, pMol)) return;

  const qlib::uid_t nSceneID = getSceneID();

  // Balls: one sphere per pivot atom
  if (m_sphr > 0.0) {
    m_sphIdxGpuPrim.alloc(pdc, natoms);
    for (int i = 0; i < natoms; ++i) {
      const int aid = ctAtomIDAt(i);
      m_sphIdxGpuPrim.setData(i, i, static_cast<float>(m_sphr),
                              m_aidColor[aid]->getDevCode(nSceneID),
                              gfx::encodeHitName(aid));
    }
    m_sphIdxGpuPrim.setCoordTex(ctTexture(), 0);
  }

  // Sticks: same colour -> 1 cylinder, different -> 2 halves split at t=0.5
  int ncyls = 0;
  if (m_bondw > 0.0) {
    for (const auto &s : m_sticks) {
      if (m_aidColor[s.first]->equals(*m_aidColor[s.second].get())) ++ncyls;
      else ncyls += 2;
    }
  }

  if (ncyls > 0) {
    m_cylIdxGpuPrim.alloc(pdc, ncyls);
    const float bw = static_cast<float>(m_bondw);
    int i = 0;
    for (const auto &s : m_sticks) {
      const int i1 = ctIndexOf(s.first);
      const int i2 = ctIndexOf(s.second);
      const ColorPtr &c1 = m_aidColor[s.first];
      const ColorPtr &c2 = m_aidColor[s.second];
      const quint32 dc1 = c1->getDevCode(nSceneID);
      const quint32 n1 = gfx::encodeHitName(s.first);
      const quint32 n2 = gfx::encodeHitName(s.second);
      if (c1->equals(*c2.get())) {
        // Full stick: the pick pass splits it at the midpoint (n1 | n2).
        m_cylIdxGpuPrim.setData(i++, i1, i2, 0.0f, 1.0f, bw, dc1, n1, n2);
      }
      else {
        m_cylIdxGpuPrim.setData(i++, i1, i2, 0.0f, 0.5f, bw, dc1, n1, n1);
        m_cylIdxGpuPrim.setData(i++, i1, i2, 0.5f, 1.0f, bw,
                                c2->getDevCode(nSceneID), n2, n2);
      }
    }
    m_cylIdxGpuPrim.setCoordTex(ctTexture(), 0);
  }

  LOG_DPRINTLN("TraceStickRenderer> rendered %d spheres, %d cylinders (coord texture)",
               m_sphIdxGpuPrim.isValid() ? natoms : 0, ncyls);
}
