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
#include <gfx/FloatDataTexture.hpp>
#include <qsys/Scene.hpp>

using namespace molstr;

namespace {
// Fixed coordinate texture width (matches TEX2D_WIDTH in lib_atoms.glsl).
constexpr int TEX2D_WIDTH = 1024;
}  // namespace

TraceRenderer::TraceRenderer()
{
  //m_bUseVBO = true;
  m_bUseVBO = false;
  // m_pVBO = NULL;

  m_bUseShader = false;
  m_bCheckShaderOK = false;
  m_pCoordTex = nullptr;
  m_nTexW = 0;
  m_nTexH = 0;
  m_bUseCoordTex = false;
  m_bCoordDirty = false;

  m_bCollecting = false;
  m_bHavePrev = false;
  m_prevAid = -1;
  m_curSegFirstAid = -1;
  m_curSegCount = 0;
}

TraceRenderer::~TraceRenderer()
{
  if (m_pCoordTex != nullptr) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
  }
}

const char *TraceRenderer::getTypeName() const
{
  return "trace";
}

//////////////////////////////////////////////////////////////////////////
// coordinate texture path (direct update)

void TraceRenderer::display(DisplayContext *pdc)
{
  if (pdc->isFile()) {
    super_t::display(pdc);
    return;
  }

  if (!m_bCheckShaderOK) {
    m_bUseShader = m_lineIdxGpuPrim.init(pdc);
    m_bUseCoordTex = m_bUseShader;
    m_bCheckShaderOK = true;
  }

  if (m_bUseCoordTex) {
    if (!m_lineIdxGpuPrim.isValid()) {
      renderCoordTexImpl(pdc);
      // renderCoordTexImpl clears m_bUseCoordTex if the backend cannot
      // provide a float data texture.
    }
    if (m_bUseCoordTex && m_lineIdxGpuPrim.isValid()) {
      if (m_bCoordDirty) {
        if (!updateCoordTex()) {
          invalidateDisplayCache();
          return;
        }
        m_bCoordDirty = false;
      }
      preRender(pdc);
      m_lineIdxGpuPrim.setLineWidth(static_cast<float>(m_lw) * pdc->getPixSclFac());
      m_lineIdxGpuPrim.draw(pdc);
      postRender(pdc);
      return;
    }
  }

  super_t::display(pdc);
}

void TraceRenderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
  m_lineIdxGpuPrim.invalidate();
  if (m_pCoordTex != nullptr) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
  }
  m_aidcache.clear();
  m_aid2idx.clear();
  m_aidColor.clear();
  m_traceBonds.clear();
  m_traceIso.clear();
  m_coordbuf.clear();
  m_bCoordDirty = false;
}

void TraceRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {
    if (m_bUseCoordTex && m_lineIdxGpuPrim.isValid()) {
      m_bCoordDirty = true;
      qsys::ScenePtr pScene = getScene();
      if (!pScene.isnull()) pScene->setUpdateFlag();
      invalidateHittestCache();
      return;
    }
  }
  super_t::objectChanged(ev);
}

void TraceRenderer::renderCoordTexImpl(DisplayContext *pdc)
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return;

  // Gather the trace topology by running the mainchain traversal in collect
  // mode. render() starts/ends the coloring scheme itself, so getColor() is
  // valid inside the collect callbacks; do not start it again here.
  m_aidcache.clear();
  m_aid2idx.clear();
  m_aidColor.clear();
  m_traceBonds.clear();
  m_traceIso.clear();

  m_bCollecting = true;
  render(pdc);
  m_bCollecting = false;

  const int natoms = static_cast<int>(m_aidcache.size());
  if (natoms == 0) return;

  const int nbonds = static_cast<int>(m_traceBonds.size());
  const int niso = static_cast<int>(m_traceIso.size());
  const int nlines = nbonds + 3 * niso;
  if (nlines == 0) return;

  // Allocate the coordinate texture (RGB32F, one texel per pivot atom).
  m_nTexW = TEX2D_WIDTH;
  m_nTexH = (natoms + TEX2D_WIDTH - 1) / TEX2D_WIDTH;
  m_coordbuf.resize(static_cast<size_t>(m_nTexW) * m_nTexH * 3);

  m_pCoordTex = pdc->createFloatDataTexture();
  if (m_pCoordTex == nullptr) {
    m_bUseCoordTex = false;
    m_aidcache.clear();
    m_aid2idx.clear();
    m_coordbuf.clear();
    return;
  }
  if (!m_pCoordTex->create(m_nTexW, m_nTexH, 3)) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
    m_bUseCoordTex = false;
    m_aidcache.clear();
    m_aid2idx.clear();
    m_coordbuf.clear();
    return;
  }

  // Write pivot positions into the staging buffer.
  for (int i = 0; i < natoms; ++i) {
    MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
    const Vector4D pos = pAtom->getPos();
    m_coordbuf[i * 3 + 0] = static_cast<qfloat32>(pos.x());
    m_coordbuf[i * 3 + 1] = static_cast<qfloat32>(pos.y());
    m_coordbuf[i * 3 + 2] = static_cast<qfloat32>(pos.z());
  }

  m_lineIdxGpuPrim.alloc(pdc, nlines);

  const Vector4D zero(0, 0, 0);
  int iline = 0;

  // Trace bonds: line between two pivot indices (per-residue colours).
  for (const auto &b : m_traceBonds) {
    auto it1 = m_aid2idx.find(b.first);
    auto it2 = m_aid2idx.find(b.second);
    if (it1 == m_aid2idx.end() || it2 == m_aid2idx.end()) continue;
    m_lineIdxGpuPrim.setData(iline++, it1->second, zero, m_aidColor[b.first],
                             it2->second, zero, m_aidColor[b.second]);
  }

  // Isolated residues: 3-axis aster (same index, +-axis offset, model space).
  const double rad = 0.25;
  const Vector4D xdel(rad, 0, 0), ydel(0, rad, 0), zdel(0, 0, rad);
  const Vector4D nxdel = xdel.scale(-1.0), nydel = ydel.scale(-1.0),
                 nzdel = zdel.scale(-1.0);
  for (int aid : m_traceIso) {
    auto it = m_aid2idx.find(aid);
    if (it == m_aid2idx.end()) continue;
    const int idx = it->second;
    const quint32 cc = m_aidColor[aid];
    m_lineIdxGpuPrim.setData(iline++, idx, nxdel, cc, idx, xdel, cc);
    m_lineIdxGpuPrim.setData(iline++, idx, nydel, cc, idx, ydel, cc);
    m_lineIdxGpuPrim.setData(iline++, idx, nzdel, cc, idx, zdel, cc);
  }

  m_pCoordTex->update(&m_coordbuf[0]);
  m_lineIdxGpuPrim.setCoordTex(m_pCoordTex, 0);
  m_bCoordDirty = false;

  LOG_DPRINTLN("TraceRenderer> rendered %d line segments (coord texture %dx%d)",
               nlines, m_nTexW, m_nTexH);
}

