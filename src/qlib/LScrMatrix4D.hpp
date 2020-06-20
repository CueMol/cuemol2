//
// Scriptable 4x4 matrix class
//
// $Id: LScrMatrix4D.hpp,v 1.3 2009/08/27 08:42:07 rishitani Exp $

#ifndef __QLIB_SCR_MATRIX_4D_H__
#define __QLIB_SCR_MATRIX_4D_H__

#include "LScrObjects.hpp"
#include "LScrVector4D.hpp"
#include "Matrix4D.hpp"
#include "Utils.hpp"
#include "mcutils.hpp"
#include "qlib.hpp"

namespace qlib {

class QLIB_API LScrMatrix4D : public LSimpleCopyScrObject, public Matrix4D
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    // typedef super_t Matrix4D;

public:
    // constructors

    /// default constructor
    LScrMatrix4D() {}

    /// copy constructor
    LScrMatrix4D(const LScrMatrix4D &arg) : Matrix4D(arg) {}

    /// Implicit conversion
    LScrMatrix4D(const Matrix4D &arg) : Matrix4D(arg) {}

    /// destructor
    virtual ~LScrMatrix4D();

    /// Assignment operator
    const LScrMatrix4D &operator=(const LScrMatrix4D &arg)
    {
        if (&arg != this) {
            Matrix4D::operator=(arg);
        }
        return *this;
    }

    ///////////////////////

    virtual bool equals(const LScrMatrix4D &arg);

    // String <--> value conversion
    virtual bool isStrConv() const;
    virtual LString toString() const;
    typedef boost::true_type has_fromString;
    static LScrMatrix4D *fromStringS(const LString &src);

    static inline void indexCheck(int i, int j) {
        if (i<=0 || Matrix4D::_N_ELEM <i) {
            auto msg = LString::format("index i=%d out of range", i);
            MB_THROW(IndexOutOfBoundsException, msg);
            return;
        }
        if (j<=0 || Matrix4D::_N_ELEM <j) {
            auto msg = LString::format("index j=%d out of range", j);
            MB_THROW(IndexOutOfBoundsException, msg);
            return;
        }
    }

    void setAt(int i, int j, value_type val)
    {
        indexCheck(i, j);
        Matrix4D::setAt(i, j, val);
    }

    value_type getAt(int i, int j) const
    {
        indexCheck(i, j);
        return Matrix4D::getAt(i, j);
    }

    value_type addAt(int i, int j, value_type val)
    {
        indexCheck(i, j);
        return Matrix4D::addAt(i, j, val);
    }

    //////////
    // arithmetics

    LScrMatrix4D scale(double aVal) const
    {
        return LScrMatrix4D(Matrix4D::scale(aVal));
    }
    LScrMatrix4D divide(double aVal) const
    {
        return LScrMatrix4D(Matrix4D::divide(aVal));
    }
    LScrMatrix4D add(const LScrMatrix4D &aVal) const
    {
        return LScrMatrix4D(Matrix4D::add(aVal));
    }
    LScrMatrix4D sub(const LScrMatrix4D &aVal) const
    {
        return LScrMatrix4D(Matrix4D::sub(aVal));
    }
    LScrMatrix4D mul(const LScrMatrix4D &aVal) const
    {
        return LScrMatrix4D(Matrix4D::mul(aVal));
    }
    LScrVector4D mulvec(const LScrVector4D &aVal) const
    {
        return LScrVector4D(Matrix4D::mulvec(aVal));
    }

    /// Diagonalization as a 3x3 matrix
    LScrMatrix4D diag3() const;

    void setRotate(const LScrVector4D &cen, const LScrVector4D &ax, double degree);

    void setTranslate(const LScrVector4D &shift);

    // Vector access methods

    void setRow(int i, const LScrVector4D &v)
    {
        aij(i, 1) = v.x();
        aij(i, 2) = v.y();
        aij(i, 3) = v.z();
        aij(i, 4) = v.w();
        ;
    }

    LScrVector4D row(int i) const
    {
        return LScrVector4D(aij(i, 1), aij(i, 2), aij(i, 3), aij(i, 4));
    }

    void setCol(int i, const LScrVector4D &v)
    {
        aij(1, i) = v.x();
        aij(2, i) = v.y();
        aij(3, i) = v.z();
        aij(4, i) = v.w();
    }

    LScrVector4D col(int i) const
    {
        return LScrVector4D(aij(1, i), aij(2, i), aij(3, i), aij(4, i));
    }
};

}  // namespace qlib

#endif
