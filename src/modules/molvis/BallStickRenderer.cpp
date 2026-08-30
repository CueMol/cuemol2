// -*-Mode: C++;-*-
//
//  Ball & Stick model renderer class
//
//  $Id: BallStickRenderer.cpp,v 1.15 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "BallStickRenderer.hpp"

#include <vector>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResiToppar.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/BondIterator.hpp>

#include <gfx/GpuPrim.hpp>
#include <gfx/FloatDataTexture.hpp>
#include <qsys/Scene.hpp>

using namespace molvis;
using namespace molstr;

using gfx::DisplayContext;
using gfx::ColorPtr;

namespace {
// Fixed coordinate texture width (matches TEX2D_WIDTH in lib_atoms.glsl).
constexpr int TEX2D_WIDTH = 1024;
}  // namespace

BallStickRenderer::BallStickRenderer()
{
  m_bUseShader = false;
  m_bCheckShaderOK = false;
  m_bDrawRingOnly = false;
  m_pSphGpuPrim = MB_NEW gfx::SphereGpuPrim();
  m_pCylGpuPrim = MB_NEW gfx::CylinderGpuPrim();
  m_nVBMode = VBMODE_OFF;

  m_bUseCoordTex = false;
  m_bCoordDirty = false;
  m_pCoordTex = nullptr;
  m_nTexW = 0;
  m_nTexH = 0;
}

BallStickRenderer::~BallStickRenderer()
{
  MB_DPRINTLN("BallStickRenderer destructed %p", this);
  delete m_pSphGpuPrim;
  delete m_pCylGpuPrim;
  if (m_pCoordTex != nullptr)
    delete m_pCoordTex;
}

const char *BallStickRenderer::getTypeName() const
{
  return "ballstick";
}

void BallStickRenderer::display(DisplayContext *pdc)
{
  if (pdc->isFile() || m_nVBMode!=VBMODE_OFF) {
    // case of the file (non-ogl) rendering
    // always use the old version.
    super_t::display(pdc);
    return;
  }

  //////////

  if (!m_bCheckShaderOK) {
    if (m_pSphGpuPrim->init(pdc) &&
        m_pCylGpuPrim->init(pdc)) {
      MB_DPRINTLN("BallStick sphere shader OK");
      m_bUseShader = true;
    }
    else {
      m_bUseShader = false;
    }

    // Try the coordinate texture path; falls back silently when unavailable.
    m_bUseCoordTex = m_bUseShader &&
                     m_sphIdxGpuPrim.init(pdc) && m_cylIdxGpuPrim.init(pdc);

    m_bCheckShaderOK = true;
  }

  //////////

  if (m_bUseShader &&
      (m_nGlRendMode==REND_DEFAULT ||
       m_nGlRendMode==REND_SHADER)) {

    // Coordinate texture (direct update) path. Rings are drawn via the legacy
    // display list, so only take this path when rings are off.
    if (m_bUseCoordTex && !m_fRing) {
      if (!m_sphIdxGpuPrim.isValid()) {
        renderCoordTexImpl(pdc);
        // renderCoordTexImpl clears m_bUseCoordTex when the backend cannot
        // provide a float data texture.
      }
      if (m_bUseCoordTex && m_sphIdxGpuPrim.isValid()) {
        if (m_bCoordDirty) {
          if (!updateCoordTex()) {
            invalidateDisplayCache();
            return;
          }
          m_bCoordDirty = false;
        }
        preRender(pdc);
        m_sphIdxGpuPrim.draw(pdc);
        m_cylIdxGpuPrim.draw(pdc);
        postRender(pdc);
        return;
      }
    }

    if (m_fRing) {
      // only draw rings using old displist version
      MB_DPRINTLN("Ballstick ring render");
      m_bDrawRingOnly = true;
      super_t::display(pdc);
      m_bDrawRingOnly = false;
    }

    // shader rendering mode (non-texture)
    if (!m_pSphGpuPrim->isValid()) {
      renderShaderImpl(pdc);
      if (!m_pSphGpuPrim->isValid())
        return; // Error, Cannot draw anything (ignore)
    }

    MB_DPRINTLN("Ballstick shader render");
    preRender(pdc);
    m_pSphGpuPrim->draw(pdc);
    m_pCylGpuPrim->draw(pdc);
    postRender(pdc);

  }
  else {
    // old version (uses DisplayContext::sphere)
    super_t::display(pdc);
  }
}

void BallStickRenderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();

  if (m_bUseShader) {
    m_pSphGpuPrim->invalidate();
    m_pCylGpuPrim->invalidate();
  }

  m_sphIdxGpuPrim.invalidate();
  m_cylIdxGpuPrim.invalidate();
  if (m_pCoordTex != nullptr) {
    delete m_pCoordTex;
    m_pCoordTex = nullptr;
  }
  m_aidcache.clear();
  m_aid2idx.clear();
  m_coordbuf.clear();
  m_bCoordDirty = false;
}

void BallStickRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("atomsMoved")) {
    // Positions changed but topology/colour did not. Mark the coordinate
    // texture dirty and let display() do the upload once per frame.
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

////////////

void BallStickRenderer::preRender(DisplayContext *pdc)
{
  MB_DPRINTLN("BallStickRenderer::preRender setLit TRUE");
  pdc->setLighting(true);
}

void BallStickRenderer::postRender(DisplayContext *pdc)
{
  MB_DPRINTLN("BallStickRenderer::postRender setLit FALSE");
  pdc->setLighting(false);
}

void BallStickRenderer::beginRend(DisplayContext *pdl)
{
  if (m_atoms.size()>0)
    m_atoms.clear(); //erase(m_atoms.begin(), m_atoms.end());

  m_nDetailOld = pdl->getDetail();
  setupDetail(pdl, m_nDetail);
}

void BallStickRenderer::endRend(DisplayContext *pdl)
{
  if ( m_fRing && !qlib::isNear4(m_tickness, 0.0) ) {
    drawRings(pdl);
    if (m_atoms.size()>0)
      m_atoms.clear(); //erase(m_atoms.begin(), m_atoms.end());
  }

  pdl->setDetail(m_nDetailOld);
  return;
}

bool BallStickRenderer::isRendBond() const
{
  if (m_bDrawRingOnly)
    return false;

  return true;
}

void BallStickRenderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  checkRing(pAtom->getID());

  if (m_bDrawRingOnly)
    return;

  if (m_sphr>0.0) {
    pdl->color(ColSchmHolder::getColor(pAtom));
    pdl->sphere(m_sphr, pAtom->getPos());
  }
}

void BallStickRenderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
  if (m_bDrawRingOnly)
    return;

  if (m_bondw>0.0) {
    if (m_nVBMode==VBMODE_TYPE1)
      drawVBondType1(pAtom1, pAtom2, pMB, pdl);
    else
      drawInterAtomLine(pAtom1, pAtom2, pdl);
  }
}

void BallStickRenderer::drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
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

void BallStickRenderer::drawVBondType1(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                                       MolBond *pMB, DisplayContext *pdl)
{
  if (pAtom1.isnull() || pAtom2.isnull()) return;

  int nBondType = pMB->getType();

  if (!(nBondType==MolBond::DOUBLE ||
        nBondType==MolBond::TRIPLE)) {
    drawInterAtomLine(pAtom1, pAtom2, pdl);
    return;
  }

  const Vector4D pos1 = pAtom1->getPos();
  const Vector4D pos2 = pAtom2->getPos();

  MolCoordPtr pMol = getClientMol();
  Vector4D dvd = pMB->getDblBondDir(pMol);
  Vector4D dv = (pos2-pos1).normalize();

  ColorPtr pcol1 = ColSchmHolder::getColor(pAtom1);
  ColorPtr pcol2 = ColSchmHolder::getColor(pAtom2);

  const double vbscl1 = m_bondw * 2.5;
  const double vbscl2 = m_sphr * 2.0;

  const Vector4D del1 = dv.scale(vbscl2) + dvd.scale(vbscl1);
  const Vector4D del2 = dv.scale(-vbscl2) + dvd.scale(vbscl1);

  if ( pcol1->equals(*pcol2.get()) ) {
    // single-color bond
    pdl->color(pcol1);
    pdl->cylinder(m_bondw, pos1, pos2);

    pdl->cylinder(m_bondw, pos1+del1, pos2+del2);
    pdl->sphere(m_bondw, pos1+del1);
    pdl->sphere(m_bondw, pos2+del2);
  }
  else {
    // double-color bond
    const Vector4D mpos = (pos1 + pos2).divide(2.0);
    const Vector4D mpos2 = mpos+ dvd.scale(vbscl1);
    pdl->color(pcol1);
    pdl->cylinder(m_bondw, pos1, mpos);
    pdl->cylinder(m_bondw, pos1+del1, mpos2);
    pdl->sphere(m_bondw, pos1+del1);

    pdl->color(pcol2);
    pdl->cylinder(m_bondw, pos2, mpos);
    pdl->cylinder(m_bondw, pos2+del2, mpos2);
    pdl->sphere(m_bondw, pos2+del2);
  }
}

