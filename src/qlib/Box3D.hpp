// -*-Mode: C++;-*-
//
// $Id: Box3D.hpp,v 1.2 2010/11/05 14:24:26 rishitani Exp $

#ifndef BOX_3D_HPP_INCLUDED
#define BOX_3D_HPP_INCLUDED

#include "Vector4D.hpp"

namespace qlib {

  class Box3D
  {
  public:
    Vector4D vstart;
    Vector4D vend;

  public:
    /////////////////
    // constructors

    /** default constructor */
    Box3D()
      : vstart(+1.0, +1.0, +1.0), vend(-1.0, -1.0, -1.0)
    {
    }

    /** copy constructor */
    Box3D(const Box3D &arg)
      : vstart(arg.vstart), vend(arg.vend)
    {
    }

  public:

    /////////////////////////
    // unary operator

    /** assignment operator */
    const Box3D &operator=(const Box3D &arg) {
      if(&arg!=this){
        vstart = arg.vstart;
        vend = arg.vend;
      }
      return *this;
    }

    void merge(const Vector4D &pos) {
      if (isEmpty()) {
        vend = vstart = pos;
        return;
      }

      if (pos.x()<vstart.x()) vstart.x() = pos.x();
      if (vend.x()<pos.x()) vend.x() = pos.x();

      if (pos.y()<vstart.y()) vstart.y() = pos.y();
      if (vend.y()<pos.y()) vend.y() = pos.y();

      if (pos.z()<vstart.z()) vstart.z() = pos.z();
      if (vend.z()<pos.z()) vend.z() = pos.z();
    }

    void inflate(double d) {
      if (isEmpty()) return;
      vstart.x() -= d;
      vstart.y() -= d;
      vstart.z() -= d;

      vend.x() += d;
      vend.y() += d;
      vend.z() += d;
    }

    bool contains(const Vector4D &pos) const {
      return (vstart.x()<=pos.x() && pos.x()<vend.x() &&
              vstart.y()<=pos.y() && pos.y()<vend.y() &&
              vstart.z()<=pos.z() && pos.z()<vend.z());

    }

    bool isEmpty() const {
      return (vstart.x()>vend.x() ||
              vstart.y()>vend.y() ||
              vstart.z()>vend.z());
    }

    void setEmpty() {
      vstart = Vector4D(+1.0, +1.0, +1.0);
      vend = Vector4D(-1.0, -1.0, -1.0);
    }

    Vector4D center() const {
      return (vstart+vend).divide(2.0);
    }

    double sizex() const {
      return vend.x()-vstart.x();
    }
    double sizey() const {
      return vend.y()-vstart.y();
    }
    double sizez() const {
      return vend.z()-vstart.z();
    }
    Vector4D size() const {
      return Vector4D(sizex(), sizey(), sizez());
    }
  };
}

#endif

