// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

// #define SHOW_NORMAL

#include "MapSurfRenderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "MapLod.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/MarchingCubes.hpp>
#include <gfx/Mesh.hpp>
#include <qlib/parallel.hpp>
#include <qlib/EventManager.hpp>

#include <unordered_map>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/AtomPosMap2.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/MolCoord.hpp>

using namespace xtal;
namespace mct = gfx::mctables;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;
using qsys::SceneManager;
using molstr::AtomIterator;
using molstr::MolAtomPtr;

// default constructor
MapSurfRenderer::MapSurfRenderer()
     : super_t()
{
  m_bPBC = false;
  m_bAutoUpdate = true;
  m_bDragUpdate = false;
  m_nDrawMode = MSRDRAW_FILL;
  m_lw = 1.2;
  m_pCMap = NULL;

  m_nTgtMolID = qlib::invalid_uid;
  m_pAtomPosMap = NULL;

  m_nBinFac = 1;
  m_nMaxGrid = 100;
  m_nLod = LOD_AUTO;
  m_nLodBudget = 16;
  m_nStep = 1;
  m_bCapDisplay = false;

  m_bZoomRefine = true;
  m_bViewBoxValid = false;
  m_dViewHalf = 0.0;
  m_bCurRegionValid = false;
  m_nCurStep = 1;
  for (int i=0; i<3; ++i)
    m_nCurLo[i] = m_nCurHi[i] = 0;

  m_bGenSurfMode = false;

  m_bMeshCacheValid = false;
  m_bAidValid = false;
  m_bColorDirty = false;

  m_bCheckShaderOK = false;
  m_bUseShader = false;
}

// destructor
MapSurfRenderer::~MapSurfRenderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
  qlib::EventManager::getInstance()->removeTimer(this);

  if (m_pAtomPosMap!=NULL)
    delete m_pAtomPosMap;

  // detach from the coloring target mol
  if (m_nTgtMolID!=qlib::invalid_uid) {
    qsys::ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
    if (!pObj.isnull()) {
      pObj->removeListener(this);
    }
    m_nTgtMolID = qlib::invalid_uid;
  }
}

/////////////////////////////////

const char *MapSurfRenderer::getTypeName() const
{
  return "isosurf";
}

void MapSurfRenderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid!=qlib::invalid_uid) {
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->addViewListener(nid, this);
  }
}

qlib::uid_t MapSurfRenderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  

void MapSurfRenderer::viewChanged(qsys::ViewEvent &ev)
{
  const int nType = ev.getType();

  if (nType!=qsys::ViewEvent::VWE_PROPCHG &&
      nType!=qsys::ViewEvent::VWE_PROPCHG_DRG &&
      nType!=qsys::ViewEvent::VWE_SIZECHG)
    return;

  qsys::View *pView = ev.getTargetPtr();
  if (pView==NULL)
    return;

  if (getEffectiveRegionMode()==REGION_FULL) {
    // Full region mode: the center follows the view without a rebuild
    // (it only matters for a later switch to box mode), and the visible
    // box feeds the debounced region refinement; updateViewRegion()
    // decides whether the box left the marched region or allows a finer
    // stride, so a pan or wheel burst costs at most one rebuild.
    const LString descr = ev.getDescr();
    const bool bSize = (nType==qsys::ViewEvent::VWE_SIZECHG);
    const bool bCenter = !bSize && descr.equals("center");
    const bool bZoom = !bSize &&
        (descr.equals("zoom") || descr.equals("setCamera"));
    if (!bSize && !bCenter && !bZoom)
      return;
    if (nType==qsys::ViewEvent::VWE_PROPCHG_DRG && !m_bDragUpdate)
      return;

    const Vector4D c = pView->getViewCenter();
    if (bCenter && (m_bAutoUpdate || m_bDragUpdate)) {
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
    return;
  }

  // Box region mode: the historical center following (a center change is
  // a geometry change of the center +- extent box).
  if (nType==qsys::ViewEvent::VWE_SIZECHG)
    return;

  if (!m_bAutoUpdate && !m_bDragUpdate)
    return;

  if (!ev.getDescr().equals("center"))
    return;

  Vector4D c = pView->getViewCenter();

  if (m_bDragUpdate) {
    if (nType==qsys::ViewEvent::VWE_PROPCHG ||
        nType==qsys::ViewEvent::VWE_PROPCHG_DRG) {
      setCenter(c);
      setDefaultPropFlag("center", false);
    }
    return;
  }

  if (m_bAutoUpdate) {
    if (nType==qsys::ViewEvent::VWE_PROPCHG) {
      setCenter(c);
      setDefaultPropFlag("center", false);
    }
    return;
  }
  
  return;
}

void MapSurfRenderer::setMaxGrids(int n)
{
  if (m_nMaxGrid == n)
    return;
  m_nMaxGrid = n;
  // the max extent clamps the box range, so this is a geometry change
  invalidateGeomCache();

  /*
  if (getClientObj().isnull())
    return; // not initialized (-> don't get maxext/change the extent)
  
  // shrink the extent, if the extent exceeds maxext.
  double dmax = getMaxExtent();
  double dext = getExtent();
  if (dmax<dext) {
    setExtent(dmax);
  }
   */
}

double MapSurfRenderer::getMaxExtent() const
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double grdsz = 1.0;

  if (pMap!=NULL)
    grdsz = qlib::min(pMap->getColGridSize(),
                      qlib::min(pMap->getRowGridSize(),
                                pMap->getSecGridSize()));

  return m_nMaxGrid * pMap->getColGridSize() / 2.0;
}

///////////////////////////////////////////////////////////////

void MapSurfRenderer::preRender(DisplayContext *pdc)
{
  pdc->color(getColor());

  if (m_nDrawMode==MSRDRAW_POINT) {
    pdc->setLighting(false);
    pdc->setPolygonMode(gfx::DisplayContext::POLY_POINT);
    pdc->setPointSize(m_lw);
  }
  else if (m_nDrawMode==MSRDRAW_LINE) {
    pdc->setLighting(false);
    pdc->setPolygonMode(gfx::DisplayContext::POLY_LINE);
    pdc->setLineWidth(m_lw);
  }
  else {
    pdc->setLighting(true);
    //pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    // Ridge line generates dot noise on the surface (but this may be bug of marching cubes implementation...)
    pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
  }
  
  if (getEdgeLineType()==gfx::DisplayContext::ELT_NONE) {
    pdc->setCullFace(m_bCullFace);
  }
  else {
    // edge/silhouette line is ON
    //   --> always don't draw backface (cull backface=true) for edge rendering
    pdc->setCullFace(true);
  }
}

void MapSurfRenderer::postRender(DisplayContext *pdc)
{
  // reset to default drawing options
  pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  pdc->setPointSize(1.0);
  pdc->setLineWidth(1.0);
  pdc->setCullFace(true);
  pdc->setLighting(false);
}

