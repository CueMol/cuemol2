// -*-Mode: C++;-*-
//
//  Sphere set object
//

#include <common.h>

#include "SphereSet.hpp"

#if 0
using namespace gfx;

SphereSet::SphereSet()
{
  m_defAlpha = 1.0;
}

SphereSet::~SphereSet()
{
}

void SphereSet::create(int nsize, int ndetail)
{
  m_nDetail = ndetail;
  m_data.resize(nsize);
}

void SphereSet::sphere(int i, const Vector4D &pos, double r, const ColorPtr &col)
{
  m_data[i].posr = pos;
  m_data[i].posr.w() = r;
  if (qlib::isNear4(m_defAlpha, 1.0)) {
    m_data[i].ccode = col->getCode();
  }
  else {
    m_data[i].ccode = gfx::mixAlpha(col->getCode(), m_defAlpha);
  }
}

void SphereSet::estimateMeshSize(int &nverts, int &nfaces)
{
  nverts = 0;
  nfaces = 0;

  int i;
  int nLat = m_nDetail+1;
  int nLng, nLngPrev=0;

  const double rad = 10000.0;
  const double dmax = (M_PI*rad)/double(m_nDetail+1);

  for (i=0; i<=nLat; ++i) {
    if (i==0) {
      ++nverts;
      nLngPrev=0;
    }
    else if (i==nLat) {
      ++nverts;
      nfaces += nLngPrev;
    }
    else {
      const double th = double(i)*M_PI/double(nLat);
      const double ri = rad*::sin(th);
      nLng = (int) ::ceil(ri*M_PI*2.0/dmax);

      nverts += nLng;
      nfaces += nLng + nLngPrev;

      nLngPrev=nLng;
    }
  } // for (i)

  MB_DPRINTLN("Sph> nverts = %d, nfaces = %d", nverts, nfaces);
}

DrawElem *SphereSet::buildDrawElem()
{
  int nverts,  nfaces; 
  estimateMeshSize(nverts, nfaces);
  int nsphs = m_data.size();

  int nvtot = nverts*nsphs;
  int nftot = nfaces*nsphs;
  MB_DPRINTLN("Sph> nv_tot = %d, nf_fot = %d", nvtot, nftot);

  // Create DrawElemVNCI (or VNI?) object
  m_pDrawElem = MB_NEW gfx::DrawElemVNCI32();
  m_pDrawElem->startIndexTriangles(nvtot, nftot);

  int ivt = 0, ifc = 0;
  for (int i=0; i<nsphs; ++i) {
    buildSphere(i, ivt, ifc);
  }

  return m_pDrawElem;
}

void SphereSet::buildSphere(int isph, int &ivt, int &ifc)
{
  DrawElemVNCI32 *pVary = m_pDrawElem;
  ElemType *pSph = &m_data[isph];
  const Vector4D v1 = pSph->posr;
  const double rad = v1.w();
  int col = pSph->ccode;
  const double dmax = (M_PI*rad)/double(m_nDetail+1);

  int i, j;
  int ivtbase = ivt;
  int ifcbase = ifc;
  int nLat = m_nDetail+1;

  // detail in longitude direction is automatically determined by stack radius
  int nLng;

  //MB_DPRINTLN("buildSphere v1=(%f,%f,%f) r=%f",
  //v1.x(), v1.y(), v1.z(), rad);
  // MB_DPRINTLN("sphere R=%f, nLat=%d (%f)", rad, nLat, rad*M_PI/dmax);

  int **ppindx = MB_NEW int *[nLat+1];

  // generate verteces
  for (i=0; i<=nLat; ++i) {
    int ind;

    if (i==0) {
      ind = ivt;
      pVary->color(ivt, col);
      pVary->normal(ivt, Vector4D(0, 0, 1));
      pVary->vertex(ivt, Vector4D(0, 0, rad) + v1);
      ++ivt;
      ppindx[i] = new int[1];
      ppindx[i][0] = ind;
    }
    else if (i==nLat) {
      ind = ivt;
      pVary->color(ivt, col);
      pVary->normal(ivt, Vector4D(0, 0, -1));
      pVary->vertex(ivt, Vector4D(0, 0, -rad) + v1);
      ++ivt;
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

	ind = ivt;
	pVary->color(ivt, col);
	pVary->normal(ivt, norm);
	pVary->vertex(ivt, vec + v1);
	++ivt;

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
	quint32 n1 = (quint32) ipiv;
	quint32 n2 = (quint32) ppindx[1][j+1];
	quint32 n3 = (quint32) ppindx[1][j+2];
	pVary->setIndex3(ifc, n1, n2, n3);
	++ifc;
      }
    }
    else if (i==nLat-1) {
      int ipiv = ppindx[nLat][0];
      int nLng = ppindx[nLat-1][0];
      for (j=0; j<nLng; ++j) {
	quint32 n1 = (quint32) ppindx[nLat-1][j+2];
	quint32 n2 = (quint32) ppindx[nLat-1][j+1];
	quint32 n3 = (quint32) ipiv;
	pVary->setIndex3(ifc, n1, n2, n3);
	++ifc;
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
	  quint32 n1 = (quint32) piJ[j];
	  quint32 n2 = (quint32) piK[k];
	  quint32 n3 = (quint32) piJ[j+1];
	  pVary->setIndex3(ifc, n1, n2, n3);
	  ++ifc;
          ++j;
        }
        else /*if (bJ==0)*/ {
	  quint32 n1 = (quint32) piJ[j];
	  quint32 n2 = (quint32) piK[k];
	  quint32 n3 = (quint32) piK[k+1];
	  pVary->setIndex3(ifc, n1, n2, n3);
	  ++ifc;
          ++k;
        }
      } // while

    }
  } // for (i)

  for (i=0; i<=nLat; ++i)
    delete [] ppindx[i];
  delete [] ppindx;

  //MB_DPRINTLN("ivt incr=%d", ivt - ivtbase);
  //MB_DPRINTLN("ifc incr=%d", ifc - ifcbase);
}

static
inline Vector4D makenorm(const Vector4D &pos1,
                         const Vector4D &pos2,
                         const Vector4D &pos3)
{
  const Vector4D v12 = pos2 - pos1;
  const Vector4D v23 = pos3 - pos2;
  Vector4D vn = v12.cross(v23);
  const double dnorm = vn.length();
  // if (dnorm<dtol) {
  //   TODO: throw error!!
  // }
  vn /= dnorm;
  return vn;
}

int SphereSet::selectTrig(int j, int k, int j1, int k1)
{
  Vector4D vj, vk, vj1, vk1;
  m_pDrawElem->getVertex(j, vj);
  m_pDrawElem->getVertex(k, vk);
  m_pDrawElem->getVertex(j1, vj1);
  m_pDrawElem->getVertex(k1, vk1);

  Vector4D nj1 = makenorm(vj, vk, vj1);
  Vector4D nk1 = makenorm(vj, vk, vk1);
  
  double detj = nj1.dot(vk1-vk);
  double detk = nk1.dot(vj1-vj);

  if (detj<0 && detk>=0)
    return 1; // select j1

  if (detj>=0 && detk<0)
    return 0; // select k1

  MB_DPRINTLN("SelectTrig warning; (%d,%d,%d,%d) detj=%f, detk=%f", j, k, j1, k1, detj, detk);
  return 2;
}

#endif

