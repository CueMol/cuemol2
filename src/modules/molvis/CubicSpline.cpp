// -*-Mode: C++;-*-
//
//  Natural (cubic) spline interpolator class
//
//  $Id: CubicSpline.cpp,v 1.2 2009/09/23 15:27:48 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "CubicSpline.hpp"

using namespace molvis;

CubicSpline::CubicSpline()
     : m_nPoints(0)
{
}

CubicSpline::~CubicSpline()
{
  // cleanup();
}

/// re-initialization
void CubicSpline::cleanup()
{
  m_veclist.clear();
  m_coefs.clear();
  m_nPoints = 0;
}

/// generate spline coeffs
void CubicSpline::generate()
{
  int i;
  m_nPoints = m_veclist.size();

  if (m_nPoints==0)
    return; // there is no interp points!!

  // allocate coefficient table
  /*
  MB_ASSERT(m_pCoeff0==NULL);
  m_pCoeff0 = MB_NEW Vector4D[m_nPoints];
  MB_ASSERT(m_pCoeff1==NULL);
  m_pCoeff1 = MB_NEW Vector4D[m_nPoints];
  MB_ASSERT(m_pCoeff2==NULL);
  m_pCoeff2 = MB_NEW Vector4D[m_nPoints];
  MB_ASSERT(m_pCoeff3==NULL);
  m_pCoeff3 = MB_NEW Vector4D[m_nPoints];
*/
  m_coefs.resize(m_nPoints * 3 * 4);
  
  if (m_nPoints==1) {
    // Degenerated case (point)
    // cannot calculate spline, return constant polynom
    const Vector3F &p0 = m_veclist[0];

    setCoeff(3, 0, Vector3F());
    setCoeff(2, 0, Vector3F());
    setCoeff(1, 0, Vector3F());
    setCoeff(0, 0, p0);

    //m_pCoeff3[0] = Vector3F();
    //m_pCoeff2[0] = Vector3F();
    //m_pCoeff1[0] = Vector3F();
    //m_pCoeff0[0] = p0;
    return ;
  }
  else if (m_nPoints==2) {
    // Degenerated case (line)
    const Vector3F &p0 = m_veclist[0];
    const Vector3F &p1 = m_veclist[1];

    setCoeff(3, 0, Vector3F());
    setCoeff(2, 0, Vector3F());
    setCoeff(1, 0, p1-p0);
    setCoeff(0, 0, p0);

    //m_pCoeff3[0] = Vector3F();
    //m_pCoeff2[0] = Vector3F();
    //m_pCoeff1[0] = p1-p0;
    //m_pCoeff0[0] = p0;
    return ;
  }

  ///////////////////////////////////////////////////
  // calculate natural spline coeffs

  int intNo = m_nPoints - 1;  // number of intervals
  int equNo = intNo - 1;  // number of equations

  // interval sizes
  m_h.resize(intNo);
  m_ih.resize(intNo);
  //double *h = MB_NEW double[intNo];
  //double *ih = MB_NEW double[intNo];

  // diagonal of tridiagonal matrix
  m_a.resize(equNo);
  //double *a = MB_NEW double[equNo];

  // constant part of linear equations
  m_dvec.resize(equNo);
  //Vector3F *dvec = MB_NEW Vector3F[equNo];
  
  // LR decomposition of tridiagonal matrix
  m_m.resize(equNo);
  m_l.resize(equNo-1);
  //double *m = MB_NEW double[equNo];
  //double *l = MB_NEW double[equNo - 1];

  // ??
  m_xvec.resize(equNo);
  m_yvec.resize(equNo);
  //Vector3F *yvec = MB_NEW Vector3F[equNo];
  //Vector3F *xvec = MB_NEW Vector3F[equNo];

  Vector3F d0, d1;

  const VecArray &invec = m_veclist;
  
  // calculate interval sizes as distance between points
  for (i = 0; i < intNo; i++) {
    m_h[i] = (invec[i]-invec[i+1]).length();
    m_ih[i] = 1.0 / m_h[i];
  }

  // calculate diagonal of tridiagonal matrix
  for (i = 0; i < equNo; i++)
    m_a[i] = 2.0 * (m_h[i] + m_h[i + 1]);

  // calculate LR decomposition of tridiagonal matrix
  m_m[0] = m_a[0];
  for (i = 0; i < equNo - 1; i++) {
    m_l[i] = m_h[i + 1] / m_m[i];
    m_m[i + 1] = m_a[i + 1] - m_l[i] * m_h[i + 1];
  }

  // interpolation is done separately for all 3 coordinates

  for (i = 0; i < equNo; i++) {
    Vector3F dif1 = invec[i+1] - invec[i];
    Vector3F dif2 = invec[i+2] - invec[i+1];
    m_dvec[i] = dif1.scale(m_ih[i]) - dif2.scale(m_ih[i+1]);
    //m_dvec[i] = m_dvec[i].scale(6.0);
    m_dvec[i].scaleSelf(6.0);
  }

  // forward elimination
  m_yvec[0] = m_dvec[0];
  for (i = 1; i < equNo; i++)
    m_yvec[i] = m_dvec[i] - m_yvec[i-1].scale(m_l[i-1]);

  // back substitution
  m_xvec[equNo-1] = m_yvec[equNo-1].scale(-1.0/m_m[equNo-1]);
  for (i = equNo - 2; i >= 0; i--) {
    m_xvec[i] = m_yvec[i] + m_xvec[i+1].scale(m_h[i+1]);
    m_xvec[i] = m_xvec[i].scale(-1.0/m_m[i]);
  }
  
  // calculate spline points
  for (i = 0; i < intNo; i++) {
    // calculate polynom coefficients
    if (i == 0)
      d0 = Vector3F(); // zero vector
    else
      d0 = m_xvec[i-1];
    
    if (i == intNo-1)
      d1 = Vector3F(); // zero vector
    else
      d1 = m_xvec[i];
    
    double hsq = m_h[i]*m_h[i];
    setCoeff(3, i, (d1 - d0).scale(hsq/6.0));
    setCoeff(2, i, d0.scale(0.5*hsq));
    setCoeff(1, i, invec[i+1] - invec[i] - (d1 + d0.scale(2.0)).scale(hsq/6.0));
    setCoeff(0, i, invec[i]);
    
    //m_pCoeff3[i] = (d1 - d0).scale(hsq/6.0);
    //m_pCoeff2[i] = d0.scale(0.5*hsq);
    //m_pCoeff1[i] = invec[i+1] - invec[i] - (d1 + d0.scale(2.0)).scale(hsq/6.0);
    //m_pCoeff0[i] = invec[i];
  }

  return;
}

