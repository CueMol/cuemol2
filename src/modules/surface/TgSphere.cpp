// -*-Mode: C++;-*-
//
//  Build a triangulated sphere
//
// $Id: TgSphere.cpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#include <common.h>
#include "surface.hpp"

#ifdef SURF_BUILDER_TEST

#include "TgSphere.hpp"
#include "MolSurfBuilder.hpp"
#include <gfx/DisplayContext.hpp>

using namespace surface;


void TgSphere::buildVerteces(bool bdir /*=true*/ )
{
  m_verts.erase(m_verts.begin(), m_verts.end());
  m_faces.erase(m_faces.begin(), m_faces.end());

  m_bdir = bdir;
  int i, j;
  int nLng, nLat = (int) ::ceil(m_rad*M_PI/m_dmax);
  MB_DPRINTLN("sphere R=%f, nLat=%d (%f)", m_rad, nLat, m_rad*M_PI/m_dmax);

  int **ppindx = MB_NEW int *[nLat+1];

  // generate verteces
  for (i=0; i<=nLat; ++i) {
    int ind;
    std::list<int> ilst;

    if (i==0) {
      ind = putVert(Vector4D(0, 0, m_rad));
      //ind = putVert(m_rad, 0, 0);

      ppindx[i] = MB_NEW int[1];
      ppindx[i][0] = ind;
    }
    else if (i==nLat) {
      ind = putVert(Vector4D(0, 0, -m_rad));
      //ind = putVert(-m_rad, 0, 0);
      ilst.push_back(ind);

      ppindx[i] = MB_NEW int[1];
      ppindx[i][0] = ind;
    }
    else {
      Vector4D vec;
      const double th = double(i)*M_PI/double(nLat);
      const double ri = m_rad*::sin(th);
      vec.z()  = m_rad*::cos(th);
      nLng = (int) ::ceil(ri*M_PI*2.0/m_dmax);
      ppindx[i] = MB_NEW int[nLng+2];
      ppindx[i][0] = nLng;
      const double start_phi = double(i%2) * 3.0 / nLng;
      //MB_DPRINTLN("Lat: %d start phi=%f", i, start_phi);
      for (j=0; j<nLng; ++j) {
        double ph = double(j)*M_PI*2.0/double(nLng) + start_phi;
        vec.x() = ri*::cos(ph);
        vec.y() = ri*::sin(ph);
        ind = putVert(vec);
        //ind = putVert(z, x, y);
        ppindx[i][j+1] = ind;
      }
      ppindx[i][j+1] = ppindx[i][1];
    }
  } // for (i)

  // build faces from verteces
  for (i=0; i<nLat; ++i) {
    if (i==0) {
      int ipiv = ppindx[0][0];
      int nLng = ppindx[1][0];
      for (j=0; j<nLng; ++j) {
        putFace(ipiv, ppindx[1][j+1], ppindx[1][j+2]);
      }
      //putFace(ipiv, ppindx[1][(nLng-1)+1], ppindx[1][1]);
    }
    else if (i==nLat-1) {
      int ipiv = ppindx[nLat][0];
      int nLng = ppindx[nLat-1][0];
      for (j=0; j<nLng; ++j) {
        putFace(ppindx[nLat-1][j+2], ppindx[nLat-1][j+1], ipiv);
      }
      //putFace(ppindx[nLat-1][(nLng-1)+1], ppindx[nLat-1][1], ipiv);
    }
    else /*if (i==2)*/ {

      int j = 0, k = 0;
      int bJ;

      int jmax = ppindx[i][0];
      int *piJ = &(ppindx[i][1]);

      int kmax = ppindx[i+1][0];
      int *piK = &(ppindx[i+1][1]);

//      double am1, am2;
      while (j+1<=jmax || k+1<=kmax) {
        if (j+1>jmax) bJ = 0;
        else if (k+1>kmax) bJ = 1;
        else bJ = selectTrig(piJ[j], piK[k], piJ[j+1], piK[k+1]);

        if (bJ==1) {
          putFace(piJ[j], piK[k], piJ[j+1]);
          ++j;
        }
        else /*if (bJ==0)*/ {
          putFace(piJ[j], piK[k], piK[k+1]);
          ++k;
        }
      } // while

    }
  } // for (i)

  for (i=0; i<=nLat; ++i)
    delete [] ppindx[i];
  delete [] ppindx;
}

