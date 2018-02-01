// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

#include "MapSurfRenderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>
#include <sysdep/OglProgramObject.hpp>

#ifdef _OPENMP
#  include <omp.h>
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

#define MAXTRIG 4

/// Rendering using OpenMP/VBO
void MapSurfRenderer::displayGLSL1(DisplayContext *pdc)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  m_pCMap = pMap;

  if (!m_bWorkOK) {
    // check and setup mol boundary data
    setupMolBndry();
    // generate map-range information
    makerange();
    // CreateVBO
    createGLSL1(pdc);
  }

  preRender(pdc);

  pdc->pushMatrix();
  setupXformMat(pdc);

  if (m_pVBO!=NULL)
    pdc->drawElem(*m_pVBO);

  pdc->popMatrix();

  postRender(pdc);

  m_pCMap = NULL;
}

namespace {
  inline float getOffset(qbyte val1, qbyte val2, qbyte isolev)
  {
    int delta = int(val2) - int(val1);
    
    if(delta == 0) {
      return 0.5f;
    }
    return float(int(isolev) - int(val1))/float(delta);
  }
}

void MapSurfRenderer::createGLSL1(DisplayContext *pdl)
{
  ScalarObject *pMap = m_pCMap;

  /////////////////////
  // setup workarea

  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;

  int lv = int( floor( (m_dLevel - pMap->getLevelBase()) / pMap->getLevelStep() ) );
  m_bIsoLev = qbyte( qlib::trunc<int>(lv, 0, 255) );

  m_nMapColNo = pMap->getColNo();
  m_nMapRowNo = pMap->getRowNo();
  m_nMapSecNo = pMap->getSecNo();

  /////////////////////
  // do marching cubes

  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

  int i,j,k;

  int nsz_est_tot = ncol*nrow*nsec*3;
  
  if (m_pVBO!=NULL && m_pVBO->getSize()!=nsz_est_tot) {
    delete m_pVBO;
    m_pVBO=NULL;
  }

  if (m_pVBO==NULL) {
    m_pVBO = MB_NEW gfx::DrawElemVNC();
    m_pVBO->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    m_pVBO->alloc(nsz_est_tot);
  }

  struct Voxel {
    quint32 ind;
    quint16 flag;
    quint16 ivert;
  };
  std::vector<Voxel> voxdat(ncol*nrow*nsec*6);

  MB_DPRINTLN("voxels %d", ncol*nrow*nsec);
  MB_DPRINTLN("estimated vertex size %d", nsz_est_tot);
  
  for (i=0; i<nsz_est_tot; ++i) {
    m_pVBO->m_pData[i] = {0.0f, 0.0f, 0.0f,0.0f, 0.0f, 0.0f,0,0,0,0};
  }

  quint32 cc = getColor()->getCode();
  m_col_r = gfx::getRCode(cc);
  m_col_g = gfx::getGCode(cc);
  m_col_b = gfx::getBCode(cc);
  m_col_a = gfx::getACode(cc);

  m_nbcol = m_nStCol - pMap->getStartCol();
  m_nbrow = m_nStRow - pMap->getStartRow();
  m_nbsec = m_nStSec - pMap->getStartSec();

  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;
  int ix, iy, iz;
  int ixx, iyy, izz;

  int vxind = 0;
  for (k=0; k<nsec; k+=m_nBinFac) {
    for (j=0; j<nrow; j+=m_nBinFac) {
      for (i=0; i<ncol; i+=m_nBinFac) {

        //if (i==1&&j==1)
        //MB_DPRINTLN("i=%d, thr=%d", k, ithr);

        qbyte values[8];
        bool bary[8];

        //if (i==1&&j==1)
        //MB_DPRINTLN("i=%d, thr=%d", k, omp_get_thread_num());

        ix = i + m_nbcol;
        iy = j + m_nbrow;
        iz = k + m_nbsec;
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
          if(values[iVertexTest] <= m_bIsoLev) 
            iFlagIndex |= 1<<iVertexTest;
        }

        // Find which edges are intersected by the surface
        iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

        if(iEdgeFlags == 0)
          continue;

#ifdef USE_TCTAB
        for (iCorner = 0; iCorner < 3*MAXTRIG; iCorner++) {
          if (vxind<voxdat.size()) {
            voxdat[vxind].ind = i + (j + k*nrow)*ncol;
            voxdat[vxind].flag = quint16(iFlagIndex);
            voxdat[vxind].ivert = quint16(iCorner);
          }
          else {
            //MB_DPRINTLN("XXX");
            //continue;
          }
          ++vxind;
        }
#else
        for (iCorner = 0; iCorner < 3*MAXTRIG; iCorner++) {
          iEdge = a2iTriangleConnectionTable[iFlagIndex][iCorner];
          if (iEdge<0)
            break;

          if (vxind<voxdat.size()) {
            voxdat[vxind].ind = i + (j + k*nrow)*ncol;
            voxdat[vxind].flag = quint16(iFlagIndex);
            voxdat[vxind].ivert = quint16(iEdge);
          }

          ++vxind;
        }
#endif

      }
    }
  }

  MB_DPRINTLN("voxdat size=%d / actual=%d", voxdat.size(), vxind);
  int nvx = qlib::min<int>(vxind, voxdat.size());
  int ivbo = 0;
  float norm[3], norm0[4], norm1[4];

  for (vxind=0; vxind<nvx; ++vxind) {
    i = voxdat[vxind].ind % ncol;
    int itt = voxdat[vxind].ind / ncol;
    j = itt % nrow;
    k = itt / nrow;

    ix = i + m_nbcol;
    iy = j + m_nbrow;
    iz = k + m_nbsec;

    iFlagIndex = voxdat[vxind].flag;

#ifdef USE_TCTAB
    iCorner = voxdat[vxind].ivert;
    iEdge = a2iTriangleConnectionTable[iFlagIndex][iCorner];
    if (iEdge<0)
      continue;
#else
    iEdge = voxdat[vxind].ivert;
#endif

    const int ec0 = a2iEdgeConnection[iEdge][0];
    const int ec1 = a2iEdgeConnection[iEdge][1];

    ixx = ix + (vtxoffs[ec0][0]) * m_nBinFac;
    iyy = iy + (vtxoffs[ec0][1]) * m_nBinFac;
    izz = iz + (vtxoffs[ec0][2]) * m_nBinFac;
    qbyte val0 = getByteDen(ixx, iyy, izz);
    getGrdNormByte(ixx, iyy, izz, norm0);

    ixx = ix + (vtxoffs[ec1][0]) * m_nBinFac;
    iyy = iy + (vtxoffs[ec1][1]) * m_nBinFac;
    izz = iz + (vtxoffs[ec1][2]) * m_nBinFac;
    qbyte val1 = getByteDen(ixx, iyy, izz);
    getGrdNormByte(ixx, iyy, izz, norm1);

    const float fOffset = getOffset(val0, val1, m_bIsoLev);
      
    const float roffs = (1.0f-fOffset);
    norm[0] = norm0[0]*roffs + norm1[0]*fOffset;
    norm[1] = norm0[1]*roffs + norm1[1]*fOffset;
    norm[2] = norm0[2]*roffs + norm1[2]*fOffset;
    float len = sqrt(norm[0]*norm[0] +
                     norm[1]*norm[1] +
                     norm[2]*norm[2]);
    if (m_dLevel<0.0)
      len *= -1.0f;
    norm[0] /= len;
    norm[1] /= len;
    norm[2] /= len;

    if (ivbo<m_pVBO->getSize()) {
      gfx::DrawElemVNC::Elem &dat = m_pVBO->m_pData[ivbo];
      dat.x = float(i) +
        (a2fVertexOffset[ec0][0] + fOffset*a2fEdgeDirection[iEdge][0]) * m_nBinFac;
      dat.y = float(j) +
        (a2fVertexOffset[ec0][1] + fOffset*a2fEdgeDirection[iEdge][1]) * m_nBinFac;
      dat.z = float(k) +
        (a2fVertexOffset[ec0][2] + fOffset*a2fEdgeDirection[iEdge][2]) * m_nBinFac;
      
      dat.nx = norm[0];
      dat.ny = norm[1];
      dat.nz = norm[2];

      dat.r = m_col_r;
      dat.g = m_col_g;
      dat.b = m_col_b;
      dat.a = m_col_a;
    }

    ++ivbo;
  }

  m_pVBO->setUpdated(true);
  m_bWorkOK = true;
}

