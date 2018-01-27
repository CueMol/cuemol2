// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

#include "MapSurfRenderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/Mesh.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

#ifdef _OPENMP
#  include <omp.h>
#endif

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;
using molstr::AtomIterator;

/// Rendering using OpenMP/VBO
void MapSurfRenderer::display(DisplayContext *pdc)
{
  if (!m_bUseOpenMP) {
    super_t::display(pdc);
    return;
  }

  /// Rendering using OpenMP

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  m_pCMap = pMap;

  if (m_verts.empty()) {
    // check and setup mol boundary data
    setupMolBndry();
    // generate map-range information
    makerange();

    renderImpl2(pdc);
  }
  
  preRender(pdc);

  pdc->pushMatrix();

  const Matrix4D &xfm = pMap->getXformMatrix();
  if (!xfm.isIdent()) {
    pdc->multMatrix(xfm);
  }

  //  setup frac-->orth matrix
  if (pXtal==NULL) {
    pdc->translate(pMap->getOrigin());
  }
  else {
    Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
    pdc->multMatrix(Matrix4D(orthmat));
  }

#ifdef DBG_DRAW_AXIS
  pdc->startLines();
  // pdc->color(1,1,0);
  pdc->vertex(0,0,0);
  pdc->vertex(1,0,0);
  pdc->vertex(0,0,0);
  pdc->vertex(0,1,0);
  pdc->vertex(0,0,0);
  pdc->vertex(0,0,1);
  pdc->end();
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

    pdc->scale(vtmp);

    vtmp = Vector4D(m_nStCol, m_nStRow, m_nStSec);
    pdc->translate(vtmp);
  }

  const int nthr = m_verts.size();
  int i;
  for (i=0; i<nthr; ++i) {
    pdc->drawElem(m_verts[i]);
  }

  pdc->popMatrix();

  postRender(pdc);

  m_pCMap = NULL;
}

void MapSurfRenderer::invalidateDisplayCache()
{
  m_verts.clear();
  super_t::invalidateDisplayCache();
}

void MapSurfRenderer::renderImpl2(DisplayContext *pdl)
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
  nthr = omp_get_max_threads();
#endif

  m_verts.resize(nthr);
  std::vector<int> vinds(nthr);

  int nsize_estim = ncol*nrow*nsec*3/nthr;
  //LOG_DPRINTLN("voxels %d", ncol*nrow*nsec);
  //LOG_DPRINTLN("estim size %d", nsize_estim);
  for (i=0; i<nthr; ++i) {
    //verts[i].reserve(nsize_estim);
    m_verts[i].setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    m_verts[i].alloc(nsize_estim);
    vinds[i] = 0;
  }

  //LOG_DPRINTLN("nthr=%d", nthr);

  m_nbcol = m_nStCol - pMap->getStartCol();
  m_nbrow = m_nStRow - pMap->getStartRow();
  m_nbsec = m_nStSec - pMap->getStartSec();

#pragma omp parallel for private (j,k) schedule(dynamic)
  for (i=0; i<ncol; i+=m_nBinFac)
    for (j=0; j<nrow; j+=m_nBinFac)
      for (k=0; k<nsec; k+=m_nBinFac) {
        int ithr = 1;
#ifdef _OPENMP
        ithr = omp_get_thread_num();
#endif

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

        //marchCube2(i, j, k, values, bary, verts[ithr]);
        marchCube2(i, j, k, values, bary, &m_verts[ithr], &vinds[ithr]);
      }

  //pdl->startTriangles();
  for (i=0; i<nthr; ++i) {
    //LOG_DPRINTLN("Triangles: %d for thr %d", verts[i].size(), i);
    /*BOOST_FOREACH (surface::MSVert &v, verts[i]) {
      pdl->normal(v.n3d());
      pdl->vertex(v.v3d());
    }*/

    MB_DPRINTLN("Triangles: %d for thr %d", vinds[i], i);
    m_verts[i].setSize(vinds[i]);
    //pdl->drawElem(verts[i]);
  }
  //pdl->end();
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

