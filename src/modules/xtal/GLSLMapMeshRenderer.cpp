// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject
//

#include <common.h>

#include "GLSLMapMeshRenderer.hpp"
#include "DensityMap.hpp"

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>

#define SCALE 0x1000
//#define DBG_DRAW_AXIS 0

#define MY_MAPTEX_DIM GL_TEXTURE_BUFFER

#define CHK_GLERROR(MSG)\
{ \
  GLenum errc; \
  errc = glGetError(); \
  if (errc!=GL_NO_ERROR) \
    MB_DPRINTLN("%s GLError(%d): %s", MSG, errc, gluErrorString(errc)); \
}

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;

// default constructor
GLSLMapMeshRenderer::GLSLMapMeshRenderer()
     : super_t()
{
  m_bChkShaderDone = false;
  
  m_nBufSize = 100;
  m_lw = 1.0;
  m_bPBC = false;
  m_bAutoUpdate = true;

  //resetAllProps();

  //m_pVS = NULL;
  //m_pFS = NULL;
  m_pPO = NULL;

  m_nMapTexID = 0;
  m_nMapBufID = 0;

  m_bMapTexOK = false;

}

// destructor
GLSLMapMeshRenderer::~GLSLMapMeshRenderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
}

/////////////////////////////////

const char *GLSLMapMeshRenderer::getTypeName() const
{
  return "gpu_mapmesh";
}

double GLSLMapMeshRenderer::getMaxExtent() const
{
  GLSLMapMeshRenderer *pthis = const_cast<GLSLMapMeshRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();

  const double xmax = 100 * pMap->getColGridSize() / 2.0;
  const double ymax = 100 * pMap->getRowGridSize() / 2.0;
  const double zmax = 100 * pMap->getSecGridSize() / 2.0;

  return qlib::min(xmax, qlib::min(ymax, zmax));
}

void GLSLMapMeshRenderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid==qlib::invalid_uid)
    return;

  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->addViewListener(nid, this);

  // initShader();
}

qlib::uid_t GLSLMapMeshRenderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  

void GLSLMapMeshRenderer::viewChanged(qsys::ViewEvent &ev)
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