void MapSurfRenderer::setupXformMat(DisplayContext *pdl)
{
  ScalarObject *pMap = m_pCMap;
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  const Matrix4D &xfm = pMap->getXformMatrix();
  if (!xfm.isIdent()) {
    pdl->multMatrix(xfm);
  }

  // map origin (MRC ORIGIN for DensityMap; zero for crystallographic maps)
  {
    const Vector4D vorig = pMap->getOrigin();
    if (pXtal==NULL || !vorig.isZero3D())
      pdl->translate(vorig);
  }

  //  setup frac-->orth matrix
  if (pXtal!=NULL) {
    Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
    pdl->multMatrix(Matrix4D(orthmat));
  }

#ifdef DBG_DRAW_AXIS
  pdl->startLines();
  // pdl->color(1,1,0);
  pdl->vertex(0,0,0);
  pdl->vertex(1,0,0);
  pdl->vertex(0,0,0);
  pdl->vertex(0,1,0);
  pdl->vertex(0,0,0);
  pdl->vertex(0,0,1);
  pdl->end();
#endif

  {  
    Vector4D vtmp;
    if (pXtal!=NULL)
      vtmp = Vector4D(1.0/double(pXtal->getColInterval()),
                      1.0/double(pXtal->getRowInterval()),
                      1.0/double(pXtal->getSecInterval()));
    else
      vtmp = Vector4D(pMap->getColGridSize(),
                      pMap->getRowGridSize(),
                      pMap->getSecGridSize());

    pdl->scale(vtmp);

    vtmp = Vector4D(m_nStCol, m_nStRow, m_nStSec);
    pdl->translate(vtmp);
  }
}

// generate display list
void MapSurfRenderer::render(DisplayContext *pdl)
{
  ScalarObject *pMap = getScalarObj();
  m_pCMap = pMap;

  // The mol boundary and the map range are only recomputed when the mesh
  // is rebuilt: the cached vertices are in cell-grid coordinates relative
  // to the range start (setupXformMat translates by it), so a color-only
  // display-list rebuild must keep the range the cache was built with. In
  // full region mode the view box may have moved inside the hysteresis
  // margin since, and recomputing the range here would shift the surface.
  if (!m_bMeshCacheValid) {
    setupMolBndry();
    makerange();
  }

  pdl->pushMatrix();
  setupXformMat(pdl);

  MB_DPRINTLN("MapSurfRenderer Rendereing...");

  // Bake the base color into the display list. The cache builds the list by
  // calling render() on the recording context, while preRender()'s color() is
  // applied to the outer context only; without this the recorded vertices keep
  // the display list's default gray. In non-simple color modes setVertexColor()
  // overrides this per vertex.
  pdl->color(getColor());

  pdl->startTriangles();
  renderImpl(pdl);
  pdl->end();

#ifdef SHOW_NORMAL
  pdl->startLines();
  BOOST_FOREACH (const Vector4D &elem, m_tmpv) {
    pdl->vertex(elem);
  }
  pdl->end();
  m_tmpv.clear();
#endif
  
  MB_DPRINTLN("MapSurfRenderer Rendereing OK\n");

  pdl->popMatrix();
  m_pCMap = NULL;
}

void MapSurfRenderer::makerange()
{
  Vector4D cent = getCenter();
  double extent = getExtent();
  if (extent>getMaxExtent())
    extent = getMaxExtent();

  ScalarObject *pMap = m_pCMap; //static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
  if (pMap==NULL)
    return;

  // Box region mode (the historical center +- extent cube) unless the
  // effective region policy is full.
  m_bCapDisplay = false;
  if (getEffectiveRegionMode()==REGION_FULL) {
    makerangeFull(pMap);
    return;
  }

  // Marching stride: the explicit lod step, or the binning factor in auto
  // mode (the cell budget only applies to the full region mode).
  m_nStep = (m_nLod==LOD_AUTO) ? m_nBinFac : m_nLod;
  if (m_nStep<1)
    m_nStep = 1;

  //
  // col,row,sec
  //

  const Matrix4D &xfm = pMap->getXformMatrix();
  if (!xfm.isIdent()) {
    // apply inv of xformMat
    Matrix3D rmat = xfm.getMatrix3D();
    rmat = rmat.invert();
    Vector4D tr = xfm.getTransPart();
    cent -= tr;
    cent = rmat.mulvec(cent);
  }

  Vector4D vmin(cent.x()-extent, cent.y()-extent, cent.z()-extent);
  Vector4D vmax(cent.x()+extent, cent.y()+extent, cent.z()+extent);

  // get origin / translate the origin to (0,0,0)
  vmin -= pMap->getOrigin();
  vmax -= pMap->getOrigin();

  if (pXtal!=NULL) {
    const CrystalInfo &xt = pXtal->getXtalInfo();
    xt.orthToFrac(vmin);
    xt.orthToFrac(vmax);

    // check PBC (the stored block must span the whole cell)
    const double dimx = pMap->getColGridSize()*pMap->getColNo();
    const double dimy = pMap->getRowGridSize()*pMap->getRowNo();
    const double dimz = pMap->getSecGridSize()*pMap->getSecNo();
    const double cea = xt.a();
    const double ceb = xt.b();
    const double cec = xt.c();
    const bool bSpansCell = qlib::isNear4(dimx, cea) &&
                            qlib::isNear4(dimy, ceb) &&
                            qlib::isNear4(dimz, cec);
    m_bPBC = isPBCEligible(pXtal, bSpansCell);
  }
  else {
    m_bPBC = false;
  }

  if (pXtal!=NULL) {
    vmin.x() *= pXtal->getColInterval();
    vmin.y() *= pXtal->getRowInterval();
    vmin.z() *= pXtal->getSecInterval();
    vmax.x() *= pXtal->getColInterval();
    vmax.y() *= pXtal->getRowInterval();
    vmax.z() *= pXtal->getSecInterval();
  }
  else {
    vmin.x() /= pMap->getColGridSize();
    vmin.y() /= pMap->getRowGridSize();
    vmin.z() /= pMap->getSecGridSize();
    vmax.x() /= pMap->getColGridSize();
    vmax.y() /= pMap->getRowGridSize();
    vmax.z() /= pMap->getSecGridSize();
  }

  if (!m_bPBC) {
    // limit XYZ in the available region of map
    vmin.x() = floor(qlib::max<double>(vmin.x(), pMap->getStartCol()));
    vmin.y() = floor(qlib::max<double>(vmin.y(), pMap->getStartRow()));
    vmin.z() = floor(qlib::max<double>(vmin.z(), pMap->getStartSec()));
    
    vmax.x() = floor(qlib::min<double>(vmax.x(), pMap->getStartCol()+pMap->getColNo()));
    vmax.y() = floor(qlib::min<double>(vmax.y(), pMap->getStartRow()+pMap->getRowNo()));
    vmax.z() = floor(qlib::min<double>(vmax.z(), pMap->getStartSec()+pMap->getSecNo()));
  }

  m_nActCol = int(vmax.x() - vmin.x());
  m_nActRow = int(vmax.y() - vmin.y());
  m_nActSec = int(vmax.z() - vmin.z());

  m_nStCol = int(vmin.x());
  m_nStRow = int(vmin.y());
  m_nStSec = int(vmin.z());
  //int stcol = int(vmin.x())-pMap->getStartCol();
  //int strow = int(vmin.y())-pMap->getStartRow();
  //int stsec = int(vmin.z())-pMap->getStartSec();
}

