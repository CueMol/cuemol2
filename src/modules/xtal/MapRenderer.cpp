// -*-Mode: C++;-*-
//
// superclass of density-map renderers
//
// $Id: MapRenderer.cpp,v 1.5 2011/01/08 18:28:29 rishitani Exp $

#include <common.h>

#include "MapRenderer.hpp"
#include "DensityMap.hpp"
#include "MapLod.hpp"

#include <qlib/EventManager.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/View.hpp>
#include <gfx/SolidColor.hpp>

#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

using namespace xtal;
using qlib::Matrix3D;
using qlib::Matrix4D;
using qsys::ScalarObject;
using molstr::AtomIterator;

// default constructor
MapRenderer::MapRenderer()
     : super_t()
{
  //m_pcolor = gfx::SolidColor::createRGB(0.0, 0.0, 1.0);
  //m_dSigLevel = 1.1;
  //m_dMapRange = 15.0;

  m_bUseMolBndry = false;
  m_bBndryBBox = false;
  m_bUseAbsLev = false;
  m_nRegionMode = REGION_AUTO;

  m_nLod = LOD_AUTO;
  m_nLodBudget = 16;
  m_bZoomRefine = true;
  m_bViewBoxValid = false;
  m_dViewHalf = 0.0;
  m_bCurRegionValid = false;
  m_nCurStep = 1;
  for (int i=0; i<3; ++i)
    m_nCurLo[i] = m_nCurHi[i] = 0;

  m_pGrad = qsys::MultiGradientPtr(MB_NEW qsys::MultiGradient());
  super_t::setupParentData("multi_grad");
}

// destructor
MapRenderer::~MapRenderer()
{
  // a pending view-region timer must not fire on a destroyed renderer
  qlib::EventManager::getInstance()->removeTimer(this);
}

void MapRenderer::unloading()
{
  qlib::EventManager::getInstance()->removeTimer(this);
  super_t::unloading();
}

bool MapRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  ScalarObject *ptest = dynamic_cast<ScalarObject *>(pobj.get());
  return ptest!=NULL;
}

LString MapRenderer::toString() const
{
  return LString::format("MapRenderer %p", this);
}

double MapRenderer::getMaxLevel() const
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  if (!(sig > 0.0))
    return 0.0;  // uniform map: no sigma scale
  return pMap->getMaxDensity()/sig;
}

double MapRenderer::getMinLevel() const
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  if (!(sig > 0.0))
    return 0.0;  // uniform map: no sigma scale
  return pMap->getMinDensity()/sig;
}

double MapRenderer::getLevel() const
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  return m_dSigLevel * sig;
}

void MapRenderer::setLevel(double value)
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  if (!(sig > 0.0)) {
    setSigLevel(0.0);  // uniform map: no sigma scale
    return;
  }
  setSigLevel(value/sig);
}

///////////////////////////////////////////////////
// Display region policy / periodic boundary

int MapRenderer::getEffectiveRegionMode() const
{
  if (m_nRegionMode != REGION_AUTO)
    return m_nRegionMode;

  const DensityMap *pXtal = dynamic_cast<const DensityMap *>(getScalarObj());
  if (pXtal != NULL &&
      pXtal->getEffectiveMapType() == DensityMap::MAPTYPE_EM)
    return REGION_FULL;

  return REGION_BOX;
}

LString MapRenderer::getRegionModeResolvedStr() const
{
  return (getEffectiveRegionMode() == REGION_FULL) ? LString("full")
                                                   : LString("box");
}

LString MapRenderer::getMapTypeResolvedStr() const
{
  const DensityMap *pXtal = dynamic_cast<const DensityMap *>(getScalarObj());
  if (pXtal == NULL)
    return LString();

  return pXtal->getMapTypeResolvedStr();
}

bool MapRenderer::isPBCEligible(const ScalarObject *pMap, bool bSpansCell) const
{
  const DensityMap *pXtal = dynamic_cast<const DensityMap *>(pMap);
  if (pXtal == NULL)
    return false;
  if (!isUsePBC())
    return false;
  if (!pXtal->isPeriodic())
    return false;
  if (!bSpansCell)
    return false;
  if (getEffectiveRegionMode() == REGION_FULL)
    return false;
  return true;
}

///////////////////////////////////////////////////
// View-driven region (full region mode)

