// -*-Mode: C++;-*-
//
//  Natural (cubic) spline interpolator class
//

#ifndef CUBIC_SPLINE_HPP_INCLUDED
#define CUBIC_SPLINE_HPP_INCLUDED

#include "molvis.hpp"
#include <qlib/Vector4D.hpp>

namespace molvis {

using qlib::Vector4D;

class CubicSpline
{
private:
  std::vector<Vector4D> m_veclist;

  int m_nPoints;
  Vector4D *m_pCoeff0;
  Vector4D *m_pCoeff1;
  Vector4D *m_pCoeff2;
  Vector4D *m_pCoeff3;

public:
  CubicSpline();

  ~CubicSpline();

  /// reinitialization
  void cleanup();

  void setSize(int nsize) { m_veclist.resize(nsize); }

  /// accumlate interporation point
  void setPoint(int i, const Vector4D &vec) {
    m_veclist[i] = vec;
  }

  /// generate spline coeffs
  bool generate();

  /// perform interpolation
  bool interpolate(double f, Vector4D *vec,
                   Vector4D *dvec = NULL, Vector4D *ddvec = NULL);

  /// get the number of data points
  int getPoints() const { return m_nPoints; }
};

}

#endif