void MapSurfRenderer::marchCube2(int fx, int fy, int fz,
                                 const qbyte *values,
                                 const bool *bary,
                                 gfx::DrawElemVNC *pverts,
                                 int *pvind)
                                 //MSVertList &verts)
{
  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;

  //Vector4D asEdgeVertex[12];
  float asEdgeVertex[12][3];

  //Vector4D asEdgeNorm[12];
  float asEdgeNorm[12][3];

  bool edgeBinFlags[12];

  //Vector4D norms[8];
  float norms[8][4];

  // Find which vertices are inside of the surface and which are outside
  iFlagIndex = 0;
  for(iVertexTest = 0; iVertexTest < 8; iVertexTest++) {
    if(values[iVertexTest] <= m_bIsoLev) 
      iFlagIndex |= 1<<iVertexTest;
  }

  // Find which edges are intersected by the surface
  iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

  //If the cube is entirely inside or outside of the surface, then there will be no intersections
  if(iEdgeFlags == 0) {
    return;
  }

  for (int ii=0; ii<8; ii++) {
    //norms[ii].w() = -1.0;
    norms[ii][3] = -1.0f;
  }

  ScalarObject *pMap = m_pCMap;
  const int ix = fx + m_nbcol;
  const int iy = fy + m_nbrow;
  const int iz = fz + m_nbsec;

  // Find the point of intersection of the surface with each edge
  // Then find the normal to the surface at those points
  for(iEdge = 0; iEdge < 12; iEdge++) {
    //if there is an intersection on this edge
    if(iEdgeFlags & (1<<iEdge)) {
      const int ec0 = a2iEdgeConnection[iEdge][0];
      const int ec1 = a2iEdgeConnection[iEdge][1];
      if (m_bary[ec0]==false || m_bary[ec1]==false) {
        edgeBinFlags[iEdge] = false;
        continue;
      }
      edgeBinFlags[iEdge] = true;
      
      const float fOffset = getOffset(values[ ec0 ], 
                                      values[ ec1 ], m_bIsoLev);
      
      asEdgeVertex[iEdge][0] =
        float(fx) +
          (a2fVertexOffset[ec0][0] + fOffset*a2fEdgeDirection[iEdge][0]) * m_nBinFac;
      asEdgeVertex[iEdge][1] =
        float(fy) +
          (a2fVertexOffset[ec0][1] + fOffset*a2fEdgeDirection[iEdge][1]) * m_nBinFac;
      asEdgeVertex[iEdge][2] =
        float(fz) +
          (a2fVertexOffset[ec0][2] + fOffset*a2fEdgeDirection[iEdge][2]) * m_nBinFac;
      //asEdgeVertex[iEdge].w() = 0;
      
      //Vector4D nv0,nv1;
      if (norms[ec0][3]<0.0) {
        const int ixx = ix + (vtxoffs[ec0][0]) * m_nBinFac;
        const int iyy = iy + (vtxoffs[ec0][1]) * m_nBinFac;
        const int izz = iz + (vtxoffs[ec0][2]) * m_nBinFac;
        getGrdNormByte(ixx, iyy, izz, &norms[ec0][0]);
      }
      if (norms[ec1][3]<0.0) {
        const int ixx = ix + (vtxoffs[ec1][0]) * m_nBinFac;
        const int iyy = iy + (vtxoffs[ec1][1]) * m_nBinFac;
        const int izz = iz + (vtxoffs[ec1][2]) * m_nBinFac;
        getGrdNormByte(ixx, iyy, izz, &norms[ec1][0]);
      }

      const float roffs = (1.0f-fOffset);
      asEdgeNorm[iEdge][0] = norms[ec0][0]*roffs + norms[ec1][0]*fOffset;
      asEdgeNorm[iEdge][1] = norms[ec0][1]*roffs + norms[ec1][1]*fOffset;
      asEdgeNorm[iEdge][2] = norms[ec0][2]*roffs + norms[ec1][2]*fOffset;
      float len = sqrt(asEdgeNorm[iEdge][0]*asEdgeNorm[iEdge][0] +
                       asEdgeNorm[iEdge][1]*asEdgeNorm[iEdge][1] +
                       asEdgeNorm[iEdge][2]*asEdgeNorm[iEdge][2]);
      if (m_dLevel<0.0)
        len *= -1.0f;
      asEdgeNorm[iEdge][0] /= len;
      asEdgeNorm[iEdge][1] /= len;
      asEdgeNorm[iEdge][2] /= len;
    }
  }

  const int nverts = pverts->getSize();
  int i;

  // Draw the triangles that were found.  There can be up to five per cube
  for(iTriangle = 0; iTriangle < 5; iTriangle++) {
    if(a2iTriangleConnectionTable[iFlagIndex][3*iTriangle] < 0)
      break;
    
    bool bNotDraw = false;
    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      if (!edgeBinFlags[iVertex]) {
        bNotDraw = true;
        break;
      }
    }
    if (bNotDraw)
      continue;

    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      //verts.push_back( surface::MSVert(asEdgeVertex[iVertex],
      //asEdgeNorm[iVertex]) );

      i = *pvind;
      if (i<nverts) {
        pverts->m_pData[i].x = asEdgeVertex[iVertex][0];
        pverts->m_pData[i].y = asEdgeVertex[iVertex][1];
        pverts->m_pData[i].z = asEdgeVertex[iVertex][2];
        
        pverts->m_pData[i].nx = asEdgeNorm[iVertex][0];
        pverts->m_pData[i].ny = asEdgeNorm[iVertex][1];
        pverts->m_pData[i].nz = asEdgeNorm[iVertex][2];

        pverts->m_pData[i].r = 255;
        pverts->m_pData[i].g = 255;
        pverts->m_pData[i].b = 255;
        pverts->m_pData[i].a = 255;
      }
      (*pvind)++;
    } // for(iCorner = 0; iCorner < 3; iCorner++)

  } // for(iTriangle = 0; iTriangle < 5; iTriangle++)

  return;
}

