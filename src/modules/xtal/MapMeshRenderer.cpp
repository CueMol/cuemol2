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

#define SCALE 0x1000
//#define DBG_DRAW_AXIS 0
#define _NEW_IMPL 1

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;

// default constructor
MapMeshRenderer::MapMeshRenderer()
     :  super_t()

{
  m_pXCrsLst = NULL;
  m_pYCrsLst = NULL;
  m_pZCrsLst = NULL;

  m_nBufSize = 100;
  m_lw = 1.0;
  m_bPBC = false;
  m_bAutoUpdate = true;

  //resetAllProps();

  // // default work area size 100x100x100
  // setCrossArraySize(m_nBufSize,m_nBufSize,m_nBufSize);

  // X-Y plane
  m_ivdel[0] = Vector3I(0,0,0);
  m_ivdel[1] = Vector3I(1,0,0);
  m_ivdel[2] = Vector3I(1,1,0);
  m_ivdel[3] = Vector3I(0,1,0);
  
  // Y-Z plane
  m_ivdel[4] = Vector3I(0,0,0);
  m_ivdel[5] = Vector3I(0,1,0);
  m_ivdel[6] = Vector3I(0,1,1);
  m_ivdel[7] = Vector3I(0,0,1);
  
  // Z-X plane
  m_ivdel[8] = Vector3I(0,0,0);
  m_ivdel[9] = Vector3I(0,0,1);
  m_ivdel[10] = Vector3I(1,0,1);
  m_ivdel[11] = Vector3I(1,0,0);

  for (int i=0; i<12; ++i)
    for (int j=0; j<3; ++j)
      m_idel[i][j] = m_ivdel[i].ai(j+1);

  ////

  int triTable[16][2] ={
    {-1,-1}, // 0000
    { 0, 3}, // 0001
    { 0, 1}, // 0010
    { 1, 3}, // 0011
    { 1, 2}, // 0100
    {-1,-1}, // 0101
    { 0, 2}, // 0110
    { 2, 3}, // 0111
    { 2, 3}, // 1000
    { 0, 2}, // 1001
    {-1,-1}, // 1010
    { 1, 2}, // 1011
    { 1, 3}, // 1100
    { 0, 1}, // 1101
    { 0, 3}, // 1110
    {-1,-1}  // 1111
  };
    
  for (int i=0; i<16; ++i)
    for (int j=0; j<2; ++j)
      m_triTable[i][j] = triTable[i][j];
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

/////////////////////////////////

void MapMeshRenderer::viewChanged(qsys::ViewEvent &ev)
{
  const int nType = ev.getType();
  
  if (nType!=qsys::ViewEvent::VWE_PROPCHG &&
      nType!=qsys::ViewEvent::VWE_PROPCHG_DRG)
    return;

  if (!m_bAutoUpdate && !m_bDragUpdate)
    return;

  if (!ev.getDescr().equals("center") &&
      !ev.getDescr().equals("setCamera")) // setCamera is called by animation (AnimCam)
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

/// Setup map rendering information (extent, level, etc)
void MapMeshRenderer::setupMapRendInfo(ScalarObject *pMap)
{
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  m_mapSize.x() = pMap->getColNo();
  m_mapSize.y() = pMap->getRowNo();
  m_mapSize.z() = pMap->getSecNo();

  const Vector4D cent = getCenter();
  const double extent = getExtent();

  //
  // col,row,sec
  //
  Vector4D vmin(cent.x()-extent, cent.y()-extent, cent.z()-extent);
  Vector4D vmax(cent.x()+extent, cent.y()+extent, cent.z()+extent);

  //
  // get map origin / translate the origin to (0,0,0)
  //
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

  m_glbStPos = Vector3I(vmin.xyz());

  // conv to map-base index (from global origin)
  m_mapStPos.x() = m_glbStPos.x() - pMap->getStartCol();
  m_mapStPos.y() = m_glbStPos.y() - pMap->getStartRow();
  m_mapStPos.z() = m_glbStPos.z() - pMap->getStartSec();

  // actual display extent (in grid unit)
  m_dspSize = Vector3I( (vmax-vmin).xyz() );
  
  /*{
    Vector4D xmin(m_glbStPos);
    Vector4D xmax(m_glbStPos+m_dspSize);

    xmin.x() /= pXtal->getColInterval();
    xmin.y() /= pXtal->getRowInterval();
    xmin.z() /= pXtal->getSecInterval();

    xmax.x() /= pXtal->getColInterval();
    xmax.y() /= pXtal->getRowInterval();
    xmax.z() /= pXtal->getSecInterval();

    const CrystalInfo &xt = pXtal->getXtalInfo();
    xt.fracToOrth(xmin);
    xt.fracToOrth(xmax);

    MB_DPRINTLN("actual range dist-min: %f", (xmin-cent).length());
    MB_DPRINTLN("actual range dist-max: %f", (xmax-cent).length());
  }*/
}

/// Calculate 8-bit contour level
void MapMeshRenderer::calcContLevel(ScalarObject *pMap)
{
  //
  // calculate the contour level
  //
  const double siglevel = getSigLevel();
  const double level = pMap->getRmsdDensity() * siglevel;
  double lvtmp = floor( (level-pMap->getLevelBase()) / pMap->getLevelStep());
  unsigned int lv = (unsigned int)lvtmp;
  if (lvtmp<0) lv = 0;
  if (lvtmp>0xFF) lv = 0xFF;
  
  MB_DPRINTLN("set isolevel=%d", lv);
  m_nIsoLevel = lv;
}

/// Setup coord xform for map rendering (grid-->world)
void MapMeshRenderer::setupXform(DisplayContext *pdc, ScalarObject *pMap, DensityMap *pXtal)
{
  // pdc->pushMatrix();

  if (pXtal==NULL) {
    pdc->translate(pMap->getOrigin());
  }
  else {
    Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
    pdc->multMatrix(Matrix4D(orthmat));
  }

  Vector4D vtmp;
  if (pXtal!=NULL)
    vtmp = Vector4D(1.0/double(pXtal->getColInterval()),
                    1.0/double(pXtal->getRowInterval()),
                    1.0/double(pXtal->getSecInterval()));
  else
    vtmp = Vector4D(pMap->getColGridSize(),
                    pMap->getRowGridSize(),
                    pMap->getSecGridSize());
  
  pdc->scale(vtmp);
  
  vtmp = Vector4D(getGlbStPos());
  pdc->translate(vtmp);
}

void MapMeshRenderer::preRender(DisplayContext *pdc)
{
  pdc->color(getColor());
  pdc->setLineWidth(m_lw);
  pdc->setLighting(false);
}

namespace {
  inline float getCrossVal(quint8 d0, quint8 d1, quint8 isolev)
  {
    if (d0==d1) return -1.0;
    
    float crs = float(isolev-d0)/float(d1-d0);
    return crs;
  }
}

Vector3F MapMeshRenderer::calcVecCrs(const Vector3I &tpos, int iv0, float crs0, int ivbase)
{
  Vector3F vbase = Vector3F(tpos);
  Vector3F v0, v1, vr;

  v0 = vbase + Vector3F(m_ivdel[ivbase+iv0]);
  v1 = vbase + Vector3F(m_ivdel[ivbase+(iv0+1)%4]);

  vr = v0 + (v1-v0).scale(crs0);
  return vr;
}

#ifdef _NEW_IMPL
/// File rendering/Generate display list (legacy interface)
void MapMeshRenderer::render(DisplayContext *pdl)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  setupMapRendInfo(pMap);
  calcContLevel(pMap);


  bool bOrgChg = false;
  if (!m_mapStPos.equals(m_texStPos)) {
    //if (m_mapStPos.x()!=m_nTexStCol ||
    //m_mapStPos.y()!=m_nTexStRow ||
    //m_mapStPos.z()!=m_nTexStSec) {
    // texture origin changed --> regenerate texture
    bOrgChg = true;
  }

  bool bSizeChg = false;

  if (m_maptmp.cols()!=getDspSize().x() ||
      m_maptmp.rows()!=getDspSize().y() ||
      m_maptmp.secs()!=getDspSize().z()) {
    // texture size changed --> regenerate texture/VBO
    m_maptmp.resize(getDspSize().x(), getDspSize().y(), getDspSize().z());
    bSizeChg = true;
  }

  if (bSizeChg || bOrgChg) {
    // (Re)generate texture map
    // create local CPU copy of Texture
    int i,j,k;
    for (k=0; k<getDspSize().z(); k++)
      for (j=0; j<getDspSize().y(); j++)
        for (i=0; i<getDspSize().x(); i++){
          m_maptmp.at(i,j,k) = getMap(pMap, m_mapStPos.x()+i,  m_mapStPos.y()+j, m_mapStPos.z()+k);
        }
    
    m_texStPos = m_mapStPos;
  }


  pdl->pushMatrix();
  setupXform(pdl, pMap, pXtal);

  int i,j,k;
  const int ncol = m_dspSize.x();
  const int nrow = m_dspSize.y();
  const int nsec = m_dspSize.z();

  const int stcol = m_mapStPos.x();
  const int strow = m_mapStPos.y();
  const int stsec = m_mapStPos.z();

  quint8 val[4];
  quint8 isolev = quint8( m_nIsoLevel );

  pdl->color(getColor());
  pdl->startLines();

  for (k=0; k<nsec-1; k++)
    for (j=0; j<nrow-1; j++)
      for (i=0; i<ncol-1; i++){
        for (int iplane = 0; iplane<3; ++iplane) {
          quint8 flag = 0U;
          quint8 mask = 1U;

          // Vector3I tpos(i, j, k);

          for (int ii=0; ii<4; ++ii) {
            //Vector3I iv = tpos + m_ivdel[ii + iplane*4];
            //val[ii] = m_maptmp.at(iv.ai(1), iv.ai(2), iv.ai(3));

            int ivx = i + m_idel[ii + iplane*4][0];
            int ivy = j + m_idel[ii + iplane*4][1];
            int ivz = k + m_idel[ii + iplane*4][2];
            val[ii] = m_maptmp.at(ivx, ivy, ivz);

            //val[ii] = getMap(pMap, iv.ai(1)+stcol, iv.ai(2)+strow, iv.ai(3)+stsec);
            if (val[ii]>isolev)
              flag += mask;
            mask = mask << 1;
          }

          int iv0 = m_triTable[flag][0];
          int iv1 = m_triTable[flag][1];
          if (iv0<0)
            continue;
          float crs0 = getCrossVal(val[iv0], val[(iv0+1)%4], isolev);
          float crs1 = getCrossVal(val[iv1], val[(iv1+1)%4], isolev);
          if (crs0>=-0.0 && crs1>=-0.0) {
            Vector3F v0 = calcVecCrs(i, j, k, iv0, crs0, iplane*4);
            Vector3F v1 = calcVecCrs(i, j, k, iv1, crs1, iplane*4);
            pdl->vertex(v0.x(), v0.y(), v0.z());
            pdl->vertex(v1.x(), v1.y(), v1.z());
          }
        }
      }
  pdl->end();

  pdl->popMatrix();
}

void MapMeshRenderer::setBufSize(int nsize)
{
}

double MapMeshRenderer::getMaxExtent() const
{
  MapMeshRenderer *pthis = const_cast<MapMeshRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();

  const int nCrs = 100;

  const double xmax = nCrs * pMap->getColGridSize() / 2.0;
  const double ymax = nCrs * pMap->getRowGridSize() / 2.0;
  const double zmax = nCrs * pMap->getSecGridSize() / 2.0;

  return qlib::min(xmax, qlib::min(ymax, zmax));
}
#endif

///////////////////////////////////////////////////////////////////


#ifndef _NEW_IMPL
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
  const double extent = getExtent();

  if (pMap==NULL)
    return false;

  // check and setup mol boundary data
  setupMolBndry();

  // calculate the contour level
  const double siglevel = getSigLevel();
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

  m_mapSize.x() = pMap->getColNo();
  m_mapSize.y() = pMap->getRowNo();
  m_mapSize.z() = pMap->getSecNo();

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
  
  m_dspSize.x() = ncol;
  m_dspSize.y() = nrow;
  m_dspSize.z() = nsec;
  
  m_glbStPos.x() = int(vmin.x());
  m_glbStPos.y() = int(vmin.y());
  m_glbStPos.z() = int(vmin.z());

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

  const int ncol = m_dspSize.x();
  const int nrow = m_dspSize.y();
  const int nsec = m_dspSize.z();

  pdl->pushMatrix();

  setupXform(pdl, pMap, pXtal);

  /*
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

    vtmp = Vector4D(m_glbStPos.x(), m_glbStPos.y(), m_glbStPos.z());
    pdl->translate(vtmp);
  }
   */
  
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

#endif

