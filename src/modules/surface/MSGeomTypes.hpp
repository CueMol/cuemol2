// -*-Mode: C++;-*-
//
// Geometric object defs for Molecular surface
//

#ifndef MOL_SURF_GEOM_TYPES_HPP_INCLUDED
#define MOL_SURF_GEOM_TYPES_HPP_INCLUDED

#include "surface.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/Array.hpp>

namespace surface {

  using qlib::Vector4D;

  class MSVert
  {
  public:
    
    /// vertex position
    float x, y, z;

    /// vertex normal
    float nx, ny, nz;

    /// vertex's atom info (aid)
    int info;

#ifdef USE_VERT_TYPE_ID
    /** for debug */
    int ntype;
#endif
    
    MSVert()
      : x(0), y(0), z(0), nx(0), ny(0), nz(0),
        info(0)
#ifdef USE_VERT_TYPE_ID
        ,ntype(0)
#endif
    {
    }

    MSVert(const MSVert &arg)
      : x(arg.x), y(arg.y), z(arg.z), nx(arg.nx), ny(arg.ny), nz(arg.nz),
        info(arg.info)
#ifdef USE_VERT_TYPE_ID
        ,ntype(arg.ntype)
#endif
    {
    }

    MSVert(const Vector4D &v, const Vector4D &n)
      : x((float)v.x()), y((float)v.y()), z((float)v.z()),
        nx((float)n.x()), ny((float)n.y()), nz((float)n.z()),
        info(0)
#ifdef USE_VERT_TYPE_ID
        ,ntype(0)
#endif
    {
    }

    MSVert(const Vector4D &v)
      : x((float)v.x()), y((float)v.y()), z((float)v.z()),
        nx(0), ny(0), nz(0),
        info(0)
#ifdef USE_VERT_TYPE_ID
        ,ntype(0)
#endif
    {
    }

    const MSVert &operator=(const MSVert &arg) {
      if(&arg!=this){
        x = arg.x;
        y = arg.y;
        z = arg.z;
        nx = arg.nx;
        ny = arg.ny;
        nz = arg.nz;
        info = arg.info;
#ifdef USE_VERT_TYPE_ID
        ntype = arg.ntype;
#endif
      }
      return *this;
    }

    Vector4D v3d() const {
      return Vector4D(x, y, z);
    }

    Vector4D n3d() const {
      return Vector4D(nx, ny, nz);
    }
  };

  ///
  ///  Face class for molsurf mesh object
  ///
  struct MSFace
  {
    int id1, id2, id3;

    MSFace() {}
    MSFace(int rid1, int rid2, int rid3)
         : id1(rid1), id2(rid2), id3(rid3)
      {}
  };

  ///
  /// Set of vertices/faces
  ///
  typedef qlib::Array<MSVert> MSVertArray;

  typedef qlib::Array<MSFace> MSFaceArray;

}


#endif

