// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

// #define SHOW_NORMAL

#include "MapSurf2Renderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

#ifdef _OPENMP
#  include <omp.h>
#endif

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;
using molstr::AtomIterator;

/// default constructor
MapSurf2Renderer::MapSurf2Renderer()
     : super_t()
{
  m_bPBC = false;
  //m_bAutoUpdate = true;
  //m_bDragUpdate = false;
  m_nDrawMode = MSRDRAW_FILL;
  m_lw = 1.2;
  m_pCMap = NULL;

  m_nBinFac = 1;
//  m_nMaxGrid = 100;

  m_nOmpThr = -1;
  //  m_bIsoLev = 0;
  m_bWorkOK = false;
  m_pVBO=NULL;

}

// destructor
MapSurf2Renderer::~MapSurf2Renderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  if (m_pVBO!=NULL)
    delete m_pVBO;

}

/////////////////////////////////

const char *MapSurf2Renderer::getTypeName() const
{
  return "isosurf2";
}

void MapSurf2Renderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid!=qlib::invalid_uid) {
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->addViewListener(nid, this);
  }
}

qlib::uid_t MapSurf2Renderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  

/*void MapSurf2Renderer::viewChanged(qsys::ViewEvent &ev)
{
  const int nType = ev.getType();
  
  if (nType!=qsys::ViewEvent::VWE_PROPCHG &&
      nType!=qsys::ViewEvent::VWE_PROPCHG_DRG)
    return;

  if (!isAutoUpdate() && !isDragUpdate())
    return;

  if (!ev.getDescr().equals("center"))
    return;

  qsys::View *pView = ev.getTargetPtr();
  if (pView==NULL)
    return;

  Vector4D c = pView->getViewCenter();

  if (isDragUpdate()) {
    if (nType==qsys::ViewEvent::VWE_PROPCHG ||
        nType==qsys::ViewEvent::VWE_PROPCHG_DRG) {
      setCenter(c);
      setDefaultPropFlag("center", false);
    }
    return;
  }

  if (isAutoUpdate()) {
    if (nType==qsys::ViewEvent::VWE_PROPCHG) {
      setCenter(c);
      setDefaultPropFlag("center", false);
    }
    return;
  }
  
  return;
}*/


///////////////////////////////////////////////////////////////

void MapSurf2Renderer::preRender(DisplayContext *pdc)
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

void MapSurf2Renderer::postRender(DisplayContext *pdc)
{
  // reset to default drawing options
  pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  pdc->setPointSize(1.0);
  pdc->setLineWidth(1.0);
  pdc->setCullFace(true);
  pdc->setLighting(false);
}

#if 0
void MapSurf2Renderer::setupXformMat(DisplayContext *pdl)
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
#endif

/// Generate display list
void MapSurf2Renderer::render(DisplayContext *pdl)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
  m_pCMap = pMap;

  // check and setup mol boundary data
  setupMolBndry();

  // generate map-range information
  // makerange();
  calcMapDispExtent(pMap);

  pdl->pushMatrix();
  //setupXformMat(pdl);
  setupXform(pdl, pMap, pXtal);

  MB_DPRINTLN("MapSurf2Renderer Rendereing...");

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
  
  MB_DPRINTLN("MapSurf2Renderer Rendereing OK\n");

  pdl->popMatrix();
  m_pCMap = NULL;
}

