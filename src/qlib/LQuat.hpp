//
// Quaternion object
//


#ifndef L_QUAT_HPP__
#define L_QUAT_HPP__

#include "qlib.hpp"

#include "Vector4D.hpp"
#include "Matrix4D.hpp"

// #include "LSerial.hpp"

namespace qlib {

  class QLIB_API LQuat
  {
      
  public:
    /// Vector representation of the quaternion
    Vector4D m_data;

    /// type of the element
    typedef Vector4D::value_type value_type;

  public:
    // constructors

    // default constructor
    LQuat()
      : m_data()
    {
    }

    // copy constructor
    LQuat(const LQuat &arg)
      : m_data(arg.m_data)
    {
    }


    LQuat(value_type a, value_type x, value_type y, value_type z)
      : m_data(x, y, z, a)
    {
    }

    LQuat(const Vector4D &axis, value_type phi)
    {
      m_data = axis.scale(::sin(phi));
      m_data.ai(4) = ::cos(phi);
    }

    /** convert from the old vector-form representation */
    LQuat(const Vector4D &vrep)
      : m_data(vrep)
      //: V(vrep.x, vrep.y, vrep.z), a(vrep.w)
    {
    }

  public:

    //////////////////////////////////////////
    // C++ operators

    // = operator
    const LQuat &operator=(const LQuat &arg)
    {
      if(&arg!=this)
	m_data = arg.m_data;
      return *this;
    }

    // += operator
    const LQuat &operator+=(const LQuat &arg)
    {
      m_data += arg.m_data;
      return *this;
    }
    // -= operator
    const LQuat &operator-=(const LQuat &arg)
    {
      m_data -= arg.m_data;
      return *this;
    }

    // *= operator (scaling)
    const LQuat &operator*=(value_type arg)
    {
      scaleSelf(arg);
      return *this;
    }

    // /= operator (scaling)
    const LQuat &operator/=(value_type arg)
    {
      divideSelf(arg);
      return *this;
    }

    // - operator
    LQuat operator-() const
    {
      return LQuat(-m_data);
    }

    // + operator
    LQuat operator+()
    {
      return *this;
    }

    // *= operator
    const LQuat &operator*=(const LQuat &p2)
    {
      mulSelf(p2);
      return *this;
    }

    //////////////////////////////////////////
    // Access methods

    inline value_type Vx() const { return m_data.x(); }
    inline value_type Vy() const { return m_data.y(); }
    inline value_type Vz() const { return m_data.z(); }
    inline value_type a() const { return m_data.w(); }

    inline value_type &Vx() { return m_data.x(); }
    inline value_type &Vy() { return m_data.y(); }
    inline value_type &Vz() { return m_data.z(); }
    inline value_type &a()  { return m_data.w(); }

    LString toString() { return m_data.toString(); }

    //////////////////////////////////////////
    // binary operator

    bool equals(const LQuat &arg, value_type dtol = value_type(F_EPS8)) const
    {
      return m_data.equals(arg.m_data, dtol);
    }

    // square of vector length
    value_type sqlen() const
    {
      return m_data.sqlen();
    }

    LQuat scale(value_type arg) const
    {
      LQuat retval(m_data);
      retval *= arg;
      return retval;
    }

    LQuat divide(value_type arg) const
    {
      LQuat retval(m_data);
      retval /= arg;
      return retval;
    }

    void scaleSelf(value_type arg)
    {
      m_data *= arg;
    }

    void divideSelf(value_type arg)
    {
      m_data /= arg;
    }

    LQuat normalize() const
    {
      LQuat retval(m_data);
      retval /= ::sqrt(sqlen());
      return retval;
    }

    void normalizeSelf()
    {
      m_data /= ::sqrt(sqlen());
    }

    void normalizeSelf(value_type dtol)
    {
      value_type sql = sqlen();
      if (qlib::abs<value_type>(sql-1.0)>dtol) {
        m_data /= ::sqrt(sql);
      }
    }

