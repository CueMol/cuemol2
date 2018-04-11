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
#include <gfx/Mesh.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;
using molstr::AtomIterator;

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

  m_nBinFac = 1;
//  m_nMaxGrid = 100;

  m_nGlRendMode = MSR_REND_DLIST;

  m_bGenSurfMode = false;

/*
  m_nOmpThr = -1;
  m_bIsoLev = 0;
  m_bWorkOK = false;
  m_pVBO=NULL;

  m_bChkShaderDone = false;

  m_pPO = NULL;
  m_pAttrArray = NULL;
  m_nMapTexID = 0;
  m_nMapBufID = 0;

*/
}

// destructor
MapSurfRenderer::~MapSurfRenderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

/*
  if (m_pVBO!=NULL)
    delete m_pVBO;
*/
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
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  m_pCMap = pMap;

  // check and setup mol boundary data
  setupMolBndry();

  // generate map-range information
  makerange();

  pdl->pushMatrix();
  setupXformMat(pdl);

  MB_DPRINTLN("MapSurfRenderer Rendereing...");

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

  /////////////////////
  // do marching cubes

  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

  int i,j,k;
  /*
  for (i=0; i<ncol; i++)
    for (j=0; j<nrow; j++)
      for (k=0; k<nsec; k++) {
        //if (i==1&&j==1)
        //MB_DPRINTLN("i=%d, thr=%d", k, omp_get_thread_num());
*/

  for (i=0; i<ncol; i+=m_nBinFac)
    for (j=0; j<nrow; j+=m_nBinFac)
      for (k=0; k<nsec; k+=m_nBinFac) {

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
        
        if (i==0) {
        }
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
        

  m_pColMapObj = NULL;
  m_pGrad = NULL;
}

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

/*
Vector4D MapSurfRenderer::getGrdNorm(int x, int y, int z)
{
  Vector4D rval;

  int ix = x+ (m_nStCol - m_pCMap->getStartCol());
  int iy = y+ (m_nStRow - m_pCMap->getStartRow());
  int iz = z+ (m_nStSec - m_pCMap->getStartSec());

  //const int n = m_nBinFac;
  const int n = 1;
  rval.x() = getDen(ix-n, iy,   iz  ) - getDen(ix+n, iy,   iz );
  rval.y() = getDen(ix,   iy-n, iz  ) - getDen(ix,   iy+n, iz  );
  rval.z() = getDen(ix,   iy,   iz-n) - getDen(ix,   iy,   iz+n);
  return rval;
}*/

Vector4D MapSurfRenderer::getGrdNorm2(int ix, int iy, int iz)
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

