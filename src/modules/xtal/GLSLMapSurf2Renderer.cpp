// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

#include "GLSLMapSurf2Renderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>
#include <sysdep/OglProgramObject.hpp>
#include <sysdep/OglShaderSetupHelper.hpp>
#include <sysdep/OglError.hpp>

#include <qsys/ScrEventManager.hpp>

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;

#ifdef WIN32
#define USE_TBO
#endif

#define USE_DRAW_INSTANCED 65536

/// default constructor
GLSLMapSurf2Renderer::GLSLMapSurf2Renderer()
  : super_t()
{
  m_pPO = NULL;
  m_pMapTex = NULL;
  m_pAttrArray = NULL;
  m_pTriTex = NULL;
}

/// destructor
GLSLMapSurf2Renderer::~GLSLMapSurf2Renderer()
{
  // for safety, remove from event manager is needed here...
  qsys::ScrEventManager *pSEM = qsys::ScrEventManager::getInstance();
  pSEM->removeViewListener(this);
}

///////////////////////////////////////////

/// Use ver2 interface
bool GLSLMapSurf2Renderer::isUseVer2Iface() const
{
  if (isUseShader())
    return true;
  else
    return false; // --> fall back to legacy impl
}

/// Initialize & setup capabilities (for glsl setup)
// void initShader(DisplayContext *pdc);
bool GLSLMapSurf2Renderer::init(DisplayContext *pdc)
{
  DensityMap *pMap = dynamic_cast<DensityMap *>(getClientObj().get());
  if (pMap!=NULL) {
    pMap->setCompCtxt( pdc->getComputeContext() );
  }

  sysdep::OglShaderSetupHelper<GLSLMapSurf2Renderer> ssh(this);

  if (m_pPO==NULL) {
    ssh.setUseInclude(true);
#ifdef USE_TBO
    ssh.defineMacro("USE_TBO", "1");
#else
#endif
    
#ifdef USE_DRAW_INSTANCED
    ssh.defineMacro("USE_DRAW_INSTANCED", LString::format("%d",USE_DRAW_INSTANCED).c_str());
#else
#endif
    m_pPO = ssh.createProgObj("mapsurf1",
                              "%%CONFDIR%%/data/shaders/mapsurf1_vertex.glsl",
                              "%%CONFDIR%%/data/shaders/mapsurf1_frag.glsl");
  }
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("GPUMapSurf2> ERROR: cannot create progobj.");
    return false;
  }

  m_pPO->enable();

  m_nDummyLoc = m_pPO->getAttribLocation("a_dummy");
  if (m_nDummyLoc<0)
    m_nDummyLoc = 0;
  MB_DPRINTLN("a_dummy location: %d", m_nDummyLoc);

  // setup constant tables
  int i, j;
  LString key;

  // vtxoffs
  for (i=0; i<8; ++i) {
    key = LString::format("ivtxoffs[%d]", i);
    m_pPO->setUniform(key, vtxoffs[i][0], vtxoffs[i][1], vtxoffs[i][2]);
  }
  
  // a2fVertexOffset
  for (i=0; i<8; ++i) {
    key = LString::format("fvtxoffs[%d]", i);
    m_pPO->setUniformF(key, a2fVertexOffset[i][0], a2fVertexOffset[i][1], a2fVertexOffset[i][2]);
  }

  // a2fEdgeDirection
  for (i=0; i<12; ++i) {
    key = LString::format("fegdir[%d]", i);
    m_pPO->setUniformF(key, a2fEdgeDirection[i][0], a2fEdgeDirection[i][1], a2fEdgeDirection[i][2]);
  }

  // a2iEdgeConnection
  for (i=0; i<12; ++i) {
    key = LString::format("iegconn[%d]", i);
    m_pPO->setUniform(key, a2iEdgeConnection[i][0], a2iEdgeConnection[i][1]);
  }

  m_pPO->setUniform("u_maptex", MAP_TEX_UNIT);
  m_pPO->setUniform("u_tritex", TRI_TEX_UNIT);

  m_pPO->disable();

  if (m_pMapTex != NULL)
    delete m_pMapTex;
  m_pMapTex = MB_NEW gfx::Texture();

