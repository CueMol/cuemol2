// -*-Mode: C++;-*-
//
//  Penalized cubic spline fit on equispaced basis knots
//

#include <common.h>

#include "PenalizedSpline.hpp"

#include <cfloat>
#include <cmath>

using namespace molvis;

namespace {

  /// Second derivatives d2[0..m-1] of the natural cubic spline through
  /// (x[j], y[j]) (d2[0] = d2[m-1] = 0), by the tridiagonal solve.
  void naturalSplineD2(const std::vector<double> &x, const double *y, double *d2)
  {
    const int m = x.size();
    d2[0] = d2[m-1] = 0.0;
    if (m<3)
      return;

    // forward elimination over the interior knots 1..m-2
    std::vector<double> cp(m, 0.0), rp(m, 0.0);
    for (int j=1; j<m-1; ++j) {
      const double h0 = x[j]-x[j-1], h1 = x[j+1]-x[j];
      const double a = h0/6.0, b = (h0+h1)/3.0, c = h1/6.0;
      const double r = (y[j+1]-y[j])/h1 - (y[j]-y[j-1])/h0;
      const double den = b - (j>1 ? a*cp[j-1] : 0.0);
      cp[j] = c/den;
      rp[j] = (r - (j>1 ? a*rp[j-1] : 0.0))/den;
    }
    d2[m-2] = rp[m-2];
    for (int j=m-3; j>=1; --j)
      d2[j] = rp[j] - cp[j]*d2[j+1];
  }

  /// Value at u of the natural cubic spline given by knot values y and
  /// second derivatives d2 (u outside the knots uses the end segments).
  double naturalSplineValue(const std::vector<double> &x, const double *y,
                            const double *d2, double u)
  {
    const int m = x.size();
    int k = 0;
    while (k<m-2 && u>x[k+1])
      ++k;
    const double h = x[k+1]-x[k];
    const double a = (x[k+1]-u)/h, b = 1.0-a;
    return a*y[k] + b*y[k+1] + ((a*a*a-a)*d2[k] + (b*b*b-b)*d2[k+1])*h*h/6.0;
  }

}

bool PenalizedSpline::setup(const double *t, const double *wgt, int n, int m, double rho)
{
  m_n = m_m = 0;
  if (n<1 || m<4)
    return false;

  // rho clamp: [-v, v], v = -log10(machine epsilon)
  const double rhomax = -std::log(DBL_EPSILON)/std::log(10.0);
  rho = std::max(-rhomax, std::min(rho, rhomax));
  const double lambdav = std::pow(10.0, rho);

  // map [min t, max t] to [-1, 1] (forcing min != max)
  double tmin = t[0], tmax = t[0];
  for (int i=1; i<n; ++i) {
    tmin = std::min(tmin, t[i]);
    tmax = std::max(tmax, t[i]);
  }
  if (tmin==tmax) {
    if (tmin==0.0) {
      tmin = -1.0;
      tmax = 1.0;
    }
    else if (tmin>0.0)
      tmin = 0.5*tmin;
    else
      tmax = 0.5*tmax;
  }
  m_xa = 2.0/(tmax-tmin);
  m_xb = -(tmin+tmax)/(tmax-tmin);

  std::vector<double> xs(n);
  for (int i=0; i<n; ++i)
    xs[i] = 2.0*(t[i]-0.5*(tmin+tmax))/(tmax-tmin);

  // weights scaled by max |w| (the scale does not change the solution)
  double wmax = 0.0;
  for (int i=0; i<n; ++i)
    wmax = std::max(wmax, std::fabs(wgt==NULL ? 1.0 : wgt[i]));
  m_w2.resize(n);
  for (int i=0; i<n; ++i) {
    double w = (wgt==NULL ? 1.0 : wgt[i]);
    if (wmax!=0.0)
      w /= wmax;
    m_w2[i] = w*w;
  }

  m_bx.resize(m);
  for (int j=0; j<m; ++j)
    m_bx[j] = double(2*j)/double(m-1) - 1.0;

  // basis matrix and second derivatives of the cardinal basis splines
  m_fmat.assign(n*m, 0.0);
  std::vector<double> d2mat(m*m), by(m);
  double fdmax = 0.0;
  for (int b=0; b<m; ++b) {
    std::fill(by.begin(), by.end(), 0.0);
    by[b] = 1.0;
    double *d2 = &d2mat[b*m];
    naturalSplineD2(m_bx, &by[0], d2);
    double v = 0.0;
    for (int i=0; i<n; ++i) {
      const double f = naturalSplineValue(m_bx, &by[0], d2, xs[i]);
      m_fmat[i*m+b] = f;
      v += m_w2[i]*f*f;
    }
    fdmax = std::max(fdmax, v);
  }

  // penalty matrix A_ij = integral(B_i'' B_j''), B'' piecewise linear
  std::vector<double> amat(m*m);
  double admax = 0.0;
  for (int i=0; i<m; ++i) {
    for (int j=i; j<m; ++j) {
      double v = 0.0;
      for (int k=0; k<m-1; ++k) {
        const double fa = d2mat[i*m+k], fb = d2mat[i*m+k+1];
        const double ga = d2mat[j*m+k], gb = d2mat[j*m+k+1];
        v += (m_bx[k+1]-m_bx[k]) *
          (fa*ga + (fa*(gb-ga)+ga*(fb-fa))/2.0 + (fb-fa)*(gb-ga)/3.0);
      }
      amat[i*m+j] = amat[j*m+i] = v;
    }
    admax = std::max(admax, std::fabs(amat[i*m+i]));
  }
  const double pdecay = lambdav*fdmax/admax;
  // Tikhonov regularization
  const double tdecay = fdmax*(1.0+pdecay)*10.0*DBL_EPSILON;

  // normal matrix F^T W^2 F + pdecay A + tdecay I, and its Cholesky factor
  m_chol.assign(m*m, 0.0);
  for (int a=0; a<m; ++a) {
    for (int b=0; b<=a; ++b) {
      double v = pdecay*amat[a*m+b];
      for (int i=0; i<n; ++i)
        v += m_w2[i]*m_fmat[i*m+a]*m_fmat[i*m+b];
      if (a==b)
        v += tdecay;
      m_chol[a*m+b] = v;
    }
  }
  for (int j=0; j<m; ++j) {
    double v = m_chol[j*m+j];
    for (int k=0; k<j; ++k)
      v -= m_chol[j*m+k]*m_chol[j*m+k];
    if (!(v>0.0))
      return false;
    const double ljj = std::sqrt(v);
    m_chol[j*m+j] = ljj;
    for (int i=j+1; i<m; ++i) {
      double s = m_chol[i*m+j];
      for (int k=0; k<j; ++k)
        s -= m_chol[i*m+k]*m_chol[j*m+k];
      m_chol[i*m+j] = s/ljj;
    }
  }

  m_n = n;
  m_m = m;
  return true;
}

