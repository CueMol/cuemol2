//
// Vector class with 3 dimension int value
//

#ifndef __QLIB_INTVEC_3D_HPP__
#define __QLIB_INTVEC_3D_HPP__

#include "qlib.hpp"
#include "Vector4D.hpp"

namespace qlib {

  class IntVec3D : public qlib::VectorND<3, int>
  {
  public:

    typedef qlib::VectorND<3, int> super_t;
    typedef super_t::value_type value_type;

    /// default constructor
    IntVec3D()
    {
      super_t::zero();
    }

    /// constructor without initialization
    explicit
      IntVec3D(int, qlib::detail::no_init_tag)
      {
      }

    IntVec3D(value_type ax,value_type ay ,value_type az)
    {
      super_t::ai(1) = ax;
      super_t::ai(2) = ay;
      super_t::ai(3) = az;
    }

    /// Implicit conversion
    IntVec3D(const super_t &arg)
         : super_t(arg)
    {
    }

    qlib::Vector4D vec4() const {
      return qlib::Vector4D(ai(1),ai(2),ai(3),0);
    }

    inline value_type col() const { return ai(1); }
    inline value_type &col() { return ai(1); }
      
    inline value_type row() const { return ai(2); }
    inline value_type &row() { return ai(2); }

    inline value_type sec() const { return ai(3); }
    inline value_type &sec() { return ai(3); }

  };

  inline IntVec3D operator+(const IntVec3D &p1,const IntVec3D &p2)
  {
    return p1.add(p2);
  }
  inline IntVec3D operator-(const IntVec3D &p1,const IntVec3D &p2)
  {
    return p1.sub(p2);
  }
}

#endif

