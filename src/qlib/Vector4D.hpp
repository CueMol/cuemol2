//
// Vector class with 4 dimension real value
//

#ifndef __QLIB_VECTOR_4D_HPP__
#define __QLIB_VECTOR_4D_HPP__

#include "qlib.hpp"
#include "VectorND.hpp"

namespace qlib {

  class QLIB_API Vector4D : public VectorND<4, LReal>
  {
  public:
    typedef VectorND<4, LReal> super_t;
    typedef super_t::value_type value_type;
    
  public:
    /////////////////
    // constructors

    /// default constructor
    Vector4D()
    {
      super_t::zero();
    }

    /// constructor without initialization
    explicit
    Vector4D(int, detail::no_init_tag)
    {
    }

    /// copy constructor
    Vector4D(const Vector4D &arg)
         : super_t(arg)
    {
    }

    /// Implicit conversion
    Vector4D(const super_t &arg)
         : super_t(arg)
    {
    }

    Vector4D(value_type ax,value_type ay ,value_type az, value_type aw)
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
      super_t::ai(3) = az;
      super_t::ai(4) = aw;
    }

    Vector4D(value_type ax,value_type ay ,value_type az)
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
      super_t::ai(3) = az;
      super_t::ai(4) = value_type(0);
    }

  public:

    inline value_type x() const { return super_t::ai(1); }
    inline value_type y() const { return super_t::ai(2); }
    inline value_type z() const { return super_t::ai(3); }
    inline value_type w() const { return super_t::ai(4); }

    inline value_type &x() { return super_t::ai(1); }
    inline value_type &y() { return super_t::ai(2); }
    inline value_type &z() { return super_t::ai(3); }
    inline value_type &w() { return super_t::ai(4); }

    //////////////////////////////////////////
    // methods

    void set(value_type ax, value_type ay, value_type az) {
      ai(1) = ax;
      ai(2) = ay;
      ai(3) = az;
    }

    void set(value_type ax, value_type ay, value_type az, value_type aw) {
      set(ax, ay, az);
      ai(4) = aw;
    }

    /// Outer product
    Vector4D cross(const Vector4D &arg) const
    {
      return Vector4D(y()*arg.z() - z()*arg.y(),
                      z()*arg.x() - x()*arg.z(),
                      x()*arg.y() - y()*arg.x());
    }

    /// check zero vector (ignoring w elem)
    bool isZero3D(value_type dtol = value_type(F_EPS8)) const
    {
      for (int i=1; i<=3; ++i) {
        if (! (qlib::abs<value_type>(super_t::ai(i))<dtol) )
	  return false;
      }
      return true;
    }

    ///////////////////////////

    /// Calc Angle between two vectors, this and v2
    value_type angle(const Vector4D &v2) const
    {
      const double u = double( dot(v2) );
      const double l = double( length() ) * double( v2.length()  );
      const double res = ::acos( u/l );
      return value_type( res );
    }

    /// Calc Angle between two vectors, v1, and v2
    inline static value_type angle(const Vector4D &v1, const Vector4D &v2)
    {
      const double u = double( v1.dot(v2) );
      const double l = double( v1.length() ) * double( v2.length()  );
      const double res = ::acos( u/l );
      return value_type( res );
    }

    /// calc torsion angle (throw exception in singlarity case)
    static double torsion(const Vector4D &veci,
                          const Vector4D &vecj,
                          const Vector4D &veck,
                          const Vector4D &vecl);

    LString toString() const;

    typedef boost::true_type has_fromString;
    static bool fromStringS(const LString &src, Vector4D &result);


  };

  ///////////////////////////////////////////////
  // Definitions of non-member binary operators

  inline Vector4D operator+(const Vector4D &p1,const Vector4D &p2)
  {
    return p1.add(p2);
  }

  inline Vector4D operator-(const Vector4D &p1,const Vector4D &p2)
  {
    return p1.sub(p2);
  }

  inline bool operator==(const Vector4D &p1,const Vector4D &p2)
  {
    return p1.equals(p2);
  }

} // namespace qlib

#endif

