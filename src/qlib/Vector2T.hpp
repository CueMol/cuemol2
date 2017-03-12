//
// Vector class with 2 dimension any value
//

#ifndef __QLIB_VECTOR_2T_HPP__
#define __QLIB_VECTOR_2T_HPP__

#include "qlib.hpp"
#include "VectorND.hpp"
#include "LTypes.hpp"

namespace qlib {

  template <typename _ValueType>
  class Vector2T : public VectorND<2, _ValueType>
  {
  public:
    typedef VectorND<2, _ValueType> super_t;

  public:
    typedef _ValueType value_type;
    
    ///////////////////////////////////////////////////
    // constructors

  public:

    /// Default constructor
    Vector2T()
      : super_t()
    {
    }

    /// Constructor without initialization
    Vector2T(int a, detail::no_init_tag b)
      : super_t(a, b)
    {
    }

    /// copy constructor
    Vector2T(const Vector2T &arg)
      : super_t(arg)
    {
    }

    /// construction from ptr
    explicit
    Vector2T(const value_type *parg)
      : super_t(parg)
    {
    }

    /// Implicit conversion
    Vector2T(const super_t &arg)
      : super_t(arg)
    {
    }

    /// Cconversion
    template <typename _ArgType>
    explicit
    Vector2T(const Vector2T<_ArgType> &arg)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = value_type( arg.ai(1) );
      super_t::ai(2) = value_type( arg.ai(2) );
    }

    Vector2T(value_type ax,value_type ay)
      : super_t(0, detail::no_init_tag())
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
    }


    //////////////////////////////////////////
    // methods

  public:

    inline value_type x() const { return super_t::ai(1); }
    inline value_type y() const { return super_t::ai(2); }

    inline value_type &x() { return super_t::ai(1); }
    inline value_type &y() { return super_t::ai(2); }

    inline void set(value_type ax, value_type ay) {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
    }

    inline value_type cross(const Vector2T &av) const {
      return x() * av.y() - y() * av.x();
    }

  };

} // namespace qlib

#endif

