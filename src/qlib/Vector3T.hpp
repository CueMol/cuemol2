//
// Vector class with 3 dimension any value
//

#ifndef __QLIB_VECTOR_3T_HPP__
#define __QLIB_VECTOR_3T_HPP__

#include "qlib.hpp"
#include "VectorND.hpp"
#include "LTypes.hpp"

#include "Vector2T.hpp"

namespace qlib {

  template <typename _ValueType>
  class Vector3T : public VectorND<3, _ValueType>
  {
  public:
    typedef VectorND<3, _ValueType> super_t;

  public:
    typedef _ValueType value_type;
    
    ///////////////////////////////////////////////////
    // constructors

  public:

    /// Default constructor
    Vector3T()
      : super_t()
    {
    }

    /// Constructor without initialization
    Vector3T(int a, detail::no_init_tag b)
      : super_t(a, b)
    {
    }

    /// copy constructor
    Vector3T(const Vector3T &arg)
      : super_t(arg)
    {
    }

    /// construction from ptr
    explicit
    Vector3T(const value_type *parg)
      : super_t(parg)
    {
    }

    /// Implicit conversion
    Vector3T(const super_t &arg)
      : super_t(arg)
    {
    }

    /// Cconversion
    template <typename _ArgType>
    explicit
    Vector3T(const Vector3T<_ArgType> &arg)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = value_type( arg.ai(1) );
      super_t::ai(2) = value_type( arg.ai(2) );
      super_t::ai(3) = value_type( arg.ai(3) );
    }

    Vector3T(value_type ax,value_type ay, value_type az)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
      super_t::ai(3) = az;
    }

    /// construction from 2D vector
    Vector3T(const Vector2T<_ValueType> &arg, value_type az)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = arg.ai(1);
      super_t::ai(2) = arg.ai(2);
      super_t::ai(3) = az;
    }

    //////////////////////////////////////////
    // methods

  public:

    inline value_type x() const { return super_t::ai(1); }
    inline value_type y() const { return super_t::ai(2); }
    inline value_type z() const { return super_t::ai(3); }

    inline value_type &x() { return super_t::ai(1); }
    inline value_type &y() { return super_t::ai(2); }
    inline value_type &z() { return super_t::ai(3); }

    Vector2T<_ValueType> xy() const {
      return Vector2T<_ValueType>(super_t::ai(1),
				  super_t::ai(2));
    }

    Vector3T cross(const Vector3T &arg) const
    {
      return Vector3T(y()*arg.z() - z()*arg.y(),
                      z()*arg.x() - x()*arg.z(),
                      x()*arg.y() - y()*arg.x());
    }
    
  };

} // namespace qlib

#endif