bool MapRenderer::worldBoxToGrid(ScalarObject *pMap,
                                 const Vector4D &vmin, const Vector4D &vmax,
                                 int lo[3], int hi[3]) const
{
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  // inverse of the object xform (world --> map orthogonal coordinates)
  const Matrix4D &xfm = pMap->getXformMatrix();
  const bool bXfm = !xfm.isIdent();
  Matrix3D rmat;
  Vector4D tr;
  if (bXfm) {
    rmat = xfm.getMatrix3D();
    rmat = rmat.invert();
    tr = xfm.getTransPart();
  }

  const Vector4D vorig = pMap->getOrigin();

  // grid-index bounding box of the eight corners (the cell may be skewed)
  Vector4D gmin, gmax;
  for (int i=0; i<8; ++i) {
    Vector4D p((i&1) ? vmax.x() : vmin.x(),
               (i&2) ? vmax.y() : vmin.y(),
               (i&4) ? vmax.z() : vmin.z());
    if (bXfm) {
      p -= tr;
      p = rmat.mulvec(p);
    }
    p -= vorig;
    if (pXtal!=NULL) {
      pXtal->getXtalInfo().orthToFrac(p);
      p.x() *= pXtal->getColInterval();
      p.y() *= pXtal->getRowInterval();
      p.z() *= pXtal->getSecInterval();
    }
    else {
      p.x() /= pMap->getColGridSize();
      p.y() /= pMap->getRowGridSize();
      p.z() /= pMap->getSecGridSize();
    }
    if (i==0) {
      gmin = p;
      gmax = p;
    }
    else {
      gmin.x() = qlib::min(gmin.x(), p.x());
      gmin.y() = qlib::min(gmin.y(), p.y());
      gmin.z() = qlib::min(gmin.z(), p.z());
      gmax.x() = qlib::max(gmax.x(), p.x());
      gmax.y() = qlib::max(gmax.y(), p.y());
      gmax.z() = qlib::max(gmax.z(), p.z());
    }
  }

  const int st[3] = {pMap->getStartCol(), pMap->getStartRow(), pMap->getStartSec()};
  const int n[3] = {pMap->getColNo(), pMap->getRowNo(), pMap->getSecNo()};
  const double dmin[3] = {gmin.x(), gmin.y(), gmin.z()};
  const double dmax[3] = {gmax.x(), gmax.y(), gmax.z()};

  // The fractional conversion goes through the numerically inverted cell
  // matrix, so a box edge sitting on a node comes back as 2.9999999 or
  // 3.0000001; snap within a small tolerance before rounding outward.
  const double eps = 1.0e-4;
  for (int a=0; a<3; ++a) {
    lo[a] = qlib::max(int(floor(dmin[a] + eps)), st[a]);
    hi[a] = qlib::min(int(ceil(dmax[a] - eps)), st[a]+n[a]-1);
    if (lo[a]>hi[a])
      return false;
  }
  return true;
}

void MapRenderer::computeFullRegion(ScalarObject *pMap, int lo[3], int hi[3],
                                    int &step) const
{
  const int st[3] = {pMap->getStartCol(), pMap->getStartRow(), pMap->getStartSec()};
  const int n[3] = {pMap->getColNo(), pMap->getRowNo(), pMap->getSecNo()};
  for (int a=0; a<3; ++a) {
    lo[a] = st[a];
    hi[a] = st[a]+n[a]-1;
  }

  // Clip to the padded view box. A view box that misses the block
  // altogether falls back to the whole block: the coarse whole map keeps
  // the user oriented, and there is nothing better to show.
  if (m_bZoomRefine && m_bViewBoxValid) {
    const double h = m_dViewHalf * VIEW_REGION_PAD;
    const Vector4D d(h, h, h);
    int vlo[3], vhi[3];
    if (worldBoxToGrid(pMap, m_vViewCenter - d, m_vViewCenter + d, vlo, vhi)) {
      for (int a=0; a<3; ++a) {
        lo[a] = qlib::max(lo[a], vlo[a]);
        hi[a] = qlib::min(hi[a], vhi[a]);
      }
    }
  }

  // Clip to the molecule boundary box: the boundary masks every cell
  // outside it, so displaying them only wastes budget.
  Vector4D bmin, bmax;
  if (getBndryBBox(bmin, bmax)) {
    int blo[3], bhi[3];
    if (worldBoxToGrid(pMap, bmin, bmax, blo, bhi)) {
      int tlo[3], thi[3];
      bool bEmpty = false;
      for (int a=0; a<3; ++a) {
        tlo[a] = qlib::max(lo[a], blo[a]);
        thi[a] = qlib::min(hi[a], bhi[a]);
        if (tlo[a]>thi[a])
          bEmpty = true;
      }
      if (!bEmpty) {
        for (int a=0; a<3; ++a) {
          lo[a] = tlo[a];
          hi[a] = thi[a];
        }
      }
    }
  }

  // Stride: explicit lod step, or the smallest power of two that keeps
  // the cell count of this region under the budget.
  step = m_nLod;
  if (step==LOD_AUTO) {
    const long long budget = (long long) m_nLodBudget << 20;
    step = lodStepForBudget(hi[0]-lo[0]+1, hi[1]-lo[1]+1, hi[2]-lo[2]+1, budget);
  }
  if (step<1)
    step = 1;
}