void MapSurfRenderer::makerangeFull(ScalarObject *pMap)
{
  // Full region mode: no periodic wrap, the surface is closed at the
  // region boundary, and the range is the stored block clipped to the
  // padded view box / molecule boundary, in absolute cell-grid node
  // indices.
  m_bPBC = false;
  m_bCapDisplay = true;

  int lo[3], hi[3], s;
  computeFullRegion(pMap, lo, hi, s);

  const int st[3] = {pMap->getStartCol(), pMap->getStartRow(), pMap->getStartSec()};
  const int n[3] = {pMap->getColNo(), pMap->getRowNo(), pMap->getSecNo()};

  // Align the sample nodes to multiples of the stride relative to the
  // block start; the aligned span never passes the last aligned node, so
  // no cube reads past the block.
  const LodRange rc = lodAlignRange(lo[0], hi[0], st[0], n[0], s);
  const LodRange rr = lodAlignRange(lo[1], hi[1], st[1], n[1], s);
  const LodRange rs = lodAlignRange(lo[2], hi[2], st[2], n[2], s);

  m_nStCol = rc.start;
  m_nStRow = rr.start;
  m_nStSec = rs.start;
  m_nActCol = rc.span;
  m_nActRow = rr.span;
  m_nActSec = rs.span;
  m_nStep = s;

  m_nCurLo[0] = rc.start;
  m_nCurLo[1] = rr.start;
  m_nCurLo[2] = rs.start;
  m_nCurHi[0] = rc.start + rc.span;
  m_nCurHi[1] = rr.start + rr.span;
  m_nCurHi[2] = rs.start + rs.span;
  m_nCurStep = s;
  m_bCurRegionValid = true;

  MB_DPRINTLN("MapSurfRend> full region [%d,%d]x[%d,%d]x[%d,%d] of %dx%dx%d nodes, step %d",
              m_nCurLo[0], m_nCurHi[0], m_nCurLo[1], m_nCurHi[1],
              m_nCurLo[2], m_nCurHi[2], n[0], n[1], n[2], s);
}