bool GLSLMapMeshRenderer::initShader()
{
  m_pPO = NULL;

  sysdep::ShaderSetupHelper<GLSLMapMeshRenderer> ssh(this);

  if (!ssh.checkEnvGS()) {
    LOG_DPRINTLN("GPUMapMesh> ERROR: OpenGL GPU geom program not supported.");
    m_bChkShaderDone = true;
    return false;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_mapmesh",
                              "%%CONFDIR%%/data/shaders/mapmesh_vertex.glsl",
                              "%%CONFDIR%%/data/shaders/mapmesh_frag.glsl",
                              "%%CONFDIR%%/data/shaders/mapmesh_geom.glsl",
                              GL_POINTS, GL_LINE_STRIP, 16);
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("GPUMapMesh> ERROR: cannot create progobj.");
    m_bChkShaderDone = true;
    return false;
  }

  m_pPO->enable();

  // Setup the index displacement array
  // X-Y plane
  m_pPO->setUniform("ivdel[0]", 0, 0, 0);
  m_pPO->setUniform("ivdel[1]", 1, 0, 0);
  m_pPO->setUniform("ivdel[2]", 1, 1, 0);
  m_pPO->setUniform("ivdel[3]", 0, 1, 0);
  
  // Y-Z plane
  m_pPO->setUniform("ivdel[4]", 0, 0, 0);
  m_pPO->setUniform("ivdel[5]", 0, 1, 0);
  m_pPO->setUniform("ivdel[6]", 0, 1, 1);
  m_pPO->setUniform("ivdel[7]", 0, 0, 1);
  
  // Z-X plane
  m_pPO->setUniform("ivdel[8]" , 0, 0, 0);
  m_pPO->setUniform("ivdel[9]" , 0, 0, 1);
  m_pPO->setUniform("ivdel[10]", 1, 0, 1);
  m_pPO->setUniform("ivdel[11]", 1, 0, 0);
  
  // setup the edge table
  m_pPO->setUniform("edgetab[0]" , -1,-1); // 0000
  m_pPO->setUniform("edgetab[1]" ,  0, 3); // 0001
  m_pPO->setUniform("edgetab[2]" ,  0, 1); // 0010
  m_pPO->setUniform("edgetab[3]" ,  1, 3); // 0011
  m_pPO->setUniform("edgetab[4]" ,  1, 2); // 0100
  m_pPO->setUniform("edgetab[5]" , -1,-1); // 0101
  m_pPO->setUniform("edgetab[6]" ,  0, 2); // 0110
  m_pPO->setUniform("edgetab[7]" ,  2, 3); // 0111
  m_pPO->setUniform("edgetab[8]" ,  2, 3); // 1000
  m_pPO->setUniform("edgetab[9]" ,  0, 2); // 1001
  m_pPO->setUniform("edgetab[10]", -1,-1); // 1010
  m_pPO->setUniform("edgetab[11]",  1, 2); // 1011
  m_pPO->setUniform("edgetab[12]",  1, 3); // 1100
  m_pPO->setUniform("edgetab[13]",  0, 1); // 1101
  m_pPO->setUniform("edgetab[14]",  0, 3); // 1110
  m_pPO->setUniform("edgetab[15]", -1,-1); // 1111
  
  //m_nVertexLoc = glGetAttribLocation(m_pPO->getHandle(), "InVertex");
  
  m_pPO->disable();

  glGenBuffersARB(1, &m_nMapBufID);
  glGenBuffersARB(1, &m_nVBOID);

  // setup texture
  glGenTextures(1, &m_nMapTexID);
  glActiveTexture(GL_TEXTURE0);
  glEnable(MY_MAPTEX_DIM);
  glBindTexture(MY_MAPTEX_DIM, m_nMapTexID);

  //glTexParameteri(MY_MAPTEX_DIM, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  //glTexParameteri(MY_MAPTEX_DIM, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  //glTexParameteri(MY_MAPTEX_DIM, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  //glTexParameteri(MY_MAPTEX_DIM, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  //glTexParameteri(MY_MAPTEX_DIM, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);
  
  glBindTexture(MY_MAPTEX_DIM, 0);

  m_bChkShaderDone = true;
}

void GLSLMapMeshRenderer::unloading()
{
  // delete texture
  glDeleteTextures(1, &m_nMapTexID);
  glDeleteBuffersARB(1, &m_nMapBufID);
  glDeleteBuffersARB(1, &m_nVBOID);

  // ProgramObject is owned by DisplayContext
  // and will be reused other renderes,
  // so m_pPO should not be deleted here.
  m_pPO = NULL;

  super_t::unloading();
}

void GLSLMapMeshRenderer::invalidateDisplayCache()
{
  m_bMapTexOK = false;
  super_t::invalidateDisplayCache();
}

/////////////////////////////////

