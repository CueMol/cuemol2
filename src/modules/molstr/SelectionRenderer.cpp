// -*-Mode: C++;-*-
//
//    Molecular selection renderer (stick model)
//
// $Id: SelectionRenderer.cpp,v 1.14 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>
#include "SelectionRenderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "ResiToppar.hpp"
#include "BondIterator.hpp"
#include "AtomIterator.hpp"

#include "SelCommand.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/FloatDataTexture.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

#include <set>

using namespace molstr;

using qlib::Vector4D;
using gfx::ColorPtr;

SelectionRenderer::SelectionRenderer()
{
  m_nMode = MODE_STICK;
  m_pSel = molstr::SelectionPtr(MB_NEW molstr::SelCommand(LString("!*")));

  m_bUseShader = false;
  m_bCheckShaderOK = false;
}

SelectionRenderer::~SelectionRenderer() {}

const char *SelectionRenderer::getTypeName() const
{
  return "*selection";
}

SelectionPtr SelectionRenderer::getSelection() const
{
  MolCoordPtr pClient = qlib::ensureNotNull( getClientMol() );
  // MB_ASSERT(!pClient.isnull());
  SelectionPtr psel = pClient->getSelection();
  if (psel.isnull())
    return m_pSel;
  if (psel->toString().isEmpty())
    return m_pSel;
  return psel;
}

void SelectionRenderer::propChanged(qlib::LPropEvent &ev)
{
  super_t::propChanged(ev);

  if (ev.getTarget()==this) {
    if (ev.getName().equals("mode") ||
        ev.getName().equals("linew") ||
        ev.getName().equals("dispx") ||
        ev.getName().equals("dispy") ||
        ev.getName().equals("color")
        ) {
      invalidateDisplayCache();
      return;
    }
  }

  /*qlib::LPropSupport *pmol = getClientMol().get();
  if (ev.getTarget()==pmol) {
    if (ev.getName().equals("sel")) {
      invalidateDisplayCache();
    }
  }*/
}

//////////////////////////////////////////////////////////////////////////
// selection drawing

static void drawSelInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                                 DisplayContext *pdl)
{
  if (pAtom1.isnull() || pAtom2.isnull()) return;

  pdl->vertex(pAtom1->getPos());
  pdl->vertex(pAtom2->getPos());
}

static void drawSelAtom(MolAtomPtr pAtom, DisplayContext *pdl)
{
  pdl->drawAster(pAtom->getPos(), 0.25);
}

bool SelectionRenderer::isRendBond() const
{
  if (m_nMode==0)
    return true;
  else
    return false;
}

//////////////////////////////////////////////////////////////////////////
// coordinate texture path (direct update)

void SelectionRenderer::display(DisplayContext *pdc)
{
  // File output or point mode: use the legacy display-list path.
  if (pdc->isFile() || m_nMode != MODE_STICK) {
    super_t::display(pdc);
    return;
  }

  if (!m_bCheckShaderOK) {
    m_bUseShader = m_lineIdxGpuPrim.init(pdc);
    if (!m_bUseShader) ctDisable();
    m_bCheckShaderOK = true;
  }

  if (ctUsable()) {
    // Nothing is selected, and nothing was selected when this was last built.
    // Rebuilding would walk every atom of the molecule evaluating the
    // selection and produce no geometry, and it would do that on every frame
    // for as long as the selection stayed empty -- which is the normal state
    // of a molecule nobody has selected anything in. The legacy path below is
    // skipped for the same reason.
    if (ctNothingToDraw()) return;

    if (!m_lineIdxGpuPrim.isValid()) {
      renderCoordTexImpl(pdc);
      // renderCoordTexImpl stops the mixin being usable if the backend cannot
      // provide a float data texture.
    }
    if (ctUsable() && m_lineIdxGpuPrim.isValid()) {
      // Deferred coordinate upload: at most once per frame, inside the rAF
      // tick, right before the draw.
      if (ctIsDirty()) {
        if (!updateCoordTex()) {
          // Topology changed under us: fall back to a full rebuild.
          invalidateDisplayCache();
          return;
        }
      }
      preRender(pdc);
      m_lineIdxGpuPrim.setLineWidth(static_cast<float>(m_linew) * pdc->getPixSclFac());
      m_lineIdxGpuPrim.draw(pdc);
      postRender(pdc);
      return;
    }
    if (ctNothingToDraw()) return;
  }

  // Shader/texture not available: legacy rendering.
  super_t::display(pdc);
}

void SelectionRenderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();
  m_lineIdxGpuPrim.invalidate();
  ctInvalidate();
}

