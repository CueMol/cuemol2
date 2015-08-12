// -*-Mode: C++;-*-
//
//  Sphere set object
//

#include <common.h>

#include "SphereSet.hpp"

using namespace gfx;

SphereSet::SphereSet()
{
}

SphereSet::~SphereSet()
{
}

void SphereSet::create(int nsize)
{
  m_data.resize(nsize);
}

void SphereSet::sphere(int i, const Vector4D &pos, double r, const ColorPtr &col)
{
  m_data[i].posr = pos;
  m_data[i].posr.w() = r;
  m_data[i].ccode = col->getCode();
}

void SphereSet::buildDrawElem(int nDet)
{
  m_nDetail = nDet;
}

// convert single sphere to mesh data
void RendIntData::convSphere(int ind)
{
  ElemType *pSph = &m_data[ind];
  const Vector4D v1 = pSph->posr;
  const double rad = v1.w();
  // ColIndex col = pSph->col;
  const double dmax = (M_PI*rad)/double(m_nDetail+1);

  const int ivstart = m_mesh.getVertexSize();

  int i, j;
  int nLat = m_nDetail+1;

  // detail in longitude direction is automatically determined by stack radius
  int nLng;

  MB_DPRINTLN("RendIntData::convSphere v1=(%f,%f,%f) r=%f",
              pSph->v1.x(), pSph->v1.y(), pSph->v1.z(), pSph->r);
  MB_DPRINTLN("sphere R=%f, nLat=%d (%f)", rad, nLat, rad*M_PI/dmax);

  int **ppindx = new int *[nLat+1];

  // generate verteces
  for (i=0; i<=nLat; ++i) {
    int ind;
    //std::list<int> ilst;

    if (i==0) {
      ind = m_mesh.addVertex(Vector4D(0, 0, rad) + v1,
                             Vector4D(0, 0, 1),
                             col);
      //ind = putVert(Vector4D(0, 0, rad) + v1);

      ppindx[i] = new int[1];
      ppindx[i][0] = ind;
    }
    else if (i==nLat) {
      ind = m_mesh.addVertex(Vector4D(0, 0, -rad) + v1,
                             Vector4D(0, 0, -1),
                             col);
      //ind = putVert(Vector4D(0, 0, -rad) + v1);
      //ilst.push_back(ind);

      ppindx[i] = new int[1];
      ppindx[i][0] = ind;
    }
    else {
      Vector4D vec, norm;
      const double th = double(i)*M_PI/double(nLat);
      const double ri = rad*::sin(th);
      vec.z()  = rad*::cos(th);
      nLng = (int) ::ceil(ri*M_PI*2.0/dmax);
      ppindx[i] = new int[nLng+2];
      ppindx[i][0] = nLng;
      const double start_phi = double(i%2) * 3.0 / nLng;
      //MB_DPRINTLN("Lat: %d start phi=%f", i, start_phi);
      for (j=0; j<nLng; ++j) {
        double ph = double(j)*M_PI*2.0/double(nLng) + start_phi;
        vec.x() = ri*::cos(ph);
        vec.y() = ri*::sin(ph);
        norm = vec.normalize();
        ind = m_mesh.addVertex(vec + v1, norm, col);
        //ind = putVert(vec + v1);

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
        m_mesh.addFace(ipiv, ppindx[1][j+1], ppindx[1][j+2],
		       2);
      }
    }
    else if (i==nLat-1) {
      int ipiv = ppindx[nLat][0];
      int nLng = ppindx[nLat-1][0];
      for (j=0; j<nLng; ++j) {
        m_mesh.addFace(ppindx[nLat-1][j+2], ppindx[nLat-1][j+1], ipiv,
		       2);
      }
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
          m_mesh.addFace(piJ[j], piK[k], piJ[j+1],
			 2);
          ++j;
        }
        else /*if (bJ==0)*/ {
          m_mesh.addFace(piJ[j], piK[k], piK[k+1],
			 2);
          ++k;
        }
      } // while

    }
  } // for (i)

  for (i=0; i<=nLat; ++i)
    delete [] ppindx[i];
  delete [] ppindx;
}
