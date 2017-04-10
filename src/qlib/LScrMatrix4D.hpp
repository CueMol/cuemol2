//
// Scriptable 4x4 matrix class
//
// $Id: LScrMatrix4D.hpp,v 1.3 2009/08/27 08:42:07 rishitani Exp $

#ifndef __QLIB_SCR_MATRIX_4D_H__
#define __QLIB_SCR_MATRIX_4D_H__

#include "qlib.hpp"

#include "LScrObjects.hpp"
#include "Utils.hpp"
#include "mcutils.hpp"

#include "Matrix4D.hpp"
#include "LScrVector4D.hpp"

namespace qlib {

class QLIB_API LScrMatrix4D : public LSimpleCopyScrObject, public Matrix4D
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  public:
  // constructors
  
  /// default constructor
  LScrMatrix4D()
  {
  }
  
  /// copy constructor
  LScrMatrix4D(const LScrMatrix4D &arg)
       : Matrix4D(arg)
  {
  }

  /// Implicit conversion
  LScrMatrix4D(const Matrix4D &arg)
       : Matrix4D(arg)
  {
  }

  /// destructor
  virtual ~LScrMatrix4D();

  /// Assignment operator
  const LScrMatrix4D &operator=(const LScrMatrix4D &arg) {
    if(&arg!=this) {
      Matrix4D::operator=(arg);
    }
    return *this;
  }

  ///////////////////////

  virtual bool equals(const LScrMatrix4D &arg);
  virtual bool isStrConv() const;
  virtual LString toString() const;

  LScrMatrix4D scale(double aVal) const {
    return LScrMatrix4D(Matrix4D::scale(aVal));
  }
  LScrMatrix4D divide(double aVal) const {
    return LScrMatrix4D(Matrix4D::divide(aVal));
  }
  LScrMatrix4D add(const LScrMatrix4D &aVal) const {
    return LScrMatrix4D(Matrix4D::add(aVal));
  }
  LScrMatrix4D sub(const LScrMatrix4D &aVal) const {
    return LScrMatrix4D(Matrix4D::sub(aVal));
  }
  LScrMatrix4D mul(const LScrMatrix4D &aVal) const {
    return LScrMatrix4D(Matrix4D::mul(aVal));
  }
  LScrVector4D mulvec(const LScrVector4D &aVal) const {
    return LScrVector4D(Matrix4D::mulvec(aVal));
  }

  /// Diagonalization as a 3x3 matrix
  LScrMatrix4D diag3() const;

  LScrVector4D row(int i) const {
    return LScrVector4D(aij(i,1),
			aij(i,2),
			aij(i,3),
			aij(i,4));
  }

  LScrVector4D col(int i) const {
    return LScrVector4D(aij(1,i),
			aij(2,i),
			aij(3,i),
			aij(4,i));
  }

};

}

#endif

