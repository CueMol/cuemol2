//
// Scriptable vector class with 4-d real value
//

#ifndef __QLIB_SCR_VECTOR_4D_HPP__
#define __QLIB_SCR_VECTOR_4D_HPP__

#include "LScrObjects.hpp"
#include "LVarDict.hpp"
#include "LVarArray.hpp"
#include "Vector4D.hpp"
#include "mcutils.hpp"
#include "qlib.hpp"

namespace qlib {

class QLIB_API LScrVector4D : public LSimpleCopyScrObject, public Vector4D
{
    MC_SCRIPTABLE;

    MC_CLONEABLE;

public:
    /////////////////
    // constructors

    /** default constructor */
    LScrVector4D() {}

    /** copy constructor */
    LScrVector4D(const LScrVector4D &arg) : Vector4D(arg) {}

    /** Implicit conversion */
    LScrVector4D(const Vector4D &arg) : Vector4D(arg) {}

    LScrVector4D(double ax, double ay, double az, double aw) : Vector4D(ax, ay, az, aw)
    {
    }

    LScrVector4D(double ax, double ay, double az) : Vector4D(ax, ay, az) {}

    virtual ~LScrVector4D();

    // Assignment operator
    const LScrVector4D &operator=(const LScrVector4D &arg)
    {
        if (&arg != this) {
            Vector4D::operator=(arg);
        }
        return *this;
    }

    ///////////////////////////

    LReal getX() const
    {
        return Vector4D::x();
    }
    LReal getY() const
    {
        return Vector4D::y();
    }
    LReal getZ() const
    {
        return Vector4D::z();
    }
    LReal getW() const
    {
        return Vector4D::w();
    }
    void setX(LReal aVal)
    {
        Vector4D::x() = aVal;
    }
    void setY(LReal aVal)
    {
        Vector4D::y() = aVal;
    }
    void setZ(LReal aVal)
    {
        Vector4D::z() = aVal;
    }
    void setW(LReal aVal)
    {
        Vector4D::w() = aVal;
    }

    LScrVector4D scale(LReal aVal) const
    {
        return LScrVector4D(Vector4D::scale(aVal));
    }
    LScrVector4D divideScr(LReal aVal) const
    {
        return LScrVector4D(Vector4D::divideThrows(aVal));
    }
    LScrVector4D normalizeScr() const
    {
        return LScrVector4D(Vector4D::normalizeThrows());
    }
    LScrVector4D cross(const LScrVector4D &aVal) const
    {
        return LScrVector4D(Vector4D::cross(aVal));
    }

    LScrVector4D addScr(const LScrVector4D &aVal) const
    {
        return LScrVector4D(Vector4D::add(aVal));
    }
    LScrVector4D subScr(const LScrVector4D &aVal) const
    {
        return LScrVector4D(Vector4D::sub(aVal));
    }

    virtual bool isStrConv() const;
    virtual LString toString() const;

    void setStrValue(const LString &val);

    typedef boost::true_type has_fromString;
    static LScrVector4D *fromStringS(const LString &src);

#if 0
    //////////
    // for test

    LVarDict getDict() const
    {
        return m_dictValue;
    }
    void setDict(const LVarDict &dict)
    {
        m_dictValue = dict;
    }

    LVarArray getArray() const
    {
        return m_arrayValue;
    }
    void setArray(const LVarArray &value)
    {
        m_arrayValue = value;
    }

private:
    LVarDict m_dictValue;
    LVarArray m_arrayValue;
#endif

};

}  // namespace qlib

#endif