bool MapSurfRenderer::worldBoxToGrid(ScalarObject *pMap,
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

void MapSurfRenderer::computeFullRegion(ScalarObject *pMap, int lo[3], int hi[3],
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
  // outside it, so marching them only wastes budget.
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
  // the marched cell count of this region under the budget.
  step = m_nLod;
  if (step==LOD_AUTO) {
    const long long budget = (long long) m_nLodBudget << 20;
    step = lodStepForBudget(hi[0]-lo[0]+1, hi[1]-lo[1]+1, hi[2]-lo[2]+1, budget);
  }
  if (step<1)
    step = 1;
}

void MapSurfRenderer::setViewBox(const Vector4D &cent, double half)
{
  m_vViewCenter = cent;
  m_dViewHalf = qlib::max(half, 0.0);
  m_bViewBoxValid = true;
}

void MapSurfRenderer::scheduleViewRegionUpdate()
{
  // One pending timer per listener: a burst of view events (wheel zoom,
  // drag) collapses into one update after the last event.
  qlib::EventManager::getInstance()->setTimerMilliSec(this, 150.0);
}

bool MapSurfRenderer::onTimer(double t, qlib::time_value curr, bool bLast)
{
  if (!bLast)
    return true;
  updateViewRegion();
  return false;
}

bool MapSurfRenderer::updateViewRegion()
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

  // Otherwise the (unpadded) view box must still lie inside the marched
  // region; the padding absorbs small pans. A coarser fresh stride alone
  // does not rebuild: the finer surface on screen still covers the view.
  const Vector4D d(m_dViewHalf, m_dViewHalf, m_dViewHalf);
  int vlo[3], vhi[3];
  if (!worldBoxToGrid(pMap, m_vViewCenter - d, m_vViewCenter + d, vlo, vhi))
    return false;   // the view left the map: keep what is shown
  Vector4D bmin, bmax;
  if (getBndryBBox(bmin, bmax)) {
    // the marched region is also clipped to the boundary box
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

/////////////////////////////////////////////////////////////////////////////////


void MapSurfRenderer::setupColorEnv()
{
  ScalarObject *pMap = m_pCMap;

  /////////////////////
  // setup workarea

  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;

  m_nMapColNo = pMap->getColNo();
  m_nMapRowNo = pMap->getRowNo();
  m_nMapSecNo = pMap->getSecNo();

  m_pColMapObj = NULL;
  m_pGrad = NULL;
  m_pColMol = MolCoordPtr();

  if (getColorMode()==MapRenderer::MAPREND_MULTIGRAD) {
    m_pGrad = getMultiGrad().get();
    LString nm = getColorMapName();
    if (!nm.isEmpty()) {
      qsys::ObjectPtr pobj = ensureNotNull(getScene())->getObjectByName(nm);
      m_pColMapObj = dynamic_cast<qsys::ScalarObject*>(pobj.get());
    }
    if (m_pColMapObj==NULL) {
      LOG_DPRINTLN("MapSurfRend> \"%s\" is not a scalar object.", nm.c_str());
    }
    setupXformMat();
  }
  else if (!m_bGenSurfMode &&
           getColorMode()==MapRenderer::MAPREND_MOLFANC) {
    if (m_nTgtMolID!=qlib::invalid_uid) {
      qsys::ObjectPtr pobj = SceneManager::getObjectS(m_nTgtMolID);
      m_pColMol = MolCoordPtr(pobj, qlib::no_throw_tag());
    }
    if (!m_pColMol.isnull()) {
      makeAtomPosMap();

      // Sync the ColoringScheme fallback color with the solid color prop
      molstr::ColSchmHolder::setDefaultColor(MapRenderer::getColor());

      // initialize the coloring scheme (with the target mol)
      molstr::ColoringSchemePtr pCS = getColSchm();
      if (!pCS.isnull())
        pCS->start(m_pColMol, this);

      // The mol-side scheme is also evaluated by ColSchmHolder::getColor()
      // and must be bracketed too (stateful schemes such as rainbow
      // precompute their tables in start()); every other renderer already
      // does this.
      molstr::ColoringSchemePtr pMolCS = m_pColMol->getColSchm();
      if (!pMolCS.isnull())
        pMolCS->start(m_pColMol, this);

      setupXformMat();
    }
    else {
      LOG_DPRINTLN("MapSurfRend> MOLFANC target mol \"%d\" is not found.",
                   int(m_nTgtMolID));
      // Don't keep a map that pins the MolCoordPtr of a removed object
      invalidateAtomPosMap();
    }
  }
}

void MapSurfRenderer::cleanupColorEnv()
{
  // cleanup for MOLFANC mode
  if (!m_pColMol.isnull()) {
    molstr::ColoringSchemePtr pCS = getColSchm();
    if (!pCS.isnull())
      pCS->end();
    molstr::ColoringSchemePtr pMolCS = m_pColMol->getColSchm();
    if (!pMolCS.isnull())
      pMolCS->end();
  }
  // m_pAtomPosMap is intentionally kept alive here: it is cached across
  // renders and dropped only via invalidateAtomPosMap().
  m_pColMol = MolCoordPtr();

  m_pColMapObj = NULL;
  m_pGrad = NULL;
}

void MapSurfRenderer::renderImpl(DisplayContext *pdl)
{
  setupColorEnv();

  /////////////////////
  // do marching cubes

  const bool bGenSurf = (pdl==NULL);

  if (bGenSurf) {
    // gen-surf path: transient double-precision records, no mesh cache
    // (keeps generateSurfObj output byte-identical to the historical path)
    std::vector<MCVertBuf> slabs;
    runMarchingCubes(true, slabs);

    const int nslabs = (int) slabs.size();
    for (int si=0; si<nslabs; ++si) {
      const MCVertBuf &buf = slabs[si];
      for (MCVertBuf::const_iterator it = buf.begin(); it != buf.end(); ++it)
        addMSVert(it->pos, it->norm);
    }
    // benchmark timing (uncomment when profiling):
    // const std::chrono::steady_clock::time_point t1 = ...;
    // LOG_DPRINTLN("MapSurfRend> replay %.2f ms (gensurf)", replay_ms);
  }
  else {
    // display path: build/reuse the persistent mesh cache, then replay it
    // into the display list with serial coloring
    if (!m_bMeshCacheValid)
      buildMeshCache();
    if (getColorMode()==MapRenderer::MAPREND_MOLFANC &&
        !m_pColMol.isnull() && m_pAtomPosMap!=NULL && !m_bAidValid)
      resolveAidCache();
    replayMeshCache(pdl);
  }

  cleanupColorEnv();
}

void MapSurfRenderer::runMarchingCubes(bool bGenSurf,
                                       std::vector<MCVertBuf> &slabs) const
{
  ScalarObject *pMap = m_pCMap;

  const int ncol = m_nActCol;
  const int nrow = m_nActRow;
  const int nsec = m_nActSec;

  // Phase 1: run the per-cell marching-cubes kernel over the grid, slab by
  // slab along the col axis, recording the emissions into per-slab buffers.
  // The kernel only reads shared state, so the slabs run concurrently on
  // oneTBB; consuming the buffers in slab order reproduces the serial
  // emission order exactly, independent of the thread count.
  const int nslabs = (ncol + m_nStep - 1) / m_nStep;
  slabs.clear();
  slabs.resize(nslabs);

  qlib::parallel_for(0, (size_t) nslabs, [&](size_t si) {
    const int i = (int) si * m_nStep;
    MCVertBuf &out = slabs[si];
    float values[8];
    bool bary[8];

    for (int j=0; j<nrow; j+=m_nStep)
      for (int k=0; k<nsec; k+=m_nStep) {

        int ix = i+m_nStCol - pMap->getStartCol();
        int iy = j+m_nStRow - pMap->getStartRow();
        int iz = k+m_nStSec - pMap->getStartSec();
        if (!m_bPBC) {
          // The whole cube (far corner at +step) must lie inside the map
          // block; getDen() returns 0 outside, which would cut a bogus
          // surface along the block edge.
          if (ix<0||iy<0||iz<0)
            continue;
          if (ix+m_nStep>=m_nMapColNo||
              iy+m_nStep>=m_nMapRowNo||
              iz+m_nStep>=m_nMapSecNo)
            continue;
        }

        bool bin = false;
        int ii;
        for (ii=0; ii<8; ii++) {
          const int ixx = ix + (mct::cubeVertexOffset[ii][0]) * m_nStep;
          const int iyy = iy + (mct::cubeVertexOffset[ii][1]) * m_nStep;
          const int izz = iz + (mct::cubeVertexOffset[ii][2]) * m_nStep;
          values[ii] = getDen(ixx, iyy, izz);

          // check mol boundary
          bary[ii] = inMolBndry(pMap, ixx, iyy, izz);
          if (bary[ii])
            bin = true;
        }

        if (!bin)
          continue;

        marchCubeCell(i, j, k, values, bary, bGenSurf, out);
      }
  });

  // benchmark timing (uncomment when profiling; measure around the
  // parallel_for above):
  // LOG_DPRINTLN("MapSurfRend> MC build %.2f ms "
  //              "(backend=%s, threads=%d, %d slabs, %d verts)",
  //              build_ms,
  //              qlib::parallel_enabled() ? "oneTBB" : "serial",
  //              qlib::parallel_max_concurrency(), nslabs, (int) nrec);
}

void MapSurfRenderer::buildMeshCache()
{
  std::vector<MCVertBuf> slabs;
  runMarchingCubes(false, slabs);

  size_t nrec = 0;
  for (size_t si=0; si<slabs.size(); ++si)
    nrec += slabs[si].size();

  m_meshCache.clear();
  m_meshCache.reserve(nrec);
  for (size_t si=0; si<slabs.size(); ++si) {
    const MCVertBuf &buf = slabs[si];
    for (MCVertBuf::const_iterator it = buf.begin(); it != buf.end(); ++it) {
      CachedVert cv;
      cv.x = (float) it->pos.x();
      cv.y = (float) it->pos.y();
      cv.z = (float) it->pos.z();
      cv.nx = (float) it->norm.x();
      cv.ny = (float) it->norm.y();
      cv.nz = (float) it->norm.z();
      cv.aid = -1;
      m_meshCache.push_back(cv);
    }
  }

  m_bMeshCacheValid = true;
  m_bAidValid = false;

  // benchmark timing (uncomment when profiling):
  // LOG_DPRINTLN("MapSurfRend> mesh flatten %.2f ms (%d verts, %.1f MB)",
  //              flat_ms, (int) nrec,
  //              double(nrec * sizeof(CachedVert)) / (1024.0 * 1024.0));
}

void MapSurfRenderer::resolveAidCache()
{
  MB_ASSERT(m_pAtomPosMap!=NULL);

  // The tree was built at a defined point (ensureBuilt in makeAtomPosMap),
  // so concurrent queries are read-only and safe; each returns a plain int.
  const size_t nverts = m_meshCache.size();
  qlib::parallel_for(0, nverts, [&](size_t i) {
    CachedVert &cv = m_meshCache[i];
    Vector4D vv(cv.x, cv.y, cv.z);
    vv.w() = 1.0;
    m_xform.xform4D(vv);
    cv.aid = m_pAtomPosMap->searchNearestAtom(vv);
  });

  m_bAidValid = true;

  // benchmark timing (uncomment when profiling):
  // LOG_DPRINTLN("MapSurfRend> aid resolve %.2f ms (parallel, %d verts)",
  //              aid_ms, (int) nverts);
}

void MapSurfRenderer::replayMeshCache(DisplayContext *pdl)
{
  // Serial replay: vertex colors are evaluated here because the coloring
  // schemes (incl. script-implemented ones) are not safe to call
  // concurrently.
  const int cmode = getColorMode();
  // MOLFANC with a resolved aid column: colors are memoized per atom, so
  // the (two-pass) coloring-scheme evaluation runs once per atom instead
  // of once per vertex.
  const bool bMolFanc = (cmode==MapRenderer::MAPREND_MOLFANC &&
                         m_bAidValid && !m_pColMol.isnull());
  const bool bColor = (cmode!=MapRenderer::MAPREND_SIMPLE);
  std::unordered_map<int, ColorPtr> colmemo;

  const size_t nverts = m_meshCache.size();
  for (size_t i=0; i<nverts; ++i) {
    const CachedVert &cv = m_meshCache[i];
    const Vector4D pos(cv.x, cv.y, cv.z);
    if (bMolFanc) {
      if (cv.aid>=0) {
        std::unordered_map<int, ColorPtr>::const_iterator it =
            colmemo.find(cv.aid);
        ColorPtr pcol;
        if (it==colmemo.end()) {
          MolAtomPtr pa = m_pColMol->getAtom(cv.aid);
          if (!pa.isnull())
            pcol = molstr::ColSchmHolder::getColor(pa);
          colmemo.insert(
              std::unordered_map<int, ColorPtr>::value_type(cv.aid, pcol));
        }
        else {
          pcol = it->second;
        }
        // on failure (null), the previously set color remains in effect --
        // same semantics as the historical getColorMol failure path
        if (!pcol.isnull())
          pdl->color(pcol);
      }
    }
    else if (bColor) {
      setVertexColor(pdl, pos);
    }
#ifdef SHOW_NORMAL
    m_tmpv.push_back(pos);
    m_tmpv.push_back(pos + Vector4D(cv.nx, cv.ny, cv.nz));
#endif
    pdl->normal(Vector4D(cv.nx, cv.ny, cv.nz));
    pdl->vertex(pos);
  }

  // benchmark timing (uncomment when profiling):
  // LOG_DPRINTLN("MapSurfRend> replay/color %.2f ms "
  //              "(colormode=%d, %d verts, memo %d atoms)",
  //              replay_ms, cmode, (int) nverts, (int) colmemo.size());
}

void MapSurfRenderer::invalidateMeshCache()
{
  m_meshCache.clear();
  std::vector<CachedVert>().swap(m_meshCache);
  m_bMeshCacheValid = false;
  m_bAidValid = false;
  m_bCurRegionValid = false;
  m_trigGpuPrim.invalidate();
  super_t::invalidateDisplayCache();
}

void MapSurfRenderer::invalidateGpuMesh()
{
  m_trigGpuPrim.invalidate();
}

void MapSurfRenderer::invalidateGeomCache()
{
  invalidateMeshCache();
}

void MapSurfRenderer::invalidateDisplayCache()
{
  // Generic (color-level) invalidation: keep the mesh cache, mark the
  // GPU-side colors dirty, and drop the display list as before. All
  // geometry-affecting inputs route through invalidateGeomCache()/
  // invalidateMeshCache() instead.
  m_bColorDirty = true;
  super_t::invalidateDisplayCache();
}

Vector4D MapSurfRenderer::getGrdNorm2(int ix, int iy, int iz) const
{
  Vector4D rval;

  // Central difference over one marching stride: at coarse strides the
  // +-1 node difference is high-frequency noise relative to the surface.
  const int n = m_nStep;
  rval.x() = getDen(ix-n, iy,   iz  ) - getDen(ix+n, iy,   iz );
  rval.y() = getDen(ix,   iy-n, iz  ) - getDen(ix,   iy+n, iz  );
  rval.z() = getDen(ix,   iy,   iz-n) - getDen(ix,   iy,   iz+n);

  return rval;
}

inline int getVertFlag4(int iVertFlag, const int *iv)
{
  int ires = 0;

  for (int i=0; i<4; ++i)
    if (iVertFlag & (1<<iv[i]))
      ires |= 1<<i;

  return ires;
}


//////////////////////////////////////////

void MapSurfRenderer::marchCubeCell(int fx, int fy, int fz,
                                    const float values[8],
                                    const bool bary[8],
                                    bool bGenSurf, MCVertBuf &out) const
{
  int iCorner, iVertex, iEdge, iTriangle, iFlagIndex, iEdgeFlags;

  Vector4D asEdgeVertex[12];
  Vector4D asEdgeNorm[12];
  Vector4D norms[8];
  bool edgeBinFlags[12];

  // Find which vertices are inside (0) of the surface and which are outside (1)
  iFlagIndex = gfx::mc::cornerFlags(values, m_dLevel);

  // If the cube is entirely inside or outside of the surface, then there will be no intersections

  if(iFlagIndex == 255) {
    // outside of the iso-surface
    return;
  }

  // Calclate the 6-bit border flags
  int border_flag = 0;
  if (fx==0)
    border_flag |= 1<<0;
  if (m_nActCol<=fx+m_nStep)
    border_flag |= 1<<1;
  if (fy==0)
    border_flag |= 1<<2;
  if (m_nActRow<=fy+m_nStep)
    border_flag |= 1<<3;
  if (fz==0)
    border_flag |= 1<<4;
  if (m_nActSec<=fz+m_nStep)
    border_flag |= 1<<5;

  // Border caps close the surface at the range boundary: always for the
  // generated surface object, and in the display path in full region
  // mode (m_bCapDisplay).
  const bool bCap = bGenSurf || m_bCapDisplay;

  if(iFlagIndex == 0 && bCap) {
    // Fill the border of the extent
    // inside of the iso-surface
    int nx, ny, nz, dx, dy, dz, dx2, dy2, dz2;

    for (int i=0; i<6; ++i) {
      int mask = 1<<i;
      if (border_flag & mask) {

        nx = border_normal[i][0];
        ny = border_normal[i][1];
        nz = border_normal[i][2];

        dx = ( (nx+1)/2 )*m_nStep;
        dy = ( (ny+1)/2 )*m_nStep;
        dz = ( (nz+1)/2 )*m_nStep;

        for (int j=0; j<6; ++j) {
          int k = (i%2) * 6 + j;
          dx2 =  border_plane[k][(3+0-i/2)%3];
          dy2 =  border_plane[k][(3+1-i/2)%3];
          dz2 =  border_plane[k][(3+2-i/2)%3];
          out.push_back(MCVert{Vector4D(fx+dx+dx2, fy+dy+dy2, fz+dz+dz2),
                               Vector4D(nx, ny, nz)});
        }
      }
    }
    return;
  }

  // Find which edges are intersected by the surface
  iEdgeFlags = gfx::mc::edgeFlags(iFlagIndex);

  {
    for (int ii=0; ii<8; ii++) {
      norms[ii].w() = -1.0;
    }
  }
  ScalarObject *pMap = m_pCMap;
  const int ix = fx+m_nStCol - pMap->getStartCol();
  const int iy = fy+m_nStRow - pMap->getStartRow();
  const int iz = fz+m_nStSec - pMap->getStartSec();

  // Find the point of intersection of the surface with each edge
  // Then find the normal to the surface at those points
  for(iEdge = 0; iEdge < 12; iEdge++) {
    //if there is an intersection on this edge
    if(iEdgeFlags & (1<<iEdge)) {
      const int ec0 = mct::cubeEdgeConnection[iEdge][0];
      const int ec1 = mct::cubeEdgeConnection[iEdge][1];
      if (bary[ec0]==false || bary[ec1]==false) {
        edgeBinFlags[iEdge] = false;
        continue;
      }
      edgeBinFlags[iEdge] = true;

      const double fOffset = gfx::mc::edgeOffset(values[ ec0 ],
                                                 values[ ec1 ],
                                                 float(m_dLevel));

      asEdgeVertex[iEdge].x() =
        double(fx) +
          (mct::cubeVertexOffset[ec0][0] + fOffset*mct::cubeEdgeDirection[iEdge][0]) * m_nStep;
      asEdgeVertex[iEdge].y() =
        double(fy) +
          (mct::cubeVertexOffset[ec0][1] + fOffset*mct::cubeEdgeDirection[iEdge][1]) * m_nStep;
      asEdgeVertex[iEdge].z() =
        double(fz) +
          (mct::cubeVertexOffset[ec0][2] + fOffset*mct::cubeEdgeDirection[iEdge][2]) * m_nStep;
      asEdgeVertex[iEdge].w() = 0;

      Vector4D nv0,nv1;
      if (norms[ ec0 ].w()<0.0) {
        const int ixx = ix + (mct::cubeVertexOffset[ec0][0]) * m_nStep;
        const int iyy = iy + (mct::cubeVertexOffset[ec0][1]) * m_nStep;
        const int izz = iz + (mct::cubeVertexOffset[ec0][2]) * m_nStep;
        nv0 = norms[ec0] = getGrdNorm2(ixx, iyy, izz);
      }
      else {
        nv0 = norms[ec0];
      }
      if (norms[ ec1 ].w()<0.0) {
        const int ixx = ix + (mct::cubeVertexOffset[ec1][0]) * m_nStep;
        const int iyy = iy + (mct::cubeVertexOffset[ec1][1]) * m_nStep;
        const int izz = iz + (mct::cubeVertexOffset[ec1][2]) * m_nStep;
        nv1 = norms[ec1] = getGrdNorm2(ixx, iyy, izz);
      }
      else {
        nv1 = norms[ec1];
      }
      asEdgeNorm[iEdge] = (nv0.scale(1.0-fOffset) + nv1.scale(fOffset)).normalize();
    }
  }

  // Draw the triangles that were found.  There can be up to five per cube
  for(iTriangle = 0; iTriangle < 5; iTriangle++) {
    if(mct::triangleConnectionTable[iFlagIndex][3*iTriangle] < 0)
      break;

    bool bNotDraw = false;
    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = mct::triangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      if (!edgeBinFlags[iVertex]) {
        bNotDraw = true;
        break;
      }
    }
    if (bNotDraw)
      continue;

    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = mct::triangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];

      // The negative-level normal flip is applied at record time; phase 2
      // replays the records verbatim.
      if (m_dLevel<0)
        out.push_back(MCVert{asEdgeVertex[iVertex], -asEdgeNorm[iVertex]});
      else
        out.push_back(MCVert{asEdgeVertex[iVertex], asEdgeNorm[iVertex]});

    } // for(iCorner = 0; iCorner < 3; iCorner++)

  } // for(iTriangle = 0; iTriangle < 5; iTriangle++)


  // Fill the border of the extent
  if(bCap) {
    Vector4D v[8+12];
    for (int i=0; i<8; ++i) {
      v[i].x() = double(fx) + mct::cubeVertexOffset[i][0] * m_nStep;
      v[i].y() = double(fy) + mct::cubeVertexOffset[i][1] * m_nStep;
      v[i].z() = double(fz) + mct::cubeVertexOffset[i][2] * m_nStep;
      v[i].w() = 0;
    }
    for (int i=0; i<12; ++i) {
      v[i+8] = asEdgeVertex[i];
    }
    
    for (int iBorder=0; iBorder<6; ++iBorder) {
      int mask = 1<<iBorder;
      if (border_flag & mask) {
        
        Vector4D norm(border_normal[iBorder][0], border_normal[iBorder][1], border_normal[iBorder][2]);
        
        const int *iverts = bdr_verts[iBorder]; //{0, 4, 7, 3};
        int ivf4 = getVertFlag4(iFlagIndex, iverts);

        for (int j=0; j<3*3; ++j) {
          int iv = bdr_tris[ivf4][j];
          if (iv<0) break;
          out.push_back(MCVert{v[iverts[iv]], norm});
        }
      }
    }
    return;
  }

}