int TgSphere::selectTrig(int j, int k, int j1, int k1)
{
  const Vector4D &vj = m_verts[j].v3d();
  const Vector4D &vk = m_verts[k].v3d();
  const Vector4D &vj1 = m_verts[j1].v3d();
  const Vector4D &vk1 = m_verts[k1].v3d();

  Vector4D nj1 = MolSurfBuilder::makenorm(vj, vk, vj1);
  Vector4D nk1 = MolSurfBuilder::makenorm(vj, vk, vk1);
  
  double detj = nj1.dot(vk1-vk);
  double detk = nk1.dot(vj1-vj);

  if (detj<0 && detk>=0)
    return 1; // select j1

  if (detj>=0 && detk<0)
    return 0; // select k1

  MB_DPRINTLN("SelectTrig warning; (%d,%d,%d,%d) detj=%f, detk=%f", j, k, j1, k1, detj, detk);
  return 2;
  /*
  double am1 = angmax(m_verts[j].v3d(), m_verts[k].v3d(), m_verts[j1].v3d());
  double am2 = angmax(m_verts[j].v3d(), m_verts[k].v3d(), m_verts[k1].v3d());
  return (am1<am2);
   */
}

void TgSphere::checkConvexHull()
{
  int i, j;
  for (i=0; i<m_faces.size(); ++i) {
    const MSFace &tgl = m_faces[i];

    Vector4D norm;
    if (m_bdir)
      norm = MolSurfBuilder::makenorm(m_verts[tgl.id2].v3d(),
                                      m_verts[tgl.id1].v3d(),
                                      m_verts[tgl.id3].v3d());
    else
      norm = MolSurfBuilder::makenorm(m_verts[tgl.id1].v3d(),
                                      m_verts[tgl.id2].v3d(),
                                      m_verts[tgl.id3].v3d());
    
    Vector4D cen = m_verts[tgl.id1].v3d();

    for (j=0; j<m_verts.size(); ++j) {
      const MSVert &vert = m_verts[j];
      if (j==tgl.id1 || j==tgl.id2 || j==tgl.id3) continue;

      Vector4D x = vert.v3d();
      double det = norm.dot(x-cen);
      if (det<=0.0) {
        MB_DPRINTLN("XXX face (%d,%d,%d) is not hull for %d", tgl.id1, tgl.id2, tgl.id3, j);
        if (m_pdl!=NULL) {
          m_pdl->setLighting(false);
          m_pdl->startLineStrip();
          m_pdl->color(1,0,0);
          m_pdl->vertex(m_verts[tgl.id1].v3d());
          m_pdl->vertex(m_verts[tgl.id2].v3d());
          m_pdl->vertex(m_verts[tgl.id3].v3d());
          m_pdl->end();
          m_pdl->setLighting(true);
        }
      }
    }
  }
}

/////////////////////////////////////////////////////////////////////

void TgSphere::drawSphere(DisplayContext *pdl, bool bdir /*=true*/ )
{
  double f = bdir?1.0:-1.0;
  std::deque<MSFace>::const_iterator fiter = m_faces.begin();
  for (; fiter!=m_faces.end(); ++fiter) {
    const MSFace &tgl = *fiter;

    /*if (!m_flags[tgl.iv1] ||
        !m_flags[tgl.iv2] ||
        !m_flags[tgl.iv3]) continue;*/

    pdl->normal(m_verts[tgl.id1].n3d());
    pdl->vertex(m_verts[tgl.id1].v3d());

    pdl->normal(m_verts[tgl.id2].n3d());
    pdl->vertex(m_verts[tgl.id2].v3d());

    pdl->normal(m_verts[tgl.id3].n3d());
    pdl->vertex(m_verts[tgl.id3].v3d());
  }
}