//////////////////////////////////////////

/// Rendering using OpenMP/VBO
void MapSurfRenderer::displayGLSL2(DisplayContext *pdc)
{
  if (!m_bChkShaderDone)
    initShader();

  if (m_pPO==NULL) return; // not initialized

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  m_pCMap = pMap;

  if (!m_bWorkOK) {
    // check and setup mol boundary data
    setupMolBndry();
    // generate map-range information
    makerange();
    // Create VBO/Texture
    createGLSL2(pdc);
  }

  if (m_pAttrArray==NULL) {
    MB_DPRINTLN("ERROR: attr array is null");
    return;
  }

  preRender(pdc);

  pdc->pushMatrix();
  setupXformMat(pdc);

  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_BUFFER, m_nMapTexID);
  glTexBufferARB(GL_TEXTURE_BUFFER, GL_R8UI, m_nMapBufID);

  m_pPO->enable();

  pdc->drawElem(*m_pAttrArray);

  m_pPO->disable();

  glBindTexture(GL_TEXTURE_BUFFER, 0);

  pdc->popMatrix();

  postRender(pdc);

  m_pCMap = NULL;
}

bool MapSurfRenderer::initShader()
{
  MB_ASSERT(m_pPO == NULL);

  sysdep::ShaderSetupHelper<MapSurfRenderer> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("GPUMapSurf> ERROR: OpenGL GPU shading not supported.");
    m_bChkShaderDone = true;
    MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    return false;
  }

  m_pPO = ssh.createProgObj("gpu_mapsurf1",
                            "%%CONFDIR%%/data/shaders/mapsurf1_vertex.glsl",
                            "%%CONFDIR%%/data/shaders/mapsurf1_frag.glsl");

  if (m_pPO==NULL) {
    LOG_DPRINTLN("GPUMapSurf> ERROR: cannot create progobj.");
    m_bChkShaderDone = true;
    return false;
  }

  m_pPO->enable();

  // setup constant tables
  int i;
  LString key;

  // vtxoffs
  for (i=0; i<8; ++i) {
    key = LString::format("ivtxoffs[%d]", i);
    m_pPO->setUniform(key, vtxoffs[i][0], vtxoffs[i][1], vtxoffs[i][2]);
  }
  
  // a2fVertexOffset
  for (i=0; i<8; ++i) {
    key = LString::format("fvtxoffs[%d]", i);
    m_pPO->setUniform(key, a2fVertexOffset[i][0], a2fVertexOffset[i][1], a2fVertexOffset[i][2]);
  }

  // a2fEdgeDirection
  for (i=0; i<12; ++i) {
    key = LString::format("fegdir[%d]", i);
    m_pPO->setUniform(key, a2fEdgeDirection[i][0], a2fEdgeDirection[i][1], a2fEdgeDirection[i][2]);
  }

  // a2iEdgeConnection
  for (i=0; i<12; ++i) {
    key = LString::format("iegconn[%d]", i);
    m_pPO->setUniform(key, a2iEdgeConnection[i][0], a2iEdgeConnection[i][1]);
  }

  // a2iTriangleConnectionTable


  m_pPO->disable();

  // setup texture (TBO)
  glGenBuffersARB(1, &m_nMapBufID);
  glGenTextures(1, &m_nMapTexID);
  glActiveTexture(GL_TEXTURE0);
  glEnable(GL_TEXTURE_BUFFER);
  glBindTexture(GL_TEXTURE_BUFFER, m_nMapTexID);
  glBindTexture(GL_TEXTURE_BUFFER, 0);

  m_bChkShaderDone = true;
  return true;
}

