// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject
//

#include <common.h>

#include "GLSLMapVolRenderer.hpp"
#include "DensityMap.hpp"

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>

#include <gfx/Texture.hpp>

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
GLSLMapVolRenderer::GLSLMapVolRenderer()
     : super_t()
{
  m_bChkShaderDone = false;

  // m_nBufSize = 100;
  m_bPBC = false;
  m_bAutoUpdate = true;

  m_pPO = NULL;

  // m_nMapTexID = 0;
  m_pMapTex = NULL;

  // m_nXfunTexID = 0;

  m_bMapTexOK = false;

  m_xfnmap.resize(256*4);

}

// destructor
GLSLMapVolRenderer::~GLSLMapVolRenderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
}

/////////////////////////////////

const char *GLSLMapVolRenderer::getTypeName() const
{
  return "gpu_mapvol";
}

double GLSLMapVolRenderer::getMaxExtent() const
{
  GLSLMapVolRenderer *pthis = const_cast<GLSLMapVolRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();

  const double xmax = pMap->getColNo() * pMap->getColGridSize() / 2.0;
  const double ymax = pMap->getRowNo() * pMap->getRowGridSize() / 2.0;
  const double zmax = pMap->getSecNo() * pMap->getSecGridSize() / 2.0;

  return qlib::max(xmax, qlib::max(ymax, zmax));
}

void GLSLMapVolRenderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid==qlib::invalid_uid)
    return;

  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->addViewListener(nid, this);

  // initShader();
}

qlib::uid_t GLSLMapVolRenderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  

void GLSLMapVolRenderer::viewChanged(qsys::ViewEvent &ev)
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

//////////////////////////////////////////////////////////////////

void GLSLMapVolRenderer::initShader(DisplayContext *pdc)
{
  sysdep::ShaderSetupHelper<GLSLMapVolRenderer> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("GPUMapMesh> ERROR: OpenGL GPU shading not supported.");
    MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    m_bChkShaderDone = true;
    return;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_mapvol",
                              "%%CONFDIR%%/data/shaders/mapvol_vertex.glsl",
                              "%%CONFDIR%%/data/shaders/mapvol_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("GPUMapMesh> ERROR: cannot create progobj.");
    m_bChkShaderDone = true;
    return;
  }

  LOG_DPRINTLN("Init MapVol shader OK.");

  // glGenBuffersARB(1, &m_nVBOID);

  // setup texture (map 3D tex)
  /*
  glGenTextures(1, &m_nMapTexID);
  glActiveTexture(GL_TEXTURE0);
  glEnable(GL_TEXTURE_3D);
  glBindTexture(GL_TEXTURE_3D, m_nMapTexID);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_3D, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);
  glBindTexture(GL_TEXTURE_3D, 0);
  glDisable(GL_TEXTURE_3D);
  */

  //qlib::uid_t nSceneID = getSceneID();
  //m_pMapTex = MB_NEW gfx::Texture3D();
  //m_pMapTex->setRep(MB_NEW OglTextureRep(nSceneID));
  m_pMapTex = pdc->createTexture3D();
  m_pMapTex->setup();

  // setup texture (xfer function 1D tex; unit 1)
  //m_pXfnTex = MB_NEW gfx::Texture1D();
  //m_pXfnTex->setRep(MB_NEW OglTextureRep(nSceneID));
  m_pXfnTex = pdc->createTexture1D();
  m_pXfnTex->setup(gfx::AbstTexture::FMT_RGBA,
		   gfx::AbstTexture::TYPE_UINT8);
  /*
  glGenTextures(1, &m_nXfunTexID);
  glActiveTexture(GL_TEXTURE1);
  glEnable(GL_TEXTURE_1D);
  glBindTexture(GL_TEXTURE_1D, m_nXfunTexID);
  glTexParameteri(GL_TEXTURE_1D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_1D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_1D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glBindTexture(GL_TEXTURE_1D, 0);
  glDisable(GL_TEXTURE_1D);

  glActiveTexture(GL_TEXTURE0);
  */
  m_bChkShaderDone = true;
}

void GLSLMapVolRenderer::unloading()
{
  // delete texture
  //glDeleteTextures(1, &m_nMapTexID);
  if (m_pMapTex!=NULL) {
    delete m_pMapTex;
    m_pMapTex = NULL;
  }

  // glDeleteTextures(1, &m_nXfunTexID);
  if (m_pXfnTex!=NULL) {
    delete m_pXfnTex;
    m_pXfnTex = NULL;
  }

  // glDeleteBuffersARB(1, &m_nVBOID);

  // PO will be reused
  m_pPO = NULL;

  super_t::unloading();
}