void GLSLMapMeshRenderer::make3DTexMap(ScalarObject *pMap, DensityMap *pXtal)
{
  const Vector4D cent = getCenter();
  const double extent = getExtent();

  //
  // col,row,sec
  //
  Vector4D vmin(cent.x()-extent, cent.y()-extent, cent.z()-extent);
  Vector4D vmax(cent.x()+extent, cent.y()+extent, cent.z()+extent);

  //
  // get origin / translate the origin to (0,0,0)
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

  m_nMapColNo = pMap->getColNo();
  m_nMapRowNo = pMap->getRowNo();
  m_nMapSecNo = pMap->getSecNo();

  Vector4D vwi;
  vwi.x() = vmax.x() - vmin.x();
  vwi.y() = vmax.y() - vmin.y();
  vwi.z() = vmax.z() - vmin.z();

  m_nStCol = int(vmin.x());
  m_nStRow = int(vmin.y());
  m_nStSec = int(vmin.z());

  int stcol = m_nStCol - pMap->getStartCol();
  int strow = m_nStRow - pMap->getStartRow();
  int stsec = m_nStSec - pMap->getStartSec();

  int ncol = int(vmax.x() - vmin.x());
  int nrow = int(vmax.y() - vmin.y());
  int nsec = int(vmax.z() - vmin.z());

  bool bReuse;
  if (qlib::abs(m_maptmp.cols()-ncol)<1 &&
      qlib::abs(m_maptmp.rows()-nrow)<1 &&
      qlib::abs(m_maptmp.secs()-nsec)<1) {
    MB_DPRINTLN("reuse texture");
    ncol = m_maptmp.cols();
    nrow = m_maptmp.rows();
    nsec = m_maptmp.secs();
    bReuse = true;
  }
  else {
    m_maptmp.resize(ncol, nrow, nsec);
    bReuse = false;
  }

  m_nActCol = ncol;// = 8;
  m_nActRow = nrow;// = 8;
  m_nActSec = nsec;// = 8;
  
  MB_DPRINT("ncol: %d\n", ncol);
  MB_DPRINT("nrow: %d\n", nrow);
  MB_DPRINT("nsec: %d\n", nsec);

  // Generate Grid Data VBO
  if (!bReuse) {
    // size is changed --> generate grid data
    int vcol = ncol-1;
    int vrow = nrow-1;
    int vsec = nsec-1;
    qlib::Array3D<qint16> grid;

    grid.resize(vcol*3, vrow, vsec);
    int i,j,k,l, ibase;
    qint16 *pdata = const_cast<qint16 *>(grid.data());
    for (k=0; k<vsec; k++)
      for (j=0; j<vrow; j++)
        for (i=0; i<vcol; i++){
          ibase = 3*(i + vcol*(j + vrow*k));
          pdata[ibase + 0] = i;
          pdata[ibase + 1] = j;
          pdata[ibase + 2] = k;
        }

    glBindBuffer(GL_ARRAY_BUFFER_ARB, m_nVBOID);
    glBufferDataARB(GL_ARRAY_BUFFER_ARB, vcol*vrow*vsec*3*(sizeof (qint16)), grid.data(), GL_STATIC_DRAW_ARB);
    glBindBuffer(GL_ARRAY_BUFFER_ARB, 0);

    /*
    grid.resize(vcol*4*3, vrow, vsec);
    int i,j,k,l, ibase;
    qint16 *pdata = const_cast<qint16 *>(grid.data());
    for (k=0; k<vsec; k++)
      for (j=0; j<vrow; j++)
        for (i=0; i<vcol; i++){
          for (l=0; l<3; ++l) {
            ibase = 4*(l + 3*(i + vcol*(j + vrow*k)));
            pdata[ibase + 0] = i;
            pdata[ibase + 1] = j;
            pdata[ibase + 2] = k;
            pdata[ibase + 3] = l;
          }
        }

    glBindBuffer(GL_ARRAY_BUFFER_ARB, m_nVBOID);
    glBufferDataARB(GL_ARRAY_BUFFER_ARB, vcol*vrow*vsec*4*3*(sizeof qint16), grid.data(), GL_STATIC_DRAW_ARB);
    glBindBuffer(GL_ARRAY_BUFFER_ARB, 0);
     */
  }

  //
  // generate texture map
  //

  int i,j,k;
  // unsigned int s0,s1;
  for (k=0; k<nsec; k++)
    for (j=0; j<nrow; j++)
      for (i=0; i<ncol; i++){
        m_maptmp.at(i,j,k) = getMap(pMap, stcol+i,  strow+j, stsec+k);
        //m_maptmp.at(i,j,k) = MapTmp::value_type( float(i)/float(ncol)*255.0 );
        //dataField[i + ncol*(j + nrow*k)] = float(i)/float(ncol);
      }

  glBindBufferARB(GL_TEXTURE_BUFFER, m_nMapBufID);
  CHK_GLERROR("glBindBuffer");

  if (!bReuse) {
    glBufferDataARB(GL_TEXTURE_BUFFER, ncol*nrow*nsec*sizeof(MapTmp::value_type), m_maptmp.data(), GL_DYNAMIC_DRAW_ARB);
    CHK_GLERROR("glBufferDataARB");
  }
  else {
    glBufferSubDataARB(GL_TEXTURE_BUFFER, 0, ncol*nrow*nsec*sizeof(MapTmp::value_type), m_maptmp.data());
    CHK_GLERROR("glBufferDataARB");
  }

  glBindBuffer(GL_TEXTURE_BUFFER, 0);

  glActiveTexture(GL_TEXTURE0);
  // glEnable(MY_MAPTEX_DIM);
  glBindTexture(MY_MAPTEX_DIM, m_nMapTexID);

  glTexBufferARB(GL_TEXTURE_BUFFER, GL_R8UI, m_nMapBufID);
  CHK_GLERROR("glTexBufferARB");

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
    m_isolevel = lv;
  }

  m_pPO->enable();

  // connect texture0 to the dataFieldTex uniform variable
  m_pPO->setUniform("dataFieldTex", 0);
  CHK_GLERROR("setUniform dataFieldTex");

  m_pPO->disable();

  // glBindTexture(MY_MAPTEX_DIM, 0);
  
  MB_DPRINTLN("make3D texture OK.");
  m_bMapTexOK = true;
}

