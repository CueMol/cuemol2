// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject
//

#include <common.h>

#include "GLSLMapMesh3Renderer.hpp"
#include "DensityMap.hpp"

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>

#include <sysdep/OglShaderSetupHelper.hpp>

//#define SCALE 0x1000
//#define DBG_DRAW_AXIS 0
// #define MY_MAPTEX_DIM GL_TEXTURE_BUFFER
//#define USE_ALLMAP

#ifdef WIN32
#define USE_TBO
#endif

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
GLSLMapMesh3Renderer::GLSLMapMesh3Renderer()
     : super_t()
{
  m_pPO = NULL;
  m_pMapTex = NULL;
  m_pAttrAry = NULL;

  m_bCacheValid = false;

  //m_nTexStCol = -1;
  //m_nTexStRow = -1;
  //m_nTexStSec = -1;

  // setForceGLSL(true);
}

// destructor
GLSLMapMesh3Renderer::~GLSLMapMesh3Renderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
}

/////////////////////////////////

/// Use ver2 interface, if shader is available
///  (Fall back to legacy impl (AtomIntr2Renderer) if the shader is not available)
bool GLSLMapMesh3Renderer::isUseVer2Iface() const
{
  if (isUseShader())
    return true;
  else
    return false; // --> fall back to legacy impl
}

bool GLSLMapMesh3Renderer::init(DisplayContext *pdc)
{
  DensityMap *pMap = dynamic_cast<DensityMap *>(getClientObj().get());
  if (pMap!=NULL) {
    pMap->setCompCtxt( pdc->getComputeContext() );
  }

  sysdep::OglShaderSetupHelper<GLSLMapMesh3Renderer> ssh(this);

  if (m_pPO==NULL)
    ssh.setUseInclude(true);
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
  //ssh.defineMacro("TEX2D_WIDTH", LString::format("%d",TEX2D_WIDTH).c_str());
#endif
    m_pPO = ssh.createProgObj("mapmesh2",
                              "%%CONFDIR%%/data/shaders/mapmesh2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/mapmesh2_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("GPUMapMesh> ERROR: cannot create progobj.");
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
  
  m_nPosLoc = m_pPO->getAttribLocation("a_dummy");
  if (m_nPosLoc<0)
    m_nPosLoc = 0;
  MB_DPRINTLN("a_dummy location: %d", m_nPosLoc);
  
  // connect texture0 to the dataFieldTex uniform variable
  m_pPO->setUniform("dataFieldTex", MAP_TEX_UNIT);
  CHK_GLERROR("setUniform dataFieldTex");

  m_pPO->disable();

  if (m_pMapTex != NULL)
    delete m_pMapTex;
  m_pMapTex = MB_NEW gfx::Texture();

#ifdef USE_TBO
  m_pMapTex->setup(1, gfx::Texture::FMT_R,
                   gfx::Texture::TYPE_UINT8);
#else
  m_pMapTex->setup(3, gfx::Texture::FMT_R,
                   gfx::Texture::TYPE_UINT8_COLOR);
                   //gfx::Texture::TYPE_UINT8);
#endif

  setShaderAvail(true);
  return true;
}

void GLSLMapMesh3Renderer::unloading()
{
  if (m_pMapTex != NULL)
    delete m_pMapTex;
  m_pMapTex = NULL;

  if (m_pAttrAry != NULL)
    delete m_pAttrAry;
  m_pAttrAry = NULL;

  // ProgramObject is owned by DisplayContext
  // and will be reused other renderes,
  // so m_pPO should not be deleted here.
  m_pPO = NULL;

  super_t::unloading();
}

void GLSLMapMesh3Renderer::createDisplayCache()
{
  if (isUseShader()) {
    createGLSL();
  }
  else {
  }
}

void GLSLMapMesh3Renderer::invalidateDisplayCache()
{
  m_bCacheValid = false;
  super_t::invalidateDisplayCache();
}

bool GLSLMapMesh3Renderer::isCacheAvail() const
{
  if (m_bCacheValid)
    return true;
  else
    return false;
}

void GLSLMapMesh3Renderer::createGLSL()
{
  if (m_bUseGlobMap)
    createGLSLGlobMap();
  else
    createGLSLLocMap();
}

/// create GLSL dataset using global map (i.e., texture obj in DensityMap obj)
void GLSLMapMesh3Renderer::createGLSLGlobMap()
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());

  setupMapRendInfo(pMap);

  calcContLevel(pMap);

  {
    // (Re)Generate Grid Data VBO
    // size is changed --> generate grid data
    const int vcol = getDspSize().x()-1;
    const int vrow = getDspSize().y()-1;
    const int vsec = getDspSize().z()-1;
    const int nVA = vcol * vrow * vsec * 2;

    if (m_pAttrAry==NULL || nVA!=m_pAttrAry->getSize()) {

      if (m_pAttrAry!=NULL)
        delete m_pAttrAry;

      m_pAttrAry = MB_NEW AttrArray();
      
      AttrArray &ata = *m_pAttrAry;
      ata.setAttrSize(1);
      ata.setAttrInfo(0, m_nPosLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, dummy));
      
      ata.alloc(nVA);
      ata.setDrawMode(gfx::AbstDrawElem::DRAW_LINES);
    }
  }

  MB_DPRINTLN("GLSLMapMesh> Make3D texture OK.");
  m_bCacheValid = true;
}