void GLSLMapVolRenderer::invalidateDisplayCache()
{
  m_bMapTexOK = false;
  super_t::invalidateDisplayCache();
}

/////////////////////////////////

void GLSLMapVolRenderer::make3DTexMap(ScalarObject *pMap, DensityMap *pXtal)
{
  if (m_pPO==NULL) {
    MB_DPRINTLN("MapVol> Error; shader not initialized!!");
    return;
  }

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

  m_dgrid = qlib::min(pMap->getColGridSize(),
                      qlib::min(pMap->getRowGridSize(),
                                pMap->getSecGridSize()));

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

  //
  // Generate texture map
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

  /*
  glActiveTexture(GL_TEXTURE0);
  glEnable(GL_TEXTURE_3D);
  glBindTexture(GL_TEXTURE_3D, m_nMapTexID);
  glTexEnvf( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE );
  glPixelStorei( GL_UNPACK_ALIGNMENT, 1 );

  if (!bReuse) {
    glTexImage3D(GL_TEXTURE_3D, 0,
                 GL_LUMINANCE,
                 ncol, nrow, nsec, 0,
                 GL_LUMINANCE, GL_UNSIGNED_BYTE, m_maptmp.data());
  }
  else {
    glTexSubImage3D(GL_TEXTURE_3D,
                    0, // LOD
                    0, 0, 0, // offset
                    ncol, nrow, nsec, // size
                    GL_LUMINANCE, // format
                    GL_UNSIGNED_BYTE, // type
                    m_maptmp.data());
  }
  */
  //m_pMapTex->setDimension(ncol, nrow, nsec);
  m_pMapTex->setData(ncol, nrow, nsec, m_maptmp.data());

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

  // glBindTexture(GL_TEXTURE_3D, 0);

  genXferFunMap();

  m_pPO->enable();

  // connect texture0 to the dataFieldTex uniform variable
  m_pPO->setUniform("dataFieldTex", 0);
  CHK_GLERROR("setUniform dataFieldTex");

  // connect texture1 to the xferFunTex uniform variable
  m_pPO->setUniform("xferFunTex", 1);
  CHK_GLERROR("setUniform xferFunTex");

  m_pPO->disable();

  MB_DPRINTLN("make3D texture OK.");
  m_bMapTexOK = true;
}

void GLSLMapVolRenderer::genXferFunMap()
{
  CHK_GLERROR("(reset)");

  quint8 *pData = &m_xfnmap[0]; //new quint8[4*256];
  if (m_nXferType==GLMV_AUTO1) {
    for (int i=0; i<256; ++i) {
      double d = double(i)/255.0;
      d = pow(d, 1.5);
      double dr, dg, db;
      gfx::AbstractColor::HSBtoRGB(d, 1.0, 1.0, dr, dg, db);

      Vector4D col(dr, dg, db);
      if (i>m_isolevel)
	col.w() = d*2.0;
      else
	col.w() = d*0.1;
      pData[i*4 + 0] = (quint8) qlib::trunc(int(col.x()*255.0), 0, 255);
      pData[i*4 + 1] = (quint8) qlib::trunc(int(col.y()*255.0), 0, 255);
      pData[i*4 + 2] = (quint8) qlib::trunc(int(col.z()*255.0), 0, 255);
      pData[i*4 + 3] = (quint8) qlib::trunc(int(col.w()*255.0), 0, 255);
    }
  }
  else /*if (m_nXferType==GLMV_AUTO2)*/ {
    for (int i=0; i<256; ++i) {
      double d = double(i)/255.0;
      d = pow(d, 1.5);
      double dr, dg, db;
      gfx::AbstractColor::HSBtoRGB(d, 1.0, 1.0, dr, dg, db);

      Vector4D col(dr, dg, db);
      if (i>m_isolevel)
	col.w() = d*2.0;
      else
	col.w() = d*0.1;
      pData[i*4 + 0] = (quint8) qlib::trunc(int(col.x()*255.0), 0, 255);
      pData[i*4 + 1] = (quint8) qlib::trunc(int(col.y()*255.0), 0, 255);
      pData[i*4 + 2] = (quint8) qlib::trunc(int(col.z()*255.0), 0, 255);
      pData[i*4 + 3] = (quint8) qlib::trunc(int(col.w()*255.0), 0, 255);
    }
  }

  MB_DPRINTLN("MapVol> genXferFunMap for siglevel %d done", m_isolevel);
  m_pXfnTex->setData(256, pData);
  // delete [] pData;

  /*
  glActiveTexture(GL_TEXTURE1);
  glEnable(GL_TEXTURE_1D);
  glBindTexture(GL_TEXTURE_1D, m_nXfunTexID);
  glTexEnvf(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 4);

  glTexImage1D(GL_TEXTURE_1D, 0,
               GL_RGBA,
               256, 0,
               GL_RGBA, GL_UNSIGNED_BYTE, pData);
  CHK_GLERROR("glTexImage1D xferFunTex");

  glBindTexture(GL_TEXTURE_1D, 0);
  glDisable(GL_TEXTURE_1D);
  glActiveTexture(GL_TEXTURE0);
  */
}

