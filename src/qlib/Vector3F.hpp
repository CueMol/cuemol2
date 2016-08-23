//
// Vector class with 3 dimension float32 value
//

#ifndef __QLIB_VECTOR_3F_HPP__
#define __QLIB_VECTOR_3F_HPP__

#include "qlib.hpp"
#include "VectorND.hpp"
#include "LTypes.hpp"

namespace qlib {

  class Vector3F : public VectorND<3, qfloat32>
  {
  public:
    typedef VectorND<3, qfloat32> super_t;
    
  public:
    /////////////////
    // constructors

    /// Default constructor
    Vector3F()
    {
      super_t::zero();
    }

    /// Constructor without initialization
    explicit
    Vector3F(int, detail::no_init_tag)
    {
    }

    /// copy constructor
    Vector3F(const Vector3F &arg)
         : super_t(arg)
    {
    }

    /// Implicit conversion
    Vector3F(const super_t &arg)
         : super_t(arg)
    {
    }

    Vector3F(qfloat32 ax,qfloat32 ay, qfloat32 az)
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
      super_t::ai(3) = ay;
    }

  public:

    inline qfloat32 x() const { return super_t::ai(1); }
    inline qfloat32 y() const { return super_t::ai(2); }
    inline qfloat32 z() const { return super_t::ai(3); }

    inline qfloat32 &x() { return super_t::ai(1); }
    inline qfloat32 &y() { return super_t::ai(2); }
    inline qfloat32 &z() { return super_t::ai(3); }

    //////////////////////////////////////////
    // methods

    /*void set(qfloat32 ax, qfloat32 ay, qfloat32 az) {
      ai(1) = ax;
      ai(2) = ay;
      ai(3) = az;
    }*/

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