void MapSurfRenderer::unloading()
{
  // delete texture
  if (m_nMapBufID!=0) {
    glDeleteTextures(1, &m_nMapTexID);
    glDeleteBuffersARB(1, &m_nMapBufID);
  }
  if (m_pAttrArray!=NULL)
    delete m_pAttrArray;
  
  // ProgramObject is owned by DisplayContext
  // and will be reused other renderes,
  // so m_pPO should not be deleted here.
  m_pPO = NULL;

  super_t::unloading();
}


void MapSurfRenderer::createGLSL2(DisplayContext *pdl)
{
  ScalarObject *pMap = m_pCMap;

  /////////////////////
  // setup workarea

  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;

  int lv = int( floor( (m_dLevel - pMap->getLevelBase()) / pMap->getLevelStep() ) );
  m_bIsoLev = qbyte( qlib::trunc<int>(lv, 0, 255) );

  m_nMapColNo = pMap->getColNo();
  m_nMapRowNo = pMap->getRowNo();
  m_nMapSecNo = pMap->getSecNo();

  /////////////////////
  // do marching cubes

  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

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

    //m_pAttrArray->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    m_pAttrArray->setDrawMode(gfx::AbstDrawElem::DRAW_POINTS);
    m_pAttrArray->alloc(nsz_est_tot);
  }

  MB_DPRINTLN("voxels %d", ncol*nrow*nsec);
  MB_DPRINTLN("estimated vertex size %d", nsz_est_tot);
  
  for (i=0; i<nsz_est_tot; ++i) {
    m_pAttrArray->at(i) = {0.0f, 0.0f, 0.0f};
  }

  quint32 cc = getColor()->getCode();
  m_col_r = gfx::getRCode(cc);
  m_col_g = gfx::getGCode(cc);
  m_col_b = gfx::getBCode(cc);
  m_col_a = gfx::getACode(cc);

  m_nbcol = m_nStCol - pMap->getStartCol();
  m_nbrow = m_nStRow - pMap->getStartRow();
  m_nbsec = m_nStSec - pMap->getStartSec();

  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;
  int ix, iy, iz;
  int ixx, iyy, izz;

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
          if (ix+1>=m_nMapColNo||
              iy+1>=m_nMapRowNo||
              iz+1>=m_nMapSecNo)
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
          if(values[iVertexTest] <= m_bIsoLev) 
            iFlagIndex |= 1<<iVertexTest;
        }

        // Find which edges are intersected by the surface
        iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

        if(iEdgeFlags == 0)
          continue;

        for (iCorner = 0; iCorner < 3*MAXTRIG; iCorner++) {
#ifdef USE_TCTAB
          if (vxind<voxdat.size()) {
            voxdat[vxind].ind = i + (j + k*nrow)*ncol;
            voxdat[vxind].flag = quint16(iFlagIndex);
            voxdat[vxind].ivert = quint16(iCorner);
          }
#else
          iEdge = a2iTriangleConnectionTable[iFlagIndex][iCorner];
          if (iEdge<0)
            break;

          if (vxind<m_pAttrArray->getSize()) {
            m_pAttrArray->at(vxind).ind = i + (j + k*nrow)*ncol;
            m_pAttrArray->at(vxind).flag = iFlagIndex;
            m_pAttrArray->at(vxind).ivert = iEdge;
          }
#endif
          ++vxind;
        }
      }
    }
  }

  m_pAttrArray->setUpdated(true);

  ///////////////////////
  // Create texture (TBO)

  bool bReuse;
  if (m_maptmp.cols()!=ncol ||
      m_maptmp.rows()!=nrow ||
      m_maptmp.secs()!=nsec) {
    m_maptmp.resize(ncol, nrow, nsec);
    bReuse = false;
  }
  else {
    MB_DPRINTLN("reuse texture");
    bReuse = true;
  }
  
  for (k=0; k<nsec; k++)
    for (j=0; j<nrow; j++)
      for (i=0; i<ncol; i++){
        ix = i + m_nbcol;
        iy = j + m_nbrow;
        iz = k + m_nbsec;
        m_maptmp.at(i,j,k) = getByteDen(ix, iy, iz);
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

  glBindBufferARB(GL_TEXTURE_BUFFER, 0);

  glActiveTexture(GL_TEXTURE0);
  // glEnable(MY_MAPTEX_DIM);
  glBindTexture(GL_TEXTURE_BUFFER, m_nMapTexID);

  glTexBufferARB(GL_TEXTURE_BUFFER, GL_R8UI, m_nMapBufID);
  CHK_GLERROR("glTexBufferARB");

  ////////////////////////
  /// Setup uniform values

  m_pPO->enable();
  m_pPO->setUniform("u_maptex", 0);

  m_pPO->setUniform("u_isolevel", m_bIsoLev);
  CHK_GLERROR("setUniform isolevel");

  m_pPO->setUniform("u_ncol", ncol);
  CHK_GLERROR("setUniform ncol");

  m_pPO->setUniform("u_nrow", nrow);
  CHK_GLERROR("setUniform nrow");

  m_pPO->disable();

  m_bWorkOK = true;
}