void SelectionRenderer::renderCoordTexImpl(DisplayContext *pdc)
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return;

  // Build the atom texel layout (all selected atoms).
  ctBegin();
  {
    AtomIterator aiter(pMol, getSelection());
    for (aiter.first(); aiter.hasMore(); aiter.next()) {
      int aid = aiter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue;
      ctAddAtom(aid);
    }
  }
  const int natoms = ctAtomCount();
  if (natoms == 0) {
    // Records that there is nothing to draw, which is what stops display()
    // asking again on every frame while the selection stays empty.
    ctAlloc(pdc, pMol);
    return;
  }

  // Count line segments: bonds (1 each) + isolated atoms (3-axis aster).
  int nlines = 0;
  std::set<int> bonded;
  {
    BondIterator biter(pMol, getSelection());
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      int aid1 = pMB->getAtom1();
      int aid2 = pMB->getAtom2();
      if (ctIndexOf(aid1) < 0 || ctIndexOf(aid2) < 0) continue;
      bonded.insert(aid1);
      bonded.insert(aid2);
      ++nlines;
    }
  }
  std::vector<int> iso_atoms;
  for (int i = 0; i < natoms; ++i) {
    const int aid = ctAtomIDAt(i);
    if (bonded.find(aid) == bonded.end()) {
      iso_atoms.push_back(aid);
      nlines += 3;
    }
  }
  if (nlines == 0) return;

  // Creates the texture and fills it with the current positions.
  if (!ctAlloc(pdc, pMol)) return;

  m_lineIdxGpuPrim.alloc(pdc, nlines);

  const quint32 cc = m_color->getDevCode(getSceneID());
  const Vector4D zero(0, 0, 0);
  int iline = 0;

  // Bonds: a single line between the two atom indices (no offset).
  {
    BondIterator biter(pMol, getSelection());
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      const int i1 = ctIndexOf(pMB->getAtom1());
      const int i2 = ctIndexOf(pMB->getAtom2());
      if (i1 < 0 || i2 < 0) continue;
      m_lineIdxGpuPrim.setData(iline++, i1, zero, cc, i2, zero, cc);
    }
  }

  // Isolated atoms: 3-axis aster (same index, +-axis offset, model space).
  const double rad = 0.25;
  const Vector4D xdel(rad, 0, 0), ydel(0, rad, 0), zdel(0, 0, rad);
  const Vector4D nxdel = xdel.scale(-1.0), nydel = ydel.scale(-1.0),
                 nzdel = zdel.scale(-1.0);
  for (int aid : iso_atoms) {
    const int idx = ctIndexOf(aid);
    m_lineIdxGpuPrim.setData(iline++, idx, nxdel, cc, idx, xdel, cc);
    m_lineIdxGpuPrim.setData(iline++, idx, nydel, cc, idx, ydel, cc);
    m_lineIdxGpuPrim.setData(iline++, idx, nzdel, cc, idx, zdel, cc);
  }

  m_lineIdxGpuPrim.setCoordTex(ctTexture(), 0);

  LOG_DPRINTLN("SelectionRenderer> rendered %d line segments (coord texture)", nlines);
}

bool SelectionRenderer::updateCoordTex()
{
  return ctUpdate(getClientMol());
}

void SelectionRenderer::beginRend(DisplayContext *pdl)
{
  if (m_nMode==0) {
    pdl->startLines();
  }
  else {
    pdl->setPointSize(m_linew);
    pdl->startPoints();
  }

  pdl->color(m_color);
}

void SelectionRenderer::endRend(DisplayContext *pdl)
{
  if (m_nMode==0) {
    pdl->end();
    pdl->setLineWidth(1.0);
  }
  else {
    pdl->end();
    pdl->setPointSize(1.0);
  }
}

void SelectionRenderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded)
{
  if (m_nMode==0) {
    if (!fbonded)
      drawSelAtom(pAtom, pdl);
  }
  else {
    pdl->vertex(pAtom->getPos());
    //Vector4D pos = pAtom->getPos();
    //pdl->drawPixels(pos, m_boximg, *(m_color.get()));
  }
}

void SelectionRenderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
  if (m_nMode==0) {
    drawSelInterAtomLine(pAtom1, pAtom2, pdl);
  }
  else {
  }
}

void SelectionRenderer::preRender(DisplayContext *pdc)
{
  Vector4D dv;

  double delx = m_dispx, dely = m_dispy;
  if (m_nMode!=0) {
    delx -= m_linew/2.0;
    dely += m_linew/2.0;
  }
  qsys::View *pview = pdc->getTargetView();
  if (pview!=NULL) {
    pview->convXYTrans(delx, dely, dv);
    Vector4D dz;
    pview->convZTrans(delx, dz);
    dv -= dz;
  }

  pdc->setLineWidth(m_linew);
  pdc->pushMatrix();
  pdc->translate(dv);
  pdc->setLighting(false);
}

void SelectionRenderer::postRender(DisplayContext *pdc)
{
  pdc->popMatrix();
  pdc->setLineWidth(1.0);
}

void SelectionRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {
    // Positions changed but topology/selection did not. Mark the coordinate
    // texture dirty and let display() do the upload (once per frame, inside
    // the rAF tick). No hittest cache here (SelectionRenderer has none).
    if (ctUsable() && (m_lineIdxGpuPrim.isValid() || ctNothingToDraw())) {
      ctMarkDirty();
      qsys::ScenePtr pScene = getScene();
      if (!pScene.isnull()) pScene->setUpdateFlag();
      return;
    }
  }

  if (ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
    if (ev.getDescr().equals("sel")) {
      invalidateDisplayCache();
      //return;
    }
  }

  super_t::objectChanged(ev);
}

bool SelectionRenderer::isTransp() const
{
/*
  if (m_nMode==MODE_STICK &&
      m_color.fa()<1.0)
    return true;
  else
    return false;
  */
  return true;
}