/// create GLSL dataset using local copy of map
void GLSLMapMesh3Renderer::createGLSLLocMap()
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());

  setupMapRendInfo(pMap);

  calcContLevel(pMap);

  // setup mol boundry info (if needed)
  setupMolBndry();

  const int ncol = getDspSize().x();
  const int nrow = getDspSize().y();
  const int nsec = getDspSize().z();

  const int stcol = m_mapStPos.x();
  const int strow = m_mapStPos.y();
  const int stsec = m_mapStPos.z();

  bool bOrgChg = false;
  if (!m_mapStPos.equals(m_texStPos)) {
    bOrgChg = true;
  }

  bool bSizeChg = false;

  if (m_maptmp.cols()!=ncol ||
      m_maptmp.rows()!=nrow ||
      m_maptmp.secs()!=nsec) {
    // texture size changed --> regenerate texture/VBO
    m_maptmp.resize(ncol, nrow, nsec);
    bSizeChg = true;
  }

  if (bSizeChg) {
    // (Re)Generate Grid Data VBO
    // size is changed --> generate grid data
    const int nVA = (ncol-1) * (nrow-1) * (nsec-1) * 2;

    if (m_pAttrAry!=NULL)
      delete m_pAttrAry;

    m_pAttrAry = MB_NEW AttrArray();

    AttrArray &ata = *m_pAttrAry;
    ata.setAttrSize(1);
    ata.setAttrInfo(0, m_nPosLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, dummy));

    ata.alloc(nVA);
    ata.setDrawMode(gfx::AbstDrawElem::DRAW_LINES);
  }

  if (bSizeChg || bOrgChg || isUseMolBndry() ) {
    // (Re)generate texture map
    // create local CPU copy of Texture
    int i,j,k;
    for (k=0; k<nsec; k++)
      for (j=0; j<nrow; j++)
        for (i=0; i<ncol; i++){
          if (!inMolBndry(pMap, stcol+i, strow+j, stsec+k))
            m_maptmp.at(i,j,k) = 0;
          else
            m_maptmp.at(i,j,k) = getMap(pMap, stcol+i, strow+j, stsec+k);
        }
    
    m_texStPos = m_mapStPos;

#ifdef USE_TBO
    m_pMapTex->setData(ncol*nrow*nsec, 1, 1, m_maptmp.data());
#else
    m_pMapTex->setData(ncol, nrow, nsec, m_maptmp.data());
#endif

  }

  
  MB_DPRINTLN("GLSLMapMesh> Make3D texture OK.");
  m_bCacheValid = true;

}