void MapSurf2Renderer::renderImpl(DisplayContext *pdl)
{
  ScalarObject *pMap = m_pCMap;

  /////////////////////
  // setup workarea

  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;

  // m_nMapColNo = pMap->getColNo();
  // m_nMapRowNo = pMap->getRowNo();
  // m_nMapSecNo = pMap->getSecNo();

  int ncol = m_dspSize.x(); //m_nActCol;
  int nrow = m_dspSize.y(); //m_nActRow;
  int nsec = m_dspSize.z(); //m_nActSec;

  const int ixmax = m_mapSize.x();
  const int iymax = m_mapSize.y();
  const int izmax = m_mapSize.z();

  m_nbcol = m_mapStPos.x();
  m_nbrow = m_mapStPos.y();
  m_nbsec = m_mapStPos.z();

  /////////////////////
  // do marching cubes

  int i,j,k;

  for (i=0; i<ncol; i+=m_nBinFac)
    for (j=0; j<nrow; j+=m_nBinFac)
      for (k=0; k<nsec; k+=m_nBinFac) {

        int ix = i + m_nbcol;
        int iy = j + m_nbrow;
        int iz = k + m_nbsec;
        if (!m_bPBC) {
          if (ix<0||iy<0||iz<0 ||
              ix+1>=ixmax|| iy+1>=iymax|| iz+1>=izmax)
            continue;
        }

        bool bin = false;
        int ii;
        for (ii=0; ii<8; ii++) {
          const int ixx = ix + (vtxoffs[ii][0]) * m_nBinFac;
          const int iyy = iy + (vtxoffs[ii][1]) * m_nBinFac;
          const int izz = iz + (vtxoffs[ii][2]) * m_nBinFac;
          m_values[ii] = getDen(ixx, iyy, izz);
          
          // check mol boundary
          m_bary[ii] = inMolBndry(pMap, ixx, iyy, izz);
          if (m_bary[ii])
            bin = true;
        }

        if (!bin)
          continue;

        marchCube(pdl, i, j, k);
        
        /*
        pdl->startLines();
        pdl->vertex(i,j,k);
        pdl->vertex(i+1,j,k);
        pdl->vertex(i,j,k);
        pdl->vertex(i,j+1,k);
        pdl->vertex(i,j,k);
        pdl->vertex(i,j,k+1);
        pdl->end();*/
      }
        

}

#if 0
void MapSurf2Renderer::makerange()
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
#endif

/////////////////////////////////////////////////////////////////////////////////

//fGetOffset finds the approximate point of intersection of the surface
// between two points with the values fValue1 and fValue2
namespace {
  inline float getOffset(float fValue1, float fValue2, float fValueDesired)
  {
    float fDelta = fValue2 - fValue1;
    
    if(fDelta == 0.0f) {
      return 0.5f;
    }
    return (fValueDesired - fValue1)/fDelta;
  }
}

//////////////////////////////////////////


