// -*-Mode: C++;-*-
//
// 4x4 matrix class
//
// $Id: Matrix4D.hpp,v 1.12 2011/02/11 06:56:58 rishitani Exp $

#ifndef __QLIB_MATRIX_4D_H__
#define __QLIB_MATRIX_4D_H__

#include "qlib.hpp"

#include "MatrixND.hpp"
#include "Utils.hpp"
#include "Matrix3D.hpp"
#include "Vector4D.hpp"

namespace qlib {

  class LQuat;

  namespace detail {
    struct use_w_tag {};
  }

  class QLIB_API Matrix4D : public MatrixND<4, LReal>
  {
  public:
    typedef MatrixND<4, LReal> super_t;
    typedef super_t::value_type value_type;
    
  public:
    // constructors

    /// Default constructor with creating unit matrix
    Matrix4D()
    {
      super_t::setIdent();
    }

    /// Constructor without initialization
    explicit
    Matrix4D(int, detail::no_init_tag)
    {
    }

    /// Copy constructor
    Matrix4D(const Matrix4D &arg)
         : super_t(arg)
    {
    }

    /// Implicit conversion
    Matrix4D(const super_t &arg)
         : super_t(arg)
      {
      }

    /// Construct from 4D vector (using w comp)
    explicit Matrix4D(const Vector4D &v, detail::use_w_tag)
    {
      super_t::setIdent();
      aij(1,4) = v.x();
      aij(2,4) = v.y();
      aij(3,4) = v.z();
      aij(4,4) = v.w();
    }

    /// construct from 3D matrix
    explicit
    Matrix4D(const Matrix3D &arg)
         : super_t(arg)
    {
    }

/*
    /// Construct from 3D matrix and 3D translation vector
    Matrix4D(const Matrix3D &arg, const Vector3D &v)
      : a11(arg.a11), a12(arg.a12), a13(arg.a13), a14(v.x),
	a21(arg.a21), a22(arg.a22), a23(arg.a23), a24(v.y),
	a31(arg.a31), a32(arg.a32), a33(arg.a33), a34(v.z),
	a41(0), a42(0), a43(0), a44(1)
    {
    }
*/
    
    ////////////////////////////////////////////////////////////
    // operators

  public:

    Vector4D mulvec(const Vector4D &arg) const {
      Vector4D retval(0, detail::no_init_tag());
      for (int i=1; i<=super_t::dimension; ++i) {
	value_type sum=0.0;
        for (int j=1; j<=super_t::dimension; ++j) {
	  sum += this->aij(i,j) * arg.ai(j);
	}
	retval.ai(i) = sum;
      }
      return retval;
    }

    ////////////////////////////////////////////////////////////

    void setAt(int i, int j, value_type val) {
      aij(i,j) = val;
    }
    
    value_type getAt(int i, int j) const {
      return aij(i,j);
    }

    value_type addAt(int i, int j, value_type val) {
      aij(i,j) += val;
      return aij(i,j);
    }

    ////////////////////////
    // Vector transformation

    void xform(value_type &x, value_type &y, value_type &z) const
    {
      value_type rx = aij(1,1)*x + aij(1,2)*y + aij(1,3)*z + aij(1,4);
      value_type ry = aij(2,1)*x + aij(2,2)*y + aij(2,3)*z + aij(2,4);
      value_type rz = aij(3,1)*x + aij(3,2)*y + aij(3,3)*z + aij(3,4);

      x = rx; y = ry; z = rz;
    }

    /// Transform v as 3D vector (ignore w element) 
    void xform3D(Vector4D &v) const
    {
      value_type rx = aij(1,1)*v.x() + aij(1,2)*v.y() + aij(1,3)*v.z() + aij(1,4);
      value_type ry = aij(2,1)*v.x() + aij(2,2)*v.y() + aij(2,3)*v.z() + aij(2,4);
      value_type rz = aij(3,1)*v.x() + aij(3,2)*v.y() + aij(3,3)*v.z() + aij(3,4);

      v.ai(1) = rx;
      v.ai(2) = ry;
      v.ai(3) = rz;
    }

