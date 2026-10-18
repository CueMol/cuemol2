// -*-Mode: C++;-*-
//
//  Smooth spline interpolator class
//

#include <common.h>
#include <modules/molvis/molvis.hpp>

#include "SmoothSpline.hpp"
#include "interpolation.hpp"
#include "ReinschSpline.hpp"

using namespace molvis;

namespace {

  /// Power-basis coefficients c[4*i+k] (k-th power of t - x_i) of the fitted
  /// spline in the node layout of the alglib fit: n+2 nodes x_i = t0-1+i,
  /// i.e. the n data knots plus one linear extension segment at each end.
  void calcReinschCoeffs(int n, const double *g, const double *gam, double *c)
  {
    // interior segments (unit spacing)
    for (int i=0; i<n-1; ++i) {
      double *ci = c + 4*(i+1);
      ci[0] = g[i];
      ci[1] = g[i+1] - g[i] - (2.0*gam[i] + gam[i+1])/6.0;
      ci[2] = 0.5*gam[i];
      ci[3] = (gam[i+1] - gam[i])/6.0;
    }

    // linear extensions with the end slopes
    const double d0 = c[4*1+1];
    const double dn = g[n-1] - g[n-2] + (gam[n-2] + 2.0*gam[n-1])/6.0;
    c[0] = g[0] - d0;
    c[1] = d0;
    c[2] = c[3] = 0.0;
    double *ce = c + 4*n;
    ce[0] = g[n-1];
    ce[1] = dn;
    ce[2] = ce[3] = 0.0;
  }

}

SmoothSpline1D::SmoothSpline1D()
  : m_nPoints(0)
{
  m_rho = 3.0;
}

SmoothSpline1D::~SmoothSpline1D()
{
  cleanup();
}

/** re-initialization */
void SmoothSpline1D::cleanup()
{
  m_vecx.clear();
  m_coeff0.clear();
  m_coeff1.clear();
  m_coeff2.clear();
  m_coeff3.clear();

  m_nPoints = 0;
}

/** generate spline coeffs */
bool SmoothSpline1D::generate()
{
  return generateImpl(true);
}

bool SmoothSpline1D::generateAlglib()
{
  return generateImpl(false);
}

bool SmoothSpline1D::generateImpl(bool bReinsch)
{
  // drop the coefficients of a previous generate() so that a failure
  // below leaves interpolate() with nothing to read
  cleanup();
  m_nPoints = m_veclist.size();

  if (m_nPoints==0)
    return false; // there is no points to interpolate!!

  if (m_nPoints<=2)
    return false; // there is no points to interpolate!!

  if (!bReinsch || !fitReinsch())
    fitAlglib();

  return true;
}

bool SmoothSpline1D::fitReinsch()
{
  const int n = m_nPoints;
  // the alglib fit uses max(10, n) basis functions; below 10 points the
  // knots are not on the data points, which the Reinsch path does not cover
  if (n<10)
    return false;

  ReinschSpline rs;
  if (!rs.factor(n, NULL, m_rho))
    return false;

  std::vector<double> g(n), gam(n), c(4*(n+1));
  rs.solve(&m_veclist[0], 1, &g[0], &gam[0]);
  calcReinschCoeffs(n, &g[0], &gam[0], &c[0]);

  m_vecx.resize(n+2);
  m_coeff0.resize(n+1);
  m_coeff1.resize(n+1);
  m_coeff2.resize(n+1);
  m_coeff3.resize(n+1);
  for (int i=0; i<n+2; ++i)
    m_vecx[i] = double(i-1);
  for (int i=0; i<n+1; ++i) {
    m_coeff0[i] = c[4*i+0];
    m_coeff1[i] = c[4*i+1];
    m_coeff2[i] = c[4*i+2];
    m_coeff3[i] = c[4*i+3];
  }

  return true;
}

