// -*-Mode: C++;-*-
//
// Generate/Render mesh contours of ScalarObject (ver. 3)
//

#include <common.h>

#include "MapMesh3Renderer.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;

// default constructor
MapMesh3Renderer::MapMesh3Renderer()
     :  super_t()

{
  m_pBsplCoeff=NULL;
  m_dArcMax = -1.0; //0.25;

  m_lw = 1.0;

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

  int triTab2[16][4] ={
    {-1,-1,-1,-1}, // 0000
    { 0, 3,-1,-1}, // 0001
    { 0, 1,-1,-1}, // 0010
    { 1, 3,-1,-1}, // 0011
    { 1, 2,-1,-1}, // 0100
    { 1, 2, 0, 3}, // 0101
    { 0, 2,-1,-1}, // 0110
    { 2, 3,-1,-1}, // 0111
    { 2, 3,-1,-1}, // 1000
    { 0, 2,-1,-1}, // 1001
    { 2, 3, 0, 1}, // 1010
    { 1, 2,-1,-1}, // 1011
    { 1, 3,-1,-1}, // 1100
    { 0, 1,-1,-1}, // 1101
    { 0, 3,-1,-1}, // 1110
    {-1,-1,-1,-1}  // 1111
  };

  for (int i=0; i<16; ++i)
    for (int j=0; j<4; ++j)
      m_triTab2[i][j] = triTab2[i][j];
}

// destructor
MapMesh3Renderer::~MapMesh3Renderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
}

/////////////////////////////////

const char *MapMesh3Renderer::getTypeName() const
{
  return "contour";
}

void MapMesh3Renderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid!=qlib::invalid_uid) {
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->addViewListener(nid, this);
  }
}

qlib::uid_t MapMesh3Renderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  

/////////////////////////////////

void MapMesh3Renderer::objectChanged(qsys::ObjectEvent &ev)
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

void MapMesh3Renderer::preRender(DisplayContext *pdc)
{
  pdc->color(getColor());
  pdc->setLineWidth(m_lw);
  pdc->setLighting(false);
}

Vector3F MapMesh3Renderer::calcVecCrs(const Vector3I &tpos, int iv0, float crs0, int ivbase)
{
  Vector3F vbase = Vector3F(tpos);
  Vector3F v0, v1, vr;

  v0 = vbase + Vector3F(m_ivdel[ivbase+iv0]);
  v1 = vbase + Vector3F(m_ivdel[ivbase+(iv0+1)%4]);

  vr = v0 + (v1-v0).scale(crs0);
  return vr;
}

/// File rendering/Generate display list (legacy interface)
void MapMesh3Renderer::render(DisplayContext *pdl)
{
  //renderImpl1(pdl);
  renderImplTest2(pdl);
}


/// File rendering/Generate display list (legacy interface)
void MapMesh3Renderer::renderImpl1(DisplayContext *pdl)
{
  // TO DO: support object xformMat property!!

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  calcMapDispExtent(pMap);
  calcContLevel(pMap);

  // setup mol boundry info (if needed)
  setupMolBndry();

  bool bOrgChg = false;
  if (!m_mapStPos.equals(m_texStPos)) {
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

            if (val[ii]>isolev)
              flag += mask;
            mask = mask << 1;
          }

          // TO DO: use flag value (0000/1111) to omit calc for empty voxels

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

