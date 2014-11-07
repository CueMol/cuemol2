// -*-Mode: C++;-*-
//
// Generate/Render the map contour mesh of ScalarObject
//

#include <common.h>

#include "MapMeshRenderer.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

#define SCALE 0x1000
//#define DBG_DRAW_AXIS 0

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;
using molstr::AtomIterator;

// default constructor
MapMeshRenderer::MapMeshRenderer()
     : super_t()
{
  m_pXCrsLst = NULL;
  m_pYCrsLst = NULL;
  m_pZCrsLst = NULL;

  m_nBufSize = 100;
  m_lw = 1.0;
  m_bPBC = false;
  m_bAutoUpdate = true;

  //resetAllProps();

  // default work area size 100x100x100
  setCrossArraySize(m_nBufSize,m_nBufSize,m_nBufSize);

  m_bUseMolBndry = false;
}

// destructor
MapMeshRenderer::~MapMeshRenderer()
{
  if (m_pXCrsLst!=NULL)
    delete m_pXCrsLst;

  if (m_pYCrsLst!=NULL)
    delete m_pYCrsLst;

  if (m_pZCrsLst!=NULL)
    delete m_pZCrsLst;

  //if (m_pdl!=NULL)
  //delete m_pdl;

  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
}

/////////////////////////////////

const char *MapMeshRenderer::getTypeName() const
{
  return "contour";
}

/////////////////////////////////

void MapMeshRenderer::setBufSize(int nsize)
{
  if (nsize<=10)
    nsize = 10;
  m_nBufSize = nsize;
  setCrossArraySize(m_nBufSize,m_nBufSize,m_nBufSize);
}

bool MapMeshRenderer::setCrossArraySize(int ncol, int nrow, int nsec)
{
  if (m_pXCrsLst!=NULL)
    delete m_pXCrsLst;

  if (m_pYCrsLst!=NULL)
    delete m_pYCrsLst;

  if (m_pZCrsLst!=NULL)
    delete m_pZCrsLst;

  m_nColCrs = ncol; m_nRowCrs = nrow; m_nSecCrs = nsec;

  m_pXCrsLst = new qlib::ByteMap(ncol, nrow, nsec);
  m_pYCrsLst = new qlib::ByteMap(ncol, nrow, nsec);
  m_pZCrsLst = new qlib::ByteMap(ncol, nrow, nsec);

  if (m_pXCrsLst==NULL||
      m_pYCrsLst==NULL||
      m_pZCrsLst==NULL)
    return false;

  return true;
}

unsigned char MapMeshRenderer::getContSec(unsigned int s0,
                                          unsigned int s1,
                                          unsigned int lv)
{
  double crs;
  bool flag = false;
  if ( s0!=s1 ) {
    if (s0<lv && lv<s1) { // s0 < lv < s1
      crs = double(lv-s0)/double(s1-s0);
      flag = true;
    }
    else if (s1<lv && lv<s0) { // s1 < lv < s0
      crs = double(s0-lv)/double(s0-s1);
      flag = true;
    }
    else if((lv==s0 || lv==s1) &&
            (lv>=s0 && lv>=s1)) {
      if (lv==s0)
        crs = m_delta/double(s0-s1);
      else
        crs = double(lv-s0)/(double(s1-s0)+m_delta);
      flag = true;
    }
  }

  if (flag==false)
    return 0;

  //MB_DPRINT("(%d %d)/%d contour sec %f\n",s0, s1, lv, crs);
  crs *= 254.0f;
  if (crs<=0)
    return 1;
  else if (crs>=254)
    return 255;

  unsigned char bcrs = (unsigned char)crs;
  bcrs++;
  return bcrs;
}

