// -*-Mode: C++;-*-
//
//  Natural (cubic) spline interpolator class
//

#ifndef CUBIC_SPLINE_HPP_INCLUDED
#define CUBIC_SPLINE_HPP_INCLUDED

#include "molvis.hpp"
#include <qlib/Vector3F.hpp>
#include <qlib/Vector4D.hpp>

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;

  class CubicSpline
  {
  private:
    typedef std::vector<Vector3F> VecArray;
    typedef std::vector<float> FArray;

    /// Number of interpolation points
    int m_nPoints;

    /// Interpolation point vector array
    VecArray m_veclist;

    /// Cubic spline coefficients
    /// ([xyz]0 [xyz]1 [xyz]2 [xyz]3) x m_nPoints array
    FArray m_coefs;

    /*
    Vector4D *m_pCoeff0;
    Vector4D *m_pCoeff1;
    Vector4D *m_pCoeff2;
    Vector4D *m_pCoeff3;
     */
    
  public:
    CubicSpline();

    ~CubicSpline();

    /// reinitialization
    void cleanup();

    inline void setSize(int nsize) { m_veclist.resize(nsize); }
    inline int getSize() const {
      return m_veclist.size();
    }

    /// accumlate interporation point
    inline void setPoint(int i, const Vector4D &vec) {
      m_veclist[i].x() = float(vec.x());
      m_veclist[i].y() = float(vec.y());
      m_veclist[i].z() = float(vec.z());
    }

    inline void setPoint(int i, const Vector3F &vec) {
      m_veclist[i] = vec;
    }

    /// generate spline coeffs
    void generate();

    /// perform interpolation
    void interpolate(double f, Vector4D *vec,
                     Vector4D *dvec = NULL, Vector4D *ddvec = NULL);

    void interpolate(double f, Vector3F *vec,
                     Vector3F *dvec = NULL, Vector3F *ddvec = NULL);

    /// get the number of data points
    int getPoints() const { return getSize(); }

    inline void setCoeff(int sub, int ind, const Vector3F &val) {
      const int i = (ind * 4 + sub) * 3;
      m_coefs[i + 0] = val.x();
      m_coefs[i + 1] = val.y();
      m_coefs[i + 2] = val.z();
    }

    inline Vector3F getCoeff(int sub, int ind) const {
      const int i = (ind * 4 + sub) * 3;
      return Vector3F(m_coefs[i + 0],
                      m_coefs[i + 1],
                      m_coefs[i + 2]);
    }

    const float *getCoefArray() const {
      return &m_coefs[0];
    }

  private:
    // workarea for natural spline calc
    std::vector<float> m_h;
    std::vector<float> m_ih;
    std::vector<float> m_a;
    VecArray m_dvec;

    std::vector<float> m_m;
    std::vector<float> m_l;
    VecArray m_xvec;
    VecArray m_yvec;
  };

}

#endif