/// perform interpolation
void CubicSpline::interpolate(double par, Vector4D *vec,
                              Vector4D *dvec /*= NULL*/,
                              Vector4D *ddvec /*= NULL*/)
{
  Vector3F fvec, fdvec, fddvec;
  interpolate(par, &fvec,
              (dvec==NULL)?(NULL):(&fdvec),
              (ddvec==NULL)?(NULL):(&fddvec));
  
  vec->x() = fvec.x();
  vec->y() = fvec.y();
  vec->z() = fvec.z();
  vec->w() = 0.0;

  if (dvec != NULL) {
    dvec->x() = fdvec.x();
    dvec->y() = fdvec.y();
    dvec->z() = fdvec.z();
    dvec->w() = 0.0;
  }

  if (ddvec != NULL) {
    ddvec->x() = fddvec.x();
    ddvec->y() = fddvec.y();
    ddvec->z() = fddvec.z();
    ddvec->w() = 0.0;
  }
}

/// perform interpolation
void CubicSpline::interpolate(double par, Vector3F *vec,
                              Vector3F *dvec /*= NULL*/,
                              Vector3F *ddvec /*= NULL*/)
{
  // check parameter value f
  int ncoeff = (int)::floor(par);
  if (ncoeff<0)
    ncoeff = 0;
  if (ncoeff>=(m_nPoints-1))
    ncoeff = m_nPoints-2;

  const Vector3F coeff0 = getCoeff(0, ncoeff);
  const Vector3F coeff1 = getCoeff(1, ncoeff);
  const Vector3F coeff2 = getCoeff(2, ncoeff);
  const Vector3F coeff3 = getCoeff(3, ncoeff);

  float f = par - float(ncoeff);

  Vector3F tmp;
  tmp = coeff3.scale(f) + coeff2;
  tmp = tmp.scale(f) + coeff1;
  tmp = tmp.scale(f) + coeff0;
  *vec = tmp;


  if (dvec != NULL) {
    // calculate tangential vector
    tmp = coeff3.scale(3.0*f) + coeff2.scale(2.0);
    tmp = tmp.scale(f) + coeff1;
    *dvec = tmp;
    
    //dvec->x() = tmp.x();
    //dvec->y() = tmp.y();
    //dvec->z() = tmp.z();
    //dvec->w() = 0.0;
  }

  if (ddvec != NULL) {
    // calculate curvature vector
    tmp = coeff3.scale(6.0*f) + coeff2.scale(2.0);
    *ddvec = tmp;
    
    //ddvec->x() = tmp.x();
    //ddvec->y() = tmp.y();
    //ddvec->z() = tmp.z();
    //ddvec->w() = 0.0;
  }

  return;
}



