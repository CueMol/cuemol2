//
// Vector class with 3 dimension float32 value
//

#ifndef __QLIB_VECTOR_3F_HPP__
#define __QLIB_VECTOR_3F_HPP__

#include "qlib.hpp"
//#include "VectorND.hpp"
#include "Vector3T.hpp"
#include "LTypes.hpp"

namespace qlib {

  //typedef Vector3T<qfloat32> Vector3F;

  class Vector3F : public Vector3T<qfloat32>
  {
  public:
    typedef Vector3T<qfloat32> super_t;
    
  public:
    typedef super_t::value_type value_type;

    ///////////////////////////////////////////////////
    // constructors

  public:

    /// Default constructor
    Vector3F()
      : super_t()
    {
    }

    /// Constructor without initialization
    Vector3F(int a, detail::no_init_tag b)
      : super_t(a, b)
    {
    }

    /// copy constructor
    Vector3F(const Vector3F &arg)
      : super_t(arg)
    {
    }

    /// construction from ptr
    explicit
    Vector3F(const value_type *parg)
      : super_t(parg)
    {
    }

    /// Implicit conversion
    Vector3F(const super_t &arg)
      : super_t(arg)
    {
    }

    /// Implicit conversion
    Vector3F(const super_t::super_t &arg)
      : super_t(arg)
    {
    }

    /// Cconversion
    template <typename _ArgType>
    explicit
    Vector3F(const Vector3T<_ArgType> &arg)
      : super_t(arg)
    {
    }

    Vector3F(value_type ax,value_type ay, value_type az)
      : super_t(ax, ay, az)
    {
    }

    /// construction from 2D vector
    Vector3F(const Vector2T<value_type> &arg, value_type az)
      : super_t(arg, az)
    {
    }
  };

  ///////////////////////////////////////////////
  // Definitions of non-member binary operators

  inline Vector3F operator+(const Vector3F &p1,const Vector3F &p2)
  {
    return p1.add(p2);
  }

  inline Vector3F operator-(const Vector3F &p1,const Vector3F &p2)
  {
    return p1.sub(p2);
  }

  inline bool operator==(const Vector3F &p1,const Vector3F &p2)
  {
    return p1.equals(p2);
  }

} // namespace qlib

#endif

