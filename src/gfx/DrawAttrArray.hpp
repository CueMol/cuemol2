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
    ~DrawAttrArray() override {}

    int getType() const override {
        return AbstDrawElem::VA_ATTRS;
    }

    /// Backwards-compatible owning allocation.
    /// Delegates to allocOwnedData so callers that haven't migrated to
    /// DisplayContext::allocBuffer keep working.
    virtual void alloc(int nsize)
    {
      allocOwnedData(nsize);
    }

    // Storage allocation hooks (see AbstDrawAttrs).
    void allocOwnedData(int nelems) override
    {
      m_data.allocate(nelems);
      super_t::setSize(nelems);
    }
    void setDataRef(void *p, int nelems) override
    {
      m_data.refer(nelems, static_cast<_ElemType *>(p));
      super_t::setSize(nelems);
    }

    const void *getData() const override
    {
      return m_data.data();
    }

    size_t getElemSize() const override {
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

