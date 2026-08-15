// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

// #define SHOW_NORMAL

#include "MapSurfRenderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/MarchingCubes.hpp>
#include <gfx/Mesh.hpp>
#include <qlib/parallel.hpp>

#include <chrono>

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

  m_bGenSurfMode = false;
}

// destructor
MapSurfRenderer::~MapSurfRenderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

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
      nType!=qsys::ViewEvent::VWE_PROPCHG_DRG)
    return;

  if (!m_bAutoUpdate && !m_bDragUpdate)
    return;

  if (!ev.getDescr().equals("center"))
    return;

  qsys::View *pView = ev.getTargetPtr();
  if (pView==NULL)
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
  m_nMaxGrid = n;

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

  //  setup frac-->orth matrix
  if (pXtal==NULL) {
    pdl->translate(pMap->getOrigin());
  }
  else {
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

  // check and setup mol boundary data
  setupMolBndry();

  // generate map-range information
  makerange();

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

    // check PBC
    m_bPBC = false;
    const double dimx = pMap->getColGridSize()*pMap->getColNo();
    const double dimy = pMap->getRowGridSize()*pMap->getRowNo();
    const double dimz = pMap->getSecGridSize()*pMap->getSecNo();
    const double cea = xt.a();
    const double ceb = xt.b();
    const double cec = xt.c();
    if (qlib::isNear4(dimx, cea) &&
        qlib::isNear4(dimy, ceb) &&
        qlib::isNear4(dimz, cec) &&
        isUsePBC())
      m_bPBC = true;
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

/////////////////////////////////////////////////////////////////////////////////


void MapSurfRenderer::renderImpl(DisplayContext *pdl)
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
      // TO DO: re-generate atom-map only when Mol is changed.
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

  /////////////////////
  // do marching cubes

  const int ncol = m_nActCol;
  const int nrow = m_nActRow;
  const int nsec = m_nActSec;

  const bool bGenSurf = (pdl==NULL);

  // Phase 1: run the per-cell marching-cubes kernel over the grid, slab by
  // slab along the col axis, recording the emissions into per-slab buffers.
  // The kernel only reads shared state, so the slabs run concurrently on
  // oneTBB; replaying the buffers in slab order (phase 2) reproduces the
  // serial emission order exactly, independent of the thread count.
  const int nslabs = (ncol + m_nBinFac - 1) / m_nBinFac;
  std::vector<MCVertBuf> slabs(nslabs);

  const std::chrono::steady_clock::time_point t0 =
      std::chrono::steady_clock::now();

  qlib::parallel_for(0, (size_t) nslabs, [&](size_t si) {
    const int i = (int) si * m_nBinFac;
    MCVertBuf &out = slabs[si];
    float values[8];
    bool bary[8];

    for (int j=0; j<nrow; j+=m_nBinFac)
      for (int k=0; k<nsec; k+=m_nBinFac) {

        int ix = i+m_nStCol - pMap->getStartCol();
        int iy = j+m_nStRow - pMap->getStartRow();
        int iz = k+m_nStSec - pMap->getStartSec();
        if (!m_bPBC) {
          if (ix<0||iy<0||iz<0)
            continue;
          if (ix+1>=m_nMapColNo||
              iy+1>=m_nMapRowNo||
              iz+1>=m_nMapSecNo)
            continue;
        }

        bool bin = false;
        int ii;
        for (ii=0; ii<8; ii++) {
          const int ixx = ix + (mct::cubeVertexOffset[ii][0]) * m_nBinFac;
          const int iyy = iy + (mct::cubeVertexOffset[ii][1]) * m_nBinFac;
          const int izz = iz + (mct::cubeVertexOffset[ii][2]) * m_nBinFac;
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

  {
    const double build_ms = std::chrono::duration<double, std::milli>(
                                std::chrono::steady_clock::now() - t0)
                                .count();
    size_t nrec = 0;
    for (int si=0; si<nslabs; ++si)
      nrec += slabs[si].size();
    // Always-on log (release builds included) so the MC/coloring cost split
    // can be benchmarked on release builds.
    LOG_DPRINTLN("MapSurfRend> MC build %.2f ms "
                 "(backend=%s, threads=%d, %d slabs, %d verts)",
                 build_ms,
                 qlib::parallel_enabled() ? "oneTBB" : "serial",
                 qlib::parallel_max_concurrency(), nslabs, (int) nrec);
  }

  const std::chrono::steady_clock::time_point t1 =
      std::chrono::steady_clock::now();

  // Phase 2 (serial, slab order): replay the records, evaluating vertex
  // colors here because the coloring schemes (incl. script-implemented
  // ones) are not safe to call concurrently.
  for (int si=0; si<nslabs; ++si) {
    const MCVertBuf &buf = slabs[si];
    for (MCVertBuf::const_iterator it = buf.begin(); it != buf.end(); ++it) {
      if (bGenSurf) {
        addMSVert(it->pos, it->norm);
      }
      else {
        if (getColorMode()!=MapRenderer::MAPREND_SIMPLE)
          setVertexColor(pdl, it->pos);
#ifdef SHOW_NORMAL
        m_tmpv.push_back(it->pos);
        m_tmpv.push_back(it->pos + it->norm);
#endif
        pdl->normal(it->norm);
        pdl->vertex(it->pos);
      }
    }
  }

  {
    const double replay_ms = std::chrono::duration<double, std::milli>(
                                 std::chrono::steady_clock::now() - t1)
                                 .count();
    LOG_DPRINTLN("MapSurfRend> replay/color %.2f ms (colormode=%d, gensurf=%d)",
                 replay_ms, getColorMode(), bGenSurf ? 1 : 0);
  }

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

Vector4D MapSurfRenderer::getGrdNorm2(int ix, int iy, int iz) const
{
  Vector4D rval;

  const int n = 1;
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
  if (m_nActCol<=fx+m_nBinFac)
    border_flag |= 1<<1;
  if (fy==0)
    border_flag |= 1<<2;
  if (m_nActRow<=fy+m_nBinFac)
    border_flag |= 1<<3;
  if (fz==0)
    border_flag |= 1<<4;
  if (m_nActSec<=fz+m_nBinFac)
    border_flag |= 1<<5;

  if(iFlagIndex == 0 && bGenSurf) {
    // Fill the border of the extent
    // inside of the iso-surface
    int nx, ny, nz, dx, dy, dz, dx2, dy2, dz2;

    for (int i=0; i<6; ++i) {
      int mask = 1<<i;
      if (border_flag & mask) {

        nx = border_normal[i][0];
        ny = border_normal[i][1];
        nz = border_normal[i][2];

        dx = ( (nx+1)/2 )*m_nBinFac;
        dy = ( (ny+1)/2 )*m_nBinFac;
        dz = ( (nz+1)/2 )*m_nBinFac;

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
          (mct::cubeVertexOffset[ec0][0] + fOffset*mct::cubeEdgeDirection[iEdge][0]) * m_nBinFac;
      asEdgeVertex[iEdge].y() =
        double(fy) +
          (mct::cubeVertexOffset[ec0][1] + fOffset*mct::cubeEdgeDirection[iEdge][1]) * m_nBinFac;
      asEdgeVertex[iEdge].z() =
        double(fz) +
          (mct::cubeVertexOffset[ec0][2] + fOffset*mct::cubeEdgeDirection[iEdge][2]) * m_nBinFac;
      asEdgeVertex[iEdge].w() = 0;

      Vector4D nv0,nv1;
      if (norms[ ec0 ].w()<0.0) {
        const int ixx = ix + (mct::cubeVertexOffset[ec0][0]) * m_nBinFac;
        const int iyy = iy + (mct::cubeVertexOffset[ec0][1]) * m_nBinFac;
        const int izz = iz + (mct::cubeVertexOffset[ec0][2]) * m_nBinFac;
        nv0 = norms[ec0] = getGrdNorm2(ixx, iyy, izz);
      }
      else {
        nv0 = norms[ec0];
      }
      if (norms[ ec1 ].w()<0.0) {
        const int ixx = ix + (mct::cubeVertexOffset[ec1][0]) * m_nBinFac;
        const int iyy = iy + (mct::cubeVertexOffset[ec1][1]) * m_nBinFac;
        const int izz = iz + (mct::cubeVertexOffset[ec1][2]) * m_nBinFac;
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
  if(bGenSurf) {
    Vector4D v[8+12];
    for (int i=0; i<8; ++i) {
      v[i].x() = double(fx) + mct::cubeVertexOffset[i][0] * m_nBinFac;
      v[i].y() = double(fy) + mct::cubeVertexOffset[i][1] * m_nBinFac;
      v[i].z() = double(fz) + mct::cubeVertexOffset[i][2] * m_nBinFac;
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

void MapSurfRenderer::setupXformMat()
{
  ScalarObject *pMap = m_pCMap;
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  // Apply the object's xform matrix first, to be consistent with
  // setupXformMat(pdl) used in the display-list path.
  m_xform = pMap->getXformMatrix();

  //  setup frac-->orth matrix
  if (pXtal==NULL) {
    m_xform.matprod( Matrix4D::makeTransMat(pMap->getOrigin()) );
  }
  else {
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

  const std::chrono::steady_clock::time_point t0 =
      std::chrono::steady_clock::now();

  m_pAtomPosMap = MB_NEW molstr::AtomPosMap2();
  m_pAtomPosMap->setTarget(m_pColMol);
  m_pAtomPosMap->generate(m_pMolSel);
  // Force the lazy CGAL tree build here (not on the first query), so the
  // build happens at a defined point and later queries are read-only.
  m_pAtomPosMap->ensureBuilt();

  const double build_ms = std::chrono::duration<double, std::milli>(
                              std::chrono::steady_clock::now() - t0)
                              .count();
  LOG_DPRINTLN("MapSurfRend> AtomPosMap build %.2f ms", build_ms);
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