void GLSLMapVolRenderer::display(DisplayContext *pdc)
{
  if (!m_bChkShaderDone)
    initShader(pdc);

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  if (!m_bMapTexOK) {
    if (!pMap)
      return;
    make3DTexMap(pMap, pXtal);
  }

  pdc->color(getColor());
  pdc->setLineWidth(1.0);
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

  // (0~nActCol) <==> (0~1)
  vtmp = Vector4D(m_nActCol, m_nActRow, m_nActSec);
  pdc->scale(vtmp);

  //renderCPU(pdc);
  renderGPU(pdc);

  pdc->popMatrix();

}

void calcBoundingBox( float& x_min, float& x_max,
                      float& y_min, float& y_max,
                      float& z_min, float& z_max )
{
  // current modelview matrix (local -> camera)

  float	m[ 16 ];
  glGetFloatv( GL_MODELVIEW_MATRIX, m );

  // print

#if 0
  for ( int i = 0; i < 4; i++ ) {
    for ( int j = 0; j < 4; j++ ) {
      cout << m[ i + j * 4 ] << " ";
    }
    cout << endl;
  }
#endif

  // find x_min and x_max

  x_min = m[ 3 * 4 + 0 ];
  x_max = m[ 3 * 4 + 0 ];
  for ( int i = 0; i < 3; i++ ) {
    if ( m[ i * 4 + 0 ] < 0 ) {
      x_min += m[ i * 4 + 0 ];
    } else {
      x_max += m[ i * 4 + 0 ];
    }
  }

  // find y_min and y_max

  y_min = m[ 3 * 4 + 1 ];
  y_max = m[ 3 * 4 + 1 ];
  for ( int i = 0; i < 3; i++ ) {
    if ( m[ i * 4 + 1 ] < 0 ) {
      y_min += m[ i * 4 + 1 ];
    } else {
      y_max += m[ i * 4 + 1 ];
    }
  }

  // find z_min and z_max

  z_min = m[ 3 * 4 + 2 ];
  z_max = m[ 3 * 4 + 2 ];
  for ( int i = 0; i < 3; i++ ) {
    if ( m[ i * 4 + 2 ] < 0 ) {
      z_min += m[ i * 4 + 2 ];
    } else {
      z_max += m[ i * 4 + 2 ];
    }
  }

/*
  // near and far must be set before exec

  if ( z_max > -near_clipping_length ) {
    z_max = -near_clipping_length;
  }
  if ( z_min < -far_clipping_length ) {
    z_min = -far_clipping_length;
  }
*/
  // -far_clipping_length < z_min < z_max < -near_clipping_length ( < 0 )
}

static GLdouble clip_plane[ 6 ][ 4 ] = {
	{  1,  0,  0, 0 },
	{ -1,  0,  0, 1 },
	{  0,  1,  0, 0 },
	{  0, -1,  0, 1 },
	{  0,  0,  1, 0 },
	{  0,  0, -1, 1 }
};

void enableClipPlane()
{
  for ( int i = 0; i < 6; i++ ) {
    glClipPlane( GL_CLIP_PLANE0 + i, clip_plane[i] );
    glEnable( GL_CLIP_PLANE0 + i );
  }
}

void disableClipPlane()
{
  for ( int i = 0; i < 6; i++ ) {
    glDisable( GL_CLIP_PLANE0 + i );
  }
}

