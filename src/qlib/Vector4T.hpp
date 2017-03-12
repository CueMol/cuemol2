//
// Vector class with 4 dimension any value
//

#ifndef __QLIB_VECTOR_4T_HPP__
#define __QLIB_VECTOR_4T_HPP__

#include "qlib.hpp"
#include "VectorND.hpp"
#include "LTypes.hpp"

#include "Vector2T.hpp"
#include "Vector3T.hpp"

namespace qlib {

  template <typename _ValueType>
  class Vector4T : public VectorND<4, _ValueType>
  {
  public:
    typedef VectorND<4, _ValueType> super_t;

  public:
    typedef _ValueType value_type;
    
    ///////////////////////////////////////////////////
    // constructors

  public:

    /// Default constructor
    Vector4T()
      : super_t()
    {
    }

    /// Constructor without initialization
    Vector4T(int a, detail::no_init_tag b)
      : super_t(a, b)
    {
    }

    /// copy constructor
    Vector4T(const Vector4T &arg)
      : super_t(arg)
    {
    }

    /// construction from ptr
    explicit
    Vector4T(const value_type *parg)
      : super_t(parg)
    {
    }

    /// Implicit conversion
    Vector4T(const super_t &arg)
      : super_t(arg)
    {
    }

    /// Conversion
    template <typename _ArgType>
    explicit
    Vector4T(const Vector4T<_ArgType> &arg)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = value_type( arg.ai(1) );
      super_t::ai(2) = value_type( arg.ai(2) );
      super_t::ai(3) = value_type( arg.ai(3) );
      super_t::ai(4) = value_type( arg.ai(4) );
    }

    Vector4T(value_type ax,value_type ay, value_type az, value_type aw)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
      super_t::ai(3) = az;
      super_t::ai(4) = aw;
    }

    /// construction from 3D vector
    Vector4T(const Vector3T<_ValueType> &arg, value_type aw)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = arg.ai(1);
      super_t::ai(2) = arg.ai(2);
      super_t::ai(3) = arg.ai(3);
      super_t::ai(4) = aw;
    }

    //////////////////////////////////////////
    // methods

  public:

    inline value_type x() const { return super_t::ai(1); }
    inline value_type y() const { return super_t::ai(2); }
    inline value_type z() const { return super_t::ai(3); }
    inline value_type w() const { return super_t::ai(4); }

    inline value_type &x() { return super_t::ai(1); }
    inline value_type &y() { return super_t::ai(2); }
    inline value_type &z() { return super_t::ai(3); }
    inline value_type &w() { return super_t::ai(4); }

    inline Vector2T<_ValueType> xy() const {
      return Vector2T<_ValueType>(super_t::ai(1),
				  super_t::ai(2));
    }

    inline Vector3T<_ValueType> xyz() const {
      return Vector2T<_ValueType>(super_t::ai(1),
				  super_t::ai(2),
				  super_t::ai(3));
    }

    inline void set(value_type ax, value_type ay, value_type az)
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
      super_t::ai(3) = az;
    }

    inline void set(value_type ax, value_type ay, value_type az, value_type aw)
    {
      set(ax, ay, az);
      super_t::ai(4) = aw;
    }

    Vector4T cross(const Vector4T &arg) const
    {
      return Vector4T(y()*arg.z() - z()*arg.y(),
                      z()*arg.x() - x()*arg.z(),
                      x()*arg.y() - y()*arg.x(),
		      value_type(0));
    }
    
    /// check zero vector (ignoring w elem)
    bool isZero3(value_type dtol = value_type(F_EPS8)) const
    {
      for (int i=1; i<=3; ++i) {
        if (! (qlib::abs<value_type>(super_t::ai(i))<=dtol) )
	  return false;
      }
      return true;
    }

  };

} // namespace qlib

#endif