void MapSurf2Renderer::marchCube(DisplayContext *pdl,
                                int fx, int fy, int fz)
{
  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;

  Vector4D asEdgeVertex[12];
  Vector4D asEdgeNorm[12];
  bool edgeBinFlags[12];

  // Find which vertices are inside of the surface and which are outside
  iFlagIndex = 0;
  for(iVertexTest = 0; iVertexTest < 8; iVertexTest++) {
    if(m_values[iVertexTest] <= m_dLevel) 
      iFlagIndex |= 1<<iVertexTest;
  }

  // Find which edges are intersected by the surface
  iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

  //If the cube is entirely inside or outside of the surface, then there will be no intersections
  if(iEdgeFlags == 0) {
    return;
  }

  {
    for (int ii=0; ii<8; ii++) {
      m_norms[ii].w() = -1.0;
    }
  }
  ScalarObject *pMap = m_pCMap;
  const int ix = fx + m_nbcol;
  const int iy = fy + m_nbrow;
  const int iz = fz + m_nbsec;

  // Find the point of intersection of the surface with each edge
  // Then find the normal to the surface at those points
  for(iEdge = 0; iEdge < 12; iEdge++) {
    //if there is an intersection on this edge
    if(iEdgeFlags & (1<<iEdge)) {
      const int ec0 = a2iEdgeConnection[iEdge][0];
      const int ec1 = a2iEdgeConnection[iEdge][1];
      if (m_bary[ec0]==false || m_bary[ec1]==false) {
        edgeBinFlags[iEdge] = false;
        continue;
      }
      edgeBinFlags[iEdge] = true;
      
      const double fOffset = getOffset(m_values[ ec0 ], 
                                       m_values[ ec1 ], m_dLevel);
      
      asEdgeVertex[iEdge].x() =
        double(fx) +
          (a2fVertexOffset[ec0][0] + fOffset*a2fEdgeDirection[iEdge][0]) * m_nBinFac;
      asEdgeVertex[iEdge].y() =
        double(fy) +
          (a2fVertexOffset[ec0][1] + fOffset*a2fEdgeDirection[iEdge][1]) * m_nBinFac;
      asEdgeVertex[iEdge].z() =
        double(fz) +
          (a2fVertexOffset[ec0][2] + fOffset*a2fEdgeDirection[iEdge][2]) * m_nBinFac;
      asEdgeVertex[iEdge].w() = 0;
      
      Vector4D nv0,nv1;
      if (m_norms[ ec0 ].w()<0.0) {
        const int ixx = ix + (vtxoffs[ec0][0]) * m_nBinFac;
        const int iyy = iy + (vtxoffs[ec0][1]) * m_nBinFac;
        const int izz = iz + (vtxoffs[ec0][2]) * m_nBinFac;
        nv0 = m_norms[ec0] = getGrdNorm2(ixx, iyy, izz);
      }
      else {
        nv0 = m_norms[ec0];
      }
      if (m_norms[ ec1 ].w()<0.0) {
        const int ixx = ix + (vtxoffs[ec1][0]) * m_nBinFac;
        const int iyy = iy + (vtxoffs[ec1][1]) * m_nBinFac;
        const int izz = iz + (vtxoffs[ec1][2]) * m_nBinFac;
        nv1 = m_norms[ec1] = getGrdNorm2(ixx, iyy, izz);
      }
      else {
        nv1 = m_norms[ec1];
      }
      asEdgeNorm[iEdge] = (nv0.scale(1.0-fOffset) + nv1.scale(fOffset)).normalize();
    }
  }

  // Draw the triangles that were found.  There can be up to five per cube
  for(iTriangle = 0; iTriangle < 5; iTriangle++) {
    if(a2iTriangleConnectionTable[iFlagIndex][3*iTriangle] < 0)
      break;
    
    bool bNotDraw = false;
    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      if (!edgeBinFlags[iVertex]) {
        bNotDraw = true;
        break;
      }
    }
    if (bNotDraw)
      continue;

    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      
      // getVertexColor(sColor, asEdgeVertex[iVertex], asEdgeNorm[iVertex]);
      // glColor3f(sColor.x, sColor.y, sColor.z);

      //if (getLevel()<0) {
      if (m_dLevel<0) {
        if (pdl!=NULL) {
          pdl->normal(-asEdgeNorm[iVertex]);
          pdl->vertex(asEdgeVertex[iVertex]);
        }
        else {
          addMSVert(asEdgeVertex[iVertex], -asEdgeNorm[iVertex]);
        }
#ifdef SHOW_NORMAL
        m_tmpv.push_back(asEdgeVertex[iVertex]);
        m_tmpv.push_back(asEdgeVertex[iVertex]-asEdgeNorm[iVertex]);
#endif

      }
      else {
        if (pdl!=NULL) {
          pdl->normal(asEdgeNorm[iVertex]);
          pdl->vertex(asEdgeVertex[iVertex]);
        }
        else {
          addMSVert(asEdgeVertex[iVertex], asEdgeNorm[iVertex]);
        }
        
#ifdef SHOW_NORMAL
        m_tmpv.push_back(asEdgeVertex[iVertex]);
        m_tmpv.push_back(asEdgeVertex[iVertex]+asEdgeNorm[iVertex]);
#endif
      }


    } // for(iCorner = 0; iCorner < 3; iCorner++)

  } // for(iTriangle = 0; iTriangle < 5; iTriangle++)

  return;
}

qsys::ObjectPtr MapSurf2Renderer::generateSurfObj()
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
  m_pCMap = pMap;

  // generate map-range information
  // makerange();
  calcMapDispExtent(pMap);

  m_xform = calcXformMat(pMap, pXtal);
#if 0
  //  setup frac-->orth matrix
  if (pXtal==NULL) {
    m_xform = Matrix4D::makeTransMat(pMap->getOrigin());
  }
  else {
    Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
    m_xform = Matrix4D(orthmat);
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
#endif

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

  qsys::ObjectPtr rval = qsys::ObjectPtr(pSurfObj);
  return rval;
}

////////////////////////////////////////////////
// New rendering interface (for VBO/GLSL)

/// Use Ver2 interface (returns true)
bool MapSurf2Renderer::isUseVer2Iface() const
{
  //return false;
  return true;
}

void MapSurf2Renderer::invalidateDisplayCache()
{
  m_bWorkOK = false;
  super_t::invalidateDisplayCache();
}
    