#if 0
  if (1) {
/*
    glTexImage3D(MY_MAPTEX_DIM, 0,
                 GL_ALPHA32F_ARB,
                 ncol, nrow, nsec, 0,
                 GL_ALPHA, GL_FLOAT,
                 (const float *)(m_maptmp));
*/
    /*
    glTexImage3D(MY_MAPTEX_DIM, 0,
                 GL_ALPHA16UI_EXT, // components
                 ncol, nrow, nsec, 0,
                 GL_ALPHA_INTEGER_EXT, GL_UNSIGNED_SHORT,
                 m_maptmp.data());
     */

  }
  else {
/*
    glTexSubImage3D(MY_MAPTEX_DIM,
                    0, // LOD
                    0, 0, 0, // offset
                    ncol, nrow, nsec, // size
                    GL_ALPHA, // format
                    GL_FLOAT, // type
                    (const float *)(m_maptmp));

    glTexSubImage3D(MY_MAPTEX_DIM,
                    0, // LOD
                    0,0,0, // offset
                    ncol,nrow,nsec, // size
                    GL_ALPHA_INTEGER_EXT, // format
                    GL_UNSIGNED_SHORT, // type
                    m_maptmp.data());
    
*/    
  }

#endif

void GLSLMapMeshRenderer::display(DisplayContext *pdc)
{
  if (!m_bChkShaderDone)
    initShader();
  
  if (m_pPO==NULL) {
    // TO DO: fallback to non-GPU rendering mode
    return;
  }

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  if (!m_bMapTexOK) {
    if (!pMap)
      return;
    make3DTexMap(pMap, pXtal);
  }

  pdc->color(getColor());
  pdc->setLineWidth(m_lw);
  pdc->setLighting(false);

  pdc->pushMatrix();

  if (pXtal==NULL)
    pdc->translate(pMap->getOrigin());

  if (pXtal!=NULL) {
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
  
  vtmp = Vector4D(m_nStCol, m_nStRow, m_nStSec);
  pdc->translate(vtmp);

  //renderCPU(pdc);
  renderGPU(pdc);

  pdc->popMatrix();

}

void GLSLMapMeshRenderer::renderGPU(DisplayContext *pdc)
{
  if (m_pPO==NULL)
    return;
  
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  glActiveTexture(GL_TEXTURE0);
  // glEnable(MY_MAPTEX_DIM);
  glBindTexture(MY_MAPTEX_DIM, m_nMapTexID);
  glTexBufferARB(GL_TEXTURE_BUFFER, GL_R8UI, m_nMapBufID);

  m_pPO->enable();
  
  int i,j,k;
  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

  m_pPO->setUniform("isolevel", m_isolevel);
  CHK_GLERROR("setUniform isolevel");

  m_pPO->setUniform("ncol", ncol);
  CHK_GLERROR("setUniform ncol");

  m_pPO->setUniform("nrow", nrow);
  CHK_GLERROR("setUniform nrow");

  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());

  /*
  pdc->startPoints();

  for (k=0; k<nsec-1; k++)
    for (j=0; j<nrow-1; j++)
      for (i=0; i<ncol-1; i++){
        glVertex3f(i,j,k);
      }

  pdc->end();
   */

  glBindBuffer(GL_ARRAY_BUFFER_ARB, m_nVBOID);
  glEnableClientState(GL_VERTEX_ARRAY);
  glVertexPointer(3, GL_SHORT, 0,  NULL);
  // glVertexAttribIPointer(m_nVertexLoc, 4, GL_SHORT, 0, NULL);
  glDrawArrays(GL_POINTS, 0, (ncol-1)*(nsec-1)*(nrow-1));
  glDisableClientState(GL_VERTEX_ARRAY);
  glBindBuffer(GL_ARRAY_BUFFER_ARB, 0);

  m_pPO->disable();

  glBindTexture(MY_MAPTEX_DIM, 0);

}


