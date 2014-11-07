// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

#include "MapSurfRenderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>

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
//  m_nBufSize = 100;
//  m_lw = 1.0;
//  m_bPBC = false;
  m_bAutoUpdate = true;

  //resetAllProps();

//  m_bUseMolBndry = false;

  m_pCMap = NULL;
}

// destructor
MapSurfRenderer::~MapSurfRenderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
}

/////////////////////////////////

const char *MapSurfRenderer::getTypeName() const
{
  return "isosurf";
}

/////////////////////////////////

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
  pdc->setLighting(true);
}

// generate display list
void MapSurfRenderer::render(DisplayContext *pdl)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  m_pCMap = pMap;

  // generate map-range information
  makerange();

  //
  //  setup frac-->orth matrix
  //

  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

  pdl->pushMatrix();

  if (pXtal==NULL)
    pdl->translate(pMap->getOrigin());

  if (pXtal!=NULL) {
    Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
    //orthmat.transpose();
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

  MB_DPRINTLN("MapSurfRenderer Rendereing...\n");

  //pdl->startLines();
  pdl->setPolygonMode(DisplayContext::POLY_FILL);
  //if (!m_bCullFace)
  pdl->setCullFace(false);
  pdl->startTriangles();

  /////////////////////
  // setup workarea
  //m_dLevel = getLevel()*pMap->getRmsdDensity();
  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;
  m_nMapColNo = pMap->getColNo();
  m_nMapRowNo = pMap->getRowNo();
  m_nMapSecNo = pMap->getSecNo();

  /////////////////////
  // do marching cubes

  int i,j,k;
  for (i=0; i<ncol; i++)
    for (j=0; j<nrow; j++)
      for (k=0; k<nsec; k++) {
        int ix = i+m_nStCol - pMap->getStartCol();
        int iy = j+m_nStRow - pMap->getStartRow();
        int iz = k+m_nStSec - pMap->getStartSec();
        if (ix<0||iy<0||iz<0)
          continue;
        if (ix+1>=m_nMapColNo||
            iy+1>=m_nMapRowNo||
            iz+1>=m_nMapSecNo)
          continue;
        double values[8];
        
        int ii;
        for (ii=0; ii<8; ii++)
          values[ii] = pMap->atFloat(ix+vtxoffs[ii][0], iy+vtxoffs[ii][1], iz+vtxoffs[ii][2]);
        
        marchCube(pdl, i, j, k, values);

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
        

  //////////

  pdl->end();
  pdl->setLighting(false);

  pdl->popMatrix();

  MB_DPRINTLN("MapSurfRenderer Rendereing OK\n");
  m_pCMap = NULL;
}

void MapSurfRenderer::makerange()
{
  ScalarObject *pMap = m_pCMap; //static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
  if (pMap==NULL)
    return;

  Vector4D vcent;
  vcent = getCenter();
  double centx = vcent.x();
  double centy = vcent.y();
  double centz = vcent.z();
  // double width = getRange();
  const double extent = getExtent();

  //
  // col,row,sec
  //
  Vector4D vmin(centx-extent, centy-extent, centz-extent),
  vmax(centx+extent, centy+extent, centz+extent);

  // get origin / translate the origin to (0,0,0)
  vmin -= pMap->getOrigin();
  vmax -= pMap->getOrigin();

  if (pXtal!=NULL) {
    const CrystalInfo &xt = pXtal->getXtalInfo();
    xt.orthToFrac(vmin);
    xt.orthToFrac(vmax);
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

  //if (!m_bPBC) {
  // limit XYZ in the available region of map
  vmin.x() = floor(qlib::max<double>(vmin.x(), pMap->getStartCol()));
  vmin.y() = floor(qlib::max<double>(vmin.y(), pMap->getStartRow()));
  vmin.z() = floor(qlib::max<double>(vmin.z(), pMap->getStartSec()));
  
  vmax.x() = floor(qlib::min<double>(vmax.x(), pMap->getStartCol()+pMap->getColNo()));
  vmax.y() = floor(qlib::min<double>(vmax.y(), pMap->getStartRow()+pMap->getRowNo()));
  vmax.z() = floor(qlib::min<double>(vmax.z(), pMap->getStartSec()+pMap->getSecNo()));
  // }

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

//fGetOffset finds the approximate point of intersection of the surface
// between two points with the values fValue1 and fValue2
double MapSurfRenderer::getOffset(double fValue1, double fValue2, double fValueDesired)
{
  double fDelta = fValue2 - fValue1;
 
  if(fDelta == 0.0) {
    return 0.5;
  }
  return (fValueDesired - fValue1)/fDelta;
}



//vGetNormal() finds the gradient of the scalar field at a point
//This gradient can be used as a very accurate vertx normal for lighting calculations
void MapSurfRenderer::getNormal(Vector4D &rfNormal, double fX, double fY, double fZ)
{
  rfNormal.x() = intrpX(fX-0.01, (int) fY, (int) fZ) - intrpX(fX+0.01, (int) fY, (int) fZ);
  rfNormal.y() = intrpY((int) fX, fY-0.01, (int) fZ) - intrpY((int) fX, fY+0.01, (int) fZ);
  rfNormal.z() = intrpZ((int) fX, (int) fY, fZ-0.01) - intrpZ((int) fX, (int) fY, fZ+0.01);
  // vNormalizeVector(rfNormal, rfNormal);

  rfNormal = rfNormal.normalizeThrows();
/*
  double len = rfNormal.length();
  if (len>F_EPS16) {
    rfNormal /= len;
  }*/
}

/*
//vGetColor generates a color from a given position and normal of a point
void MapSurfRenderer::getVertexColor(Vector4D &rfColor, Vector4D &rfPosition, Vector4D &rfNormal)
{
  double fX = rfNormal.x();
  double fY = rfNormal.y();
  double fZ = rfNormal.z();
  rfColor.x() = (fX > 0.0 ? fX : 0.0) + (fY < 0.0 ? -0.5*fY : 0.0) + (fZ < 0.0 ? -0.5*fZ : 0.0);
  rfColor.y() = (fY > 0.0 ? fY : 0.0) + (fZ < 0.0 ? -0.5*fZ : 0.0) + (fX < 0.0 ? -0.5*fX : 0.0);
  rfColor.z() = (fZ > 0.0 ? fZ : 0.0) + (fX < 0.0 ? -0.5*fX : 0.0) + (fY < 0.0 ? -0.5*fY : 0.0);
}
*/

/////////////////

//////////////////////////////////////////


void MapSurfRenderer::marchCube(DisplayContext *pdl, double fx, double fy, double fz, double *values)
{
  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;
  double fOffset;
  // Vector4D sColor;
  Vector4D asEdgeVertex[12];
  Vector4D asEdgeNorm[12];

  const double fScale = 1.0;

  // Find which vertices are inside of the surface and which are outside
  iFlagIndex = 0;
  for(iVertexTest = 0; iVertexTest < 8; iVertexTest++) {
    if(values[iVertexTest] <= m_dLevel) 
      iFlagIndex |= 1<<iVertexTest;
  }

  // Find which edges are intersected by the surface
  iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

  //If the cube is entirely inside or outside of the surface, then there will be no intersections
  if(iEdgeFlags == 0) {
    return;
  }

  // Find the point of intersection of the surface with each edge
  // Then find the normal to the surface at those points
  for(iEdge = 0; iEdge < 12; iEdge++) {
    //if there is an intersection on this edge
    if(iEdgeFlags & (1<<iEdge)) {
      fOffset = getOffset(values[ a2iEdgeConnection[iEdge][0] ], 
                          values[ a2iEdgeConnection[iEdge][1] ], m_dLevel);
      
      asEdgeVertex[iEdge].x() = fx + (a2fVertexOffset[ a2iEdgeConnection[iEdge][0] ][0]  +  fOffset * a2fEdgeDirection[iEdge][0]) * fScale;
      asEdgeVertex[iEdge].y() = fy + (a2fVertexOffset[ a2iEdgeConnection[iEdge][0] ][1]  +  fOffset * a2fEdgeDirection[iEdge][1]) * fScale;
      asEdgeVertex[iEdge].z() = fz + (a2fVertexOffset[ a2iEdgeConnection[iEdge][0] ][2]  +  fOffset * a2fEdgeDirection[iEdge][2]) * fScale;
      
      getNormal(asEdgeNorm[iEdge], asEdgeVertex[iEdge].x(), asEdgeVertex[iEdge].y(), asEdgeVertex[iEdge].z());
    }
  }

  // Draw the triangles that were found.  There can be up to five per cube
  for(iTriangle = 0; iTriangle < 5; iTriangle++) {
    if(a2iTriangleConnectionTable[iFlagIndex][3*iTriangle] < 0)
      break;
    
    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      
      // getVertexColor(sColor, asEdgeVertex[iVertex], asEdgeNorm[iVertex]);
      // glColor3f(sColor.x, sColor.y, sColor.z);
      if (getLevel()<0)
        pdl->normal(-asEdgeNorm[iVertex]);
      else
        pdl->normal(asEdgeNorm[iVertex]);
      pdl->vertex(asEdgeVertex[iVertex]);
    }
  }

  return;
}

