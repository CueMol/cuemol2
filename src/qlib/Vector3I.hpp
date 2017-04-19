//
// Vector class with 3 dimension int32 value
//

#ifndef __QLIB_VECTOR_3I_HPP__
#define __QLIB_VECTOR_3I_HPP__

#include "qlib.hpp"
#include "Vector3T.hpp"
#include "LTypes.hpp"

namespace qlib {

  class Vector3I : public Vector3T<qint32>
  {
  public:
    typedef Vector3T<qint32> super_t;
    
  public:
    typedef super_t::value_type value_type;

    ///////////////////////////////////////////////////
    // constructors

  public:

    /// Default constructor
    Vector3I()
      : super_t()
    {
    }

    /// Constructor without initialization
    Vector3I(int a, detail::no_init_tag b)
      : super_t(a, b)
    {
    }

    /// copy constructor
    Vector3I(const Vector3I &arg)
      : super_t(arg)
    {
    }

    /// construction from ptr
    explicit
    Vector3I(const value_type *parg)
      : super_t(parg)
    {
    }

    /// Implicit conversion
    Vector3I(const super_t &arg)
      : super_t(arg)
    {
    }

    /// Implicit conversion
    Vector3I(const super_t::super_t &arg)
      : super_t(arg)
    {
    }

    /// Cconversion
    template <typename _ArgType>
    explicit
    Vector3I(const Vector3T<_ArgType> &arg)
      : super_t(arg)
    {
    }

    Vector3I(value_type ax,value_type ay, value_type az)
      : super_t(ax, ay, az)
    {
    }

    /// construction from 2D vector
    Vector3I(const Vector2T<value_type> &arg, value_type az)
      : super_t(arg, az)
    {
    }

    inline value_type col() const { return ai(1); }
    inline value_type &col() { return ai(1); }
      
    inline value_type row() const { return ai(2); }
    inline value_type &row() { return ai(2); }

    inline value_type sec() const { return ai(3); }
    inline value_type &sec() { return ai(3); }

  };

  ///////////////////////////////////////////////
  // Definitions of non-member binary operators

  inline Vector3I operator+(const Vector3I &p1,const Vector3I &p2)
  {
    return p1.add(p2);
  }

  inline Vector3I operator-(const Vector3I &p1,const Vector3I &p2)
  {
    return p1.sub(p2);
  }

  inline bool operator==(const Vector3I &p1,const Vector3I &p2)
  {
    return p1.equals(p2);
  }

} // namespace qlib

#endif

