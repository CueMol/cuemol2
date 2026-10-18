// -*-Mode: C++;-*-
//
//  Penalized cubic spline fit on equispaced basis knots
//

#ifndef PENALIZED_SPLINE_HPP_INCLUDED
#define PENALIZED_SPLINE_HPP_INCLUDED

#include <modules/molvis/molvis.hpp>

#include <vector>

namespace molvis {

  /// Penalized regression spline with M natural cubic basis functions on
  /// equispaced knots over [min t, max t].
  ///
  /// Follows the algorithm of ALGLIB's spline1dfitpenalizedw(): t and y are
  /// scaled, the penalty 10^rho is normalized by the basis matrix and the
  /// penalty matrix, the normal equations (plus a tiny Tikhonov term) are
  /// solved by Cholesky, and the result is extended linearly by one knot
  /// interval at each end. Dense (O(M^3)): used for the short segments, where
  /// M exceeds the number of points and the knots are not on the data.
  class PenalizedSpline
  {
  private:
    int m_n;
    int m_m;

    /// abscissa scaling: u = m_xa * t + m_xb maps [min t, max t] to [-1, 1]
    double m_xa;
    double m_xb;

    /// basis knots (scaled)
    std::vector<double> m_bx;
    /// scaled squared weights
    std::vector<double> m_w2;
    /// basis values at the data points, m_fmat[i*m + b]
    std::vector<double> m_fmat;
    /// Cholesky factor (lower) of the normal matrix, m_chol[i*m + j]
    std::vector<double> m_chol;

  public:
    PenalizedSpline() : m_n(0), m_m(0), m_xa(1.0), m_xb(0.0) {}

    /// Build and factor the system.
    /// t: increasing abscissas (n>=1), wgt: weights (NULL means all 1),
    /// m: number of basis functions (m>=4).
    /// Returns false if the normal matrix is not positive definite
    /// (e.g. all weights are zero).
    bool setup(const double *t, const double *wgt, int n, int m, double rho);

    /// Fit the values y[i*stride] (i = 0..n-1).
    /// Writes the getNodes() nodes and the power-basis coefficients
    /// coeffs[4*k+j] (j-th power of t - nodes[k]) of the getNodes()-1 segments.
    void solve(const double *y, int stride, double *nodes, double *coeffs) const;

    /// Number of nodes of the fitted spline (basis knots plus the two ends)
    int getNodes() const { return m_m+2; }
  };

}

#endif