///////////////////////////////////////////////////////////////
// GpuPrim display path

void MapSurfRenderer::display(DisplayContext *pdc)
{
  // File (non-GL) export -- incl. umbreon/povray -- and non-fill draw modes
  // (line/point) use the legacy display-list path (render()).
  if (pdc->isFile() || m_nDrawMode!=MSRDRAW_FILL) {
    super_t::display(pdc);
    return;
  }

  if (!m_bCheckShaderOK) {
    m_bUseShader = m_trigGpuPrim.init(pdc);
    if (m_bUseShader)
      MB_DPRINTLN("MapSurfRend> triangle shader OK");
    m_bCheckShaderOK = true;
  }
  if (!m_bUseShader) {
    // shader unavailable --> legacy path
    super_t::display(pdc);
    return;
  }

  ScalarObject *pMap = getScalarObj();
  if (pMap==NULL)
    return;
  m_pCMap = pMap;

  const bool bNeedBuild =
      !m_bMeshCacheValid || !m_trigGpuPrim.isValid() || m_bColorDirty ||
      (getColorMode()==MapRenderer::MAPREND_MOLFANC && !m_bAidValid);

  if (bNeedBuild) {
    // mol boundary + map-range info only for a geometry rebuild (see
    // render(): the mesh cache is relative to the range start)
    if (!m_bMeshCacheValid) {
      setupMolBndry();
      makerange();
    }

    setupColorEnv();

    if (!m_bMeshCacheValid) {
      buildMeshCache();
      m_trigGpuPrim.invalidate();
    }
    if (getColorMode()==MapRenderer::MAPREND_MOLFANC &&
        !m_pColMol.isnull() && m_pAtomPosMap!=NULL && !m_bAidValid) {
      resolveAidCache();
      // atom correspondence changed --> colors must be re-resolved
      m_bColorDirty = true;
    }

    if (!m_trigGpuPrim.isValid()) {
      buildGpuMesh(pdc);
    }
    else if (m_bColorDirty) {
      // Color-only change: rewrite colors in place (VBO/VAO reused);
      // rebuild if the vertex count no longer matches.
      if (!updateGpuColors())
        buildGpuMesh(pdc);
    }
    m_bColorDirty = false;

    cleanupColorEnv();
  }

  if (!m_trigGpuPrim.isValid()) {
    m_pCMap = NULL;
    return;
  }

  preRender(pdc);
  pdc->pushMatrix();
  // Apply the same map transform the DL path bakes into its vertices; the
  // cached records stay in cell-grid coordinates.
  setupXformMat(pdc);
  m_trigGpuPrim.setEdgeLineType(pdc->getEdgeLineType());
  m_trigGpuPrim.draw(pdc);
  pdc->popMatrix();
  postRender(pdc);

  m_pCMap = NULL;
}