void SmoothSpline1D::fitAlglib()
{
  ///////////////////////////////////////////////////
  // calculate natural spline coeffs

  const int nsize = m_nPoints;
  alglib::real_1d_array t, x;

  t.setlength(nsize);
  x.setlength(nsize);

  for (int i=0; i<nsize; ++i) {
    t[i] = i;
    x[i] = m_veclist[i];
  }

  double rho;
  alglib::ae_int_t info;
  alglib::spline1dinterpolant sx;
  alglib::spline1dfitreport rep;

  //
  // Fit with VERY small amount of smoothing (rho = -5.0)
  // and large number of basis functions (M=50).
  //
  // With such small regularization penalized spline almost fully reproduces function values
  //
  //rho = -5.0;
  rho = m_rho;
  int mseg = nsize;
  if (mseg<10)
    mseg = 10;

  alglib::spline1dfitpenalized(t, x, mseg, rho, info, sx, rep);

  alglib_impl::spline1dinterpolant *psx = sx.c_ptr();
  const int nnodes = psx->n;
  m_vecx.resize(nnodes);
  m_coeff0.resize(nnodes-1);
  m_coeff1.resize(nnodes-1);
  m_coeff2.resize(nnodes-1);
  m_coeff3.resize(nnodes-1);
  
  for (int i=0; i<nnodes; ++i) {
    m_vecx[i] = psx->x.ptr.p_double[i];
    if (i<nnodes-1) {
      m_coeff0[i] = psx->c.ptr.p_double[4*i+0];
      m_coeff1[i] = psx->c.ptr.p_double[4*i+1];
      m_coeff2[i] = psx->c.ptr.p_double[4*i+2];
      m_coeff3[i] = psx->c.ptr.p_double[4*i+3];
    }
  }
}

/** perform interpolation */
bool SmoothSpline1D::interpolate(double par, double *vec,
                              double *dvec /*= NULL*/,
                              double *ddvec /*= NULL*/)
{
  // no coefficients: generate() has not run or rejected the points
  if (m_vecx.size()<2 || m_coeff0.empty())
    return false;

  int l = 0;
  int r = m_vecx.size()-2+1;
  int m;

  // Perform binary search in  [ x[0], ..., x[n-2] ] (x[n-1] is not included)
  while (l!=r-1) {
    m = (l+r)/2;
    if( m_vecx[m]>=par ) {
      r = m;
    }
    else {
      l = m;
    }
  }

  double f = par - m_vecx[l];

  /*
  // check parameter value f
  int ncoeff = (int)::floor(par);
  if (ncoeff<0)
    ncoeff = 0;
  if (ncoeff>=(m_nPoints-1))
    ncoeff = m_nPoints-2;
    */
  
  double coeff0 = m_coeff0[l];
  double coeff1 = m_coeff1[l];
  double coeff2 = m_coeff2[l];
  double coeff3 = m_coeff3[l];

//  double f = par - (double)ncoeff;

  double tmp;
  tmp = coeff3*f + coeff2;
  tmp = tmp*f + coeff1;
  tmp = tmp*f + coeff0;
  *vec = tmp;

  if (dvec != NULL) {
    // calculate tangential vector
    tmp = coeff3*(3.0*f) + coeff2*(2.0);
    tmp = tmp*(f) + coeff1;
    *dvec = tmp;
  }

  if (ddvec != NULL) {
    // calculate curvature vector
    tmp = coeff3*(6.0*f) + coeff2*(2.0);
    *ddvec = tmp;
  }
  return true;
}

//////////////////////////////////////////////////////////////

SmoothSpline::SmoothSpline()
{
  m_rho = 3.0;
  m_bUseWgt = false;
  m_bFixStart = false;
  m_bFixEnd = false;
  m_nStart = 0;
}

SmoothSpline::~SmoothSpline()
{
  cleanup();
}

/** re-initialization */
void SmoothSpline::cleanup()
{
  m_vecx.clear();
  m_coeff0.clear();
  m_coeff1.clear();
  m_coeff2.clear();
  m_coeff3.clear();

  m_nPoints = 0;
  m_nStart = 0;
}

/** generate spline coeffs */
bool SmoothSpline::generate()
{
  return generateImpl(true);
}

bool SmoothSpline::generateAlglib()
{
  return generateImpl(false);
}

bool SmoothSpline::generateImpl(bool bReinsch)
{
  m_nPoints = m_veclist.size();

  if (m_nPoints==0)
    return false; // there is no points to interpolate!!

  if (m_nPoints<2)
    return false; // there is no points to interpolate!!

  if (!bReinsch || !fitReinsch())
    fitAlglib();

  const int nsize = m_nPoints;
  const int nnodes = m_vecx.size();

  if (m_bFixStart) {
    /*
    MB_DPRINTLN("FIXTERM---");
    MB_DPRINTLN("a0: %f", m_coeff0[1].x());
    MB_DPRINTLN("b0: %f", m_coeff1[1].x());
    MB_DPRINTLN("c0: %f", m_coeff2[1].x());
    MB_DPRINTLN("d0: %f", m_coeff3[1].x());
    MB_DPRINTLN("y0: %f", m_veclist[0].x());
    MB_DPRINTLN("d0: %f", m_vStartD1.x());
     */

    const Vector4D &a1 = m_veclist[0];
    // double scl_dot = m_coeff1[1].length(); //qlib::max(0.1, m_vStartD1.dot(m_coeff1[1]));
    // Vector4D b1 = m_vStartD1.scale( scl_dot );

    rewriteCoeff(1, a1);
    //rewriteCoeff(1, a1, b1);
  }

  if (m_bFixEnd) {
    const Vector4D &a1 = m_veclist[nsize-1];
    // double scl_dot = m_coeff1[nnodes-2].length(); //qlib::max(0.1, m_vEndD1.dot(m_coeff1[nnodes-2]));
    // Vector4D b1 = m_vEndD1.scale( scl_dot );

    rewriteCoeff(nnodes-2, a1);
  }

  return true;
}