bool TraceRenderer::updateCoordTex()
{
  if (!m_bUseCoordTex || m_pCoordTex == nullptr) return false;
  if (m_aidcache.empty()) return false;

  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return false;

  const int natoms = static_cast<int>(m_aidcache.size());
  for (int i = 0; i < natoms; ++i) {
    MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
    if (pAtom.isnull()) return false;   // topology changed; force rebuild
    const Vector4D pos = pAtom->getPos();
    m_coordbuf[i * 3 + 0] = static_cast<qfloat32>(pos.x());
    m_coordbuf[i * 3 + 1] = static_cast<qfloat32>(pos.y());
    m_coordbuf[i * 3 + 2] = static_cast<qfloat32>(pos.z());
  }
  m_pCoordTex->update(&m_coordbuf[0]);
  return true;
}

/*
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
*/

void TraceRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

//////////

void TraceRenderer::beginRend(DisplayContext *pdl)
{
  if (m_bCollecting) return;

  if (!m_bUseVBO) {
    pdl->setLineWidth(m_lw);
    return;
  }

  // m_bPrevAidValid = false;
  // m_nVA = 0;
}

void TraceRenderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  if (m_bCollecting) {
    m_bHavePrev = false;
    m_curSegCount = 0;
    m_curSegFirstAid = -1;
    return;
  }

  if (!m_bUseVBO) {
    pdl->startLineStrip();
    return;
  }

  // m_bPrevAidValid = false;
  // m_nBonds = 0;
}

void TraceRenderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
  MolAtomPtr pAtom1 = getPivotAtom(pRes);

  if (m_bCollecting) {
    if (pAtom1.isnull()) return;
    const int aid = pAtom1->getID();
    const quint32 cc = ColSchmHolder::getColor(pRes)->getDevCode(getSceneID());
    if (m_aid2idx.find(aid) == m_aid2idx.end()) {
      m_aid2idx[aid] = static_cast<int>(m_aidcache.size());
      m_aidcache.push_back(aid);
    }
    m_aidColor[aid] = cc;
    if (m_bHavePrev) {
      m_traceBonds.push_back(std::make_pair(m_prevAid, aid));
    } else {
      m_curSegFirstAid = aid;
      m_bHavePrev = true;
    }
    m_prevAid = aid;
    ++m_curSegCount;
    return;
  }

  if (!m_bUseVBO) {
    Vector4D curpt = pAtom1->getPos();
    pdl->color(ColSchmHolder::getColor(pRes));
    pdl->vertex(curpt);
    return;
  }
  /*
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
  if (m_bCollecting) {
    // A segment with a single residue produced no bond: draw it as an aster.
    if (m_curSegCount == 1 && m_curSegFirstAid >= 0)
      m_traceIso.push_back(m_curSegFirstAid);
    return;
  }

  if (!m_bUseVBO) {
    pdl->end();
    return;
  }

  // // VBO implementation
  // if (m_nBonds>0) {
  //   m_nVA += m_nBonds * 2;
  // }
  // else if (m_bPrevAidValid) {
  //   // isolated segment
  //   m_nVA += 3*2;
  //   m_atoms.push_back(m_nPrevAid);
  // }

}

void TraceRenderer::endRend(DisplayContext *pdl)
{
  if (m_bCollecting) return;

  if (!m_bUseVBO) {
    pdl->setLineWidth(1.0f);
    return;
  }
  /*
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
