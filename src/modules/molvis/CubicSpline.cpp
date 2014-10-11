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
     : m_pCoeff0(NULL), m_pCoeff1(NULL), m_pCoeff2(NULL), m_pCoeff3(NULL)
{
}

CubicSpline::~CubicSpline()
{
  cleanup();
}

/** re-initialization */
void CubicSpline::cleanup()
{
  // if (m_veclist.size()>0)
  // m_veclist.erase(m_veclist.begin(), m_veclist.end());

  if (m_pCoeff0!=NULL)
    delete [] m_pCoeff0;
  if (m_pCoeff1!=NULL)
    delete [] m_pCoeff1;
  if (m_pCoeff2!=NULL)
    delete [] m_pCoeff2;
  if (m_pCoeff3!=NULL)
    delete [] m_pCoeff3;
  m_pCoeff0 = m_pCoeff1 = m_pCoeff2 = m_pCoeff3 = NULL;

  m_nPoints = 0;
}

/** generate spline coeffs */
bool CubicSpline::generate()
{
  int i;
  m_nPoints = m_veclist.size();

  if (m_nPoints==0)
    return false; // there is no interp points!!

  // allocate coefficient table
  MB_ASSERT(m_pCoeff0==NULL);
  m_pCoeff0 = MB_NEW Vector4D[m_nPoints];
  MB_ASSERT(m_pCoeff1==NULL);
  m_pCoeff1 = MB_NEW Vector4D[m_nPoints];
  MB_ASSERT(m_pCoeff2==NULL);
  m_pCoeff2 = MB_NEW Vector4D[m_nPoints];
  MB_ASSERT(m_pCoeff3==NULL);
  m_pCoeff3 = MB_NEW Vector4D[m_nPoints];

  if (m_nPoints==1) {
    // Degenerated case (point)
    // cannot calculate spline, return constant polynom
    const Vector4D &p0 = m_veclist[0];

    m_pCoeff3[0] = Vector4D();
    m_pCoeff2[0] = Vector4D();
    m_pCoeff1[0] = Vector4D();
    m_pCoeff0[0] = p0;
    return true;
  }
  else if (m_nPoints==2) {
    // Degenerated case (line)
    const Vector4D &p0 = m_veclist[0];
    const Vector4D &p1 = m_veclist[1];

    m_pCoeff3[0] = Vector4D();
    m_pCoeff2[0] = Vector4D();
    m_pCoeff1[0] = p1-p0;
    m_pCoeff0[0] = p0;
    return true;
  }

  ///////////////////////////////////////////////////
  // calculate natural spline coeffs

  int intNo = m_nPoints - 1;  // number of intervals
  int equNo = intNo - 1;  // number of equations

  // interval sizes
  double *h = MB_NEW double[intNo];
  double *ih = MB_NEW double[intNo];

  // diagonal of tridiagonal matrix
  double *a = MB_NEW double[equNo];
  // constant part of linear equations
  Vector4D *dvec = MB_NEW Vector4D[equNo];
  
  // LR decomposition of tridiagonal matrix
  double *m = MB_NEW double[equNo];
  double *l = MB_NEW double[equNo - 1];
  // ??
  Vector4D *yvec = MB_NEW Vector4D[equNo];
  Vector4D *xvec = MB_NEW Vector4D[equNo];

  Vector4D d0, d1;

  const std::vector<Vector4D> &invec = m_veclist;
  // Vector4D *invec = MB_NEW Vector4D[m_nPoints];
  // for (i=0; i<m_nPoints; i++) {
  // invec[i] = m_veclist[i];
  // }
  
  // calculate interval sizes as distance between points
  for (i = 0; i < intNo; i++) {
    //h[i] = Vec3DiffAbs(invec[i], invec[i + 1]);
    h[i] = (invec[i]-invec[i+1]).length();
    ih[i] = 1.0 / h[i];
  }

  // calculate diagonal of tridiagonal matrix
  for (i = 0; i < equNo; i++)
    a[i] = 2.0 * (h[i] + h[i + 1]);

  // calculate LR decomposition of tridiagonal matrix
  m[0] = a[0];
  for (i = 0; i < equNo - 1; i++) {
    l[i] = h[i + 1] / m[i];
    m[i + 1] = a[i + 1] - l[i] * h[i + 1];
  }

  // interpolation is done separately for all 3 coordinates

  for (i = 0; i < equNo; i++) {
    // dvec[i] = 6.0*(ih[i]*(invec[i+1] - invec[i]) - ih[i+1]*(invec[i+2] - invec[i+1]));
    Vector4D dif1 = invec[i+1] - invec[i];
    Vector4D dif2 = invec[i+2] - invec[i+1];
    dvec[i] = dif1.scale(ih[i]) - dif2.scale(ih[i+1]);
    dvec[i] = dvec[i].scale(6.0);
  }

  // forward elimination
  yvec[0] = dvec[0];
  for (i = 1; i < equNo; i++)
    yvec[i] = dvec[i] - yvec[i-1].scale(l[i-1]);

  // back substitution
  xvec[equNo-1] = yvec[equNo-1].scale(-1.0/m[equNo-1]);
  for (i = equNo - 2; i >= 0; i--) {
    xvec[i] = yvec[i] + xvec[i+1].scale(h[i+1]);
    xvec[i] = xvec[i].scale(-1.0/m[i]);
  }
  
  // calculate spline points
  for (i = 0; i < intNo; i++) {
    // calculate polynom coefficients
    if (i == 0)
      d0 = Vector4D(); // zero vector
    else
      d0 = xvec[i-1];
    
    if (i == intNo-1)
      d1 = Vector4D(); // zero vector
    else
      d1 = xvec[i];
    
    double hsq = h[i]*h[i];
    m_pCoeff3[i] = (d1 - d0).scale(hsq/6.0);
    m_pCoeff2[i] = d0.scale(0.5*hsq);
    m_pCoeff1[i] = invec[i+1] - invec[i] - (d1 + d0.scale(2.0)).scale(hsq/6.0);
    m_pCoeff0[i] = invec[i];

  }

  delete [] h;
  delete [] ih;
  delete [] a;
  delete [] dvec;
  delete [] m;
  delete [] l;
  delete [] yvec;
  delete [] xvec;

  // delete [] invec;

  // m_veclist.clear();
  return true;
}