#define X 0.525731112119133606f
#define Z 0.850650808352039932f

void TgSphere::buildVertIco(bool bdir)
{
  m_verts.erase(m_verts.begin(), m_verts.end());
  m_faces.erase(m_faces.begin(), m_faces.end());

  m_bdir = bdir;

  int i;
  const int ndep = 4;

  static float vdata[12][3] = {
    {-X, 0.0, Z}, {X, 0.0, Z}, {-X, 0.0, -Z}, {X, 0.0, -Z},
    {0.0, Z, X}, {0.0, Z, -X}, {0.0, -Z, X}, {0.0, -Z, -X},
    {Z, X, 0.0}, {-Z, X, 0.0}, {Z, -X, 0.0}, {-Z, -X, 0.0}
  };

  static int tindices[20][3] = {
    {0,4,1}, {0,9,4}, {9,5,4}, {4,5,8}, {4,8,1},
    {8,10,1}, {8,3,10},{5,3,8}, {5,2,3}, {2,7,3},
    {7,10,3}, {7,6,10}, {7,11,6}, {11,0,6}, {0,1,6},
    {6,1,10}, {9,0,11}, {9,11,2}, {9,2,5}, {7,2,11}
  };

  for (i=0; i<12; ++i) {
    Vector4D vert(vdata[i][0], vdata[i][1], vdata[i][2]);
    int id = putVert(vert.scale(m_rad));
    MB_ASSERT(id==i);
  }
  
  Vector4D v1, v2, v3;
//  Matrix4D xfmat(atom.pos);
//  xfmat.a11 = xfmat.a22 = xfmat.a33 = atom.rad;

  // m_pdl->pushMatrix();
  // m_pdl->multMatrix(xfmat);

  // m_pdl->startTriangles();
  // m_pdl->color_3f(0.5, 0.1, 0.4);
  for (i=0; i<20; ++i) {
    const int iv1 = tindices[i][0];
    const int iv2 = tindices[i][2];
    const int iv3 = tindices[i][1];
    //v1 = Vector4D(vdata[iv1][0], vdata[iv1][1], vdata[iv1][2]);
    //v2 = Vector4D(vdata[iv2][0], vdata[iv2][1], vdata[iv2][2]);
    //v3 = Vector4D(vdata[iv3][0], vdata[iv3][1], vdata[iv3][2]);
    icoSphSubdiv(iv1, iv2, iv3, ndep);
  }

  // m_pdl->end();
  // m_pdl->popMatrix();
}

void TgSphere::icoSphSubdiv(int iv1, int iv2, int iv3,
                               int depth)
{
  Vector4D v1 = m_verts[iv1].v3d();
  Vector4D v2 = m_verts[iv2].v3d();
  Vector4D v3 = m_verts[iv3].v3d();

  Vector4D v12, v23, v31;
  int i;

  if (depth<=0) {
    //drawTriangle(v1, v2, v3);
    putFace(iv1, iv2, iv3);
    return;
  }
  
  v12 = (v1+v2).normalize().scale(m_rad);
  int iv12 = putVert(v12);

  v23 = (v2+v3).normalize().scale(m_rad);
  int iv23 = putVert(v23);

  v31 = (v3+v1).normalize().scale(m_rad);
  int iv31 = putVert(v31);

  icoSphSubdiv(iv1, iv12, iv31, depth-1);
  icoSphSubdiv(iv2, iv23, iv12, depth-1);
  icoSphSubdiv(iv3, iv31, iv23, depth-1);
  icoSphSubdiv(iv12, iv23, iv31, depth-1);
}


/*
void TgSphere::drawTriangle(const Vector4D &v1,
                               const Vector4D &v2,
                               const Vector4D &v3)
{
  m_pdl->normal(v1);
  m_pdl->vertex(v1);
  m_pdl->normal(v2);
  m_pdl->vertex(v2);
  m_pdl->normal(v3);
  m_pdl->vertex(v3);
}
*/

#endif // SURF_BUILDER_TEST