void MapSurf2Renderer::createDisplayCache()
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  m_pCMap = pMap;

  // check and setup mol boundary data
  setupMolBndry();

  // generate map-range information
  //makerange();
  calcMapDispExtent(pMap);
  
  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;
  int lv = int( floor( (m_dLevel - pMap->getLevelBase()) / pMap->getLevelStep() ) );
  m_nIsoLevel = qbyte( qlib::clamp<int>(lv, 0, 255) );
  // calcContLevel(pMap);


  /////////////////////
  // CreateVBO

  // setup workarea

  //m_nMapColNo = pMap->getColNo();
  //m_nMapRowNo = pMap->getRowNo();
  //m_nMapSecNo = pMap->getSecNo();

  int ncol = m_dspSize.x(); //m_nActCol;
  int nrow = m_dspSize.y(); //m_nActCol;
  int nsec = m_dspSize.z(); //m_nActCol;

  int i,j,k;

  int nthr = 1;
#ifdef _OPENMP
  if (m_nOmpThr>0)
    omp_set_num_threads(m_nOmpThr);
  else
    omp_set_num_threads(omp_get_num_procs());
  nthr = omp_get_max_threads();
  LOG_DPRINTLN("MapSurf2> using OpenMP %d threads", nthr);
#endif

  std::vector<int> vinds(nthr);

  int nsz_est_thr = ncol*nrow*nsec*3/nthr;
  int nsz_est_tot = nsz_est_thr * nthr;
  
  if (m_pVBO!=NULL && m_pVBO->getSize()!=nsz_est_tot) {
    delete m_pVBO;
    m_pVBO=NULL;
  }

  if (m_pVBO==NULL) {
    m_pVBO = MB_NEW gfx::DrawElemVNC();
    m_pVBO->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    m_pVBO->alloc(nsz_est_tot);
  }

  MB_DPRINTLN("nthr=%d", nthr);
  MB_DPRINTLN("voxels %d", ncol*nrow*nsec);
  MB_DPRINTLN("estim size %d", nsz_est_tot);
  MB_DPRINTLN("estim size per thr%d", nsz_est_thr);
  
  for (i=0; i<nsz_est_tot; ++i) {
    //m_pVBO->m_pData[i] = {0.0f, 0.0f, 0.0f,0.0f, 0.0f, 0.0f,0,0,0,0};
    m_pVBO->m_pData[i].x = 0.0f;
    m_pVBO->m_pData[i].y = 0.0f;
    m_pVBO->m_pData[i].z = 0.0f;
    m_pVBO->m_pData[i].nx = 0.0f;
    m_pVBO->m_pData[i].ny = 0.0f;
    m_pVBO->m_pData[i].nz = 0.0f;
    m_pVBO->m_pData[i].r = 0;
    m_pVBO->m_pData[i].g = 0;
    m_pVBO->m_pData[i].b = 0;
    m_pVBO->m_pData[i].a = 0;
  }
  std::vector<int> iverts(nthr);
  for (i=0; i<nthr; ++i) {
    iverts[i] = i*nsz_est_thr;
    MB_DPRINTLN("thr %d start id %d", i, iverts[i]);
  }

  quint32 cc = getColor()->getCode();
  m_col_r = gfx::getRCode(cc);
  m_col_g = gfx::getGCode(cc);
  m_col_b = gfx::getBCode(cc);
  m_col_a = gfx::getACode(cc);

  m_nbcol = m_mapStPos.x();
  m_nbrow = m_mapStPos.y();
  m_nbsec = m_mapStPos.z();

  const int ixmax = m_mapSize.x();
  const int iymax = m_mapSize.y();
  const int izmax = m_mapSize.z();

  /////////////////////
  // do marching cubes