void MapSurfRenderer::unloading()
{
  m_trigGpuPrim.invalidate();
  qlib::EventManager::getInstance()->removeTimer(this);
  super_t::unloading();
}

void MapSurfRenderer::resolveVertexColors(std::vector<quint32> &vcols)
{
  const size_t nverts = m_meshCache.size();
  vcols.resize(nverts);

  const int cmode = getColorMode();
  const qlib::uid_t nSceneID = getSceneID();

  quint32 basecol = 0xFFFFFFFF;
  {
    ColorPtr pbase = MapRenderer::getColor();
    if (!pbase.isnull())
      basecol = pbase->getDevCode(nSceneID);
  }

  if (cmode==MapRenderer::MAPREND_MOLFANC &&
      m_bAidValid && !m_pColMol.isnull()) {
    // per-atom memoized colors (schemes are evaluated once per atom);
    // unresolved vertices keep the base color, matching the DL path where
    // the baked base color remains in effect on lookup failure
    std::unordered_map<int, quint32> memo;
    for (size_t i=0; i<nverts; ++i) {
      const qint32 aid = m_meshCache[i].aid;
      quint32 col = basecol;
      if (aid>=0) {
        std::unordered_map<int, quint32>::const_iterator it = memo.find(aid);
        if (it==memo.end()) {
          MolAtomPtr pa = m_pColMol->getAtom(aid);
          if (!pa.isnull()) {
            ColorPtr pcol = molstr::ColSchmHolder::getColor(pa);
            if (!pcol.isnull())
              col = pcol->getDevCode(nSceneID);
          }
          memo.insert(
              std::unordered_map<int, quint32>::value_type(aid, col));
        }
        else {
          col = it->second;
        }
      }
      vcols[i] = col;
    }
  }
  else if (cmode==MapRenderer::MAPREND_MULTIGRAD &&
           m_pColMapObj!=NULL && m_pGrad!=NULL) {
    for (size_t i=0; i<nverts; ++i) {
      const CachedVert &cv = m_meshCache[i];
      Vector4D vv(cv.x, cv.y, cv.z);
      vv.w() = 1.0;
      m_xform.xform4D(vv);
      const double par = m_pColMapObj->getValueAt(vv);
      ColorPtr pcol = m_pGrad->getColor(par);
      vcols[i] = pcol.isnull() ? basecol : pcol->getDevCode(nSceneID);
    }
  }
  else {
    // SIMPLE mode (or unresolved coloring setup): uniform base color.
    // The trig shader has no uniform-color path, so every vertex carries
    // the resolved devcode.
    std::fill(vcols.begin(), vcols.end(), basecol);
  }
}

