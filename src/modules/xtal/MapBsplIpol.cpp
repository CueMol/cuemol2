// -*-Mode: C++;-*-
//
// Generate/Render mesh contours of ScalarObject (ver. 3)
//

#include <common.h>

#include "MapBsplIpol.hpp"
#include "FFTUtil.hpp"
#include "DensityMap.hpp"

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;

float MapBsplIpol::calcAt(const Vector3F &pos) const
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

  float su = 0.0;
  for ( i = 0; i < 4; i++ ) {
    float sv = 0.0;
    for ( j = 0; j < 4; j++ ) {
      float sw = 0.0;
      for ( k = 0; k < 4; k++ ) {
        sw += Nz[k] * m_pBsplCoeff->at((ix+i)%na, (iy+j)%nb, (iz+k)%nc);
      }
      sv += Ny[j] * sw;
    }
    su += Nx[i] * sv;
  }
  return su;

}

Vector3F MapBsplIpol::calcDiffAt(const Vector3F &pos, float *rval/*=NULL*/) const
{
  int i, j, k;
  int ix, iy, iz;
  float xf, yf, zf;
  float dx, dy, dz;
  float dx2, dy2, dz2;
  float dx3, dy3, dz3;
  float Nx[4], Ny[4], Nz[4];
  float Gx[4], Gy[4], Gz[4];

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

  //

  dx2 = dx*dx;
  dx3 = dx2*dx;
  const float mdx = (1-dx);
  const float mdx2 = mdx*mdx;
  Nx[0] = 1.0/6.0 * mdx2*mdx;
  Nx[1] = 0.5 * dx3 - dx2 + 2.0/3.0;
  Nx[2] =-0.5 * dx3 + 0.5*dx2 + 0.5*dx + 1.0/6.0;
  Nx[3] = 1.0/6.0 * dx3;

  dy2 = dy*dy;
  dy3 = dy2*dy;
  const float mdy = (1-dy);
  const float mdy2 = mdy*mdy;
  Ny[0] = 1.0/6.0 * mdy2*mdy;
  Ny[1] = 0.5 * dy3 - dy2 + 2.0/3.0;
  Ny[2] =-0.5 * dy3 + 0.5*dy2 + 0.5*dy + 1.0/6.0;
  Ny[3] = 1.0/6.0 * dy3;

  dz2 = dz*dz;
  dz3 = dz2*dz;
  float mdz = (1-dz);
  Nz[0] = 1.0/6.0 * mdz*mdz*mdz;
  Nz[1] = 0.5 * dz3 - dz2 + 2.0/3.0;
  Nz[2] =-0.5 * dz3 + 0.5*dz2 + 0.5*dz + 1.0/6.0;
  Nz[3] = 1.0/6.0 * dz3;

  //

  //dx2 = dx*dx;
  Gx[0] = -0.5 * mdx2;
  Gx[1] = 1.5 * dx2 - 2.0*dx;
  Gx[2] =-1.5 * dx2 + dx + 0.5;
  Gx[3] = 0.5 * dx2;

  //dy2 = dy*dy;
  Gy[0] = -0.5 * mdy2;
  Gy[1] = 1.5 * dy2 - 2.0*dy;
  Gy[2] =-1.5 * dy2 + dy + 0.5;
  Gy[3] = 0.5 * dy2;

  // dz2 = dz*dz;
  Gz[0] = -0.5 * mdz*mdz;
  Gz[1] = 1.5 * dz2 - 2.0*dz;
  Gz[2] =-1.5 * dz2 + dz + 0.5;
  Gz[3] = 0.5 * dz2;

  float rho, s1, s2, s3;
  float du1, dv1, dv2, dw1, dw2, dw3;
  du1 = dv1 = dw1 = 0.0;

  s1 = 0.0f;
  for ( i = 0; i < 4; i++ ) {
    s2 = dv2 = dw2 = 0.0;
    for ( j = 0; j < 4; j++ ) {
      s3 = dw3 = 0.0;
      for ( k = 0; k < 4; k++ ) {
        rho = m_pBsplCoeff->at((ix+i)%na, (iy+j)%nb, (iz+k)%nc);
        s3 += Nz[k] * rho;
        dw3 += Gz[k] * rho;
      }
      s2 += Ny[j] * s3;
      dv2 += Gy[j] * s3;
      dw2 += Ny[j] * dw3;
    }
    s1 += Nx[i] * s2;
    du1 += Gx[i] * s2;
    dv1 += Nx[i] * dv2;
    dw1 += Nx[i] * dw2;
  }

  if (rval!=NULL)
    *rval = float(s1);

  Vector3F grad(du1, dv1, dw1);

  return grad;
}

