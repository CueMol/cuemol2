// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

#include "MapSurfRenderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>

#ifdef _OPENMP
#  include <omp.h>
#endif

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;

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

  int nthr = 1;
#ifdef _OPENMP
  if (m_nOmpThr>0)
    omp_set_num_threads(m_nOmpThr);
  else
    omp_set_num_threads(omp_get_num_procs());
  nthr = omp_get_max_threads();
#endif

  std::vector<int> vinds(nthr);

  int nsz_est_thr = ncol*nrow*nsec*3/nthr;
  int nsz_est_tot = nsz_est_thr * nthr;
  
  if (m_pVBO!=NULL && m_pVBO->getSize()!=nsz_est_tot) {
    delete m_pVBO;
    m_pVBO=NULL;
  }

  if (m_pVBO==NULL) {
    m_pVBO = MB_NEW gfx::DrawElemVNC();
    m_pVBO->setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    m_pVBO->alloc(nsz_est_tot);
  }

  MB_DPRINTLN("nthr=%d", nthr);
  MB_DPRINTLN("voxels %d", ncol*nrow*nsec);
  MB_DPRINTLN("estim size %d", nsz_est_tot);
  MB_DPRINTLN("estim size per thr%d", nsz_est_thr);
  
  for (i=0; i<nsz_est_tot; ++i) {
    m_pVBO->m_pData[i] = {0.0f, 0.0f, 0.0f,0.0f, 0.0f, 0.0f,0,0,0,0};
  }
  std::vector<int> iverts(nthr);
  for (i=0; i<nthr; ++i) {
    iverts[i] = i*nsz_est_thr;
  }

  quint32 cc = getColor()->getCode();
  m_col_r = gfx::getRCode(cc);
  m_col_g = gfx::getGCode(cc);
  m_col_b = gfx::getBCode(cc);
  m_col_a = gfx::getACode(cc);


  m_nbcol = m_nStCol - pMap->getStartCol();
  m_nbrow = m_nStRow - pMap->getStartRow();
  m_nbsec = m_nStSec - pMap->getStartSec();

#pragma omp parallel for private (j,k) schedule(dynamic)
  for (i=0; i<ncol; i+=m_nBinFac) {
    int ithr = 0;
#ifdef _OPENMP
    ithr = omp_get_thread_num();
#endif

    for (j=0; j<nrow; j+=m_nBinFac) {
      for (k=0; k<nsec; k+=m_nBinFac) {

        //if (i==1&&j==1)
        //MB_DPRINTLN("i=%d, thr=%d", k, ithr);

        qbyte values[8];
        bool bary[8];

        //if (i==1&&j==1)
        //MB_DPRINTLN("i=%d, thr=%d", k, omp_get_thread_num());

        int ix = i + m_nbcol;
        int iy = j + m_nbrow;
        int iz = k + m_nbsec;
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
          const int ixx = ix + (vtxoffs[ii][0]) * m_nBinFac;
          const int iyy = iy + (vtxoffs[ii][1]) * m_nBinFac;
          const int izz = iz + (vtxoffs[ii][2]) * m_nBinFac;
          values[ii] = getByteDen(ixx, iyy, izz);
          
          // check mol boundary
          bary[ii] = inMolBndry(pMap, ixx, iyy, izz);
          if (bary[ii])
            bin = true;
        }

        if (!bin)
          continue;

        marchCube2(i, j, k, values, bary, &iverts[ithr]);
      }
    }
  }

  m_pVBO->setUpdated(true);
  m_bWorkOK = true;
}

