// -*-Mode: C++;-*-
//
//  Cubic smooth spline interpolator class
//

#ifndef SMOOTH_SPLINE_HPP_INCLUDED
#define SMOOTH_SPLINE_HPP_INCLUDED

#include <modules/molvis/molvis.hpp>
#include <qlib/Vector4D.hpp>

namespace molvis {

  using qlib::Vector4D;

  /// 1D smooth spline class
  class SmoothSpline1D
  {
  private:
    std::vector<double> m_veclist;

    int m_nPoints;
    std::vector<double> m_vecx;

    std::vector<double> m_coeff0;
    std::vector<double> m_coeff1;
    std::vector<double> m_coeff2;
    std::vector<double> m_coeff3;

    double m_rho;

  public:
    SmoothSpline1D();

    ~SmoothSpline1D();

    /// reinitialization
    void cleanup();

    void setRho(double rho) { m_rho = rho; }
    double getRho() const { return m_rho; }

    void setSize(int nsize) { m_veclist.resize(nsize); }

    /// Set interporation point
    void setValue(int i, double vec) {
      m_veclist[i] = vec;
    }

    double getValue(int i) const
    {
      return m_veclist[i];
    }

    /// Generate spline coeffs
    bool generate();

    /// Calculate interpolation
    bool interpolate(double f, double *vec,
                     double *dvec = NULL, double *ddvec = NULL);

    /// Get the number of data points
    int getPoints() const { return m_nPoints; }
  };

  ///////////////////////////////

  /// 3D smooth spline class
  class SmoothSpline
  {
  private:
    std::vector<Vector4D> m_veclist;

    int m_nStart;
    int m_nPoints;
    std::vector<double> m_vecx;

    std::vector<Vector4D> m_coeff0;
    std::vector<Vector4D> m_coeff1;
    std::vector<Vector4D> m_coeff2;
    std::vector<Vector4D> m_coeff3;

    double m_rho;

    bool m_bUseWgt;

    bool m_bFixStart;
    Vector4D m_vStartD1;

    bool m_bFixEnd;
    Vector4D m_vEndD1;

    void rewriteCoeff(int i, const Vector4D &ai);
    //void rewriteCoeff(int i, const Vector4D &ai, const Vector4D &bi);

  public:
    SmoothSpline();

    ~SmoothSpline();

    /// reinitialization
    void cleanup();

    void setRho(double rho) { m_rho = rho; }
    double getRho() const { return m_rho; }

    void setUseWeight(bool b) { m_bUseWgt = b; }

    void setSize(int nsize) { m_veclist.resize(nsize); }

    /// Set start index
    void setStartId(int n) { m_nStart = n; }

    /// Set interporation point
    void setPoint(int i, const Vector4D &vec) {
      m_veclist[i-m_nStart] = vec;
    }

    void setWeight(int i, double w) {
      m_veclist[i-m_nStart].w() = w;
    }

    const Vector4D &getPoint(int i) const
    {
      return m_veclist[i-m_nStart];
    }

    //////////
    
    void setFixStart(const Vector4D &vst) {
      m_bFixStart = true;
      m_vStartD1 = vst.normalize();
    }
    void setFixEnd(const Vector4D &vst) {
      m_bFixEnd = true;
      m_vEndD1 = vst.normalize();
    }

    /// Generate spline coeffs
    bool generate();

    /// Calculate interpolation
    bool interpolate(double f, Vector4D *vec,
                     Vector4D *dvec = NULL, Vector4D *ddvec = NULL);

    /// Get the number of data points
    int getPoints() const { return m_nPoints; }
  };

}

#endif