void MapBsplIpol::calcCurvAt(const Vector3F &pos,
                             Matrix3F *pcurv,
                             Vector3F *pgrad,
                             float *rval) const
{
  int i, j, k;
  int ix, iy, iz;
  float xf, yf, zf;
  float dx, dy, dz;
  float dx2, dy2, dz2;
  float dx3, dy3, dz3;
  float Nx[4], Ny[4], Nz[4];
  float Gx[4], Gy[4], Gz[4];
  float Cx[4], Cy[4], Cz[4];

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

  //

  dx2 = dx*dx;
  dx3 = dx2*dx;
  const float mdx = (1-dx);
  const float mdx2 = mdx*mdx;
  Nx[0] = 1.0/6.0 * mdx2*mdx;
  Nx[1] = 0.5 * dx3 - dx2 + 2.0/3.0;
  Nx[2] =-0.5 * dx3 + 0.5*dx2 + 0.5*dx + 1.0/6.0;
  Nx[3] = 1.0/6.0 * dx3;

  dy2 = dy*dy;
  dy3 = dy2*dy;
  const float mdy = (1-dy);
  const float mdy2 = mdy*mdy;
  Ny[0] = 1.0/6.0 * mdy2*mdy;
  Ny[1] = 0.5 * dy3 - dy2 + 2.0/3.0;
  Ny[2] =-0.5 * dy3 + 0.5*dy2 + 0.5*dy + 1.0/6.0;
  Ny[3] = 1.0/6.0 * dy3;

  dz2 = dz*dz;
  dz3 = dz2*dz;
  float mdz = (1-dz);
  Nz[0] = 1.0/6.0 * mdz*mdz*mdz;
  Nz[1] = 0.5 * dz3 - dz2 + 2.0/3.0;
  Nz[2] =-0.5 * dz3 + 0.5*dz2 + 0.5*dz + 1.0/6.0;
  Nz[3] = 1.0/6.0 * dz3;

  // 1st diff

  //dx2 = dx*dx;
  Gx[0] = -0.5 * mdx2;
  Gx[1] = 1.5 * dx2 - 2.0*dx;
  Gx[2] =-1.5 * dx2 + dx + 0.5;
  Gx[3] = 0.5 * dx2;

  //dy2 = dy*dy;
  Gy[0] = -0.5 * mdy2;
  Gy[1] = 1.5 * dy2 - 2.0*dy;
  Gy[2] =-1.5 * dy2 + dy + 0.5;
  Gy[3] = 0.5 * dy2;

  // dz2 = dz*dz;
  Gz[0] = -0.5 * mdz*mdz;
  Gz[1] = 1.5 * dz2 - 2.0*dz;
  Gz[2] =-1.5 * dz2 + dz + 0.5;
  Gz[3] = 0.5 * dz2;

  // 2nd diff

  Cx[0] = 1.0 - dx;
  Cx[1] = 3.0*dx - 2.0;
  Cx[2] =-3.0*dx + 1.0;
  Cx[3] = dx;

  Cy[0] = 1.0 - dy;
  Cy[1] = 3.0*dy - 2.0;
  Cy[2] =-3.0*dy + 1.0;
  Cy[3] = dy;

  Cz[0] = 1.0 - dz;
  Cz[1] = 3.0*dz - 2.0;
  Cz[2] =-3.0*dz + 1.0;
  Cz[3] = dz;

  float rho, s1, s2, s3;
  float du1, dv1, dv2, dw1, dw2, dw3;
  float duv1, duw1, dvw1, duu1, dvv1, dww1;
  float dvw2, dvv2, dww2;
  float dww3;

  s1 = 0.0f;
  du1 = dv1 = dw1 = 0.0;
  duv1 = duw1 = dvw1 = duu1 = dvv1 = dww1 = 0.0;

  for ( i = 0; i < 4; i++ ) {
    s2 = dv2 = dw2 = dvw2 = dvv2 = dww2 = 0.0;
    for ( j = 0; j < 4; j++ ) {
      s3 = dw3 = dww3 = 0.0;
      for ( k = 0; k < 4; k++ ) {
        rho = m_pBsplCoeff->at((ix+i)%na, (iy+j)%nb, (iz+k)%nc);
        s3 += Nz[k] * rho;
        dw3 += Gz[k] * rho;
        dww3 += Cz[k] * rho;
      }
      s2 += Ny[j] * s3;
      dv2 += Gy[j] * s3;
      dw2 += Ny[j] * dw3;
      dvw2 += Gy[j] * dw3;
      dvv2 += Cy[j] * s3;
      dww2 += Ny[j] * dww3;
    }
    s1 += Nx[i] * s2;
    du1 += Gx[i] * s2;
    dv1 += Nx[i] * dv2;
    dw1 += Nx[i] * dw2;
    duv1 += Gx[i] * dv2;
    duw1 += Gx[i] * dw2;
    dvw1 += Nx[i] * dvw2;
    duu1 += Cx[i] * s2;
    dvv1 += Nx[i] * dvv2;
    dww1 += Nx[i] * dww2;
  }

  if (rval!=NULL)
    *rval = float(s1);

  if (pgrad!=NULL)
    *pgrad = Vector3F(du1, dv1, dw1);

  if (pcurv!=NULL)
    *pcurv = Matrix3F(duu1, duv1, duw1,
                      duv1, dvv1, dvw1,
                      duw1, dvw1, dww1);
}