    /// Transform v as 4D vector
    void xform4D(Vector4D &v) const
    {
      v = this->mulvec(v);
    }

    /// Calculate inverse matrix
    Matrix4D invert() const;

    /// extract 3x3 matrix
    Matrix3D getMatrix3D() const {
      Matrix3D r;
      for (int i=1; i<=3; ++i) {
        for (int j=1; j<=3; ++j) {
          r.aij(i,j) = aij(i,j);
	}
      }
      return r;
    }

    /// Get translation part
    Vector4D getTransPart() const {
      return Vector4D(aij(1,4), aij(2,4), aij(3,4));
    }

    /// Set translation part
    void setTransPart(const Vector4D &v) {
      aij(1,4) = v.x();
      aij(2,4) = v.y();
      aij(3,4) = v.z();
    }

    /////////////////////////////////////////////
    // comparison
    
    bool isIdentAffine(value_type dtol = F_EPS8) const {
      for (int i=1; i<=3; ++i) {
	for (int j=1; j<=3; ++j) {
	  if (! (qlib::abs<value_type>(aij(i,j) - delta(i,j))<dtol) )
	    return false;
	}
      }
      return true;

      // ?? qlib::abs<value_type>(a44-1.0)<dtol)
      return true;
    }

    /////////////////////////////////////
    // construction methods

    static Matrix4D makeRotMat(const LQuat &q);

    inline static Matrix4D makeTransMat(const Vector4D &v) {
      Matrix4D rval;
      rval.aij(1,4) = v.x();
      rval.aij(2,4) = v.y();
      rval.aij(3,4) = v.z();
      return rval;
    }

    inline static Matrix4D makeScaleMat(const Vector4D &v) {
      Matrix4D rval;
      rval.aij(1,1) = v.x();
      rval.aij(2,2) = v.y();
      rval.aij(3,3) = v.z();
      return rval;
    }

    static Matrix4D makeRotMat(const Vector4D &e1, const Vector4D &e2);
    static Matrix4D makeRotTranMat(const Vector4D &e1, const Vector4D &e2, const Vector4D &tran);

    static Matrix4D makeRotMat(const Vector4D &axis, value_type theta);

    /////////////////////////////////////
    // self transformation

    /// Apply translation (this = this * Tr)
    void translate(const Vector4D &vtran) {
      Matrix4D rmat = makeTransMat(vtran);
      matprod(rmat);
    }

    /// Apply rotation quaternion (this = this * H)
    void rotate(const LQuat &q) {
      Matrix4D rmat = makeRotMat(q);
      matprod(rmat);
    }

    /////////////////////////////////////
    // Debug/utility methods

    void dump() const {
      MB_DPRINTLN("( %.5f %.5f %.5f %.5f )", aij(1,1), aij(1,2), aij(1,3), aij(1,4));
      MB_DPRINTLN("( %.5f %.5f %.5f %.5f )", aij(2,1), aij(2,2), aij(2,3), aij(2,4));
      MB_DPRINTLN("( %.5f %.5f %.5f %.5f )", aij(3,1), aij(3,2), aij(3,3), aij(3,4));
      MB_DPRINTLN("( %.5f %.5f %.5f %.5f )", aij(4,1), aij(4,2), aij(4,3), aij(4,4));
    }

    LString toString() const {
      LString ret;
      ret += LString::format("[( %.5f %.5f %.5f %.5f ),", aij(1,1), aij(1,2), aij(1,3), aij(1,4));
      ret += LString::format("( %.5f %.5f %.5f %.5f ),", aij(2,1), aij(2,2), aij(2,3), aij(2,4));
      ret += LString::format("( %.5f %.5f %.5f %.5f ),", aij(3,1), aij(3,2), aij(3,3), aij(3,4));
      ret += LString::format("( %.5f %.5f %.5f %.5f )]", aij(4,1), aij(4,2), aij(4,3), aij(4,4));
      return ret;
    }

  };

}

#endif // MATRIX_4D_H__