void MapSurfRenderer::buildGpuMesh(DisplayContext *pdc)
{
  const int nverts = (int) m_meshCache.size();
  if (nverts<=0) {
    m_trigGpuPrim.invalidate();
    return;
  }
  const int nfaces = nverts/3;

  std::vector<quint32> vcols;
  resolveVertexColors(vcols);

  m_trigGpuPrim.setPolygonMode(DisplayContext::POLY_FILL);
  m_trigGpuPrim.alloc(pdc, nverts, nfaces);
  for (int i=0; i<nverts; ++i) {
    const CachedVert &cv = m_meshCache[i];
    m_trigGpuPrim.setVertex(i, Vector4D(cv.x, cv.y, cv.z));
    m_trigGpuPrim.setNormal(i, Vector4D(cv.nx, cv.ny, cv.nz));
    m_trigGpuPrim.setColor(i, vcols[i]);
  }
  // identity triangle soup (the MC emits unshared vertex triples)
  for (int i=0; i<nfaces; ++i)
    m_trigGpuPrim.setFace(i, i*3, i*3+1, i*3+2);
  m_trigGpuPrim.setUpdated(true);

  // benchmark timing (uncomment when profiling):
  // LOG_DPRINTLN("MapSurfRend> gpu fill %.2f ms (%d verts)", fill_ms, nverts);
}

bool MapSurfRenderer::updateGpuColors()
{
  const int nverts = (int) m_meshCache.size();
  if (nverts<=0 || m_trigGpuPrim.getVertexSize()!=nverts)
    return false;

  std::vector<quint32> vcols;
  resolveVertexColors(vcols);

  for (int i=0; i<nverts; ++i)
    m_trigGpuPrim.setColor(i, vcols[i]);
  m_trigGpuPrim.setUpdated(true);

  // benchmark timing (uncomment when profiling):
  // LOG_DPRINTLN("MapSurfRend> gpu recolor %.2f ms (%d verts)", recol_ms,
  //              nverts);
  return true;
}

void MapSurfRenderer::setupXformMat()
{
  ScalarObject *pMap = m_pCMap;
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  // Apply the object's xform matrix first, to be consistent with
  // setupXformMat(pdl) used in the display-list path.
  m_xform = pMap->getXformMatrix();

  // map origin (MRC ORIGIN for DensityMap; zero for crystallographic maps)
  {
    const Vector4D vorig = pMap->getOrigin();
    if (pXtal==NULL || !vorig.isZero3D())
      m_xform.matprod( Matrix4D::makeTransMat(vorig) );
  }

  //  setup frac-->orth matrix
  if (pXtal!=NULL) {
    Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
    m_xform.matprod( Matrix4D(orthmat) );
  }

  {  
    Vector4D vtmp;
    if (pXtal!=NULL)
      vtmp = Vector4D(1.0/double(pXtal->getColInterval()),
                      1.0/double(pXtal->getRowInterval()),
                      1.0/double(pXtal->getSecInterval()));
    else
      vtmp = Vector4D(pMap->getColGridSize(),
                      pMap->getRowGridSize(),
                      pMap->getSecGridSize());

    //pdl->scale(vtmp);
    m_xform.matprod( Matrix4D::makeScaleMat(vtmp) );

    vtmp = Vector4D(m_nStCol, m_nStRow, m_nStSec);
    // pdl->translate(vtmp);
    m_xform.matprod( Matrix4D::makeTransMat(vtmp) );
  }
}

qsys::ObjectPtr MapSurfRenderer::generateSurfObj()
{
  ScalarObject *pMap = getScalarObj();
  m_pCMap = pMap;
  m_bGenSurfMode = true;

  // generate map-range information
  makerange();

  setupXformMat();

  surface::MolSurfObj *pSurfObj = new surface::MolSurfObj();
  m_msverts.clear();
  renderImpl(NULL);
  int nverts = m_msverts.size();
  int nfaces = nverts/3;
  pSurfObj->setVertSize(nverts);
  for (int i=0; i<nverts; ++i)
    pSurfObj->setVertex(i, m_msverts[i]);
  pSurfObj->setFaceSize(nfaces);
  for (int i=0; i<nfaces; ++i)
    pSurfObj->setFace(i, i*3, i*3+1, i*3+2);
  m_msverts.clear();

  m_bGenSurfMode = false;

  qsys::ObjectPtr rval = qsys::ObjectPtr(pSurfObj);
  return rval;
}