#ifdef USE_TBO
  m_pMapTex->setup(gfx::Texture::DIM_DATA,
                   gfx::Texture::FMT_R,
                   gfx::Texture::TYPE_UINT8);
#else
  m_pMapTex->setup(gfx::Texture::DIM_3D,
                   gfx::Texture::FMT_R,
                   gfx::Texture::TYPE_UINT8);
#endif

  // a2iTriangleConnectionTable (256x5x3)
  m_tritex.resize(256*5*3);
  for (i=0; i<256; ++i) {
    for (j=0; j<5*3; ++j) {
      m_tritex[i*5*3 + j] = qbyte( a2iTriangleConnectionTable[i][j] );
    }
  }
  
  if (m_pTriTex != NULL)
    delete m_pTriTex;
  m_pTriTex = MB_NEW gfx::Texture();

#ifdef USE_TBO
  m_pTriTex->setup(gfx::Texture::DIM_DATA,
                   gfx::Texture::FMT_R,
                   gfx::Texture::TYPE_UINT8);
  m_pTriTex->setData(256*5*3, 1, 1, m_tritex.data());
#else
  m_pTriTex->setup(gfx::Texture::DIM_1D,
                   gfx::Texture::FMT_R,
                   gfx::Texture::TYPE_UINT8);
  m_pTriTex->setData(256*5*3, 1, 1, m_tritex.data());
#endif

  setShaderAvail(true);
  return true;
}
    
/// Called just before this object is unloaded
void GLSLMapSurf2Renderer::unloading()
{
  if (m_pMapTex != NULL)
    delete m_pMapTex;
  m_pMapTex = NULL;

  if (m_pAttrArray != NULL)
    delete m_pAttrArray;
  m_pAttrArray = NULL;

  if (m_pTriTex != NULL)
    delete m_pTriTex;
  m_pTriTex = NULL;

  // ProgramObject is owned by DisplayContext
  // and will be reused other renderes,
  // so m_pPO should not be deleted here.
  m_pPO = NULL;

  super_t::unloading();
}

/*bool GLSLMapSurf2Renderer::isCacheAvail() const
{
}*/

void GLSLMapSurf2Renderer::createDisplayCache()
{
  if (isUseShader()) {
    //createGLSL();
    createGLSL2();
  }
  //else {
  //}
}