bool SmoothSpline::fitReinsch()
{
  const int n = m_nPoints;
  // the alglib fit uses max(4, n) basis functions; below 4 points the
  // knots are not on the data points, which the Reinsch path does not cover
  if (n<4)
    return false;

  std::vector<double> wgt;
  if (m_bUseWgt) {
    wgt.resize(n);
    for (int i=0; i<n; ++i)
      wgt[i] = m_veclist[i].w();
  }

  ReinschSpline rs;
  if (!rs.factor(n, m_bUseWgt ? &wgt[0] : NULL, m_rho))
    return false;

  // y: xyz interleaved
  std::vector<double> y(3*n);
  for (int i=0; i<n; ++i) {
    const Vector4D &p = m_veclist[i];
    y[3*i+0] = p.x();
    y[3*i+1] = p.y();
    y[3*i+2] = p.z();
  }

  std::vector<double> g(n), gam(n), c[3];
  for (int k=0; k<3; ++k) {
    c[k].resize(4*(n+1));
    rs.solve(&y[k], 3, &g[0], &gam[0]);
    calcReinschCoeffs(n, &g[0], &gam[0], &c[k][0]);
  }

  m_vecx.resize(n+2);
  m_coeff0.resize(n+1);
  m_coeff1.resize(n+1);
  m_coeff2.resize(n+1);
  m_coeff3.resize(n+1);
  for (int i=0; i<n+2; ++i)
    m_vecx[i] = double(i-1 + m_nStart);
  for (int i=0; i<n+1; ++i) {
    m_coeff0[i] = Vector4D(c[0][4*i+0], c[1][4*i+0], c[2][4*i+0]);
    m_coeff1[i] = Vector4D(c[0][4*i+1], c[1][4*i+1], c[2][4*i+1]);
    m_coeff2[i] = Vector4D(c[0][4*i+2], c[1][4*i+2], c[2][4*i+2]);
    m_coeff3[i] = Vector4D(c[0][4*i+3], c[1][4*i+3], c[2][4*i+3]);
  }

  return true;
}

