//
// Vector class with 3 dimension float64 value
//

#ifndef __QLIB_VECTOR_3D_HPP__
#define __QLIB_VECTOR_3D_HPP__

#include "qlib.hpp"
#include "Vector3T.hpp"
#include "LTypes.hpp"

namespace qlib {

  class Vector3D : public Vector3T<qfloat64>
  {
  public:
    typedef Vector3T<qfloat64> super_t;
    
  public:
    typedef qfloat64 value_type;

    ///////////////////////////////////////////////////
    // constructors

  public:

    /// Default constructor
    Vector3D()
      : super_t()
    {
    }

    /// Constructor without initialization
    Vector3D(int a, detail::no_init_tag b)
      : super_t(a, b)
    {
    }

    /// copy constructor
    Vector3D(const Vector3D &arg)
      : super_t(arg)
    {
    }

    /// construction from ptr
    explicit
    Vector3D(const value_type *parg)
      : super_t(parg)
    {
    }

    /// Implicit conversion
    Vector3D(const super_t &arg)
      : super_t(arg)
    {
    }

    /// Implicit conversion
    Vector3D(const super_t::super_t &arg)
      : super_t(arg)
    {
    }

    /// Cconversion
    template <typename _ArgType>
    explicit
    Vector3D(const Vector3T<_ArgType> &arg)
      : super_t(arg)
    {
    }

    Vector3D(value_type ax,value_type ay, value_type az)
      : super_t(ax, ay, az)
    {
    }

    Vector3D(const Vector2T<value_type> &arg, value_type az)
      : super_t(arg, az)
    {
    }
  };

  ///////////////////////////////////////////////
  // Definitions of non-member binary operators

  inline Vector3D operator+(const Vector3D &p1,const Vector3D &p2)
  {
    return p1.add(p2);
  }

  inline Vector3D operator-(const Vector3D &p1,const Vector3D &p2)
  {
    return p1.sub(p2);
  }

  inline bool operator==(const Vector3D &p1,const Vector3D &p2)
  {
    return p1.equals(p2);
  }

} // namespace qlib

#endif