/// Create GLSL data (VBO, texture, etc)
void GLSLMapSurf2Renderer::createGLSL()
{
#if 0
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  m_pCMap = pMap;

  calcMapDispExtent(pMap);

  calcContLevel(pMap);

  int ncol = m_dspSize.x(); //m_nActCol;
  int nrow = m_dspSize.y(); //m_nActCol;
  int nsec = m_dspSize.z(); //m_nActCol;

  int i,j,k;

  ///////////////////////
  // Create attribute VBO

  int nsz_est_tot = ncol*nrow*nsec*6;
  
  if (m_pAttrArray!=NULL && m_pAttrArray->getSize()!=nsz_est_tot) {
    delete m_pAttrArray;
    m_pAttrArray=NULL;
  }

  if (m_pAttrArray==NULL) {
    m_pAttrArray = MB_NEW AttrArray();
    m_pAttrArray->setAttrSize(3);
    
    m_pAttrArray->setAttrInfo(0, m_pPO->getAttribLocation("a_ind"), 1,
                             qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, ind));
    m_pAttrArray->setAttrInfo(1, m_pPO->getAttribLocation("a_flag"), 1,
                             qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, flag));
    m_pAttrArray->setAttrInfo(2, m_pPO->getAttribLocation("a_ivert"), 1,
                             qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, ivert));

    m_pAttrArray->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    //m_pAttrArray->setDrawMode(gfx::AbstDrawElem::DRAW_LINES);
    //m_pAttrArray->setDrawMode(gfx::AbstDrawElem::DRAW_POINTS);
    m_pAttrArray->alloc(nsz_est_tot);
  }

  MB_DPRINTLN("voxels %d", ncol*nrow*nsec);
  MB_DPRINTLN("estimated vertex size %d", nsz_est_tot);
  
  for (i=0; i<m_pAttrArray->getSize(); ++i) {
    m_pAttrArray->at(i).ind = 0.0f;
    m_pAttrArray->at(i).flag = 0.0f;
    m_pAttrArray->at(i).ivert = 0.0f;
  }

  m_nbcol = m_mapStPos.x();
  m_nbrow = m_mapStPos.y();
  m_nbsec = m_mapStPos.z();

  const int ixmax = m_mapSize.x();
  const int iymax = m_mapSize.y();
  const int izmax = m_mapSize.z();

  MB_DPRINTLN("bcol,row,sec=(%d,%d,%d)", m_nbcol, m_nbrow, m_nbsec);
  MB_DPRINTLN("bisolev=%d", m_nIsoLevel);

  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;
  int ix, iy, iz;
  int ixx, iyy, izz;

  int mncol = ncol + 1;
  int mnrow = nrow + 1;
  int mnsec = nsec + 1;

  /////////////////////
  // do marching cubes

  int vxind = 0;
  for (k=0; k<nsec; k+=m_nBinFac) {
    for (j=0; j<nrow; j+=m_nBinFac) {
      for (i=0; i<ncol; i+=m_nBinFac) {
        qbyte values[8];
        bool bary[8];

        ix = i + m_nbcol;
        iy = j + m_nbrow;
        iz = k + m_nbsec;
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
          ixx = ix + (vtxoffs[ii][0]) * m_nBinFac;
          iyy = iy + (vtxoffs[ii][1]) * m_nBinFac;
          izz = iz + (vtxoffs[ii][2]) * m_nBinFac;
          values[ii] = getByteDen(ixx, iyy, izz);
          
          // check mol boundary
          bary[ii] = inMolBndry(pMap, ixx, iyy, izz);
          if (bary[ii])
            bin = true;
        }

        if (!bin)
          continue;

        // Find which vertices are inside of the surface and which are outside
        iFlagIndex = 0;
        for(iVertexTest = 0; iVertexTest < 8; iVertexTest++) {
          if(values[iVertexTest] <= m_nIsoLevel)
            iFlagIndex |= 1<<iVertexTest;
        }

        // Find which edges are intersected by the surface
        iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

        if(iEdgeFlags == 0)
          continue;

        for (iCorner = 0; iCorner < 3*5; iCorner++) {
          iEdge = a2iTriangleConnectionTable[iFlagIndex][iCorner];
          if (iEdge<0)
            break;

          if (vxind<m_pAttrArray->getSize()) {
            m_pAttrArray->at(vxind).ind = i + (j + k*mnrow)*mncol;
            m_pAttrArray->at(vxind).flag = iFlagIndex;
            //m_pAttrArray->at(vxind).ivert = iEdge;
            m_pAttrArray->at(vxind).ivert = iCorner;
          }
          ++vxind;
        }
      }
    }
  }

  //MB_DPRINTLN("filled vbo: %d", vxind);
  m_pAttrArray->setUpdated(true);

  ///////////////////////
  // Create texture (3D/TBO)

  bool bReuse;
  if (m_maptmp.cols()!=mncol ||
      m_maptmp.rows()!=mnrow ||
      m_maptmp.secs()!=mnsec) {
    m_maptmp.resize(mncol, mnrow, mnsec);
    bReuse = false;
  }
  else {
    MB_DPRINTLN("reuse texture");
    bReuse = true;
  }
  
  for (k=0; k<mnsec; k++)
    for (j=0; j<mnrow; j++)
      for (i=0; i<mncol; i++){
        ix = i + m_nbcol;
        iy = j + m_nbrow;
        iz = k + m_nbsec;
        m_maptmp.at(i,j,k) = getByteDen(ix, iy, iz);
      }

#ifdef USE_TBO
    m_pMapTex->setData(ncol*nrow*nsec, 1, 1, m_maptmp.data());
