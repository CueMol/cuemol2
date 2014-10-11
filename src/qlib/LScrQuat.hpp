//
// Scriptable version of the quaternion object
//

#ifndef L_SCR_QUAT_HPP__
#define L_SCR_QUAT_HPP__

#include "qlib.hpp"

#include "LQuat.hpp"
#include "LScrMatrix4D.hpp"
#include "LScrObjects.hpp"
#include "mcutils.hpp"

namespace qlib {

  class QLIB_API LScrQuat : public LSimpleCopyScrObject, public LQuat
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
      
  public:
    // constructors

    /** default constructor */
    LScrQuat()
    {
    }

    /** copy constructor */
    LScrQuat(const LScrQuat &arg)
         : LQuat(arg)
    {
    }

    /** Implicit conversion */
    LScrQuat(const LQuat &arg)
         : LQuat(arg)
    {
    }

    LScrQuat(double a, double x, double y, double z)
         : LQuat(x, y, z, a)
    {
    }

    LScrQuat(const Vector4D &axis, double phi)
         : LQuat(axis, phi)
    {
    }

    /** convert from the old vector-form representation */
    LScrQuat(const Vector4D &vrep)
         : LQuat(vrep)
    {
    }

    /** destructor */
    virtual ~LScrQuat();

    // Assignment operator
    const LScrQuat &operator=(const LScrQuat &arg) {
      if(&arg!=this) {
	LQuat::operator=(arg);
      }
      return *this;
    }

  public:

    double getX() const { return LQuat::Vx(); }
    double getY() const { return LQuat::Vy(); }
    double getZ() const { return LQuat::Vz(); }
    double getA() const { return LQuat::a(); }

    void setX(double aVal) { LQuat::Vx() = aVal; }
    void setY(double aVal) { LQuat::Vy() = aVal; }
    void setZ(double aVal) { LQuat::Vz() = aVal; }
    void setA(double aVal) { LQuat::a() = aVal; }

    virtual bool equals(const LScrQuat &arg) const;

    virtual bool isStrConv() const;
    virtual LString toString() const;

    typedef boost::true_type has_fromString;
    static LScrQuat *fromStringS(const LString &src);

    LScrQuat scale(double aVal) const {
      return LScrQuat(LQuat::scale(aVal));
    }
    LScrQuat divide(double aVal) const {
      return LScrQuat(LQuat::divide(aVal));
    }
    LScrQuat normalize() const {
      return LScrQuat(LQuat::normalize());
    }
    LScrQuat mul(const LScrQuat &aVal) const {
      return LScrQuat(LQuat::mul(aVal));
    }

    LScrQuat rotateX(double aVal) const {
      return LScrQuat(LQuat::rotateX(aVal));
    }
    LScrQuat rotateY(double aVal) const {
      return LScrQuat(LQuat::rotateY(aVal));
    }
    LScrQuat rotateZ(double aVal) const {
      return LScrQuat(LQuat::rotateZ(aVal));
    }


    LScrMatrix4D toMatrix() const {
      return LScrMatrix4D(LQuat::toRotMatrix());
    }

    LScrQuat conjugate() const {
      return LScrQuat(LQuat::conj());
    }

  };

}

#endif