void GLSLMapMesh3Renderer::renderGLSL(DisplayContext *pdc)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  pdc->setLineWidth(getLineWidth());
  pdc->setLighting(false);

  pdc->pushMatrix();

  //setupXform(pdc, pMap, pXtal);
  Matrix4D xfm = getXform(pMap, pXtal);
  pdc->multMatrix(xfm);
  
  if (m_bUseGlobMap)
    pdc->useTexture(pXtal->getMapTex(), MAP_TEX_UNIT);
  else
    pdc->useTexture(m_pMapTex, MAP_TEX_UNIT);

  m_pPO->enable();
  
  int i,j,k;

  if (isSphExt()) {
    m_pPO->setMatrix("u_xform", xfm);
    m_pPO->setUniformF("u_cen", getCenter().x(), getCenter().y(), getCenter().z());
    m_pPO->setUniformF("u_cexten", getExtent());
  }
  else {
    m_pPO->setUniformF("u_cexten", -1.0f);
  }
  
  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
  m_pPO->setUniform("isolevel", m_nIsoLevel);
  //m_pPO->setUniform("ncol", getDspSize().x());
  //m_pPO->setUniform("nrow", getDspSize().y());
  //m_pPO->setUniform("nsec", getDspSize().z());

  m_pPO->setUniform("u_dspsz", getDspSize().x(), getDspSize().y(), getDspSize().z());

  if (m_bUseGlobMap) {
    m_pPO->setUniform("u_stpos", m_mapStPos.x(), m_mapStPos.y(), m_mapStPos.z());
    m_pPO->setUniform("u_mapsz", getMapSize().x(), getMapSize().y(), getMapSize().z());
  }    
  else {
    m_pPO->setUniform("u_stpos", 0,0,0);
    m_pPO->setUniform("u_mapsz", getDspSize().x(), getDspSize().y(), getDspSize().z());
  }

  qlib::uid_t nSceneID = getSceneID();
  {
    float r,g,b;
    ColorPtr pcol = getColor();
    quint32 dcc = pcol->getDevCode(nSceneID);
    r = gfx::convI2F(gfx::getRCode(dcc));
    g = gfx::convI2F(gfx::getGCode(dcc));
    b = gfx::convI2F(gfx::getBCode(dcc));
    m_pPO->setUniformF("u_color", r, g, b, 1.0f);
  }

  int iplane;
  for (iplane = 0; iplane<3; ++iplane) {
    m_pPO->setUniform("u_plane", iplane);
    pdc->drawElem(*m_pAttrAry);
  }

  m_pPO->disable();
  
  if (m_bUseGlobMap)
    pdc->unuseTexture(pXtal->getMapTex());
  else
    pdc->unuseTexture(m_pMapTex);

  pdc->popMatrix();

}

void GLSLMapMesh3Renderer::setUseGlobMap(bool b)
{
  if (b) {
    ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
    DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
    if (pXtal==NULL) {
      MB_THROW(qlib::IllegalArgumentException, "cannot use global map");
      return;
    }
    if (pXtal->getMapTex()==NULL) {
      MB_THROW(qlib::IllegalArgumentException, "cannot use global map");
      return;
    }

    // cleanup local copy
    if (m_pMapTex!=NULL)
      m_pMapTex->setData(1, 1, 1, NULL);
    m_maptmp.resize(0,0,0);
  }

  m_bUseGlobMap = b;
  invalidateDisplayCache();
}

#if 0
namespace {
  float getCrossVal(quint8 d0, quint8 d1, quint8 isolev)
  {
    if (d0==d1) return -1.0;
    
    float crs = float(isolev-d0)/float(d1-d0);
    return crs;
  }
}

Vector3F GLSLMapMesh3Renderer::calcVecCrs(const Vector3I &tpos, int iv0, float crs0, int ivbase)
{
  Vector3F vbase = Vector3F(tpos);
  Vector3F v0, v1, vr;

  v0 = vbase + Vector3F(m_ivdel[ivbase+iv0]);
  v1 = vbase + Vector3F(m_ivdel[ivbase+(iv0+1)%4]);

  vr = v0 + (v1-v0).scale(crs0);
  return vr;
}

void GLSLMapMesh3Renderer::renderCPU(DisplayContext *pdc)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  if (!m_bCacheValid) {
    if (!pMap)
      return;
    make3DTexMap(pMap, pXtal);

    // Vector3I ivdel[4];
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
    m_ivdel[4] = Vector3I(0,0,0);
    m_ivdel[5] = Vector3I(0,0,1);
    m_ivdel[6] = Vector3I(1,0,1);
    m_ivdel[7] = Vector3I(1,0,0);
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
  int ncol = m_dspSize.x();
  int nrow = m_dspSize.y();
  int nsec = m_dspSize.z();

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

  pdc->color(getColor());
  pdc->startLines();

  for (k=0; k<nsec-1; k++)
    for (j=0; j<nrow-1; j++)
      for (i=0; i<ncol-1; i++){
        for (int iplane = 0; iplane<3; ++iplane) {
          quint8 flag = 0U;
          quint8 mask = 1U;

          Vector3I tpos(i, j, k);

          for (int ii=0; ii<4; ++ii) {
            Vector3I iv = tpos + m_ivdel[ii + iplane*4];
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
            Vector3F v0 = calcVecCrs(tpos, iv0, crs0, iplane*4);
            Vector3F v1 = calcVecCrs(tpos, iv1, crs1, iplane*4);
            pdc->vertex(v0.x(), v0.y(), v0.z());
            pdc->vertex(v1.x(), v1.y(), v1.z());
          }
        }
      }
  pdc->end();
}
#endif