#if 0
///////////////////////////////////////////////////////////

static const char ebuftab[12][4] =
{
  // 0: 0-1 ? (0,0,0)-(1,0,0) (ix, iy, iz) X entry [0]
  {0, 0, 0, 0},
  // 1: 1-2 = (1,0,0)-(1,1,0) (ix+1, iy, iz) Y entry [1]
  {1, 0, 0, 1},
  // 2: 2-3 = (1,1,0)-(0,1,0) (ix, iy+1, iz) X entry [0]
  {0, 1, 0, 0},
  // 3: 3-0 = (0,1,0)-(0,0,0) (ix, iy, iz) Y entry [1]
  {0, 0, 0, 1},

  //4: 4-5 = (0,0,1)-(1,0,1) (ix, iy, iz+1) X entry [0]
  {0, 0, 1, 0},
  //5: 5-6 = (1,0,1)-(1,1,1) (ix+1, iy, iz+1) Y entry [1]
  {1, 0, 1, 1},
  //6: 6-7 = (1,1,1)-(0,1,1) (ix, iy+1, iz+1) X entry [0]
  {0, 1, 1, 0},
  //7: 7-4 = (0,1,1)-(0,0,1) (ix, iy, iz+1) Y entry[1]
  {0, 0, 1, 1},

  //8: 0-4 = (0,0,0)-(0,0,1) (ix, iy, iz) Z entry [2]
  {0, 0, 0, 2},
  //9: 1-5 = (1,0,0)-(1,0,1) (ix+1, iy, iz) Z entry [2]
  {1, 0, 0, 2},
  //10: 2-6 = (1,1,0)-(1,1,1) (ix+1, iy+1, iz) Z entry [2]
  {1, 1, 0, 2},
  //11: 3-7 = (0,1,0)-(0,1,1) (ix, iy+1, iz) Z entry [2]
  {0, 1, 0, 2},
};