/** perform interpolation */
bool CubicSpline::interpolate(double par, Vector4D *vec,
                              Vector4D *dvec /*= NULL*/,
                              Vector4D *ddvec /*= NULL*/)
{
  // check parameter value f
  int ncoeff = (int)::floor(par);
  if (ncoeff<0)
    ncoeff = 0;
  if (ncoeff>=(m_nPoints-1))
    ncoeff = m_nPoints-2;

  const Vector4D &coeff0 = m_pCoeff0[ncoeff];
  const Vector4D &coeff1 = m_pCoeff1[ncoeff];
  const Vector4D &coeff2 = m_pCoeff2[ncoeff];
  const Vector4D &coeff3 = m_pCoeff3[ncoeff];

  double f = par - (double)ncoeff;

  Vector4D tmp;
  tmp = coeff3.scale(f) + coeff2;
  tmp = tmp.scale(f) + coeff1;
  tmp = tmp.scale(f) + coeff0;
  *vec = tmp;

  if (dvec != NULL) {
    // calculate tangential vector
    tmp = coeff3.scale(3.0*f) + coeff2.scale(2.0);
    tmp = tmp.scale(f) + coeff1;
    *dvec = tmp;
  }

  if (ddvec != NULL) {
    // calculate curvature vector
    tmp = coeff3.scale(6.0*f) + coeff2.scale(2.0);
    *ddvec = tmp;
  }
  return true;
}