void MapSurfRenderer::marchCube(DisplayContext *pdl,
                                int fx, int fy, int fz)
{
  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;

  Vector4D asEdgeVertex[12];
  Vector4D asEdgeNorm[12];
  bool edgeBinFlags[12];

  // Find which vertices are inside (0) of the surface and which are outside (1)
  iFlagIndex = 0;
  for(iVertexTest = 0; iVertexTest < 8; iVertexTest++) {
    if(m_values[iVertexTest] <= m_dLevel) 
      iFlagIndex |= 1<<iVertexTest;
  }

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

  if(iFlagIndex == 0 && pdl==NULL) {
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
          addMSVert(fx+dx+dx2, fy+dy+dy2, fz+dz+dz2, nx, ny, nz);
        }
      }
    }
    return;
  }

  // Find which edges are intersected by the surface
  iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

  {
    for (int ii=0; ii<8; ii++) {
      m_norms[ii].w() = -1.0;
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
      
      if (getColorMode()!=MapRenderer::MAPREND_SIMPLE)
        setVertexColor(pdl, asEdgeVertex[iVertex]);

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


  // Fill the border of the extent
  if(pdl==NULL) {
    Vector4D v[8+12];
    for (int i=0; i<8; ++i) {
      v[i].x() = double(fx) + a2fVertexOffset[i][0] * m_nBinFac;
      v[i].y() = double(fy) + a2fVertexOffset[i][1] * m_nBinFac;
      v[i].z() = double(fz) + a2fVertexOffset[i][2] * m_nBinFac;
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
        const int *iedges = bdr_edges[iBorder]; //[4] = {8, 7, 11, 3};
        
        int ivf4 = getVertFlag4(iFlagIndex, iverts);
        
        for (int j=0; j<3*3; ++j) {
          int ix = bdr_tris[ivf4][j];
          if (ix<0) break;
          addMSVert(v[iverts[ix]], norm);
        }
        

            /*
          switch (ivf4) {
            // 1-tri case
          case 15-1:
            addMSVert(v[iverts[0]], norm);
            addMSVert(v[iverts[0+4]], norm);
            addMSVert(v[iverts[3+4]], norm);
            break;
          case 15-2:
            addMSVert(v[iverts[1]], norm);
            addMSVert(v[iverts[1+4]], norm);
            addMSVert(v[iverts[0+4]], norm);
            break;
          case 15-4:
            addMSVert(v[iverts[2]], norm);
            addMSVert(v[iverts[2+4]], norm);
            addMSVert(v[iverts[1+4]], norm);
            break;
          case 15-8:
            addMSVert(v[iverts[3]], norm);
            addMSVert(v[iverts[3+4]], norm);
            addMSVert(v[iverts[2+4]], norm);
            break;

            // 2-tri case
          case 12: // 1100
            addMSVert(v[iverts[0]], norm);
            addMSVert(v[iverts[1]], norm);
            addMSVert(asEdgeVertex[iedges[3]], norm);
            
            addMSVert(v[iverts[1]], norm);
            addMSVert(asEdgeVertex[iedges[1]], norm);
            addMSVert(asEdgeVertex[iedges[3]], norm);
            break;
            
          case 3: // 0011
            addMSVert(v[iverts[2]], norm);
            addMSVert(v[iverts[3]], norm);
            addMSVert(asEdgeVertex[iedges[1]], norm);
            
            addMSVert(v[iverts[3]], norm);
            addMSVert(asEdgeVertex[iedges[3]], norm);
            addMSVert(asEdgeVertex[iedges[1]], norm);
            break;

          case 6: // 0110
            addMSVert(v[iverts[3]], norm);
            addMSVert(v[iverts[0]], norm);
            addMSVert(asEdgeVertex[iedges[2]], norm);
            
            addMSVert(v[iverts[0]], norm);
            addMSVert(asEdgeVertex[iedges[0]], norm);
            addMSVert(asEdgeVertex[iedges[2]], norm);
            break;

          case 9: // 1001
            addMSVert(v[iverts[1]], norm);
            addMSVert(v[iverts[2]], norm);
            addMSVert(asEdgeVertex[iedges[0]], norm);
            
            addMSVert(v[iverts[2]], norm);
            addMSVert(asEdgeVertex[iedges[2]], norm);
            addMSVert(asEdgeVertex[iedges[0]], norm);
            break;

            
          case 5:
          case 10:
            LOG_DPRINTLN("XXX");
            break;
            
          case 0:
            addMSVert(v[iverts[0]], norm);
            addMSVert(v[iverts[1]], norm);
            addMSVert(v[iverts[3]], norm);

            addMSVert(v[iverts[1]], norm);
            addMSVert(v[iverts[2]], norm);
            addMSVert(v[iverts[3]], norm);
            break;

          case 15:
            break;
            

            // 3-tri case
          case 1:
            addMSVert(v[iverts[2]], norm);
            addMSVert(asEdgeVertex[iedges[3]], norm);
            addMSVert(asEdgeVertex[iedges[0]], norm);

            addMSVert(v[iverts[2]], norm);
            addMSVert(asEdgeVertex[iedges[0]], norm);
            addMSVert(v[iverts[1]], norm);

            addMSVert(v[iverts[2]], norm);
            addMSVert(v[iverts[3]], norm);
            addMSVert(asEdgeVertex[iedges[3]], norm);
            break;

          case 2:
            addMSVert(v[iverts[3]], norm);
            addMSVert(asEdgeVertex[iedges[0]], norm);
            addMSVert(asEdgeVertex[iedges[1]], norm);

            addMSVert(v[iverts[3]], norm);
            addMSVert(asEdgeVertex[iedges[1]], norm);
            addMSVert(v[iverts[2]], norm);

            addMSVert(v[iverts[3]], norm);
            addMSVert(v[iverts[0]], norm);
            addMSVert(asEdgeVertex[iedges[0]], norm);
            break;

          case 4:
            addMSVert(v[iverts[0]], norm);
            addMSVert(asEdgeVertex[iedges[1]], norm);
            addMSVert(asEdgeVertex[iedges[2]], norm);
            
            addMSVert(v[iverts[0]], norm);
            addMSVert(asEdgeVertex[iedges[2]], norm);
            addMSVert(v[iverts[3]], norm);

            addMSVert(v[iverts[0]], norm);
            addMSVert(v[iverts[1]], norm);
            addMSVert(asEdgeVertex[iedges[1]], norm);
            break;

          case 8:
            addMSVert(v[iverts[1]], norm);
            addMSVert(asEdgeVertex[iedges[2]], norm);
            addMSVert(asEdgeVertex[iedges[3]], norm);
            
            addMSVert(v[iverts[1]], norm);
            addMSVert(asEdgeVertex[iedges[3]], norm);
            addMSVert(v[iverts[0]], norm);

            addMSVert(v[iverts[1]], norm);
            addMSVert(v[iverts[2]], norm);
            addMSVert(asEdgeVertex[iedges[2]], norm);
            break;
          }
             */


      }
    }
    return;
  }

}

void MapSurfRenderer::setupXformMat()
{
  ScalarObject *pMap = m_pCMap;
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

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
}

qsys::ObjectPtr MapSurfRenderer::generateSurfObj()
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
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

  if (m_pColMapObj==NULL)
    return;

  Vector4D vv(pos);
  vv.w() = 1.0;
  m_xform.xform4D(vv);

  double par = m_pColMapObj->getValueAt(vv);
  ColorPtr pcol = m_pGrad->getColor(par);
  pdl->color(pcol);
}