void MapSurfRenderer::setVertexColor(DisplayContext *pdl, const Vector4D &pos)
{
  if (m_bGenSurfMode)
    return;

  Vector4D vv(pos);
  vv.w() = 1.0;
  m_xform.xform4D(vv);

  if (getColorMode()==MapRenderer::MAPREND_MOLFANC) {
    ColorPtr pcol;
    if (getColorMol(vv, pcol))
      pdl->color(pcol);
    // on failure, the solid color baked in render() remains in effect
    return;
  }

  // MULTIGRAD mode
  if (m_pColMapObj==NULL)
    return;

  double par = m_pColMapObj->getValueAt(vv);
  ColorPtr pcol = m_pGrad->getColor(par);
  pdl->color(pcol);
}

bool MapSurfRenderer::getColorMol(const Vector4D &v, gfx::ColorPtr &rcol)
{
  if (m_pColMol.isnull())
    return false;
  if (m_pAtomPosMap==NULL)
    return false;

  int aid = m_pAtomPosMap->searchNearestAtom(v);
  if (aid<0) {
    MB_DPRINTLN("nearest atom is not found at (%f,%f,%f)", v.x(), v.y(), v.z());
    return false;
  }

  MolAtomPtr pa = m_pColMol->getAtom(aid);
  if (pa.isnull())
    return false;

  rcol = molstr::ColSchmHolder::getColor(pa);
  return true;
}

void MapSurfRenderer::invalidateAtomPosMap()
{
  if (m_pAtomPosMap!=NULL) {
    delete m_pAtomPosMap;
    m_pAtomPosMap = NULL;
  }
}

void MapSurfRenderer::makeAtomPosMap()
{
  if (m_pColMol.isnull())
    return;

  // Cached across renders; NULL means "rebuild needed" (see
  // invalidateAtomPosMap callers for the invalidation conditions).
  if (m_pAtomPosMap!=NULL)
    return;

  m_pAtomPosMap = MB_NEW molstr::AtomPosMap2();
  m_pAtomPosMap->setTarget(m_pColMol);
  m_pAtomPosMap->generate(m_pMolSel);
  // Force the lazy CGAL tree build here (not on the first query), so the
  // build happens at a defined point and later queries are read-only.
  m_pAtomPosMap->ensureBuilt();

  // benchmark timing (uncomment when profiling):
  // LOG_DPRINTLN("MapSurfRend> AtomPosMap build %.2f ms", build_ms);
}

/// Resolve mol name, set m_nTgtMolID, listen the MolCoord events,
/// and return the MolCoord object
MolCoordPtr MapSurfRenderer::resolveMolIDImpl(const qlib::LString &name)
{
  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull())
    return MolCoordPtr();

  qsys::ObjectPtr pobj = pScene->getObjectByName(name);
  MolCoordPtr pMol = MolCoordPtr(pobj, qlib::no_throw_tag());
  if (pMol.isnull()) {
    return pMol;
  }

  m_nTgtMolID = pMol->getUID();

  // target (possibly a different mol) resolved --> cached atom map is stale
  invalidateAtomPosMap();

  // event handling: attach to the new object
  pMol->addListener(this);

  MB_DPRINTLN("MapSurfRend.resolveMolID> resolved (%s), OK.", name.c_str());
  return pMol;
}

void MapSurfRenderer::setTgtObjName(const qlib::LString &name)
{
  // detach from oldobj
  if (m_nTgtMolID!=qlib::invalid_uid) {
    qsys::ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
    if (!pObj.isnull()) {
      pObj->removeListener(this);
    }
    m_nTgtMolID = qlib::invalid_uid;
  }
  invalidateAtomPosMap();

  // get object by name
  if (name.isEmpty())
    return;

  m_sTgtMolName = name;

  if (getScene().isnull())
    return; // Scene is not loaded (when called in the scene-file loading)

  MolCoordPtr pMol = resolveMolIDImpl(name);
  if (pMol.isnull()) {
    LOG_DPRINTLN("MapSurfRend> \"%s\" is not a MolCoord object.", name.c_str());
    return;
  }

  invalidateDisplayCache();
}

qlib::LString MapSurfRenderer::getTgtObjName() const
{
  if (m_nTgtMolID==qlib::invalid_uid)
    return LString();
  qsys::ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
  if (pObj.isnull())
    return LString();
  return pObj->getName();
}

void MapSurfRenderer::propChanged(qlib::LPropEvent &ev)
{
  LString name = ev.getName();
  LString pname = ev.getParentName();

  if (name.equals("coloring")||
      pname.equals("coloring")||
      pname.startsWith("coloring.")) {
    invalidateDisplayCache();
  }
  else if (name.equals("target")||
           name.equals("sel")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void MapSurfRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  // Atom positions/topology of the MOLFANC target mol changed --> the
  // cached nearest-atom map is stale (the isosurface geometry itself does
  // not depend on the mol, so only the map is dropped here; the display
  // cache invalidation is handled by the base class as before).
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getTarget()==m_nTgtMolID &&
      (ev.getDescr().equals("atomsMoved") ||
       ev.getDescr().equals("topologyChanged"))) {
    invalidateAtomPosMap();
    m_bAidValid = false;
  }

  // The client map object's data or xform changed --> the mesh cache is
  // stale (the base class handles the display-cache invalidation).
  if (ev.getTarget()==getClientObjID()) {
    if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED) {
      invalidateMeshCache();
    }
    else if (ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
      qlib::LPropEvent *pPE = ev.getPropEvent();
      if (pPE!=NULL && pPE->getName().equals("xformMat"))
        invalidateMeshCache();
    }
  }

  if (getColorMode()==MapRenderer::MAPREND_MOLFANC &&
      ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE) {
      if (pPE->getName().equals("defaultcolor")||
          pPE->getName().equals("coloring")||
          pPE->getParentName().equals("coloring")||
          pPE->getParentName().startsWith("coloring.")) {
        invalidateDisplayCache();
      }
    }
  }

  super_t::objectChanged(ev);
}

void MapSurfRenderer::sceneChanged(qsys::SceneEvent &ev)
{
  if (ev.getType()==qsys::SceneEvent::SCE_SCENE_ONLOADED) {
    // resolve target mol name, if required
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }
  else if (ev.getType()==qsys::SceneEvent::SCE_OBJ_ADDED &&
           ev.getTarget()==getClientObjID()) {
    // resolve target mol name, if required
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }
  else if (ev.getType()==qsys::SceneEvent::SCE_REND_ADDED &&
           ev.getTarget()==getUID()) {
    // resolve target mol name, if required
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }

  super_t::sceneChanged(ev);
}

