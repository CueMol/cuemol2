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
  m_nBufSize = 100;
  m_lw = 1.0;
  m_bPBC = false;
  m_bAutoUpdate = true;

  //resetAllProps();

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

void MapMeshRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (isVisible() &&
      ev.getType()==qsys::ObjectEvent::OBE_CHANGED_DYNAMIC &&
      ev.getDescr().equals("densityModified")) {
    // Invalidate the copy of map
    //m_maptmp.clear();
    m_maptmp.resize(0,0,0);
  }
  else if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED_FIXDYN) {
  }
  
  super_t::objectChanged(ev);
}

///////////////////////////////////////////////////

namespace {
  inline void calcAxisCross(const Vector4D &aax, const Vector4D &bax, const Vector4D &cax, const Vector4D &cent, double extent,
                            double &zmin, double &zmax)
  {
    Vector4D vn = aax.cross(bax);
    const double vncen = vn.dot(cent);
    const double vncax = vn.dot(cax);
    const double evn = extent*vn.length();
    zmin = (vncen - evn)/vncax;
    zmax = (vncen + evn)/vncax;
  }
}

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
  // Calc vmin, vmax
  //
  Vector4D vmin, vmax;

  if (pXtal!=NULL) {
    // non-orthogonal grid (crystal, etc)
    const CrystalInfo &xt = pXtal->getXtalInfo();

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

    Vector4D aax(1.0, 0.0, 0.0, 1.0);
    Vector4D bax(0.0, 1.0, 0.0, 1.0);
    Vector4D cax(0.0, 0.0, 1.0, 1.0);

    xt.fracToOrth(aax);
    xt.fracToOrth(bax);
    xt.fracToOrth(cax);

    calcAxisCross(aax, bax, cax, cent, extent, vmin.z(), vmax.z());
    calcAxisCross(bax, cax, aax, cent, extent, vmin.x(), vmax.x());
    calcAxisCross(cax, aax, bax, cent, extent, vmin.y(), vmax.y());
    
    vmin.x() *= pXtal->getColInterval();
    vmin.y() *= pXtal->getRowInterval();
    vmin.z() *= pXtal->getSecInterval();
    vmax.x() *= pXtal->getColInterval();
    vmax.y() *= pXtal->getRowInterval();
    vmax.z() *= pXtal->getSecInterval();
  }
  else {
    // orthogonal grid (potential map, etc)
    vmin = Vector4D(cent.x()-extent, cent.y()-extent, cent.z()-extent);
    vmax = Vector4D(cent.x()+extent, cent.y()+extent, cent.z()+extent);

    // get map origin / translate the origin to (0,0,0)
    vmin -= pMap->getOrigin();
    vmax -= pMap->getOrigin();

    vmin.x() /= pMap->getColGridSize();
    vmin.y() /= pMap->getRowGridSize();
    vmin.z() /= pMap->getSecGridSize();
    vmax.x() /= pMap->getColGridSize();
    vmax.y() /= pMap->getRowGridSize();
    vmax.z() /= pMap->getSecGridSize();
  }

/*
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
  }
*/
  
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

Matrix4D MapMeshRenderer::getXform(ScalarObject *pMap, DensityMap *pXtal)
{
  Matrix4D rval;

  if (pXtal==NULL) {
    //pdc->translate(pMap->getOrigin());
    rval.translate(pMap->getOrigin());
  }
  else {
    Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
    rval.matprod(Matrix4D(orthmat));
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
  
  //pdc->scale(vtmp);
  rval.matprod(Matrix4D::makeScaleMat(vtmp));
  
  vtmp = Vector4D(getGlbStPos());
  //pdc->translate(vtmp);
  rval.translate(vtmp);

  return rval;
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
    if (d0==d1 || d0==0 || d1==0) return -1.0;
    
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

/// File rendering/Generate display list (legacy interface)
void MapMeshRenderer::render(DisplayContext *pdl)
{
  // TO DO: support object xformMat property!!

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  setupMapRendInfo(pMap);
  calcContLevel(pMap);

  // setup mol boundry info (if needed)
  setupMolBndry();

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

  const int ncol = m_dspSize.x();
  const int nrow = m_dspSize.y();
  const int nsec = m_dspSize.z();

  const int stcol = m_mapStPos.x();
  const int strow = m_mapStPos.y();
  const int stsec = m_mapStPos.z();

  if (bSizeChg || bOrgChg) {
    // (Re)generate texture map
    // create local CPU copy of Texture
    int i,j,k;
    for (k=0; k<nsec; k++)
      for (j=0; j<nrow; j++)
        for (i=0; i<ncol; i++){
          if (!inMolBndry(pMap, stcol+i, strow+j, stsec+k))
            m_maptmp.at(i,j,k) = 0;
          else {
            m_maptmp.at(i,j,k) = getMap(pMap, stcol+i, strow+j, stsec+k);
          }
        }
    
    m_texStPos = m_mapStPos;
  }


  pdl->pushMatrix();
  setupXform(pdl, pMap, pXtal);

  int i,j,k;
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
          const int ipl4 = iplane*4;

          // Vector3I tpos(i, j, k);

          for (int ii=0; ii<4; ++ii) {
            //Vector3I iv = tpos + m_ivdel[ii + iplane*4];
            //val[ii] = m_maptmp.at(iv.ai(1), iv.ai(2), iv.ai(3));
            const int iid = ii + ipl4;
            int ivx = i + m_idel[iid][0];
            int ivy = j + m_idel[iid][1];
            int ivz = k + m_idel[iid][2];
            val[ii] = m_maptmp.at(ivx, ivy, ivz);

            //qbyte v2 = getMap(pMap, ivx+stcol, ivy+strow, ivz+stsec);

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