void SmoothSpline::fitAlglib()
{
  ///////////////////////////////////////////////////
  // calculate natural spline coeffs

  const int nsize = m_nPoints;
  alglib::real_1d_array t, x, y, z, wgt;

  t.setlength(nsize);
  x.setlength(nsize);
  y.setlength(nsize);
  z.setlength(nsize);

  if (m_bUseWgt)
    wgt.setlength(nsize);

  for (int i=0; i<nsize; ++i) {
    t[i] = i + m_nStart;
    const Vector4D &p = m_veclist[i];
    x[i] = p.x();
    y[i] = p.y();
    z[i] = p.z();
  }

  if (m_bUseWgt)
    for (int i=0; i<nsize; ++i)
      wgt[i] = m_veclist[i].w();

  double rho;
  alglib::ae_int_t info;
  alglib::spline1dinterpolant sx, sy, sz;
  alglib::spline1dfitreport rep;

  //
  // Fit with VERY small amount of smoothing (rho = -5.0)
  // and large number of basis functions (M=50).
  //
  // With such small regularization penalized spline almost fully reproduces function values
  //
  rho = m_rho;
  int mseg = qlib::max(4, nsize);

  if (m_bUseWgt) {
    alglib::spline1dfitpenalizedw(t, x, wgt, mseg, rho, info, sx, rep);
    alglib::spline1dfitpenalizedw(t, y, wgt, mseg, rho, info, sy, rep);
    alglib::spline1dfitpenalizedw(t, z, wgt, mseg, rho, info, sz, rep);
  }
  else {
    alglib::spline1dfitpenalized(t, x, mseg, rho, info, sx, rep);
    alglib::spline1dfitpenalized(t, y, mseg, rho, info, sy, rep);
    alglib::spline1dfitpenalized(t, z, mseg, rho, info, sz, rep);
  }
  //fprintf(stderr, "X info: %d\n", int(info)); // EXPECTED: 1
  //fprintf(stderr, "Y info: %d\n", int(info)); // EXPECTED: 1
  //fprintf(stderr, "Z info: %d\n", int(info)); // EXPECTED: 1

  alglib_impl::spline1dinterpolant *psx = sx.c_ptr();
  alglib_impl::spline1dinterpolant *psy = sy.c_ptr();
  alglib_impl::spline1dinterpolant *psz = sz.c_ptr();
  const int nnodes = psx->n;
  m_vecx.resize(nnodes);
  m_coeff0.resize(nnodes-1);
  m_coeff1.resize(nnodes-1);
  m_coeff2.resize(nnodes-1);
  m_coeff3.resize(nnodes-1);
  
  for (int i=0; i<nnodes; ++i) {
    m_vecx[i] = psx->x.ptr.p_double[i];
    if (i<nnodes-1) {
      m_coeff0[i] = Vector4D(psx->c.ptr.p_double[4*i+0],
                             psy->c.ptr.p_double[4*i+0],
                             psz->c.ptr.p_double[4*i+0]);
      m_coeff1[i] = Vector4D(psx->c.ptr.p_double[4*i+1],
                             psy->c.ptr.p_double[4*i+1],
                             psz->c.ptr.p_double[4*i+1]);
      m_coeff2[i] = Vector4D(psx->c.ptr.p_double[4*i+2],
                             psy->c.ptr.p_double[4*i+2],
                             psz->c.ptr.p_double[4*i+2]);
      m_coeff3[i] = Vector4D(psx->c.ptr.p_double[4*i+3],
                             psy->c.ptr.p_double[4*i+3],
                             psz->c.ptr.p_double[4*i+3]);
    }
  }
}

//void SmoothSpline::rewriteCoeff(int i, const Vector4D &ai, const Vector4D &bi)
void SmoothSpline::rewriteCoeff(int i, const Vector4D &ai)
{
  //const Vector4D &b0 = m_coeff1[i-1];
  //Vector4D b2, a2;
  //if (i+1<m_coeff1.size()) {
  //a2 = m_coeff0[i+1];
  //b2 = m_coeff1[i+1];
  //}
  
  //Vector4D ydel = a2 - ai;
  //double delta = m_vecx[i+1] - m_vecx[i];
  //double delta2 = delta*delta;
  //double delta3 = delta2*delta;
  
  m_coeff0[i] = ai;
  //m_coeff1[i] = bi;
  //m_coeff2[i] = (ydel.scale(3.0) - (bi.scale(2.0) + b2).scale(delta) ).divide(delta2);
  //m_coeff3[i] = (ydel.scale(-2.0) + (bi + b2).scale(delta) ).divide(delta3);
  
  //ydel = ai - m_coeff0[i-1];
  //delta = m_vecx[i] - m_vecx[i-1];
  //delta2 = delta*delta;
  //delta3 = delta2*delta;
  
  //m_coeff2[i-1] = (ydel.scale(3.0) - (b0.scale(2.0) + bi).scale(delta) ).divide(delta2);
  //m_coeff3[i-1] = (ydel.scale(-2.0) + (b0 + bi).scale(delta) ).divide(delta3);
}

/** perform interpolation */
bool SmoothSpline::interpolate(double par, Vector4D *vec,
                              Vector4D *dvec /*= NULL*/,
                              Vector4D *ddvec /*= NULL*/)
{
  int l = 0;
  int r = m_vecx.size()-2+1;
  int m;

  // Perform binary search in  [ x[0], ..., x[n-2] ] (x[n-1] is not included)
  while (l!=r-1) {
    m = (l+r)/2;
    if( m_vecx[m]>=par ) {
      r = m;
    }
    else {
      l = m;
    }
  }

  double f = par - m_vecx[l];

  /*
  // check parameter value f
  int ncoeff = (int)::floor(par);
  if (ncoeff<0)
    ncoeff = 0;
  if (ncoeff>=(m_nPoints-1))
    ncoeff = m_nPoints-2;
    */
  
  const Vector4D &coeff0 = m_coeff0[l];
  const Vector4D &coeff1 = m_coeff1[l];
  const Vector4D &coeff2 = m_coeff2[l];
  const Vector4D &coeff3 = m_coeff3[l];

//  double f = par - (double)ncoeff;

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