bool MapMeshRenderer::generate(ScalarObject *pMap, DensityMap *pXtal)
{
  const Vector4D cent = getCenter();
  const double siglevel = getSigLevel();
  const double extent = getExtent();

  if (pMap==NULL)
    return false;

  // check and setup mol boundary data
  setupMolBndry();

  // calculate the contour level
  const double level = pMap->getRmsdDensity() * siglevel;
  double lvtmp = floor( (level-pMap->getLevelBase()) / pMap->getLevelStep() * SCALE );
  unsigned int lv = (unsigned int)lvtmp;
  if (lvtmp<0) lv = 0;
  if (lvtmp>0xFF*SCALE) lv = 0xFF*SCALE;
  
  m_delta = pMap->getRmsdDensity()*0.01;

  //
  // col,row,sec
  //
  Vector4D vmin(cent.x()-extent, cent.y()-extent, cent.z()-extent);
  Vector4D vmax(cent.x()+extent, cent.y()+extent, cent.z()+extent);

  //Vector4D vmin(-1000,-1000,-1000),
  //    vmax(1000,1000,1000);

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
        qlib::isNear4(dimz, cec))
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

  m_nMapColNo = pMap->getColNo();
  m_nMapRowNo = pMap->getRowNo();
  m_nMapSecNo = pMap->getSecNo();

  Vector4D vwi;
  vwi.x() = vmax.x() - vmin.x();
  vwi.y() = vmax.y() - vmin.y();
  vwi.z() = vmax.z() - vmin.z();
  if (vwi.x() >= m_nColCrs) {
    int dif = int(vwi.x() - m_nColCrs);
    if (dif%2==0)
      dif /= 2;
    else
      dif = dif/2+1;
    vmin.x() += dif;
    vmax.x() -= dif;
  }

  if (vwi.y() >= m_nRowCrs) {
    int dif = int(vwi.y() - m_nRowCrs);
    if (dif%2==0)
      dif /= 2;
    else
      dif = dif/2+1;
    vmin.y() += dif;
    vmax.y() -= dif;
  }

  if (vwi.z() >= m_nSecCrs) {
    int dif = int(vwi.z() - m_nSecCrs);
    if (dif%2==0)
      dif /= 2;
    else
      dif = dif/2+1;
    vmin.z() += dif;
    vmax.z() -= dif;
  }

  int ncol = int(vmax.x() - vmin.x());
  int nrow = int(vmax.y() - vmin.y());
  int nsec = int(vmax.z() - vmin.z());

  int stcol = int(vmin.x())-pMap->getStartCol();
  int strow = int(vmin.y())-pMap->getStartRow();
  int stsec = int(vmin.z())-pMap->getStartSec();

  MB_DPRINT("ncol_cross: %d\n", m_nColCrs);
  MB_DPRINT("nrow_cross: %d\n", m_nRowCrs);
  MB_DPRINT("nsec_cross: %d\n", m_nSecCrs);

  MB_DPRINT("ncol: %d\n", ncol);
  MB_DPRINT("nrow: %d\n", nrow);
  MB_DPRINT("nsec: %d\n", nsec);

  // MB_DPRINT("col: %f - %f\n",vmin.x(),vmax.x());
  // MB_DPRINT("row: %f - %f\n",vmin.y(),vmax.y());
  // MB_DPRINT("sec: %f - %f\n",vmin.z(),vmax.z());

  // MB_DPRINT("stcol: %d\n",stcol);
  // MB_DPRINT("strow: %d\n",strow);
  // MB_DPRINT("stsec: %d\n",stsec);

	int i,j,k;
  //
  // generate X(column) direction contour section
  //

  MB_DPRINTLN("Xdir contour gen start");

  unsigned char crs;
  unsigned int s0,s1;
  for (k=0; k<nsec; k++)
    for (j=0; j<nrow; j++)
      for (i=0; i<ncol-1; i++){
        s0 = getMap(pMap, stcol+i,  strow+j,stsec+k)*SCALE;
        s1 = getMap(pMap, stcol+i+1,strow+j,stsec+k)*SCALE;
        crs = getContSec(s0, s1, lv);

        if (crs!=0) {
          if (!inMolBndry(pMap, stcol+i,  strow+j,stsec+k) ||
              !inMolBndry(pMap, stcol+i+1,strow+j,stsec+k))
            crs=0;
        }

        m_pXCrsLst->at(i,j,k) = crs;
      }

  /////////////////////////////////////////////

  MB_DPRINTLN("Ydir contour gen start");

  for (k=0; k<nsec; k++)
    for (i=0; i<ncol; i++)
      for (j=0; j<nrow-1; j++) {
        s0 = getMap(pMap, stcol+i,strow+j,  stsec+k)*SCALE;
        s1 = getMap(pMap, stcol+i,strow+j+1,stsec+k)*SCALE;
        crs = getContSec(s0, s1, lv);

        if (crs!=0) {
          if (!inMolBndry(pMap, stcol+i,strow+j  ,stsec+k) ||
              !inMolBndry(pMap, stcol+i,strow+j+1,stsec+k))
            crs = 0;
        }

        m_pYCrsLst->at(i,j,k) = crs;
      }



  /////////////////////////////////////////////
  
  MB_DPRINTLN("Zdir contour gen start");
  
  for (j=0; j<nrow; j++)
    for (i=0; i<ncol; i++)
      for (k=0; k<nsec-1; k++){
        s0 = getMap(pMap, stcol+i,strow+j,stsec+k)*SCALE;
        s1 = getMap(pMap, stcol+i,strow+j,stsec+k+1)*SCALE;
        crs = getContSec(s0, s1, lv);

        if (crs!=0) {
          if (!inMolBndry(pMap, stcol+i,strow+j,stsec+k) ||
              !inMolBndry(pMap, stcol+i,strow+j,stsec+k+1))
            crs = 0;
        }

        m_pZCrsLst->at(i,j,k) = crs;
      }
  
  m_nActCol = ncol;
  m_nActRow = nrow;
  m_nActSec = nsec;
  
  m_nStCol = int(vmin.x());
  m_nStRow = int(vmin.y());
  m_nStSec = int(vmin.z());

  return true;
}

