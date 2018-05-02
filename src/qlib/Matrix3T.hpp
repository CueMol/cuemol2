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
#include "Vector3F.hpp"

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

    /// Create basis conversion matrix
    Matrix3T(const Vector3T<value_type> &e1,
             const Vector3T<value_type> &e2,
             const Vector3T<value_type> &e3)
         : super_t(0, detail::no_init_tag())
    {
      aij(1, 1) = e1.x();
      aij(2, 1) = e1.y();
      aij(3, 1) = e1.z();
  
      aij(1, 2) = e2.x();
      aij(2, 2) = e2.y();
      aij(3, 2) = e2.z();
  
      aij(1, 3) = e3.x();
      aij(2, 3) = e3.y();
      aij(3, 3) = e3.z();
    }

    Matrix3T(value_type a11, value_type a12, value_type a13,
             value_type a21, value_type a22, value_type a23,
             value_type a31, value_type a32, value_type a33)
         : super_t(0, detail::no_init_tag())
    {
      aij(1, 1) = a11;
      aij(2, 1) = a21;
      aij(3, 1) = a31;
  
      aij(1, 2) = a12;
      aij(2, 2) = a22;
      aij(3, 2) = a32;
  
      aij(1, 3) = a13;
      aij(2, 3) = a23;
      aij(3, 3) = a33;
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

  //////////////////////////////////////////////////


  class QLIB_API Matrix3F : public Matrix3T<qfloat32>
  {
  public:
    typedef Matrix3T<qfloat32> super_t;

  public:
    typedef super_t::value_type value_type;

  public:
    // constructors

    /// Default constructor with creating unit matrix
    Matrix3F()
      : super_t()
      {
      }

    /// Constructor without initialization
    Matrix3F(int a, detail::no_init_tag b)
      : super_t(a,b)
      {
      }

    /// copy constructor
    Matrix3F(const Matrix3F &arg)
      : super_t(arg)
      {
      }

    /// Implicit conversion
    Matrix3F(const super_t &arg)
      : super_t(arg)
      {
      }

    /// Implicit conversion (from MatrixND)
    Matrix3F(const super_t::super_t &arg)
      : super_t(arg)
      {
      }

    /// Create basis conversion matrix
    Matrix3F(const Vector3F &e1,
             const Vector3F &e2,
             const Vector3F &e3)
         : super_t(e1, e2, e3)
    {
    }
    
    Matrix3F(value_type a11, value_type a12, value_type a13,
             value_type a21, value_type a22, value_type a23,
             value_type a31, value_type a32, value_type a33)
         : super_t(a11, a12, a13,
                   a21, a22, a23,
                   a31, a32, a33)
    {
    }
    
    ////////////////////////////////////////////////////////////
    // Methods

  public:


  };


}

#endif