////////////////////////////////////////////////
// Ring plate drawing

void BallStickRenderer::drawRings(DisplayContext *pdl)
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
        if (maid<0) {
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
        if (maid<0)
          continue;

        std::set<int>::iterator miter = m_atoms.find(maid);
        if (miter==m_atoms.end())
          continue;

        m_atoms.erase(miter);
      }
    }
  }

}

void BallStickRenderer::drawRingImpl(const std::list<int> atoms, DisplayContext *pdl)
{
  MolCoordPtr pMol = getClientMol();

  double len;
  int i, nsize = atoms.size();
  if (nsize<3) return;
  std::vector<Vector4D> pvecs(nsize);
  Vector4D cen;
  std::list<int>::const_iterator iter = atoms.begin();
  std::list<int>::const_iterator eiter = atoms.end();
  MolAtomPtr pPivAtom, pAtom;
  for (i=0; iter!=eiter; ++iter, i++) {
    pAtom = pMol->getAtom(*iter);
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
}

void BallStickRenderer::propChanged(qlib::LPropEvent &ev)
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

void BallStickRenderer::renderShaderImpl(DisplayContext *pdc)
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("BallStickRenderer::render> Client mol is null");
    return;
  }

  // initialize the coloring scheme
  getColSchm()->start(pMol, this);
  pMol->getColSchm()->start(pMol, this);

  const qlib::uid_t nSceneID = getSceneID();

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
    m_pSphGpuPrim->alloc(pdc, nsphs);

    AtomIterator iter(pMol, getSelection());
    int i=0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors

      quint32 devcode = ColSchmHolder::getColor(pAtom)->getDevCode(nSceneID);
      m_pSphGpuPrim->setData(i, pAtom->getPos(), (float)m_sphr, devcode);
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
    m_pCylGpuPrim->alloc(pdc, nbons);

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
        m_pCylGpuPrim->setData(i, pos1, pos2, (float)m_bondw, pcol1->getDevCode(nSceneID));
        ++i;
      }
      else {
        // different color --> two bonds
        const Vector4D mpos = (pos1 + pos2).divide(2.0);
        m_pCylGpuPrim->setData(i, pos1, mpos, (float)m_bondw, pcol1->getDevCode(nSceneID));
        ++i;
        m_pCylGpuPrim->setData(i, mpos, pos2, (float)m_bondw, pcol2->getDevCode(nSceneID));
        ++i;
      }

    }
  } // if (nbons!=0)


  // finalize the coloring scheme
  getColSchm()->end();
  pMol->getColSchm()->end();
}

//////////////////////
// Coordinate texture (direct update) implementation

