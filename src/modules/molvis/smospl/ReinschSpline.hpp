// -*-Mode: C++;-*-
//
//  Penalized cubic smoothing spline by the Reinsch algorithm
//

#ifndef REINSCH_SPLINE_HPP_INCLUDED
#define REINSCH_SPLINE_HPP_INCLUDED

#include <modules/molvis/molvis.hpp>

#include <vector>

namespace molvis {

  /// Smoothing spline on the unit-spaced knots t_i = t0 + i (i = 0..n-1).
  ///
  /// Minimizes sum{ w_i^2 (y_i - f(t_i))^2 } + lambda * integral{ f''^2 dt }
  /// over natural cubic splines in O(n), solving the pentadiagonal system of
  /// the Reinsch algorithm. lambda is derived from rho in the same way as
  /// PenalizedSpline (ALGLIB spline1dfitpenalizedw) with M == N basis functions, so
  /// that the fitted curve matches it up to rounding (its tiny
  /// Tikhonov term is not reproduced).
  class ReinschSpline
  {
  private:
    int m_n;
    double m_lambda;

    /// lambda / w_i^2
    std::vector<double> m_lw;

    /// LDL^T factor of R + lambda Q^T W^-2 Q (size n-2)
    std::vector<double> m_d;
    std::vector<double> m_l1;
    std::vector<double> m_l2;

    /// work area of solve()
    mutable std::vector<double> m_z;

    /// max_i K_ii of the penalty matrix K = Q R^-1 Q^T (unit spacing)
    static double calcMaxPenaltyDiag(int n);

  public:
    ReinschSpline() : m_n(0), m_lambda(0.0) {}

    /// Factor the system for n points (n>=3).
    /// wgt: weights w_i (NULL means all 1); every w_i must be nonzero (only w_i^2 matters).
    /// Returns false if the input is not supported or the factorization fails.
    bool factor(int n, const double *wgt, double rho);

    /// Fit the values y[i*stride] (i = 0..n-1).
    /// Writes the fitted values g[n] and second derivatives gam[n]
    /// (gam[0] = gam[n-1] = 0 by the natural boundary condition).
    void solve(const double *y, int stride, double *g, double *gam) const;

    int getSize() const { return m_n; }
    double getLambda() const { return m_lambda; }
  };

}

#endif