void MapRenderer::setViewBox(const Vector4D &cent, double half)
{
  m_vViewCenter = cent;
  m_dViewHalf = qlib::max(half, 0.0);
  m_bViewBoxValid = true;
}

void MapRenderer::setCurRegion(const int lo[3], const int hi[3], int step)
{
  for (int a=0; a<3; ++a) {
    m_nCurLo[a] = lo[a];
    m_nCurHi[a] = hi[a];
  }
  m_nCurStep = step;
  m_bCurRegionValid = true;
}

void MapRenderer::scheduleViewRegionUpdate()
{
  // One pending timer per listener: a burst of view events (wheel zoom,
  // drag) collapses into one update after the last event.
  qlib::EventManager::getInstance()->setTimerMilliSec(this, 150.0);
}

bool MapRenderer::onTimer(double t, qlib::time_value curr, bool bLast)
{
  if (!bLast)
    return true;
  updateViewRegion();
  return false;
}

bool MapRenderer::updateViewRegion()
{
  ScalarObject *pMap = getScalarObj();
  if (pMap==NULL)
    return false;
  if (getEffectiveRegionMode()!=REGION_FULL ||
      !m_bZoomRefine || !m_bViewBoxValid)
    return false;

  if (!m_bCurRegionValid) {
    invalidateGeomCache();
    return true;
  }

  // A finer stride fits the budget for the new view box: refine.
  int lo[3], hi[3], step;
  computeFullRegion(pMap, lo, hi, step);
  if (step < m_nCurStep) {
    invalidateGeomCache();
    return true;
  }

  // Otherwise the (unpadded) view box must still lie inside the displayed
  // region; the padding absorbs small pans. A coarser fresh stride alone
  // does not rebuild: the finer geometry on screen still covers the view.
  const Vector4D d(m_dViewHalf, m_dViewHalf, m_dViewHalf);
  int vlo[3], vhi[3];
  if (!worldBoxToGrid(pMap, m_vViewCenter - d, m_vViewCenter + d, vlo, vhi))
    return false;   // the view left the map: keep what is shown
  Vector4D bmin, bmax;
  if (getBndryBBox(bmin, bmax)) {
    // the displayed region is also clipped to the boundary box
    int blo[3], bhi[3];
    if (worldBoxToGrid(pMap, bmin, bmax, blo, bhi)) {
      for (int a=0; a<3; ++a) {
        vlo[a] = qlib::max(vlo[a], blo[a]);
        vhi[a] = qlib::min(vhi[a], bhi[a]);
      }
    }
  }
  for (int a=0; a<3; ++a) {
    if (vlo[a]>vhi[a])
      continue;
    if (vlo[a] < m_nCurLo[a] || vhi[a] > m_nCurHi[a]) {
      invalidateGeomCache();
      return true;
    }
  }
  return false;
}

