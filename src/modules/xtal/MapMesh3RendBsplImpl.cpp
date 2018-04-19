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

  /*
  float w = 0.0f;
  for (i=0; i<4; ++i)
    for (j=0; j<4; ++j)
      for (k=0; k<4; ++k) {
        w += Nx[i] * Ny[j] * Nz[k] * m_pBsplCoeff->at((ix+i)%na, (iy+j)%nb, (iz+k)%nc);
      }
  return w;
  */

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

Vector3F MapMesh3Renderer::calcIpolBspl3DscDiff(const Vector3F &pos) const
{
  const float delta = 0.01;
  float ex0 = calcIpolBspl3(pos+Vector3F(-delta,0,0));
  float ex1 = calcIpolBspl3(pos+Vector3F(delta,0,0));
  float ey0 = calcIpolBspl3(pos+Vector3F(0,-delta,0));
  float ey1 = calcIpolBspl3(pos+Vector3F(0,delta,0));
  float ez0 = calcIpolBspl3(pos+Vector3F(0,0,-delta));
  float ez1 = calcIpolBspl3(pos+Vector3F(0,0,delta));
    
  return Vector3F((ex1-ex0)/(2*delta), (ey1-ey0)/(2*delta), (ez1-ez0)/(2*delta));
  //rval = getDensityCubic(pos);
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

  //

  dx2 = dx*dx;
  Gx[0] = -0.5 * (1-dx)*(1-dx);
  Gx[1] = 1.5 * dx2 - 2.0*dx;
  Gx[2] =-1.5 * dx2 + dx + 0.5;
  Gx[3] = 0.5 * dx2;

  dy2 = dy*dy;
  Gy[0] = -0.5 * (1-dy)*(1-dy);
  Gy[1] = 1.5 * dy2 - 2.0*dy;
  Gy[2] =-1.5 * dy2 + dy + 0.5;
  Gy[3] = 0.5 * dy2;

  dz2 = dz*dz;
  Gz[0] = -0.5 * (1-dz)*(1-dz);
  Gz[1] = 1.5 * dz2 - 2.0*dz;
  Gz[2] =-1.5 * dz2 + dz + 0.5;
  Gz[3] = 0.5 * dz2;

  /*
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
   */

  float rho, s1, s2, s3;
  float du1, dv1, dv2, dw1, dw2, dw3;
  du1 = dv1 = dw1 = 0.0;

  // s1 = 0.0f;
  for ( i = 0; i < 4; i++ ) {
    s2 = dv2 = dw2 = 0.0;
    for ( j = 0; j < 4; j++ ) {
      //iw = iv;
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
    // s1 += Nx[i] * s2;
    du1 += Gx[i] * s2;
    dv1 += Nx[i] * dv2;
    dw1 += Nx[i] * dw2;
  }
  // rval = float(s1);
  Vector3F grad(du1, dv1, dw1);


  return grad;
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

bool MapMesh3Renderer::getXValFNrImpl1(const Vector3F &vec0, const Vector3F &dv, float rho, float isolev, float &rval)
{
  float frho, dfrho;
  Vector3F vrho, dvrho;
  int i, j;

  bool bConv = false;
  for (i=0; i<10; ++i) {
    vrho = vec0 + dv.scale(rho);
    frho = calcIpolBspl3(vrho)-isolev;
    if (qlib::isNear4(frho, 0.0f)) {
      bConv = true;
      break;
    }
    
    // dvrho = calcIpolBspl3DscDiff(vrho);
    dvrho = calcIpolBspl3Diff(vrho);

    dfrho = dv.dot( dvrho );

    rho += -frho/dfrho;

    if (rho<0.0f || 1.0f <rho) {
      return false;
    }
  }

  rval = rho;
  return true;
}

bool MapMesh3Renderer::getXValFNr(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, float isolev, Vector3F &rval)
{
  // init estim. by lin. intpol
  Vector3F dv = (vec1 - vec0);

  float rho0 = (isolev-val0)/(val1-val0);
  float rho2;

  float rho = rho0;
  float rhoL = 0.0f;
  float rhoU = 1.0f;
  
  int sign0 = (val0-isolev<0)?-1:1;
  int sign1 = (val1-isolev<0)?-1:1;

  for (int i=0; i<10; ++i) {
    if (getXValFNrImpl1(vec0, dv, rho, isolev, rho2)) {
      rval = vec0 + dv.scale(rho2);
      return true;
    }

    float frho0 = calcIpolBspl3(vec0 + dv.scale(rho));
    int signm = (frho0<isolev)?-1:1;
  
    if (sign0*signm>0) {
      // find between mid & vec1
      rhoL = rho;
      rho = (rho + rhoU)/2.0;
    }
    else {
      // find between vec0 & mid
      rhoU = rho;
      rho = (rho + rhoL)/2.0;
    }
  }

  {
    MB_DPRINTLN("XXX invalid %f", rho);
    FILE *fp = fopen("tmp.txt", "w");
    for (int i=0; i<100; i++) {
      rho = float(i)/100.0f;
      Vector3F vrho = vec0 + dv.scale(rho);
      float frho = calcIpolBspl3(vrho);
      fprintf(fp, "%d %f %f\n", i, rho, frho);
      MB_DPRINTLN("%d %f %f", i, rho, frho);
    }
    fclose(fp);
    return false;
  }
}

class DivideDraw
{
public:
  float m_r;
  int m_ipln;
  MapMesh3Renderer *m_ppar;
  Vector3F m_v0;
  float m_isolev;
  float m_eps;

  inline bool isNear(float f0, float f1) const {
    float del = qlib::abs(f0-f1);
    if (del<m_eps)
      return true;
    else
      return false;
  }

  Vector3F getVth(float th) const
  {
    if (m_ipln==0)
      return Vector3F(m_r*cos(th), m_r*sin(th), 0.0f);
    else if (m_ipln==1)
      return Vector3F(0.0f, m_r*cos(th), m_r*sin(th));
    else /*if (m_ipln==2)*/
      return Vector3F(m_r*sin(th), 0.0f, m_r*cos(th));
  }

  Vector3F getDvth(float th) const
  {
    if (m_ipln==0)
      return Vector3F(-m_r*sin(th), m_r*cos(th), 0.0f);
    else if (m_ipln==1)
      return Vector3F(0.0f, -m_r*sin(th), m_r*cos(th));
    else /*if (m_ipln==2)*/
      return Vector3F(m_r*cos(th), 0.0f, -m_r*sin(th));
    //return vth;
  }

  inline Vector3F getV(float th) const
  {
    return m_v0 + getVth(th);
  }

  inline float getF(float th) const
  {
    return m_ppar->calcIpolBspl3(getV(th)) - m_isolev;
  }

  /*
  bool findRootNrImpl1(float thL, float thM, float thU, float &rval)
  {
    float fth, dfth;
    Vector3F vth, dfdv, dvdth;
    
    // initial estimate: thM (=(thL+thU)/2)
    float th = thM;
    
    bool bConv = false;
    for (int i=0; i<10; ++i) {
      vth = getV(th);
      fth = m_ppar->calcIpolBspl3(vth)-m_isolev;
      if (isNear(fth, 0.0f)) {
        bConv = true;
        break;
      }
      
      dfdv = m_ppar->calcIpolBspl3Diff(vth);
      dvdth = getDvth(th);
      dfth = dvdth.dot( dfdv );
      
      th += -fth/dfth;
      
      if (th<thL || thU<th) {
        // th goes out of the range (thU,thL)
        //  --> root not found
        return false;
      }
    }
    
    rval = th;
    return bConv;
  }
   */
  
  bool findRootNrImpl2(float thM, float &rval, bool bnorm = true)
  {
    int i, j;
    float fth, dfth, mu;
    Vector3F vth, dfdv, dvdth;
    
    // initial estimate: thM
    float th = thM;
    
    bool bConv = false;
    for (i=0; i<10; ++i) {
      vth = getV(th);
      fth = m_ppar->calcIpolBspl3(vth)-m_isolev;
      if (isNear(fth, 0.0f)) {
        bConv = true;
        break;
      }
      
      dfdv = m_ppar->calcIpolBspl3Diff(vth);
      dvdth = getDvth(th);
      dfth = dvdth.dot( dfdv );
      
      mu = 1.0f;

      for (j=0; j<10; ++j) {
        float ftest1 = qlib::abs( getF(th - (fth/dfth) * mu) );
        float ftest2 = (1.0f-mu/4.0f) * qlib::abs(fth);
        if (ftest1<ftest2)
          break;
        mu = mu * 0.5f;
      }

      if (j == 10) {
        // cannot determine dumping factor mu
        //  --> does not use dumping
        mu = 1.0f;
      }

      th += -(fth/dfth) * mu;

      if (bnorm)
        th = fmodf(th, 2.0*M_PI);
    }
    
    rval = th;
    return bConv;
  }

  /// Find root restricted between thL and thU (by Newton/Bisec hybrid method)
  bool findRootNrRestrImpl1(float thL, float thU, float &rval)
  {
    float thM = (thL+thU)*0.5f;
    
    float th; // = 0.0f;
    bool res;
    
    for (int i=0; i<10; ++i) {
      res = findRootNrImpl2(thM, th, false);
      if (res) {
        //rval = getV(th);
        if (thL<=th && th<=thU) {
          rval = th;
          return true;
        }
        else {
          //MB_DPRINTLN("solution out of range --> retry");
        }
      }
      
      float fthL = getF(thL);
      float fthU = getF(thU);
      float fthM = getF(thM);
      
      if (fthL*fthM<0 && fthU*fthM>0) {
        // find between thL & thM
        thU = thM;
      }
      else if (fthL*fthM>0 && fthU*fthM<0) {
        // find between thM & thU
        thL = thM;
      }
      else {
        MB_DPRINTLN("solution is not between thL and thU --> ERROR!!");
        return false;
      }

      thM = (thL + thU)*0.5f;
    }
    
    // ERROR!! not converged
    return false;
  }

  /*
  bool findRootImpl1(float thL, float thU, float &rval)
  {
    float thM = (thL+thU)*0.5f;
    float fthL = getF(thL);
    float fthU = getF(thU);
    
    if (fthL * fthU>0.0)
      return false;
    
    float th; // = 0.0f;
    
    // root should exist between thL & thU
    
    for (int i=0; i<10; ++i) {
      if (findRootNrImpl1(thL, thM, thU, th)) {
        //rval = getV(th);
        rval = th;
        return true;
      }
      
      float fthM = getF(thM);
      
      if (fthL*fthM<0) {
        // find between thL & thM
        thU = thM;
      }
      else {
        // find between thM & thU
        thL = thM;
      }
      thM = (thL + thU)*0.5f;
    }
    
    // ERROR!! not converged
    return false;
  }
  */
  /*
  bool findRootImpl2(float &sol1, float &sol2)
  {
    const int ndiv = 8;

    int i;
    float th, thU, thL;
    float dth = M_PI*2.0/float(ndiv);

    std::vector<float> roots;
    
    for (i=0; i<ndiv; ++i) {
      thL = i*dth;
      thU = thL + dth;
      if (findRootImpl1(thL, thU, th)) {
        roots.push_back(th);
      }
    }

    if (roots.size()==2) {
      sol1 = roots[0];
      sol2 = roots[1];
      return true;
    }
    
    MB_DPRINTLN("%d root soln found.", roots.size());
    for (i=0; i<100; ++i) {
      th = i* (2.0*M_PI/100.0);
      MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
    }

    for (i=0; i<ndiv; ++i) {
      thL = i*dth;
      thU = thL + dth;
      if (findRootImpl1(thL, thU, th)) {
        //roots.push_back(th);
      }
    }

    return false;
  }*/

  //////////

  bool findPlusMinus(float sol1, float &del)
  {
    int i;
    
    del = 0.1;
    for (i=0; i<100; ++i) {
      if (getF(sol1-del) * getF(sol1+del) < 0.0f) {
        return true;
      }
      del *= 0.5f;
      // XXX ???
      if (del<m_eps)
        break;
    }

    // ERROR?? (or degenerated solution)
    MB_DPRINTLN("ERROR, thL/thU for root2 not found.");
    for (i=0; i<100; ++i) {
      float th = i* (2.0*M_PI/100.0);
      MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
    }
    
    return false;
  }

  bool findBothRoot(float &sol1, float &sol2)
  {
    int i;
    float th, thU, thL, rval;

    bool res;

    thL = 0.0f;
    thU = 2.0 * M_PI;
    th = (thL+thU) * 0.5f;
    res = findRootNrImpl2(th, rval);

    if (!res) {
      // ERROR??
      MB_DPRINTLN("ERROR, root1 not found.");
      for (i=0; i<100; ++i) {
        th = i* (2.0*M_PI/100.0);
        MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
      }
      
      th = (thL+thU) * 0.5f;
      findRootNrImpl2(th, rval);

      return false;
    }

    sol1 = rval;

    float del;
    if (!findPlusMinus(sol1, del)) {
      return false;
    }
    
    thU = sol1-del;
    thL = sol1+del - 2.0*M_PI;
    res = findRootNrRestrImpl1(thL, thU, rval);

    if (!res) {
      // ERROR??
      MB_DPRINTLN("ERROR, root2 not found.");
      for (i=0; i<100; ++i) {
        th = i* (2.0*M_PI/100.0);
        MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
      }
      
      res = findRootNrRestrImpl1(thU, thL, rval);
      return false;
    }

    sol2 = rval;
    return true;
  }
  

  bool findAnotherRoot(float sol1, float &sol2)
  {
    int i;
    float th, thU, thL, rval;

    bool res;

    float del;
    if (!findPlusMinus(sol1, del)) {
      return false;
    }

    thU = sol1-del;
    thL = sol1+del - 2.0*M_PI;
    res = findRootNrRestrImpl1(thL, thU, rval);

    if (!res) {
      // ERROR??
      MB_DPRINTLN("ERROR, root2 not found.");
      for (i=0; i<100; ++i) {
        th = i* (2.0*M_PI/100.0);
        MB_DPRINTLN("%d %f %f %f", i, th, qlib::toDegree(th), getF(th));
      }
      
      res = findRootNrRestrImpl1(thU, thL, rval);
      return false;
    }

    sol2 = rval;
    return true;
  }
};


void MapMesh3Renderer::divideDraw2(DisplayContext *pdl, const Vector3F &v0, const Vector3F &v1, const Vector3F &vm, int ipln)
{
  DivideDraw dd;

  dd.m_r = m_dArcMax;
  dd.m_ipln = ipln;
  dd.m_isolev = m_isolev;
  dd.m_ppar = this;
  dd.m_eps = FLT_EPSILON*100.0f;

  const int ndiv = 8;

  float sol1, sol2;
  float th, prev_th;
  Vector3F vi;

  std::vector<Vector3F> verts;

  dd.m_v0 = vm;
  if (!dd.findBothRoot(sol1, sol2)) {
    return;
  }

  if ( (dd.getV(sol1)-v1).length() > (dd.getV(sol2)-v1).length() )
    std::swap(sol1, sol2);

  prev_th = sol1;
  vi = dd.getV(prev_th);
  verts.push_back(vi);

  int ntry = int( (v0-v1).length()/m_dArcMax ) * 100;

  float fsol1, fsol2;
  bool bOK = false;
  for (int i=0; i<ntry; i++) {
    if ((vi-v1).length()<m_dArcMax) {
      bOK = true;
      break;
    }
    
    dd.m_v0 = vi;
    if (!dd.findAnotherRoot(prev_th-M_PI, fsol2)) {
      return;
    }
    prev_th = fsol2;
    vi = dd.getV(prev_th);
    verts.push_back(vi);
  }

  if (bOK) {
    Vector3F prev = v0;
    BOOST_FOREACH (const Vector3F &v, verts) {
      pdl->vertex(prev.x(), prev.y(), prev.z());
      pdl->vertex(v.x(), v.y(), v.z());
      prev = v;
    }
    pdl->vertex(prev.x(), prev.y(), prev.z());
    pdl->vertex(v1.x(), v1.y(), v1.z());
    return;
  }

  verts.clear();
  prev_th = sol2;
  vi = dd.getV(prev_th);
  verts.push_back(vi);
  bOK = false;

  for (int i=0; i<ntry; i++) {
    if ((vi-v1).length()<m_dArcMax) {
      bOK = true;
      break;
    }
    
    dd.m_v0 = vi;
    if (!dd.findAnotherRoot(prev_th-M_PI, fsol2)) {
      return;
    }
    prev_th = fsol2;
    vi = dd.getV(prev_th);
    verts.push_back(vi);
  }

  if (bOK) {
    Vector3F prev = v0;
    BOOST_FOREACH (const Vector3F &v, verts) {
      pdl->vertex(prev.x(), prev.y(), prev.z());
      pdl->vertex(v.x(), v.y(), v.z());
      prev = v;
    }
    pdl->vertex(prev.x(), prev.y(), prev.z());
    pdl->vertex(v1.x(), v1.y(), v1.z());
    return;
  }

  return;
}

void MapMesh3Renderer::divideAndDraw(DisplayContext *pdl, const Vector3F &v0, const Vector3F &v1, float isolev, int ipln)
{
  Vector3F pln;
  if (ipln==0)
    pln = Vector3F(0,0,1);
  else if (ipln==1)
    pln = Vector3F(1,0,0);
  else /*if (ipln==2)*/
    pln = Vector3F(0,1,0);

  float frho, dfrho;
  Vector3F vrho, dvrho, dvrho2;
  int ii;

  float xi = 0.5f;

  Vector3F dv = v1-v0;
  Vector3F vm = v0 + dv.scale(xi);
  Vector3F vn = dv.cross(pln);
  float rho = 0.0;
  float len = dv.length();

  bool bConv = false;
  for (ii=0; ii<10; ++ii) {
    vrho = vm + vn.scale(rho);

    if ((vrho-v0).length()>len ||
        (vrho-v1).length()>len) {
      // vrho does not converge to the local solution --> abort
      bConv = false;
      break;
    }

    frho = calcIpolBspl3(vrho);
    if (qlib::isNear4(frho, isolev)) {
      bConv = true;
      break;
    }

    dvrho2 = calcIpolBspl3Diff(vrho);
    dfrho = vn.dot( dvrho2 );
    rho += -(frho-isolev)/dfrho;
  }

  if (bConv) {
    divideDraw2(pdl, v0, v1, vrho, ipln);
    /*
    len = (v0-vrho).length();
    if (len>m_dArcMax)
      divideAndDraw(pdl, v0, vrho, isolev, pln);
    else {
      pdl->vertex(v0.x(), v0.y(), v0.z());
      pdl->vertex(vrho.x(), vrho.y(), vrho.z());
    }
    
    len = (v1-vrho).length();
    if (len>m_dArcMax)
      divideAndDraw(pdl, vrho, v1, isolev, pln);
    else {
      pdl->vertex(vrho.x(), vrho.y(), vrho.z());
      pdl->vertex(v1.x(), v1.y(), v1.z());
    }*/
  }
  else {

    MB_DPRINTLN("XXX invalid %f", rho);
    FILE *fp = fopen("tmp.txt", "w");
    for (int i=0; i<100; i++) {
      rho = float(i)/100.0f;
      Vector3F vrho = vm + vn.scale(rho);
      float frho = calcIpolBspl3(vrho) - isolev;
      fprintf(fp, "%d %f %f\n", i, rho, frho);
      MB_DPRINTLN("%d %f %f", i, rho, frho);
    }
    fclose(fp);

    pdl->vertex(v0.x(), v0.y(), v0.z());
    pdl->vertex(v1.x(), v1.y(), v1.z());
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
      // TO DO: XXX implementation
      return;
    }

    int naa = na/2+1;

    CompArray recipAry(naa, nb, nc);
    m_pBsplCoeff = MB_NEW FloatArray(na, nb, nc);

    // conv hkl list to recpi array
    pHKLList->convToArrayHerm(recipAry, 0.0, -1.0);

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
  }

  pdl->pushMatrix();
  setupXform(pdl, pMap, pXtal, false);

  float val[4];
  Vector3F vec[4];
  float isolev = float( pMap->getRmsdDensity() * getSigLevel() );
  m_isolev = isolev;

  pdl->color(getColor());
  pdl->startLines();

  // plane normal vector;
  Vector3F pln;

  int ii;
  
  for (k=0; k<nsec-1; k++)
    for (j=0; j<nrow-1; j++)
      for (i=0; i<ncol-1; i++){
        for (int iplane = 0; iplane<3; ++iplane) {
        //for (int iplane = 2; iplane<3; ++iplane) {
          if (iplane==0)
            pln = Vector3F(0,0,1);
          else if (iplane==1)
            pln = Vector3F(1,0,0);
          else
            pln = Vector3F(0,1,0);
          
          quint8 flag = 0U;
          quint8 mask = 1U;
          const int ipl4 = iplane*4;

          for (ii=0; ii<4; ++ii) {
            
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

          if (flag==0||flag==15) {
            // no intersections
            continue;
          }

            /*
          if (flag==5 || flag==10) {
            //0101 == 0100 {1,2} + 0001 {0,3};
            //1010 == 1000 {2,3} + 0010 {0,1};

            LOG_DPRINTLN("MapMesh> Wanring: section flag %d not implemented!!", flag);
            continue;
          }*/
        
          for (ii=0; ii<2; ii++) {
            int iv0 = m_triTab2[flag][ii*2+0];
            int iv1 = m_triTab2[flag][ii*2+1];
            if (iv0<0)
              break;
          

            Vector3F v0, v1;
            if (getXValFNr(val[iv0], vec[iv0], val[(iv0+1)%4], vec[(iv0+1)%4], isolev, v0) &&
                getXValFNr(val[iv1], vec[iv1], val[(iv1+1)%4], vec[(iv1+1)%4], isolev, v1) ){
              if (m_dArcMax>0.0f) {
                //divideAndDraw(pdl, v0, v1, isolev, pln);
                divideDraw2(pdl, v0, v1, iplane);
              }
              else {
                pdl->vertex(v0.x(), v0.y(), v0.z());
                pdl->vertex(v1.x(), v1.y(), v1.z());
              }
            }
            else {
              // ERROR!! Newton method does not converge
              v0 = getXValF(val[iv0], vec[iv0], val[(iv0+1)%4], vec[(iv0+1)%4], isolev);
              v1 = getXValF(val[iv1], vec[iv1], val[(iv1+1)%4], vec[(iv1+1)%4], isolev);
              pdl->vertex(v0.x(), v0.y(), v0.z());
              pdl->vertex(v1.x(), v1.y(), v1.z());
            }
          }
        }
      }

  pdl->end();

  pdl->popMatrix();
}