void PenalizedSpline::solve(const double *y, int stride, double *nodes, double *coeffs) const
{
  const int n = m_n, m = m_m;

  // y scaling: [mean, mean + stddev] to [0, 1]
  double sa = 0.0;
  for (int i=0; i<n; ++i)
    sa += y[i*stride];
  sa /= n;
  double sb = 0.0;
  for (int i=0; i<n; ++i)
    sb += (y[i*stride]-sa)*(y[i*stride]-sa);
  sb = std::sqrt(sb/n) + sa;
  if (sb==sa)
    sb = 2.0*sa;
  if (sb==sa)
    sb = sa+1.0;
  const double sd = sb-sa;

  // right part F^T W^2 y and the Cholesky solve
  std::vector<double> c(m, 0.0);
  for (int i=0; i<n; ++i) {
    const double v = m_w2[i]*(y[i*stride]-sa)/sd;
    for (int b=0; b<m; ++b)
      c[b] += v*m_fmat[i*m+b];
  }
  for (int i=0; i<m; ++i) {
    double v = c[i];
    for (int k=0; k<i; ++k)
      v -= m_chol[i*m+k]*c[k];
    c[i] = v/m_chol[i*m+i];
  }
  for (int i=m-1; i>=0; --i) {
    double v = c[i];
    for (int k=i+1; k<m; ++k)
      v -= m_chol[k*m+i]*c[k];
    c[i] = v/m_chol[i*m+i];
  }

  // natural spline through (bx, c) in power basis (scaled coordinates),
  // with one linear segment added at each end
  std::vector<double> d2(m);
  naturalSplineD2(m_bx, &c[0], &d2[0]);

  std::vector<double> ux(m+2), pc(4*(m+1));
  for (int j=0; j<m-1; ++j) {
    const double h = m_bx[j+1]-m_bx[j];
    double *p = &pc[4*(j+1)];
    p[0] = c[j];
    p[1] = (c[j+1]-c[j])/h - h*(2.0*d2[j]+d2[j+1])/6.0;
    p[2] = 0.5*d2[j];
    p[3] = (d2[j+1]-d2[j])/(6.0*h);
  }
  const double h0 = m_bx[1]-m_bx[0], h1 = m_bx[m-1]-m_bx[m-2];
  const double d0 = pc[4*1+1];
  const double d1 = (c[m-1]-c[m-2])/h1 + h1*(d2[m-2]+2.0*d2[m-1])/6.0;
  pc[0] = c[0]-d0*h0;
  pc[1] = d0;
  pc[2] = pc[3] = 0.0;
  pc[4*m+0] = c[m-1];
  pc[4*m+1] = d1;
  pc[4*m+2] = pc[4*m+3] = 0.0;
  ux[0] = m_bx[0]-h0;
  for (int j=0; j<m; ++j)
    ux[j+1] = m_bx[j];
  ux[m+1] = m_bx[m-1]+h1;

  // back to t and y: t = (u - xb)/xa, the j-th coefficient scales by xa^j
  for (int k=0; k<m+2; ++k)
    nodes[k] = (ux[k]-m_xb)/m_xa;
  for (int k=0; k<m+1; ++k) {
    double s = sd;
    for (int j=0; j<4; ++j) {
      coeffs[4*k+j] = pc[4*k+j]*s;
      s *= m_xa;
    }
    coeffs[4*k+0] += sa;
  }
}