void MapSurfRenderer::renderImpl2(DisplayContext *pdl)
{
  ScalarObject *pMap = m_pCMap;

  /////////////////////
  // setup workarea

  //m_dLevel = getLevel()*pMap->getRmsdDensity();
  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;
  m_nMapColNo = pMap->getColNo();
  m_nMapRowNo = pMap->getRowNo();
  m_nMapSecNo = pMap->getSecNo();

  /////////////////////
  // do marching cubes

  int ncol = m_nActCol;
  int nrow = m_nActRow;
  int nsec = m_nActSec;

  int nthr = omp_get_max_threads();
  typedef std::deque<surface::MSVert> MSVertList;
  std::vector<MSVertList> verts(nthr);

  Vector4D vert, norm;
  int i,j,k, ii, jj;
  int flag_ind, edge_flag;
  int iface[3];

  for (k=0; k<nsec; k++)
    for (j=0; j<nrow; j++) {
      for (i=0; i<ncol; i++) {
        if (k==1&&j==1)
          MB_DPRINTLN("i=%d, thr=%d", i, omp_get_thread_num());
        int ix = i+m_nStCol - pMap->getStartCol();
        int iy = j+m_nStRow - pMap->getStartRow();
        int iz = k+m_nStSec - pMap->getStartSec();
        if (!m_bPBC) {
          if (ix<0||iy<0||iz<0)
            continue;
          if (ix+1>=m_nMapColNo||
              iy+1>=m_nMapRowNo||
              iz+1>=m_nMapSecNo)
            continue;
        }

        // Calc flag index
        // TO DO: reuse result
        for (ii=0; ii<8; ii++) {
          const int ixx = ix + (vtxoffs[ii][0]) * m_nBinFac;
          const int iyy = iy + (vtxoffs[ii][1]) * m_nBinFac;
          const int izz = iz + (vtxoffs[ii][2]) * m_nBinFac;
          values[ii] = getDen(ixx, iyy, izz);
          norms[ii].w() = -1.0;

	  /*
          // check mol boundary
          m_bary[ii] = inMolBndry(pMap, ixx, iyy, izz);
          if (m_bary[ii])
            bin = true;
	  */
        }
        
        // Find which vertices are inside of the surface and which are outside
        flag_ind = 0;
        for (ii=0; ii<8; ii++) {
          if(values[ii] <= m_dLevel) 
            flag_ind |= 1<<ii;
        }

        // Find which edges are intersected by the surface
        edge_flag = aiCubeEdgeFlags[flag_ind];

        //If the cube is entirely inside or outside of the surface,
	//   then there will be no intersections
        if(edge_flag == 0) {
          continue;
        }

        for(ii = 0; ii<12; ii++) {
          if(edge_flag & (1<<ii)) {
	    const int dix = ebuftab[ii][0];
	    const int diy = ebuftab[ii][1];
	    const int diz = ebuftab[ii][2];
	    const int ent = ebuftab[ii][3];

	    int edge_id = edgebuf.at(i+dix, j+diy, k+diz).id[ent];
	    if (edge_id<0) {
	      const int ec0 = a2iEdgeConnection[ii][0];
	      const int ec1 = a2iEdgeConnection[ii][1];
	      const double fOffset = getOffset(values[ ec0 ], 
                                               values[ ec1 ], m_dLevel);
              ////

	      vert.x() =
		double(i) +
                (a2fVertexOffset[ec0][0] + fOffset*a2fEdgeDirection[ii][0]) * m_nBinFac;
	      vert.y() =
		double(j) +
                (a2fVertexOffset[ec0][1] + fOffset*a2fEdgeDirection[ii][1]) * m_nBinFac;
	      vert.z() =
		double(k) +
                (a2fVertexOffset[ec0][2] + fOffset*a2fEdgeDirection[ii][2]) * m_nBinFac;

              ////

              Vector4D nv0,nv1;
              if (m_norms[ ec0 ].w()<0.0) {
                const int ixx = ix + (vtxoffs[ec0][0]) * m_nBinFac;
                const int iyy = iy + (vtxoffs[ec0][1]) * m_nBinFac;
                const int izz = iz + (vtxoffs[ec0][2]) * m_nBinFac;
                nv0 = m_norms[ec0] = getGrdNorm2(ixx, iyy, izz);
              }
              else {
                nv0 = m_norms[ec0];
              }
              if (m_norms[ ec1 ].w()<0.0) {
                const int ixx = ix + (vtxoffs[ec1][0]) * m_nBinFac;
                const int iyy = iy + (vtxoffs[ec1][1]) * m_nBinFac;
                const int izz = iz + (vtxoffs[ec1][2]) * m_nBinFac;
                nv1 = m_norms[ec1] = getGrdNorm2(ixx, iyy, izz);
              }
              else {
                nv1 = m_norms[ec1];
              }
              norm = (nv0.scale(1.0-fOffset) + nv1.scale(fOffset)).normalize();

              ////

	      edge_id = addMSVert(vert, norm);
	      edgebuf.at(i+dix, j+diy, k+diz).id[ent] = edge_id;
	    }
	  }
        }
        
	// Draw the triangles that were found.  There can be up to five per cube
	for(ii = 0; ii < 5; ii++) {
	  if(a2iTriangleConnectionTable[flag_ind][3*ii] < 0)
	    break;
	  for (jj=0; jj<3; ++jj) {
	    int ie = a2iTriangleConnectionTable[flag_ind][3*ii+jj];
	    const int dix = ebuftab[ie][0];
	    const int diy = ebuftab[ie][1];
	    const int diz = ebuftab[ie][2];
	    const int ent = ebuftab[ie][3];
            iface[jj] = edgebuf.at(i+dix, j+diy, k+diz).id[ent];
            MB_ASSERT(iface[jj]>=0);
	  }

	  faces.push_back( surface::MSFace(iface[0], iface[1], iface[2]) );
	} // for(ii = 0; ii < 5; ii++) {
	
        /*
        pdl->startLines();
        pdl->vertex(i,j,k);
        pdl->vertex(i+1,j,k);
        pdl->vertex(i,j,k);
        pdl->vertex(i,j+1,k);
        pdl->vertex(i,j,k);
        pdl->vertex(i,j,k+1);
        pdl->end();
         */
      }
    }
  
  gfx::Mesh mesh;
  int nv = m_msverts.size();
  int nf = faces.size();
  mesh.init(nv, nf);
  mesh.color(getColor());
  
  i=0;
  BOOST_FOREACH (const surface::MSVert &elem, m_msverts) {
    mesh.setVertex(i, elem.x, elem.y, elem.z, elem.nx, elem.ny, elem.nz);
    ++i;
  }  

  i=0;
  BOOST_FOREACH (const surface::MSFace &elem, faces) {
    mesh.setFace(i, elem.id1, elem.id2, elem.id3);
    ++i;
  }

  pdl->drawMesh(mesh);
}

#endif


