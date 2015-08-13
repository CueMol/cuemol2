// -*-Mode: C++;-*-
//
// Sphere set/surface tesselation object
//

#ifndef GFX_SPHERESET_HPP_INCLUDE_
#define GFX_SPHERESET_HPP_INCLUDE_

#include "gfx.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/LTypes.hpp>
#include "SolidColor.hpp"
#include "DrawElem.hpp"

namespace gfx {

  using qlib::Vector4D;

  class GFX_API SphereSet
  {
  private:
    struct ElemType
    {
      Vector4D posr;
      int ccode;
    };

    std::deque<ElemType> m_data;
    
    /// tesselation detail
    int m_nDetail;

    /// built draw elem object
    DrawElem *m_pDrawElem;

  public:
    SphereSet();
    virtual ~SphereSet();

    /// estimate size / allocate draw elem object
    void create(int nsize, int ndetail);

    /// render a sphere
    void sphere(int index, const Vector4D &pos, double r, const ColorPtr &col);

    /// build draw elem objects
    DrawElem *buildDrawElem();

  private:
    void estimateMeshSize();

  };

}

#endif

