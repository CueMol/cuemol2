// -*-Mode: C++;-*-
//
// Draw (glsl) attribute array object
//

#ifndef GFX_DRAWATTRARY_HPP_INCLUDE_
#define GFX_DRAWATTRARY_HPP_INCLUDE_

#include <qlib/Array.hpp>
#include "AbstDrawAttrs.hpp"

namespace gfx {

  /// Attribute array for shading language
  template <class _ElemType>
  class DrawAttrArray : public AbstDrawAttrs
  {
  public:
    using super_t = AbstDrawAttrs;
    using elem_t = _ElemType;

  private:
    qlib::Array<_ElemType> m_data;

  public:

      DrawAttrArray() : super_t() {}
    virtual ~DrawAttrArray() {}

    virtual int getType() const {
        return AbstDrawElem::VA_ATTRS;
    }

    virtual void alloc(int nsize)
    {
      m_data.allocate(nsize);
      super_t::setSize(nsize);
    }

    virtual const void *getData() const
    {
      return m_data.data();
    }

    virtual size_t getElemSize() const {
      return sizeof(_ElemType);
    }

    ///

    const _ElemType &at(int i) const {
      return m_data.at(i);
    }

    _ElemType &at(int i) {
      return m_data.at(i);
    }

      void assignElems(std::initializer_list<_ElemType> list)
      {
          if (m_data.size() != list.size()) {
              alloc(list.size());
          }
          m_data.assign(list);
      }
  };

}

#endif