    void mulSelf(const LQuat &p2)
    {
      const LQuat &p1 = *this;

      const value_type ww = p1.m_data.w()*p2.m_data.w();
      const value_type xx = p1.m_data.x()*p2.m_data.x();
      const value_type yy = p1.m_data.y()*p2.m_data.y();
      const value_type zz = p1.m_data.z()*p2.m_data.z();
      const value_type xw = p1.m_data.x()*p2.m_data.w();
      const value_type wx = p1.m_data.w()*p2.m_data.x();
      const value_type yz = p1.m_data.y()*p2.m_data.z();
      const value_type zy = p1.m_data.z()*p2.m_data.y();
      const value_type yw = p1.m_data.y()*p2.m_data.w();
      const value_type wy = p1.m_data.w()*p2.m_data.y();
      const value_type zx = p1.m_data.z()*p2.m_data.x();
      const value_type xz = p1.m_data.x()*p2.m_data.z();
      const value_type zw = p1.m_data.z()*p2.m_data.w();
      const value_type wz = p1.m_data.w()*p2.m_data.z();
      const value_type xy = p1.m_data.x()*p2.m_data.y();
      const value_type yx = p1.m_data.y()*p2.m_data.x();

      m_data.x() = xw + wx + yz - zy;
      m_data.y() = yw + wy + zx - xz;
      m_data.z() = zw + wz + xy - yx;
      m_data.w() = ww - (xx + yy + zz);
    }

    LQuat mul(const LQuat &p2) const {
      LQuat ret(*this);
      ret.mulSelf(p2);
      return ret;
    }

    LQuat inv() const
    {
      LQuat retval;

      const value_type scl = -1.0/sqlen();
      retval.m_data.w() = m_data.w()/sqlen();
      retval.m_data.x() = m_data.x() * scl;
      retval.m_data.y() = m_data.y() * scl;
      retval.m_data.z() = m_data.z() * scl;

      return retval;
    }

    LQuat conj() const
    {
      LQuat retval;

      retval.m_data.w() = m_data.w();
      retval.m_data.x() = -m_data.x();
      retval.m_data.y() = -m_data.y();
      retval.m_data.z() = -m_data.z();

      return retval;
    }

    LQuat rotateX(value_type degree) const
    {
      qlib::Vector4D axis(1,0,0);
      const value_type ax = qlib::toRadian(degree)/2.0;
      return mul( LQuat(axis, ax) );
    }

    LQuat rotateY(value_type degree) const
    {
      qlib::Vector4D axis(0,1,0);
      const value_type ax = qlib::toRadian(degree)/2.0;
      return mul( LQuat(axis, ax) );
    }

    LQuat rotateZ(value_type degree) const
    {
      qlib::Vector4D axis(0,0,1);
      const value_type ax = qlib::toRadian(degree)/2.0;
      return mul( LQuat(axis, ax) );
    }

    void fromEuler(value_type alpha, value_type beta, value_type gamma)
    {
      value_type cr, cp, cy, sr, sp, sy, cpcy, spsy;

      //If we are in Degree mode, convert to Radians
      alpha = qlib::toRadian(alpha);
      beta = qlib::toRadian(beta);
      gamma = qlib::toRadian(gamma);

      //Calculate trig identities
      //Formerly roll, pitch, yaw
      cr = cos(alpha/2);
      cp = cos(beta/2);
      cy = cos(gamma/2);
      sr = sin(alpha/2);
      sp = sin(beta/2);
      sy = sin(gamma/2);

      cpcy = cp * cy;
      spsy = sp * sy;

      m_data.w() = cr * cpcy + sr * spsy;
      m_data.x() = sr * cpcy - cr * spsy;
      m_data.y() = cr * sp * cy + sr * cp * sy;
      m_data.z() = cr * cp * sy - sr * sp * cy;
    }

    static LQuat makeFromEuler(value_type alpha, value_type beta, value_type gamma)
    {
      LQuat q;
      q.fromEuler(alpha, beta, gamma);
      return q;
    }