float getCrossVal(quint8 d0, quint8 d1, quint8 isolev)
{
  if (d0==d1) return -1.0;

  float crs = float(isolev-d0)/float(d1-d0);
  return crs;
}

Vector4D GLSLMapMeshRenderer::calcVecCrs(const IntVec3D &tpos, int iv0, float crs0, int ivbase)
{
  Vector4D vbase = tpos.vec4();
  Vector4D v0, v1, vr;

  v0 = vbase + m_ivdel[ivbase+iv0].vec4();
  v1 = vbase + m_ivdel[ivbase+(iv0+1)%4].vec4();

  vr = v0 + (v1-v0).scale(crs0);
  return vr;
}

void GLSLMapMeshRenderer::renderCPU(DisplayContext *pdc)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  if (!m_bMapTexOK) {
    if (!pMap)
      return;
    make3DTexMap(pMap, pXtal);

    // IntVec3D ivdel[4];
    // X-Y plane
    m_ivdel[0] = IntVec3D(0,0,0);
    m_ivdel[1] = IntVec3D(1,0,0);
    m_ivdel[2] = IntVec3D(1,1,0);
    m_ivdel[3] = IntVec3D(0,1,0);

    // Y-Z plane
    m_ivdel[4] = IntVec3D(0,0,0);
    m_ivdel[5] = IntVec3D(0,1,0);
    m_ivdel[6] = IntVec3D(0,1,1);
    m_ivdel[7] = IntVec3D(0,0,1);

    // Z-X plane
    m_ivdel[4] = IntVec3D(0,0,0);
    m_ivdel[5] = IntVec3D(0,0,1);
    m_ivdel[6] = IntVec3D(1,0,1);
    m_ivdel[7] = IntVec3D(1,0,0);
  }

  quint8 isolev;
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

    isolev = lv;
  }

  int i,j,k;
  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

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
    
  quint8 val[4];
  //, crs[4];

  pdc->startLines();

  for (k=0; k<nsec-1; k++)
    for (j=0; j<nrow-1; j++)
      for (i=0; i<ncol-1; i++){
        for (int iplane = 0; iplane<3; ++iplane) {
          quint8 flag = 0U;
          quint8 mask = 1U;

          IntVec3D tpos(i, j, k);

          for (int ii=0; ii<4; ++ii) {
            IntVec3D iv = tpos + m_ivdel[ii + iplane*4];
            val[ii] = m_maptmp.at(iv.ai(1), iv.ai(2), iv.ai(3));
            if (val[ii]>isolev)
              flag += mask;
            mask = mask << 1;
          }

          int iv0 = triTable[flag][0];
          int iv1 = triTable[flag][1];
          if (iv0<0)
            continue;
          float crs0 = getCrossVal(val[iv0], val[(iv0+1)%4], isolev);
          float crs1 = getCrossVal(val[iv1], val[(iv1+1)%4], isolev);
          if (crs0>=-0.0 && crs1>=-0.0) {
            Vector4D v0 = calcVecCrs(tpos, iv0, crs0, iplane*4);
            Vector4D v1 = calcVecCrs(tpos, iv1, crs1, iplane*4);
            pdc->vertex(v0);
            pdc->vertex(v1);
          }
        }
      }
  pdc->end();
}