namespace {
  inline void drawline(DisplayContext *pdl,
                       float x1, float y1, float z1,
                       float x2, float y2, float z2)
  {
    pdl->vertex(x1, y1, z1);
    pdl->vertex(x2, y2, z2);
  }
}

void MapMeshRenderer::preRender(DisplayContext *pdc)
{
  pdc->color(getColor());
  pdc->setLineWidth(m_lw);
  pdc->setLighting(false);
}

// generate display list
void MapMeshRenderer::render(DisplayContext *pdl)
{
  if (m_pXCrsLst==NULL ||
      m_pYCrsLst==NULL ||
      m_pZCrsLst==NULL)
    return;

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  if (!generate(pMap, pXtal))
    return;

  //
  //  setup frac-->orth matrix
  //

  int ncol = m_nActCol; //m_nColCrs;
  int nrow = m_nActRow; //m_nRowCrs;
  int nsec = m_nActSec; //m_nSecCrs;

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
//  pdl->color(1,1,0);
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

  MB_DPRINTLN("MapMeshRenderer Rendereing...\n");

  pdl->startLines();
  // generate X-Y plane contour lines
  for (int k=0; k<nsec-1; k++)
    for (int j=0; j<nrow-1; j++) {
      for (int i=0; i<ncol-1; i++){
	unsigned char s0, s1, s2, s3;
	s0 = m_pXCrsLst->at(i,j,k);
	s1 = m_pYCrsLst->at(i+1,j,k);
	s2 = m_pXCrsLst->at(i,j+1,k);
	s3 = m_pYCrsLst->at(i,j,k);
	if (s0==0&&s1==0&&s2==0&&s3==0)
	  continue;
	if (s0!=0&&s1!=0&&s2!=0&&s3!=0) {
	  // saddle point
	  float rt0, rt1, rt2, rt3;
	  rt0 = float(s0-1)/254.0f;
	  rt1 = float(s1-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   float(i)+rt0,(float)j,(float)k,
		   (float)i+1,float(j)+rt1,(float)k);
	  drawline(pdl,
		   float(i)+rt2,(float)j+1,(float)k,
		   (float)i,float(j)+rt3,(float)k);
	  continue;
	}
	if (s0!=0&&s1==0&&s2!=0&&s3==0) {
	  // s0-->s2 line
	  float rt0, rt2;
	  rt0 = float(s0-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  drawline(pdl,
		   float(i)+rt0,(float)j, (float) k,
		   float(i)+rt2,(float)j+1,(float)k);
	  continue;
	}
	if (s0==0&&s1!=0&&s2==0&&s3!=0) {
	  // s1-->s3 line
	  float rt1, rt3;
	  rt1 = float(s1-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   (float)i,  float(j)+rt3,(float)k,
		   (float)i+1,float(j)+rt1,(float)k);
	  continue;
	}
	if (s0!=0&&s1!=0&&s2==0&&s3==0) {
	  // s0-->s1 line
	  float rt0, rt1;
	  rt0 = float(s0-1)/254.0f;
	  rt1 = float(s1-1)/254.0f;
	  drawline(pdl,
		   float(i)+rt0,(float)j,  (float)k,
		   (float)i+1,float(j)+rt1,(float)k);
	  continue;
	}
	if (s0==0&&s1!=0&&s2!=0&&s3==0) {
	  // s1-->s2 line
	  float rt1, rt2;
	  rt1 = float(s1-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  drawline(pdl,
		   i+1,float(j)+rt1,k,
		   float(i)+rt2,j+1,k);
	  continue;
	}
	if (s0==0&&s1==0&&s2!=0&&s3!=0) {
	  // s2-->s3 line
	  float rt2, rt3;
	  rt2 = float(s2-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   float(i)+rt2,(float)j+1,(float)k,
		   (float)i,float(j)+rt3,  (float)k);
	  continue;
	}
	if (s0!=0&&s1==0&&s2==0&&s3!=0) {
	  // s3-->s0 line
	  float rt0, rt3;
	  rt0 = float(s0-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   float(i)+rt0,(float)j,(float)k,
		   (float)i,float(j)+rt3,(float)k);
	  continue;
	}

      }
    }  


  // generate Y-Z (or j-k) plane contour lines
  //  --> X(i) is slow axis!
  for (int i=0; i<ncol-1; i++)
    for (int k=0; k<nsec-1; k++){
      for (int j=0; j<nrow-1; j++) {
	unsigned char s0, s1, s2, s3;
	s0 = m_pYCrsLst->at(i,j,k);
	s1 = m_pZCrsLst->at(i,j+1,k);
	s2 = m_pYCrsLst->at(i,j,k+1);
	s3 = m_pZCrsLst->at(i,j,k);
	if (s0==0&&s1==0&&s2==0&&s3==0)
	  continue;
	if (s0!=0&&s1!=0&&s2!=0&&s3!=0) {
	  // saddle point
	  float rt0, rt1, rt2, rt3;
	  rt0 = float(s0-1)/254.0f;
	  rt1 = float(s1-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   (float)i,float(j)+rt0,(float)k,
		   (float)i,(float)j+1,float(k)+rt1);
	  drawline(pdl,
		   (float)i,float(j)+rt2,(float)k+1,
		   (float)i,(float)j,float(k)+rt3);
	  continue;
	}
	if (s0!=0&&s1==0&&s2!=0&&s3==0) {
	  // s0-->s2 line
	  float rt0, rt2;
	  rt0 = float(s0-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  drawline(pdl,
		   (float)i,float(j)+rt0,(float)k,
		   (float)i,float(j)+rt2,(float)k+1);
	  continue;
	}
	if (s0==0&&s1!=0&&s2==0&&s3!=0) {
	  // s1-->s3 line
	  float rt1, rt3;
	  rt1 = float(s1-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   (float)i,(float)j,  float(k)+rt3,
		   (float)i,(float)j+1,float(k)+rt1);
	  continue;
	}
	if (s0!=0&&s1!=0&&s2==0&&s3==0) {
	  // s0-->s1 line
	  float rt0, rt1;
	  rt0 = float(s0-1)/254.0f;
	  rt1 = float(s1-1)/254.0f;
	  drawline(pdl,
		   (float)i,float(j)+rt0,(float)k,
		   (float)i,(float)j+1,float(k)+rt1);
	  continue;
	}
	if (s0==0&&s1!=0&&s2!=0&&s3==0) {
	  // s1-->s2 line
	  float rt1, rt2;
	  rt1 = float(s1-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  drawline(pdl,
		   (float)i,(float)j+1,float(k)+rt1,
		   (float)i,float(j)+rt2,(float)k+1);
	  continue;
	}
	if (s0==0&&s1==0&&s2!=0&&s3!=0) {
	  // s2-->s3 line
	  float rt2, rt3;
	  rt2 = float(s2-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   (float)i,float(j)+rt2,(float)k+1,
		   (float)i,(float)j,float(k)+rt3);
	  continue;
	}
	if (s0!=0&&s1==0&&s2==0&&s3!=0) {
	  // s3-->s0 line
	  float rt0, rt3;
	  rt0 = float(s0-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   (float)i,float(j)+rt0,(float)k,
		   (float)i,(float)j,float(k)+rt3);
	  continue;
	}

      }
    }  


    // generate Z-X (or k-i) plane contour lines
  //  --> Y(j) is slow axis!
  for (int j=0; j<nrow-1; j++)
    for (int i=0; i<ncol-1; i++){
      for (int k=0; k<nsec-1; k++){
	unsigned char s0, s1, s2, s3;
	s0 = m_pZCrsLst->at(i,j,k);
	s1 = m_pXCrsLst->at(i,j,k+1);
	s2 = m_pZCrsLst->at(i+1,j,k);
	s3 = m_pXCrsLst->at(i,j,k);
	if (s0==0&&s1==0&&s2==0&&s3==0)
	  continue;
	if (s0!=0&&s1!=0&&s2!=0&&s3!=0) {
	  // saddle point
	  float rt0, rt1, rt2, rt3;
	  rt0 = float(s0-1)/254.0f;
	  rt1 = float(s1-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   i,j,float(k)+rt0,
		   float(i)+rt1,j,k+1);
	  drawline(pdl,
		   i+1,j,float(k)+rt2,
		   float(i)+rt3,j,k);
	  continue;
	}
	if (s0!=0&&s1==0&&s2!=0&&s3==0) {
	  // s0-->s2 line
	  float rt0, rt2;
	  rt0 = float(s0-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  drawline(pdl,
		   i,j,float(k)+rt0,
		   i+1,j,float(k)+rt2);
	  continue;
	}
	if (s0==0&&s1!=0&&s2==0&&s3!=0) {
	  // s1-->s3 line
	  float rt1, rt3;
	  rt1 = float(s1-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   float(i)+rt3,j,k,  
		   float(i)+rt1,j,k+1);
	  continue;
	}
	if (s0!=0&&s1!=0&&s2==0&&s3==0) {
	  // s0-->s1 line
	  float rt0, rt1;
	  rt0 = float(s0-1)/254.0f;
	  rt1 = float(s1-1)/254.0f;
	  drawline(pdl,
		   i,j,float(k)+rt0,
		   float(i)+rt1,j,k+1);
	  continue;
	}
	if (s0==0&&s1!=0&&s2!=0&&s3==0) {
	  // s1-->s2 line
	  float rt1, rt2;
	  rt1 = float(s1-1)/254.0f;
	  rt2 = float(s2-1)/254.0f;
	  drawline(pdl,
		   float(i)+rt1,j,k+1,
		   i+1,j,float(k)+rt2);
	  continue;
	}
	if (s0==0&&s1==0&&s2!=0&&s3!=0) {
	  // s2-->s3 line
	  float rt2, rt3;
	  rt2 = float(s2-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   i+1,j,float(k)+rt2,
		   float(i)+rt3,j,k);
	  continue;
	}
	if (s0!=0&&s1==0&&s2==0&&s3!=0) {
	  // s3-->s0 line
	  float rt0, rt3;
	  rt0 = float(s0-1)/254.0f;
	  rt3 = float(s3-1)/254.0f;
	  drawline(pdl,
		   i,j,float(k)+rt0,
		   float(i)+rt3,j,k);
	  continue;
	}

      }
    }  

  pdl->end();

  pdl->popMatrix();

  MB_DPRINTLN("MapMeshRenderer Rendereing OK\n");
}

double MapMeshRenderer::getMaxExtent() const
{
  MapMeshRenderer *pthis = const_cast<MapMeshRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();

  const double xmax = m_nColCrs * pMap->getColGridSize() / 2.0;
  const double ymax = m_nRowCrs * pMap->getRowGridSize() / 2.0;
  const double zmax = m_nSecCrs * pMap->getSecGridSize() / 2.0;

  return qlib::min(xmax, qlib::min(ymax, zmax));
}



void MapMeshRenderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid!=qlib::invalid_uid) {
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->addViewListener(nid, this);
  }
}

qlib::uid_t MapMeshRenderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  

void MapMeshRenderer::viewChanged(qsys::ViewEvent &ev)
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

///////////////////////////////////////////////////
// Mol boundary mode routines

void MapMeshRenderer::setBndryMolName(const LString &s)
{
  if (s.equals(m_strBndryMol))
    return;
  m_strBndryMol = s;

  /// target mol is changed-->redraw map
  super_t::invalidateDisplayCache();
}

void MapMeshRenderer::setBndrySel(const SelectionPtr &pSel)
{
  ensureNotNull(pSel);
  
  if (!m_pSelBndry.isnull())
    if (m_pSelBndry->equals(pSel.get()))
      return;

  m_pSelBndry = pSel;
  //setupMolBndry();

  /// selection is changed-->redraw map
  super_t::invalidateDisplayCache();
}

void MapMeshRenderer::setBndryRng(double d)
{
  if (qlib::isNear4(d, m_dBndryRng))
    return;
  m_dBndryRng = d;
  if (m_dBndryRng<0.0)
    m_dBndryRng = 0.0;
  // setupMolBndry();

  if (m_bUseMolBndry)
    super_t::invalidateDisplayCache();
}

void MapMeshRenderer::setupMolBndry()
{
  m_boundary.clear();
  m_bUseMolBndry = false;

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
    m_boundary.setAt(i, aiter.get()->getPos(), aiter.getID());
  }

  m_boundary.build();
  m_bUseMolBndry = true;
}