    void toEuler(value_type &roll, value_type &pitch, value_type &yaw) const
    {
      value_type tanyaw, sinpitch, tanroll;

      tanyaw = 2.0*(m_data.x()*m_data.y() + m_data.w()*m_data.z()) /
	(m_data.w()*m_data.w() + m_data.x()*m_data.x() - m_data.y()*m_data.y() - m_data.z()*m_data.z());
      sinpitch = -2.0*(m_data.x()*m_data.z()-m_data.w()*m_data.y());
      tanroll = 2.0*(m_data.w()*m_data.x()+m_data.y()*m_data.z()) /
	(m_data.w()*m_data.w() - m_data.x()*m_data.x() - m_data.y()*m_data.y() + m_data.z()*m_data.z());

      roll = ::atan(tanroll);
      pitch = ::asin(sinpitch);
      yaw = ::atan(tanyaw);
    }

/*
    Matrix4D toRotMatrix() const {
      Matrix4D rmat;
      rmat.aij(1,1) = 1.0 - 2.0 * (m_data.y() * m_data.y() + m_data.z() * m_data.z());
      rmat.aij(1,2) = 2.0 * (m_data.x() * m_data.y() + m_data.z() * m_data.w());
      rmat.aij(1,3) = 2.0 * (m_data.z() * m_data.x() - m_data.y() * m_data.w());
      rmat.aij(1,4) = 0.0;

      rmat.aij(2,1) = 2.0 * (m_data.x() * m_data.y() - m_data.z() * m_data.w());
      rmat.aij(2,2) = 1.0 - 2.0 * (m_data.z() * m_data.z() + m_data.x() * m_data.x());
      rmat.aij(2,3) = 2.0 * (m_data.y() * m_data.z() + m_data.x() * m_data.w());
      rmat.aij(2,4) = 0.0;

      rmat.aij(3,1) = 2.0 * (m_data.z() * m_data.x() + m_data.y() * m_data.w());
      rmat.aij(3,2) = 2.0 * (m_data.y() * m_data.z() - m_data.x() * m_data.w());
      rmat.aij(3,3) = 1.0 - 2.0 * (m_data.y() * m_data.y() + m_data.x() * m_data.x());
      rmat.aij(3,4) = 0.0;

      rmat.aij(4,1) = 0.0;
      rmat.aij(4,2) = 0.0;
      rmat.aij(4,3) = 0.0;
      rmat.aij(4,4) = 1.0;
      return rmat;
    }
*/
    
    Matrix4D toRotMatrix() const
    {
      const value_type xx = m_data.x() * m_data.x();
      const value_type yy = m_data.y() * m_data.y();
      const value_type zz = m_data.z() * m_data.z();

      const value_type xy = m_data.x() * m_data.y();
      const value_type zw = m_data.z() * m_data.w();

      const value_type zx = m_data.z() * m_data.x();
      const value_type yw = m_data.y() * m_data.w();

      const value_type yz = m_data.y() * m_data.z();
      const value_type xw = m_data.x() * m_data.w();

      Matrix4D rmat;
      rmat.aij(1,1) -= 2.0 * (yy + zz);
      rmat.aij(1,2) = 2.0 * (xy + zw);
      rmat.aij(1,3) = 2.0 * (zx - yw);

      rmat.aij(2,1) = 2.0 * (xy - zw);
      rmat.aij(2,2) -= 2.0 * (zz + xx);
      rmat.aij(2,3) = 2.0 * (yz + xw);

      rmat.aij(3,1) = 2.0 * (zx + yw);
      rmat.aij(3,2) = 2.0 * (yz - xw);
      rmat.aij(3,3) -= 2.0 * (yy + xx);

      //rmat.aij(1,4) = 0.0;
      //rmat.aij(2,4) = 0.0;
      //rmat.aij(3,4) = 0.0;
      //rmat.aij(4,1) = 0.0;
      //rmat.aij(4,2) = 0.0;
      //rmat.aij(4,3) = 0.0;
      //rmat.aij(4,4) = 1.0;
      return rmat;
    }
    
    static LQuat slerp(const LQuat &q, const LQuat &r, const value_type t, bool bKeepPositive=true);

    static LQuat makeFromRotMat(const Matrix3D &m);
  };


  // Definitions of non-member binary operator functions

  inline LQuat operator+(const LQuat &p1,const LQuat &p2)
  {
    LQuat retval(p1);
    retval += p2;
    return retval;
  }

  inline LQuat operator-(const LQuat &p1,const LQuat &p2)
  {
    LQuat retval(p1);
    retval -= p2;
    return retval;
  }

  inline LQuat operator*(const LQuat &p1,const LQuat &p2)
  {
    return p1.mul(p2);
  }

  inline bool operator==(const LQuat &p1,const LQuat &p2)
  {
    return p1.equals(p2);
  }

}

#endif // QUATERNION_H__