void BallStickRenderer::renderCoordTexImpl(DisplayContext *pdc)
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("BallStickRenderer::renderCoordTex> Client mol is null");
    return;
  }

  getColSchm()->start(pMol, this);
  pMol->getColSchm()->start(pMol, this);
  const qlib::uid_t nSceneID = getSceneID();

  // Build the atom texel layout + AID -> index map.
  m_aidcache.clear();
  m_aid2idx.clear();
  {
    AtomIterator iter(pMol, getSelection());
    int i = 0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      int aid = iter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue;
      m_aidcache.push_back(aid);
      m_aid2idx[aid] = i;
      ++i;
    }
  }
  const int natoms = static_cast<int>(m_aidcache.size());
  if (natoms == 0) {
    getColSchm()->end();
    pMol->getColSchm()->end();
    return;
  }

  // Count cylinders: same colour -> 1, different -> 2 halves.
  int nbons = 0;
  {
    BondIterator biter(pMol, getSelection());
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      if (m_aid2idx.find(pMB->getAtom1()) == m_aid2idx.end() ||
          m_aid2idx.find(pMB->getAtom2()) == m_aid2idx.end())
        continue;
      MolAtomPtr pA1 = pMol->getAtom(pMB->getAtom1());
      MolAtomPtr pA2 = pMol->getAtom(pMB->getAtom2());
      if (pA1.isnull() || pA2.isnull()) continue;
      ColorPtr c1 = ColSchmHolder::getColor(pA1);
      ColorPtr c2 = ColSchmHolder::getColor(pA2);
      if (c1->equals(*c2.get())) ++nbons;
      else nbons += 2;
    }
  }

  // Allocate the shared coordinate texture.
  m_nTexW = TEX2D_WIDTH;
  m_nTexH = (natoms + TEX2D_WIDTH - 1) / TEX2D_WIDTH;
  m_coordbuf.resize(static_cast<size_t>(m_nTexW) * m_nTexH * 3);

  m_pCoordTex = pdc->createFloatDataTexture();
  if (m_pCoordTex == nullptr ||
      !m_pCoordTex->create(m_nTexW, m_nTexH, 3)) {
    if (m_pCoordTex != nullptr) { delete m_pCoordTex; m_pCoordTex = nullptr; }
    m_bUseCoordTex = false;
    m_aidcache.clear();
    m_aid2idx.clear();
    m_coordbuf.clear();
    getColSchm()->end();
    pMol->getColSchm()->end();
    return;
  }

  // Write atom positions.
  for (int i = 0; i < natoms; ++i) {
    MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
    const qlib::Vector4D pos = pAtom->getPos();
    m_coordbuf[i * 3 + 0] = static_cast<qfloat32>(pos.x());
    m_coordbuf[i * 3 + 1] = static_cast<qfloat32>(pos.y());
    m_coordbuf[i * 3 + 2] = static_cast<qfloat32>(pos.z());
  }

  // Balls: one sphere per atom (texel index = enumeration order).
  m_sphIdxGpuPrim.alloc(pdc, natoms);
  for (int i = 0; i < natoms; ++i) {
    MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
    quint32 devcode = ColSchmHolder::getColor(pAtom)->getDevCode(nSceneID);
    m_sphIdxGpuPrim.setData(i, i, static_cast<float>(m_sphr), devcode);
  }
  m_sphIdxGpuPrim.setCoordTex(m_pCoordTex, 0);

  // Sticks: one cylinder per bond, bicolour split at the midpoint (t=0.5).
  if (nbons != 0) {
    m_cylIdxGpuPrim.alloc(pdc, nbons);
    BondIterator biter(pMol, getSelection());
    int i = 0;
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      auto it1 = m_aid2idx.find(pMB->getAtom1());
      auto it2 = m_aid2idx.find(pMB->getAtom2());
      if (it1 == m_aid2idx.end() || it2 == m_aid2idx.end()) continue;
      MolAtomPtr pA1 = pMol->getAtom(pMB->getAtom1());
      MolAtomPtr pA2 = pMol->getAtom(pMB->getAtom2());
      if (pA1.isnull() || pA2.isnull()) continue;

      ColorPtr c1 = ColSchmHolder::getColor(pA1);
      ColorPtr c2 = ColSchmHolder::getColor(pA2);
      const quint32 dc1 = c1->getDevCode(nSceneID);
      const quint32 dc2 = c2->getDevCode(nSceneID);
      const int i1 = it1->second, i2 = it2->second;
      const float bw = static_cast<float>(m_bondw);

      if (c1->equals(*c2.get())) {
        m_cylIdxGpuPrim.setData(i++, i1, i2, 0.0f, 1.0f, bw, dc1);
      } else {
        m_cylIdxGpuPrim.setData(i++, i1, i2, 0.0f, 0.5f, bw, dc1);
        m_cylIdxGpuPrim.setData(i++, i1, i2, 0.5f, 1.0f, bw, dc2);
      }
    }
    m_cylIdxGpuPrim.setCoordTex(m_pCoordTex, 0);
  }

  getColSchm()->end();
  pMol->getColSchm()->end();

  m_pCoordTex->update(&m_coordbuf[0]);
  m_bCoordDirty = false;

  LOG_DPRINTLN("BallStickRenderer> rendered %d atoms, %d bonds (coord texture %dx%d)",
               natoms, nbons, m_nTexW, m_nTexH);
}

bool BallStickRenderer::updateCoordTex()
{
  if (!m_bUseCoordTex || m_pCoordTex == nullptr) return false;
  if (m_aidcache.empty()) return false;

  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return false;

  const int natoms = static_cast<int>(m_aidcache.size());
  for (int i = 0; i < natoms; ++i) {
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