#else
    m_pMapTex->setData(ncol, nrow, nsec, m_maptmp.data());
#endif


  ////////////////////////
  /// Setup uniform values

  m_pPO->enable();

  m_pPO->setUniform("u_isolevel", m_nIsoLevel);
  CHK_GLERROR("setUniform isolevel");

  m_pPO->setUniform("u_ncol", mncol);
  CHK_GLERROR("setUniform ncol");

  m_pPO->setUniform("u_nrow", mnrow);
  CHK_GLERROR("setUniform nrow");

  m_pPO->disable();

  m_bWorkOK = true;
#endif
}

/// Create GLSL data (VBO, texture, etc)
void GLSLMapSurf2Renderer::createGLSL2()
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  m_pCMap = pMap;

  calcMapDispExtent(pMap);

  calcContLevel(pMap);

  int ncol = m_dspSize.x(); //m_nActCol;
  int nrow = m_dspSize.y(); //m_nActCol;
  int nsec = m_dspSize.z(); //m_nActCol;

  int i,j,k;

  ///////////////////////
  // Create attribute VBO

  MB_DPRINTLN("voxels=%d", ncol*nrow*nsec);
  MB_DPRINTLN("bisolev=%d", m_nIsoLevel);

  int nvsz = ncol*nrow*nsec*15;
  int nasz = nvsz;
  
#if (USE_DRAW_INSTANCED>=1)
  nasz = (nvsz/USE_DRAW_INSTANCED/3) * 3;
  while (nasz* USE_DRAW_INSTANCED - nvsz<0)
    nasz +=3;
#endif

  if (m_pAttrArray!=NULL && m_pAttrArray->getSize()!=nasz) {
    delete m_pAttrArray;
    m_pAttrArray=NULL;
  }

  if (m_pAttrArray==NULL) {
    m_pAttrArray = MB_NEW AttrArray();
    m_pAttrArray->setAttrSize(1);
    m_pAttrArray->setAttrInfo(0, m_nDummyLoc, 1,
                              qlib::type_consts::QTC_FLOAT32,
			      offsetof(AttrElem, dummy));

    m_pAttrArray->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    //m_pAttrArray->setDrawMode(gfx::AbstDrawElem::DRAW_POINTS);

    m_pAttrArray->alloc(nasz);

#if (USE_DRAW_INSTANCED>=1)
    m_pAttrArray->setInstCount(USE_DRAW_INSTANCED);
    m_pPO->enable();
    m_pPO->setUniform("u_vbosz", nasz);
    m_pPO->setUniform("u_vmax", nvsz);
    m_pPO->disable();
    MB_DPRINTLN("VBO %d x inst %d = %d", nasz, USE_DRAW_INSTANCED, nasz* USE_DRAW_INSTANCED);
    MB_DPRINTLN("del = %d", nasz* USE_DRAW_INSTANCED - nvsz);
#else
    MB_DPRINTLN("VBO %d created", nasz);
#endif
  }

  
  // m_pAttrArray->setUpdated(true);

  ///////////////////////
  // Create texture (3D/TBO)

  if (m_bUseGlobMap)
    createGlobMapTex();
  else
    createLocMapTex();

  m_bWorkOK = true;
}

/// create global map texture (i.e., texture obj in DensityMap obj)
void GLSLMapSurf2Renderer::createGlobMapTex()
{
  // nothing to be copied

  // Setup uniform values

  m_pPO->enable();
  m_pPO->setUniform("u_isolevel", m_nIsoLevel);
  CHK_GLERROR("setUniform isolevel");

  m_pPO->setUniform("u_dspsz", getDspSize().x(), getDspSize().y(), getDspSize().z());
  m_pPO->setUniform("u_stpos", m_mapStPos.x(), m_mapStPos.y(), m_mapStPos.z());
  m_pPO->setUniform("u_mapsz", getMapSize().x(), getMapSize().y(), getMapSize().z());

  m_pPO->disable();
}

