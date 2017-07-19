// -*-Mode: C++;-*-
//
// 3x3 matrix class
//

#ifndef QLIB_MATRIX_3D_HPP
#define QLIB_MATRIX_3D_HPP

#include "qlib.hpp"
#include "MatrixND.hpp"
#include "Utils.hpp"
#include "Vector4D.hpp"

namespace qlib {

class LQuat;

class QLIB_API Matrix3D : public MatrixND<3, LReal>
{
public:
  typedef MatrixND<3, LReal> super_t;

public:
  // constructors

  /// Default constructor with creating unit matrix
  Matrix3D()
    {
      super_t::setIdent();
    }

  /// Constructor without initialization
  explicit
    Matrix3D(int, detail::no_init_tag)
      {
      }

  /// copy constructor
  Matrix3D(const Matrix3D &arg)
       : super_t(arg)
    {
    }

  /// Implicit conversion
  Matrix3D(const super_t &arg)
       : super_t(arg)
    {
    }

  /// diagonalization by Jacobi method
  bool diag(Matrix3D &evecs, Vector4D &evals) const;

  ////////////////////////////////////////////////////////////
  // operators

public:

  /// Returns a vector this*arg
  /// 4-th component of arg is ignored (and set as 0)
  Vector4D mulvec(const Vector4D &arg) const {
    Vector4D retval(0, detail::no_init_tag());
    for (int i=1; i<=super_t::dimension; ++i) {
      double sum=0.0;
      for (int j=1; j<=super_t::dimension; ++j) {
        sum += this->aij(i,j) * arg.ai(j);
      }
      retval.ai(i) = sum;
    }
    retval.ai(4) = 0.0;
    return retval;
  }

  /// transform v as 3D vector
  void xform(Vector4D &v) const {
    v = this->mulvec(v);
  }

  double deter() const;
  Matrix3D invert() const;

  /// Make rotation (unitary) matrix to converting basis of e1, e2, and e1xe2
  static Matrix3D makeRotMat(const Vector4D &e1, const Vector4D &e2);

  static Matrix3D makeRotMat(const Vector4D &axis, double theta);
  static Matrix3D makeRotMat(const Vector4D &axis, double costh, double sinth);

  /// Debug
  void dump() const
  {
    MB_DPRINTLN("( %.5f %.5f %.5f )", aij(1,1), aij(1,2), aij(1,3));
    MB_DPRINTLN("( %.5f %.5f %.5f )", aij(2,1), aij(2,2), aij(2,3));
    MB_DPRINTLN("( %.5f %.5f %.5f )", aij(3,1), aij(3,2), aij(3,3));
  }
  

};

}

#endif

