// -*-Mode: C++;-*-
//
//  Penalized cubic smoothing spline by the Reinsch algorithm
//

#include <common.h>

#include "ReinschSpline.hpp"

#include <cfloat>
#include <cmath>

using namespace molvis;

// With unit knot spacing (h = 1):
//   R (n-2 x n-2): tridiagonal, R_jj = 2/3, R_j,j+1 = 1/6
//   Q (n x n-2): Q_j,j = 1, Q_j+1,j = -2, Q_j+2,j = 1
// The penalty is integral{ f''^2 } = g^T K g with K = Q R^-1 Q^T.
//
// alglib scales t onto [-1,1] and uses pdecay = 10^rho * fdmax / admax.
// With the knots on the data points, fdmax = max_i w_i^2 and admax is
// max diag(K) in the scaled coordinates. The scale factor of the penalty
// appears in both pdecay and admax and cancels, which gives
//   lambda = 10^rho * max_i w_i^2 / max_i K_ii  (unit spacing).

double ReinschSpline::calcMaxPenaltyDiag(int n)
{
  const int nr = n-2;
  const double rd = 2.0/3.0, ro = 1.0/6.0;

  // LDL^T of R
  std::vector<double> d(nr), l(nr, 0.0);
  d[0] = rd;
  for (int j=1; j<nr; ++j) {
    l[j] = ro/d[j-1];
    d[j] = rd - l[j]*ro;
  }

  // Band of S = R^-1 (S0: diagonal, S1: j,j+1, S2: j,j+2), using
  // S_ij = -l_i+1 S_i+1,j (j>i) and S_ii = 1/d_i - l_i+1 S_i,i+1
  std::vector<double> s0(nr), s1(nr, 0.0), s2(nr, 0.0);
  s0[nr-1] = 1.0/d[nr-1];
  for (int j=nr-2; j>=0; --j) {
    s1[j] = -l[j+1]*s0[j+1];
    if (j+2<nr)
      s2[j] = -l[j+1]*s1[j+1];
    s0[j] = 1.0/d[j] - l[j+1]*s1[j];
  }

  auto sband = [&](int j, int k) -> double {
    if (j>k) std::swap(j, k);
    switch (k-j) {
    case 0: return s0[j];
    case 1: return s1[j];
    default: return s2[j];
    }
  };

  // K_ii = sum_{j,k} Q_ij S_jk Q_ik, Q_ij nonzero for j = i-2, i-1, i
  static const double qv[3] = {1.0, -2.0, 1.0}; // Q_i,i-2  Q_i,i-1  Q_i,i
  double kmax = 0.0;
  for (int i=0; i<n; ++i) {
    double v = 0.0;
    for (int a=0; a<3; ++a) {
      const int j = i-2+a;
      if (j<0 || j>=nr) continue;
      for (int b=0; b<3; ++b) {
        const int k = i-2+b;
        if (k<0 || k>=nr) continue;
        v += qv[a]*qv[b]*sband(j, k);
      }
    }
    kmax = std::max(kmax, v);
  }
  return kmax;
}

bool ReinschSpline::factor(int n, const double *wgt, double rho)
{
  m_n = 0;
  if (n<3)
    return false;

  // rho clamp of alglib: [-v, v], v = -log10(machine epsilon)
  const double rhomax = -std::log(DBL_EPSILON)/std::log(10.0);
  rho = std::max(-rhomax, std::min(rho, rhomax));

  double w2max = 1.0;
  if (wgt!=NULL) {
    w2max = 0.0;
    for (int i=0; i<n; ++i) {
      if (!(wgt[i]>0.0))
        return false;
      w2max = std::max(w2max, wgt[i]*wgt[i]);
    }
  }

  m_lambda = std::pow(10.0, rho) * w2max / calcMaxPenaltyDiag(n);

  m_lw.resize(n);
  for (int i=0; i<n; ++i)
    m_lw[i] = (wgt==NULL) ? m_lambda : m_lambda/(wgt[i]*wgt[i]);

  // M = R + lambda Q^T W^-2 Q (pentadiagonal): diagonal a, off-diagonals b, c
  // a_j = 2/3 + lw_j + 4 lw_j+1 + lw_j+2
  // b_j = 1/6 - 2 lw_j+1 - 2 lw_j+2
  // c_j = lw_j+2
  // LDL^T with L_j,j-1 = l1_j, L_j,j-2 = l2_j
  const int nr = n-2;
  const double *lw = &m_lw[0];
  m_d.resize(nr);
  m_l1.assign(nr+1, 0.0);
  m_l2.assign(nr+2, 0.0);
  for (int j=0; j<nr; ++j) {
    const double a = 2.0/3.0 + lw[j] + 4.0*lw[j+1] + lw[j+2];
    double dj = a;
    if (j>=1)
      dj -= m_l1[j]*m_l1[j]*m_d[j-1];
    if (j>=2)
      dj -= m_l2[j]*m_l2[j]*m_d[j-2];
    if (!(dj>0.0))
      return false;
    m_d[j] = dj;

    if (j+1<nr) {
      const double b = 1.0/6.0 - 2.0*lw[j+1] - 2.0*lw[j+2];
      double v = b;
      if (j>=1)
        v -= m_l2[j+1]*m_l1[j]*m_d[j-1];
      m_l1[j+1] = v/dj;
    }
    if (j+2<nr) {
      const double c = lw[j+2];
      m_l2[j+2] = c/dj;
    }
  }

  m_z.resize(nr);
  m_n = n;
  return true;
}

void ReinschSpline::solve(const double *y, int stride, double *g, double *gam) const
{
  const int n = m_n;
  const int nr = n-2;
  double *z = &m_z[0];

  // forward: L z = Q^T y
  for (int j=0; j<nr; ++j) {
    double v = y[j*stride] - 2.0*y[(j+1)*stride] + y[(j+2)*stride];
    if (j>=1)
      v -= m_l1[j]*z[j-1];
    if (j>=2)
      v -= m_l2[j]*z[j-2];
    z[j] = v;
  }

  // backward: D L^T gamma = z (gamma of interior knot j+1 is stored in gam[j+1])
  gam[0] = gam[n-1] = 0.0;
  for (int j=nr-1; j>=0; --j) {
    double v = z[j]/m_d[j];
    if (j+1<nr)
      v -= m_l1[j+1]*gam[j+2];
    if (j+2<nr)
      v -= m_l2[j+2]*gam[j+3];
    gam[j+1] = v;
  }

  // g = y - lambda W^-2 Q gamma; (Q gamma)_i = gam_i-1 - 2 gam_i + gam_i+1
  // in terms of the full-length gam (zero at both ends)
  for (int i=0; i<n; ++i) {
    double qg = -2.0*gam[i];
    if (i>=1)
      qg += gam[i-1];
    if (i+1<n)
      qg += gam[i+1];
    g[i] = y[i*stride] - m_lw[i]*qg;
  }
}
