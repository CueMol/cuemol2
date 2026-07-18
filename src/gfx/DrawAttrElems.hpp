// -*-Mode: C++;-*-
//
// Draw attribute array with indices object
//

#ifndef GFX_DRAWATTELEMS_HPP_INCLUDE_
#define GFX_DRAWATTELEMS_HPP_INCLUDE_

#include <qlib/Array.hpp>
#include "DrawAttrArray.hpp"

namespace gfx {

  /// Attribute array with indeces for shading language
  template <class _IndType, class _ElemType>
  class DrawAttrElems : public DrawAttrArray<_ElemType>
  {
  public:
    using super_t = DrawAttrArray<_ElemType>;
    using index_t = _IndType;

  private:
    qlib::Array<_IndType> m_inds;

  public:
    DrawAttrElems() : super_t() {}
    //virtual ~DrawAttrElems() {}

    int getType() const override {
        return AbstDrawElem::VA_ATTR_INDS;
    }

    /// Backwards-compatible owning allocation for the index buffer.
    void allocInd(int nsize)
    {
      this->allocOwnedIndData(nsize);
    }

    // Storage allocation hooks (see AbstDrawAttrs).
    void allocOwnedIndData(int nelems) override
    {
      m_inds.allocate(nelems);
    }
    void setIndDataRef(void *p, int nelems) override
    {
      m_inds.refer(nelems, static_cast<_IndType *>(p));
    }

    const void *getIndData() const override
    {
      return m_inds.data();
    }

    size_t getIndElemSize() const override {
      return sizeof(_IndType);
    }

    size_t getIndSize() const override {
      return m_inds.size();
    }

    ///

    const _IndType &atind(int i) const {
      return m_inds.at(i);
    }

    _IndType &atind(int i) {
      return m_inds.at(i);
    }

      void assignInds(std::initializer_list<_IndType> list)
      {
          if (m_inds.size() != list.size()) {
              allocInd(list.size());
          }
          m_inds.assign(list);
      }
  };

}

#endif