void GLSLMapVolRenderer::renderGPU(DisplayContext *pdc)
{
  if (m_pPO==NULL) {
    MB_DPRINTLN("MapVol> Error; shader not initialized!!");
    return;
  }

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  int i,j,k;
  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

  //////////////////////////////////////////

  // check bounding box of volume in camera coordinate
  float	x_min, x_max, y_min, y_max, z_min, z_max;

  calcBoundingBox( x_min, x_max, y_min, y_max, z_min, z_max );

  // Set clipping planes to limit drawing into the target box
  enableClipPlane();

  const float zrange = z_max - z_min;
  const int nLayers = ::ceil(zrange/m_dgrid*2.0);
  float	thickness = zrange / nLayers;
  MB_DPRINTLN("nlayer: %d, thickness: %f", nLayers, thickness);

  glDisable( GL_CULL_FACE );
  glDisable( GL_LIGHTING );

  //glEnable( GL_BLEND );
  //glBlendFunc( GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA );

  //glActiveTexture( GL_TEXTURE0 );
  //glEnable( GL_TEXTURE_3D );
  //glBindTexture( GL_TEXTURE_3D, texture_data );

  // calc inverse modelview matrix
  // because glsl's ModelViewMatrixInverse is sometimes incorrect...

  float	m[ 16 ];
  float	mi[ 16 ];
  float	d;

  glGetFloatv( GL_MODELVIEW_MATRIX, m );

  d = m[ 0 ] * ( m[ 5 ] * m[ 10 ] - m[ 9 ] * m[  6 ] )
    + m[ 4 ] * ( m[ 9 ] * m[  2 ] - m[ 1 ] * m[ 10 ] )
      + m[ 8 ] * ( m[ 1 ] * m[  6 ] - m[ 5 ] * m[  2 ] );

  mi[ 0 ] =    m[ 5 ] * m[ 10 ] - m[ 9 ] * m[ 6 ];
  mi[ 1 ] = -( m[ 1 ] * m[ 10 ] - m[ 9 ] * m[ 2 ] );
  mi[ 2 ] =    m[ 1 ] * m[  6 ] - m[ 5 ] * m[ 2 ];
  mi[ 3 ] = 0.0f;

  mi[ 4 ] = -( m[ 4 ] * m[ 10 ] - m[ 8 ] * m[ 6 ] );
  mi[ 5 ] =    m[ 0 ] * m[ 10 ] - m[ 8 ] * m[ 2 ];
  mi[ 6 ] = -( m[ 0 ] * m[  6 ] - m[ 4 ] * m[ 2 ] );
  mi[ 7 ] = 0.0f;

  mi[ 8 ] =    m[ 4 ] * m[ 9 ] - m[ 8 ] * m[ 5 ];
  mi[ 9 ] = -( m[ 0 ] * m[ 9 ] - m[ 8 ] * m[ 1 ] );
  mi[ 10 ] =    m[ 0 ] * m[ 5 ] - m[ 4 ] * m[ 1 ];
  mi[ 11 ] = 0.0f;

  for ( int i = 0; i < 12; i++ ) {
    mi[ i ] /= d;
  }

  mi[ 12 ] = -( mi[ 0 ] * m[ 12 ] + mi[ 4 ] * m[ 13 ] + mi[  8 ] * m[ 14 ] );
  mi[ 13 ] = -( mi[ 1 ] * m[ 12 ] + mi[ 5 ] * m[ 13 ] + mi[  9 ] * m[ 14 ] );
  mi[ 14 ] = -( mi[ 2 ] * m[ 12 ] + mi[ 6 ] * m[ 13 ] + mi[ 10 ] * m[ 14 ] );

  mi[ 15 ] = 1.0f;

  //////////////////////////////

  /*
  glActiveTexture(GL_TEXTURE0);
  //glEnable(GL_TEXTURE_3D);
  glBindTexture(GL_TEXTURE_3D, m_nMapTexID);
  */
  m_pMapTex->use(0);

  /*
  glActiveTexture(GL_TEXTURE1);
  glBindTexture(GL_TEXTURE_1D, m_nXfunTexID);
  */
  m_pXfnTex->use(1);

  if (m_pPO)
    m_pPO->enable();
  
  // set variables

  // m_pPO->setUniform( "dataFieldTex", 0 );
  // m_pPO->setUniformF( "isolevel", float(m_isolevel)/255.0 );
  m_pPO->setUniformF( "thickness", thickness );
  m_pPO->setMatrix4fv( "modelview_matrix_inverse", 1, GL_FALSE, mi );

  // draw proxy polygons

  glPushMatrix();
  glBegin( GL_QUADS );
  for (int i=0; i<nLayers; i++) {
    float z = z_min + thickness * i;
    glVertex3f( x_min, y_min, z );
    glVertex3f( x_max, y_min, z );
    glVertex3f( x_max, y_max, z );
    glVertex3f( x_min, y_max, z );
  }
  glEnd();
  glPopMatrix();

  /*
  glActiveTexture( GL_TEXTURE0 );
  glDisable( GL_TEXTURE_3D );
  glBindTexture(GL_TEXTURE_3D, 0);
  */

  m_pMapTex->unuse();
  m_pXfnTex->unuse();

  if (m_pPO)
    m_pPO->disable();

  disableClipPlane();
}


