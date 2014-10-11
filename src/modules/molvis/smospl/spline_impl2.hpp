//
//
//

#ifndef SPLIE_IMPL2_HPP_INCLUDED
#define SPLIE_IMPL2_HPP_INCLUDED

#include <vector>

namespace spline1d {
  
  using std::vector;
  
  void gridDiff2Cubic(const vector<double> &x,
		      const vector<double> &y,
		      vector<double> &d1,
		      vector<double> &d2);

  struct Spline1DCoeff
  {
    bool m_periodic;

    /// num of nodes
    int m_n;

    /// order
    int m_k;

    ///
    vector<double> m_x;
    vector<double> m_c;

    /// build Hermite spline coeff

    void buildHermite(const vector<double> &x,
		      const vector<double> &y,
		      const vector<double> &d);
      
    void buildCubic(const vector<double> &x,
		    const vector<double> &y);

  };
}

#endif
