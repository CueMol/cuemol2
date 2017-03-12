// -*-Mode: C++;-*-
//
// 3x3 matrix class with any type
//

#ifndef QLIB_MATRIX_3T_HPP
#define QLIB_MATRIX_3T_HPP

#include "qlib.hpp"
#include "MatrixND.hpp"
#include "Utils.hpp"
#include "Vector4T.hpp"

namespace qlib {

  class LQuat;

  template <typename _ValueType>
  class Matrix3T : public MatrixND<3, _ValueType>
  {
  public:
    typedef MatrixND<3, _ValueType> super_t;

  public:
    typedef typename super_t::value_type value_type;

  public:
    // constructors

    /// Default constructor with creating unit matrix
    Matrix3T()
      : super_t()
    {
    }

    /// Constructor without initialization
    Matrix3T(int a, detail::no_init_tag b)
      : super_t(a, b)
    {
    }

    /// copy constructor
    Matrix3T(const Matrix3T &arg)
      : super_t(arg)
    {
    }
    
    /// Implicit conversion from MatrixND
    Matrix3T(const super_t &arg)
      : super_t(arg)
    {
    }

    /// Type Conversion
    template <typename _ArgType>
    explicit
    Matrix3T(const Matrix3T<_ArgType> &arg)
      : super_t(arg)
    {
    }

    ////////////////////////////////////////////////////////////
    // methods

  public:

    /// Element access (mutating)
    inline value_type &aij(int i, int j) { return super_t::aij(i,j); }

    /// Element access (const)
    inline value_type aij(int i, int j) const { return super_t::aij(i,j); }

    /// Returns a vector this*vec
    inline Vector3T<value_type> mulvec(const Vector3T<value_type> &arg) const
    {
      return super_t::mulvec(arg);
    }

    /// Returns a vector this*vec4
    /// 4-th component of arg is ignored (and set as 0)
    Vector4T<value_type> mulvec(const Vector4T<value_type> &arg) const {
      Vector4T<value_type> retval(0, detail::no_init_tag());
      for (int i=1; i<=super_t::dimension; ++i) {
	value_type sum = value_type(0);
	for (int j=1; j<=super_t::dimension; ++j) {
	  sum += aij(i,j) * arg.ai(j);
	}
	retval.ai(i) = sum;
      }
      retval.ai(4) = value_type(0);
      return retval;
    }

    /// transform v as 3D vector
    void xform(Vector4T<value_type> &v) const {
      v = this->mulvec(v);
    }

    inline value_type deter() const
    {
      return
	(aij(1,1)*aij(2,2) - aij(1,2)*aij(2,1))*aij(3,3) +
	(aij(2,1)*aij(3,2) - aij(2,2)*aij(3,1))*aij(1,3) +
	(aij(3,1)*aij(1,2) - aij(3,2)*aij(1,1))*aij(2,3);
    }

    // Matrix3T invert() const;


  };

}

#endif