/// for debugging
Vector3F MapBsplIpol::calcDscDiffAt(const Vector3F &pos) const
{
  const float delta = 0.01;
  float ex0 = calcAt(pos+Vector3F(-delta,0,0));
  float ex1 = calcAt(pos+Vector3F(delta,0,0));
  float ey0 = calcAt(pos+Vector3F(0,-delta,0));
  float ey1 = calcAt(pos+Vector3F(0,delta,0));
  float ez0 = calcAt(pos+Vector3F(0,0,-delta));
  float ez1 = calcAt(pos+Vector3F(0,0,delta));

  return Vector3F((ex1-ex0)/(2*delta), (ey1-ey0)/(2*delta), (ez1-ez0)/(2*delta));
  //rval = getDensityCubic(pos);
}

Matrix3F MapBsplIpol::calcDscCurvAt(const Vector3F &pos) const
{
  const float delta = 0.01;

  Vector3F ex0 = calcDiffAt(pos+Vector3F(-delta,0,0));
  Vector3F ex1 = calcDiffAt(pos+Vector3F(delta,0,0));
  Vector3F ey0 = calcDiffAt(pos+Vector3F(0,-delta,0));
  Vector3F ey1 = calcDiffAt(pos+Vector3F(0,delta,0));
  Vector3F ez0 = calcDiffAt(pos+Vector3F(0,0,-delta));
  Vector3F ez1 = calcDiffAt(pos+Vector3F(0,0,delta));

  Vector3F r0 = (ex1-ex0).divide(2*delta);
  Vector3F r1 = (ey1-ey0).divide(2*delta);
  Vector3F r2 = (ez1-ez0).divide(2*delta);

  return Matrix3F(r0.x(), r0.y(), r0.z(),
                  r1.x(), r1.y(), r1.z(),
                  r2.x(), r2.y(), r2.z());
}

std::complex<float> MapBsplIpol::calc_cm2(int i, int N)
{
  int ii;
  if (i<N/2)
    ii = i;
  else
    ii = i-N;

  float u = float(ii)/float(N);

  std::complex<float> piu(0.0f, -2.0f*M_PI*u);
  std::complex<float> rval = std::complex<float>(3,0) * std::exp(piu) / std::complex<float>(2.0 + cos(2.0*M_PI*u),0);

  return rval;
}

void MapBsplIpol::calcCoeffs(DensityMap *pXtal)
{
  MB_DPRINTLN("MapBsplIpol> compute coeff");

  //LOG_DPRINTLN("MapBsplIpol> compute coeff; map stdev: %f", pXtal->getRmsdDensity());
  m_rmsd = pXtal->getRmsdDensity();

  const int na = pXtal->getColNo();
  const int nb = pXtal->getRowNo();
  const int nc = pXtal->getSecNo();
  int naa = na/2+1;

  CompArray recipAry(naa, nb, nc);

  if (m_pBsplCoeff!=NULL)
    delete m_pBsplCoeff;
  m_pBsplCoeff = MB_NEW FloatArray(na, nb, nc);

  HKLList *pHKLList = pXtal->getHKLList();
  if (pHKLList==NULL) {
    FloatArray *pFMap = pXtal->getFloatMap();
    if (pFMap==NULL) {
      MB_THROW(qlib::RuntimeException, "No float map available");
      return;
    }
    
    // Create reciprocal array from float map
    FFTUtil fft;
    fft.doit(*pFMap, recipAry);

    const CrystalInfo &ci = pXtal->getXtalInfo();
    // Estimate d_min from Nyquist freq
    double res_a = 1.0/sqrt( ci.invressq(naa, 0, 0) );
    double res_b = 1.0/sqrt( ci.invressq(0, nb/2+1, 0) );
    double res_c = 1.0/sqrt( ci.invressq(0, 0, nc/2+1) );
    double dmin = qlib::min( qlib::min(res_a, res_b), res_c);
    MB_DPRINTLN("MapBsplIpol> Estimated d_min = %.2f", dmin);
    const double irs_max = 1.0f/(dmin*dmin);

    const float fscl = 1.0f/float(na*nb*nc);
    int h, k, l;
    for (l=0; l<nc; ++l)
      for (k=0; k<nb; ++k)
        for (h=0; h<naa; ++h) {
          int ih = h;
          if (qlib::abs(h-na)<h)
            ih = h - na;
          
          int ik = k;
          if (qlib::abs(k-nb)<k)
            ik = k - nb;
          
          int il = l;
          if (qlib::abs(l-nc)<l)
            il = l - nc;

          float irs = float( ci.invressq(ih, ik, il) );

          if (irs>irs_max)
            recipAry.at(h,k,l) = std::complex<float>(0.0f, 0.0f);
          else 
            recipAry.at(h,k,l) *= fscl;
        }
  }
  else {
    // conv hkl list to recpi array
    pHKLList->convToArrayHerm(recipAry, 0.0, -1.0);
  }
  
  // apply filter and generate 3rd-order b-spline coeffs
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

  MB_DPRINTLN("MapBsplIpol> done");
}