void MapRenderer::handleFullModeViewEvent(qsys::ViewEvent &ev,
                                          bool bAutoUpdate, bool bDragUpdate)
{
  const int nType = ev.getType();
  if (nType!=qsys::ViewEvent::VWE_PROPCHG &&
      nType!=qsys::ViewEvent::VWE_PROPCHG_DRG &&
      nType!=qsys::ViewEvent::VWE_SIZECHG)
    return;

  qsys::View *pView = ev.getTargetPtr();
  if (pView==NULL)
    return;

  const LString descr = ev.getDescr();
  const bool bSize = (nType==qsys::ViewEvent::VWE_SIZECHG);
  const bool bCenter = !bSize && descr.equals("center");
  const bool bZoom = !bSize &&
      (descr.equals("zoom") || descr.equals("setCamera"));
  if (!bSize && !bCenter && !bZoom)
    return;
  if (nType==qsys::ViewEvent::VWE_PROPCHG_DRG && !bDragUpdate)
    return;

  const Vector4D c = pView->getViewCenter();
  if (bCenter && (bAutoUpdate || bDragUpdate)) {
    setCenterQuiet(c);
    setDefaultPropFlag("center", false);
  }

  if (!m_bZoomRefine)
    return;

  // Visible box: the zoom is the visible height (angstrom), the width
  // follows the aspect ratio; the depth is taken equal to the larger of
  // the two (the slab depth is usually far deeper than the map).
  const double zoom = pView->getZoom();
  const int w = pView->getWidth();
  const int h = pView->getHeight();
  const double aspect = (w>0 && h>0) ? double(w)/double(h) : 1.0;
  const double half = 0.5 * zoom * qlib::max(1.0, aspect);
  setViewBox(c, half);
  scheduleViewRegionUpdate();
}

void MapRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  // The map kind decides the effective region policy and the PBC
  // eligibility, so a map_type change of the client map is a geometry
  // change of every renderer on it.
  if (ev.getType() == qsys::ObjectEvent::OBE_PROPCHG &&
      ev.getTarget() == getClientObjID()) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE != NULL && pPE->getName().equals("map_type"))
      invalidateGeomCache();
  }

  super_t::objectChanged(ev);
}

///////////////////////////////////////////////////
// Mol boundary mode routines

void MapRenderer::setBndryMolName(const LString &s)
{
  if (s.equals(m_strBndryMol))
    return;
  m_strBndryMol = s;

  /// target mol is changed-->redraw map
  invalidateGeomCache();
}

void MapRenderer::setBndrySel(const SelectionPtr &pSel)
{
  ensureNotNull(pSel);
  
  if (!m_pSelBndry.isnull())
    if (m_pSelBndry->equals(pSel.get()))
      return;

  m_pSelBndry = pSel;
  //setupMolBndry();

  /// selection is changed-->redraw map
  invalidateGeomCache();
}

void MapRenderer::setBndryRng(double d)
{
  if (qlib::isNear4(d, m_dBndryRng))
    return;
  m_dBndryRng = d;
  if (m_dBndryRng<0.0)
    m_dBndryRng = 0.0;
  // setupMolBndry();

  if (m_bUseMolBndry)
    invalidateGeomCache();
}

void MapRenderer::setupMolBndry()
{
  m_boundary.clear();
  m_bUseMolBndry = false;
  m_bBndryBBox = false;

  if (m_strBndryMol.isEmpty())
    return;

  qsys::ObjectPtr pobj = ensureNotNull(getScene())->getObjectByName(m_strBndryMol);
  MolCoordPtr pMol = MolCoordPtr(pobj, qlib::no_throw_tag());

  if (pMol.isnull()) {
    m_strBndryMol = LString();
    return;
  }

  AtomIterator aiter(pMol, m_pSelBndry);
  int i, natoms=0;
  for (aiter.first();
       aiter.hasMore();
       aiter.next()) {
    ++natoms;
  }

  m_boundary.alloc(natoms);

  for (aiter.first(), i=0;
       aiter.hasMore() && i<natoms ;
       aiter.next(), ++i) {
    const Vector4D pos = aiter.get()->getPos();
    m_boundary.setAt(i, pos, aiter.getID());
    if (i==0) {
      m_vBndryMin = pos;
      m_vBndryMax = pos;
    }
    else {
      m_vBndryMin.x() = qlib::min(m_vBndryMin.x(), pos.x());
      m_vBndryMin.y() = qlib::min(m_vBndryMin.y(), pos.y());
      m_vBndryMin.z() = qlib::min(m_vBndryMin.z(), pos.z());
      m_vBndryMax.x() = qlib::max(m_vBndryMax.x(), pos.x());
      m_vBndryMax.y() = qlib::max(m_vBndryMax.y(), pos.y());
      m_vBndryMax.z() = qlib::max(m_vBndryMax.z(), pos.z());
    }
  }
  m_bBndryBBox = (natoms>0);

  m_boundary.build();
  m_bUseMolBndry = true;
}

qsys::ObjectPtr MapRenderer::getColorMapObj() const
{
  qsys::ObjectPtr pobj = ensureNotNull(getScene())->getObjectByName(getColorMapName());
  return pobj;
}

void MapRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("multi_grad") &&
      m_nMode==MAPREND_MULTIGRAD) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}