#ifdef _OPENMP
#pragma omp parallel for private (j,k) schedule(dynamic)
  for (i=0; i<ncol; i+=m_nBinFac) {
    int ithr = 0;
    ithr = omp_get_thread_num();
    for (j=0; j<nrow; j+=m_nBinFac) {
      for (k=0; k<nsec; k+=m_nBinFac) {
#else
  int ithr = 0;
  for (i=0; i<ncol; i+=m_nBinFac) {
    for (j=0; j<nrow; j+=m_nBinFac) {
      for (k=0; k<nsec; k+=m_nBinFac) {
#endif

        //if (i==1&&j==1)
        //MB_DPRINTLN("i=%d, thr=%d", k, ithr);

        qbyte values[8];
        bool bary[8];

        //if (i==1&&j==1)
        //MB_DPRINTLN("i=%d, thr=%d", k, omp_get_thread_num());

        int ix = i + m_nbcol;
        int iy = j + m_nbrow;
        int iz = k + m_nbsec;
        if (!m_bPBC) {
          if (ix<0||iy<0||iz<0)
            continue;
          if (ix+1>=ixmax||
              iy+1>=iymax||
              iz+1>=izmax)
            continue;
        }

        bool bin = false;
        int ii;
        for (ii=0; ii<8; ii++) {
          const int ixx = ix + (vtxoffs[ii][0]) * m_nBinFac;
          const int iyy = iy + (vtxoffs[ii][1]) * m_nBinFac;
          const int izz = iz + (vtxoffs[ii][2]) * m_nBinFac;
          values[ii] = getByteDen(ixx, iyy, izz);
          
          // check mol boundary
          bary[ii] = inMolBndry(pMap, ixx, iyy, izz);
          if (bary[ii])
            bin = true;
        }

        if (!bin)
          continue;

        marchCube2(i, j, k, values, bary, &iverts[ithr]);
      }
    }
  }

/*
  //pdl->startTriangles();
  for (i=0; i<nthr; ++i) {
    //LOG_DPRINTLN("Triangles: %d for thr %d", verts[i].size(), i);
    //BOOST_FOREACH (surface::MSVert &v, verts[i]) {
    //pdl->normal(v.n3d());
    //pdl->vertex(v.v3d());
    //}

    MB_DPRINTLN("Triangles: %d for thr %d", vinds[i], i);
    m_verts[i].setSize(vinds[i]);
    //pdl->drawElem(verts[i]);
  }
  //pdl->end();
*/
      
#ifdef MB_DEBUG
  for (i=0; i<nthr; ++i) {
    MB_DPRINTLN("Triangles: thr %d last vid %d", i, iverts[i]);
  }
#endif


  m_pVBO->setUpdated(true);
  m_bWorkOK = true;
  m_pCMap = NULL;
}

namespace {
  inline float getOffset(qbyte val1, qbyte val2, qbyte isolev)
  {
    int delta = int(val2) - int(val1);
    
    if(delta == 0) {
      return 0.5f;
    }
    return float(int(isolev) - int(val1))/float(delta);
  }
}

void MapSurf2Renderer::marchCube2(int fx, int fy, int fz,
                                  const qbyte *values,
                                  const bool *bary,
                                  int *pvind)
{
  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;

  //Vector4D asEdgeVertex[12];
  float asEdgeVertex[12][3];

  //Vector4D asEdgeNorm[12];
  float asEdgeNorm[12][3];

  bool edgeBinFlags[12];

  //Vector4D norms[8];
  float norms[8][4];

  // Find which vertices are inside of the surface and which are outside
  iFlagIndex = 0;
  for(iVertexTest = 0; iVertexTest < 8; iVertexTest++) {
    if(values[iVertexTest] <= m_nIsoLevel) 
      iFlagIndex |= 1<<iVertexTest;
  }

  // Find which edges are intersected by the surface
  iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];
  //If the cube is entirely inside or outside of the surface, then there will be no intersections
  if(iEdgeFlags == 0) {
    return;
  }

  for (int ii=0; ii<8; ii++) {
    //norms[ii].w() = -1.0;
    norms[ii][3] = -1.0f;
  }

  ScalarObject *pMap = m_pCMap;
  const int ix = fx + m_nbcol;
  const int iy = fy + m_nbrow;
  const int iz = fz + m_nbsec;

  // Find the point of intersection of the surface with each edge
  // Then find the normal to the surface at those points
  for(iEdge = 0; iEdge < 12; iEdge++) {
    //if there is an intersection on this edge
    if(iEdgeFlags & (1<<iEdge)) {
      const int ec0 = a2iEdgeConnection[iEdge][0];
      const int ec1 = a2iEdgeConnection[iEdge][1];
      if (bary[ec0]==false || bary[ec1]==false) {
        edgeBinFlags[iEdge] = false;
        continue;
      }
      edgeBinFlags[iEdge] = true;
      
      const float fOffset = getOffset(values[ ec0 ], 
                                      values[ ec1 ], m_nIsoLevel);
      
      asEdgeVertex[iEdge][0] =
        float(fx) +
          (a2fVertexOffset[ec0][0] + fOffset*a2fEdgeDirection[iEdge][0]) * m_nBinFac;
      asEdgeVertex[iEdge][1] =
        float(fy) +
          (a2fVertexOffset[ec0][1] + fOffset*a2fEdgeDirection[iEdge][1]) * m_nBinFac;
      asEdgeVertex[iEdge][2] =
        float(fz) +
          (a2fVertexOffset[ec0][2] + fOffset*a2fEdgeDirection[iEdge][2]) * m_nBinFac;
      //asEdgeVertex[iEdge].w() = 0;
      
      //Vector4D nv0,nv1;
      if (norms[ec0][3]<0.0) {
        const int ixx = ix + (vtxoffs[ec0][0]) * m_nBinFac;
        const int iyy = iy + (vtxoffs[ec0][1]) * m_nBinFac;
        const int izz = iz + (vtxoffs[ec0][2]) * m_nBinFac;
        getGrdNormByte(ixx, iyy, izz, &norms[ec0][0]);
      }
      if (norms[ec1][3]<0.0) {
        const int ixx = ix + (vtxoffs[ec1][0]) * m_nBinFac;
        const int iyy = iy + (vtxoffs[ec1][1]) * m_nBinFac;
        const int izz = iz + (vtxoffs[ec1][2]) * m_nBinFac;
        getGrdNormByte(ixx, iyy, izz, &norms[ec1][0]);
      }

      const float roffs = (1.0f-fOffset);
      asEdgeNorm[iEdge][0] = norms[ec0][0]*roffs + norms[ec1][0]*fOffset;
      asEdgeNorm[iEdge][1] = norms[ec0][1]*roffs + norms[ec1][1]*fOffset;
      asEdgeNorm[iEdge][2] = norms[ec0][2]*roffs + norms[ec1][2]*fOffset;
      float len = sqrt(asEdgeNorm[iEdge][0]*asEdgeNorm[iEdge][0] +
                       asEdgeNorm[iEdge][1]*asEdgeNorm[iEdge][1] +
                       asEdgeNorm[iEdge][2]*asEdgeNorm[iEdge][2]);
      if (m_dLevel<0.0)
        len *= -1.0f;
      asEdgeNorm[iEdge][0] /= len;
      asEdgeNorm[iEdge][1] /= len;
      asEdgeNorm[iEdge][2] /= len;
    }
  }

  const int nverts = m_pVBO->getSize();
  int i;

  // Draw the triangles that were found.  There can be up to five per cube
  for(iTriangle = 0; iTriangle < 5; iTriangle++) {
    if(a2iTriangleConnectionTable[iFlagIndex][3*iTriangle] < 0)
      break;

    bool bNotDraw = false;
    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      if (!edgeBinFlags[iVertex]) {
        bNotDraw = true;
        break;
      }
    }
    if (bNotDraw)
      continue;

    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      //verts.push_back( surface::MSVert(asEdgeVertex[iVertex],
      //asEdgeNorm[iVertex]) );

      i = *pvind;
      MB_DPRINTLN("i=%d", i);
      if (i<nverts) {
        m_pVBO->m_pData[i].x = asEdgeVertex[iVertex][0];
        m_pVBO->m_pData[i].y = asEdgeVertex[iVertex][1];
        m_pVBO->m_pData[i].z = asEdgeVertex[iVertex][2];
        
        m_pVBO->m_pData[i].nx = asEdgeNorm[iVertex][0];
        m_pVBO->m_pData[i].ny = asEdgeNorm[iVertex][1];
        m_pVBO->m_pData[i].nz = asEdgeNorm[iVertex][2];

        m_pVBO->m_pData[i].r = m_col_r;
        m_pVBO->m_pData[i].g = m_col_g;
        m_pVBO->m_pData[i].b = m_col_b;
        m_pVBO->m_pData[i].a = m_col_a;
      }
      else {
        MB_DPRINTLN("index out of range: %d", i);
      }
      (*pvind)++;
    } // for(iCorner = 0; iCorner < 3; iCorner++)

  } // for(iTriangle = 0; iTriangle < 5; iTriangle++)

  return;
}

bool MapSurf2Renderer::isCacheAvail() const
{
  return m_bWorkOK;
}

void MapSurf2Renderer::renderVBO(DisplayContext *pdc)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
  m_pCMap = pMap;
  

  preRender(pdc);

  pdc->pushMatrix();
  //setupXformMat(pdc);
  setupXform(pdc, pMap, pXtal);

  if (m_pVBO!=NULL)
    pdc->drawElem(*m_pVBO);

  pdc->popMatrix();

  postRender(pdc);

  m_pCMap = NULL;
}

