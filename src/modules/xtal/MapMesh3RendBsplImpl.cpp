// -*-Mode: C++;-*-
//
// Generate/Render mesh contours of ScalarObject (ver. 3)
//

#include <common.h>

#include "MapMesh3Renderer.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;

float MapMesh3Renderer::calcIpolBspl3(const Vector3F &pos) const
{
  int i, j, k;
  int ix, iy, iz;
  float xf, yf, zf;
  float dx, dy, dz;
  float dx2, dy2, dz2;
  float dx3, dy3, dz3;
  float Nx[4], Ny[4], Nz[4];

  int na = m_pBsplCoeff->cols();
  int nb = m_pBsplCoeff->rows();
  int nc = m_pBsplCoeff->secs();

  float xm = fmodf(pos.x(), float(na));
  float ym = fmodf(pos.y(), float(nb));
  float zm = fmodf(pos.z(), float(nc));
  if (xm<0.0f)
    xm += float(na);
  if (ym<0.0f)
    ym += float(nb);
  if (zm<0.0f)
    zm += float(nc);

  xf = floor(xm);
  yf = floor(ym);
  zf = floor(zm);

  ix = int(xf);
  iy = int(yf);
  iz = int(zf);

  dx = xm - xf;
  dy = ym - yf;
  dz = zm - zf;

  dx2 = dx*dx;
  dx3 = dx2*dx;
  Nx[0] = 1.0/6.0 * (1-dx)*(1-dx)*(1-dx);
  Nx[1] = 0.5 * dx3 - dx2 + 2.0/3.0;
  Nx[2] =-0.5 * dx3 + 0.5*dx2 + 0.5*dx + 1.0/6.0;
  Nx[3] = 1.0/6.0 * dx3;

  dy2 = dy*dy;
  dy3 = dy2*dy;
  Ny[0] = 1.0/6.0 * (1-dy)*(1-dy)*(1-dy);
  Ny[1] = 0.5 * dy3 - dy2 + 2.0/3.0;
  Ny[2] =-0.5 * dy3 + 0.5*dy2 + 0.5*dy + 1.0/6.0;
  Ny[3] = 1.0/6.0 * dy3;

  dz2 = dz*dz;
  dz3 = dz2*dz;
  Nz[0] = 1.0/6.0 * (1-dz)*(1-dz)*(1-dz);
  Nz[1] = 0.5 * dz3 - dz2 + 2.0/3.0;
  Nz[2] =-0.5 * dz3 + 0.5*dz2 + 0.5*dz + 1.0/6.0;
  Nz[3] = 1.0/6.0 * dz3;

  float w = 0.0f;
  for (i=0; i<4; ++i)
    for (j=0; j<4; ++j)
      for (k=0; k<4; ++k) {
        w += Nx[i] * Ny[j] * Nz[k] * m_pBsplCoeff->at((ix+i)%na, (iy+j)%nb, (iz+k)%nc);
      }

  return w;
}

Vector3F MapMesh3Renderer::calcIpolBspl3Diff(const Vector3F &pos) const
{
  int i, j, k;
  int ix, iy, iz;
  float xf, yf, zf;
  float dx, dy, dz;
  float dx2, dy2, dz2;
  float dx3, dy3, dz3;
  float Nx[4], Ny[4], Nz[4];

  int na = m_pBsplCoeff->cols();
  int nb = m_pBsplCoeff->rows();
  int nc = m_pBsplCoeff->secs();

  float xm = fmodf(pos.x(), float(na));
  float ym = fmodf(pos.y(), float(nb));
  float zm = fmodf(pos.z(), float(nc));
  if (xm<0.0f)
    xm += float(na);
  if (ym<0.0f)
    ym += float(nb);
  if (zm<0.0f)
    zm += float(nc);

  xf = floor(xm);
  yf = floor(ym);
  zf = floor(zm);

  ix = int(xf);
  iy = int(yf);
  iz = int(zf);

  dx = xm - xf;
  dy = ym - yf;
  dz = zm - zf;

  dx2 = dx*dx;
  Nx[0] = -0.5 * (1-dx)*(1-dx);
  Nx[1] = 1.5 * dx2 - 2.0*dx;
  Nx[2] =-1.5 * dx2 + dx + 0.5;
  Nx[3] = 0.5 * dx2;

  dy2 = dy*dy;
  Ny[0] = -0.5 * (1-dy)*(1-dy);
  Ny[1] = 1.5 * dy2 - 2.0*dy;
  Ny[2] =-1.5 * dy2 + dy + 0.5;
  Ny[3] = 0.5 * dy2;

  dz2 = dz*dz;
  Nz[0] = -0.5 * (1-dz)*(1-dz);
  Nz[1] = 1.5 * dz2 - 2.0*dz;
  Nz[2] =-1.5 * dz2 + dz + 0.5;
  Nz[3] = 0.5 * dz2;

  float w = 0.0f;
  for (i=0; i<4; ++i)
    for (j=0; j<4; ++j)
      for (k=0; k<4; ++k) {
        w += Nx[i] * Ny[j] * Nz[k] * m_pBsplCoeff->at((ix+i)%na, (iy+j)%nb, (iz+k)%nc);
      }

  return w;
}

Vector3F MapMesh3Renderer::getXValF(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev)
{
  if (qlib::isNear(val0,val1))
    return vec0;
    //return -1.0;
      
  float crs = (isolev-val0)/(val1-val0);
  //return crs;

  return vec0 + (vec1-vec0).scale(crs);
}