/// create texture using local copy of map
void GLSLMapSurf2Renderer::createLocMapTex()
{
  int mncol = m_dspSize.x() + 2;
  int mnrow = m_dspSize.y() + 2;
  int mnsec = m_dspSize.z() + 2;

  bool bReuse;
  if (m_maptmp.cols()!=mncol ||
      m_maptmp.rows()!=mnrow ||
      m_maptmp.secs()!=mnsec) {
    m_maptmp.resize(mncol, mnrow, mnsec);
    bReuse = false;
  }
  else {
    MB_DPRINTLN("reuse texture");
    bReuse = true;
  }
  
  m_nbcol = m_mapStPos.x()-1;
  m_nbrow = m_mapStPos.y()-1;
  m_nbsec = m_mapStPos.z()-1;
  //MB_DPRINTLN("bcol,row,sec=(%d,%d,%d)", m_nbcol, m_nbrow, m_nbsec);

  int i, j, k;
  
  for (k=0; k<mnsec; k++)
    for (j=0; j<mnrow; j++)
      for (i=0; i<mncol; i++){
        m_maptmp.at(i,j,k) = getByteDen(i + m_nbcol,
                                        j + m_nbrow,
                                        k + m_nbsec);
      }

#ifdef USE_TBO
  m_pMapTex->setData(mncol*mnrow*mnsec, 1, 1, m_maptmp.data());
  MB_DPRINTLN("GLSLMapSurf2> %d bytes TexBO created", mncol*mnrow*mnsec);
#else
  m_pMapTex->setData(mncol, mnrow, mnsec, m_maptmp.data());
  MB_DPRINTLN("GLSLMapSurf2> %dx%dx%d voxels 3DTex created", mncol,mnrow,mnsec);
#endif


  ////////////////////////
  /// Setup uniform values

  m_pPO->enable();
  m_pPO->setUniform("u_isolevel", m_nIsoLevel);
  CHK_GLERROR("setUniform isolevel");

  m_pPO->setUniform("u_dspsz", getDspSize().x(), getDspSize().y(), getDspSize().z());
  m_pPO->setUniform("u_stpos", 1,1,1);
  m_pPO->setUniform("u_mapsz", mncol, mnrow, mnsec);

  m_pPO->disable();
}

/// Render to display (using GLSL)
void GLSLMapSurf2Renderer::renderGLSL(DisplayContext *pdc)
{
  if (m_pPO==NULL) return; // not initialized

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  m_pCMap = pMap;

  preRender(pdc);

  pdc->pushMatrix();

  //setupXform(pdc, pMap, pXtal);
  Matrix4D xfm = calcXformMat(pMap, pXtal);
  pdc->multMatrix(xfm);
  
  if (m_bUseGlobMap)
    pdc->useTexture(pXtal->getMapTex(), MAP_TEX_UNIT);
  else
    pdc->useTexture(m_pMapTex, MAP_TEX_UNIT);

  pdc->useTexture(m_pTriTex, TRI_TEX_UNIT);

  m_pPO->enable();
  
  int i,j,k;

  /*
  if (isSphExt()) {
    m_pPO->setMatrix("u_xform", xfm);
    m_pPO->setUniformF("u_cen", getCenter().x(), getCenter().y(), getCenter().z());
    m_pPO->setUniformF("u_cexten", getExtent());
  }
  else {
    m_pPO->setUniformF("u_cexten", -1.0f);
  }
  */

  m_pPO->setUniformF("frag_alpha", pdc->getAlpha());

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

  // pdc->setPointSize(3.0);
  pdc->drawElem(*m_pAttrArray);

  m_pPO->disable();
  
  if (m_bUseGlobMap)
    pdc->unuseTexture(pXtal->getMapTex());
  else
    pdc->unuseTexture(m_pMapTex);

  pdc->unuseTexture(m_pTriTex);

  pdc->popMatrix();

  postRender(pdc);
}

/*
/// Invalidate the display cache
void GLSLMapSurf2Renderer::invalidateDisplayCache()
{
}
*/

void GLSLMapSurf2Renderer::setUseGlobMap(bool b)
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