Vector3F MapMesh3Renderer::getXValFBsec(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev)
{
  Vector3F mid = (vec0 + vec1).scale(0.5f);
  float valm = calcIpolBspl3(mid);
  
  if (qlib::isNear4(valm,isolev))
    return mid;

  int sign0 = (val0<isolev)?-1:1;
  int sign1 = (val1<isolev)?-1:1;
  int signm = (valm<isolev)?-1:1;

  if (sign0*signm>0) {
    // find between mid & vec1
    return getXValFBsec(valm, mid, val1, vec1, isolev);
  }
  else {
    // find between vec0 & mid
    return getXValFBsec(val0, vec0, valm, mid, isolev);
  }
}

/// File rendering/Generate display list (legacy interface)
void MapMesh3Renderer::renderImplTest2(DisplayContext *pdl)
{
  // TO DO: support object xformMat property!!

  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  calcMapDispExtent(pMap);
  calcContLevel(pMap);

  // setup mol boundry info (if needed)
  setupMolBndry();

  bool bOrgChg = false;
  if (!m_mapStPos.equals(m_texStPos)) {
    // texture origin changed --> regenerate texture
    bOrgChg = true;
  }

  bool bSizeChg = false;

  if (m_maptmp.cols()!=getDspSize().x() ||
      m_maptmp.rows()!=getDspSize().y() ||
      m_maptmp.secs()!=getDspSize().z()) {
    // texture size changed --> regenerate texture/VBO
    m_maptmp.resize(getDspSize().x(), getDspSize().y(), getDspSize().z());
    bSizeChg = true;
  }

  const int ncol = m_dspSize.x();
  const int nrow = m_dspSize.y();
  const int nsec = m_dspSize.z();

  const int stcol = m_mapStPos.x();
  const int strow = m_mapStPos.y();
  const int stsec = m_mapStPos.z();

  int na = pXtal->getColNo();
  int nb = pXtal->getRowNo();
  int nc = pXtal->getSecNo();

  int i, j, k;

  // calc b-spline coeffs
  if (m_pBsplCoeff==NULL) {
    HKLList *pHKLList = pXtal->getHKLList();
    if (pHKLList==NULL) {
      // TO DO: impl
      return;
    }

    int naa = na/2+1;

    CompArray recipAry(naa, nb, nc);
    m_pBsplCoeff = MB_NEW FloatArray(na, nb, nc);

    // conv hkl list to recpi array
    pHKLList->convToArrayHerm(recipAry, 0.0, -1.0);

    // apply filter
    int i,j,k;
    for (k=0; k<nc; k++)
      for (j=0; j<nb; j++)
        for (i=0; i<naa; i++){
          auto val = recipAry.at(i, j, k);
          val *= calc_cm2(i, na);
          val *= calc_cm2(j, nb);
          val *= calc_cm2(k, nc);
          recipAry.at(i, j, k) = val;
        }

    FFTUtil fft;
    fft.doit(recipAry, *m_pBsplCoeff);
  }

  pdl->pushMatrix();
  setupXform(pdl, pMap, pXtal, false);

  float val[4];
  Vector3F vec[4];
  float isolev = float( pMap->getRmsdDensity() * getSigLevel() );

  pdl->color(getColor());
  pdl->startLines();

  for (k=0; k<nsec-1; k++)
    for (j=0; j<nrow-1; j++)
      for (i=0; i<ncol-1; i++){
        //for (int iplane = 0; iplane<3; ++iplane) {
        for (int iplane = 0; iplane<1; ++iplane) {
          quint8 flag = 0U;
          quint8 mask = 1U;
          const int ipl4 = iplane*4;

          for (int ii=0; ii<4; ++ii) {

            const int iid = ii + ipl4;
            int ivx = i + m_idel[iid][0]+stcol;
            int ivy = j + m_idel[iid][1]+strow;
            int ivz = k + m_idel[iid][2]+stsec;

            vec[ii].x() = ivx;
            vec[ii].y() = ivy;
            vec[ii].z() = ivz;
            
            val[ii] = pMap->atFloat((ivx+10000*na)%na,
                                    (ivy+10000*nb)%nb,
                                    (ivz+10000*nc)%nc);
            if (val[ii]>isolev)
              flag += mask;
            mask = mask << 1;
          }

          int iv0 = m_triTable[flag][0];
          int iv1 = m_triTable[flag][1];
          if (iv0<0)
            continue;
          
          Vector3F v0 = getXValFBsec(val[iv0], vec[iv0], val[(iv0+1)%4], vec[(iv0+1)%4], isolev);
          Vector3F v1 = getXValFBsec(val[iv1], vec[iv1], val[(iv1+1)%4], vec[(iv1+1)%4], isolev);

          /*
          Vector3F v0 = getXValF(val[iv0], vec[iv0], val[(iv0+1)%4], vec[(iv0+1)%4], isolev);
          Vector3F v1 = getXValF(val[iv1], vec[iv1], val[(iv1+1)%4], vec[(iv1+1)%4], isolev);
           */
          pdl->vertex(v0.x(), v0.y(), v0.z());
          pdl->vertex(v1.x(), v1.y(), v1.z());

          /*
          float crs0 = getXValF(val[iv0], vec[iv0], val[(iv0+1)%4], vec[(iv0+1)%4], isolev);
          float crs1 = getXValF(val[iv1], vec[iv1], val[(iv1+1)%4], vec[(iv1+1)%4], isolev);
          if (crs0>=-0.0 && crs1>=-0.0) {
            Vector3F v0 = calcVecCrs(i, j, k, iv0, crs0, iplane*4);
            Vector3F v1 = calcVecCrs(i, j, k, iv1, crs1, iplane*4);
            pdl->vertex(v0.x(), v0.y(), v0.z());
            pdl->vertex(v1.x(), v1.y(), v1.z());
          }
           */
        }
      }

  pdl->end();

  pdl->popMatrix();
}


