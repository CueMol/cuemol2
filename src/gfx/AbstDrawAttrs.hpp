// -*-Mode: C++;-*-
//
// Abstract draw attribute array object
//

#ifndef GFX_ABSTDRAWATTRS_HPP_INCLUDE_
#define GFX_ABSTDRAWATTRS_HPP_INCLUDE_

#include <vector>
#include "gfx.hpp"
#include "AbstDrawElem.hpp"

namespace gfx {

  class GFX_API AbstDrawAttrs : public AbstDrawElem
  {
  private:
    struct AttrInfo {
      int nAttrLoc;
      int nAttrElems;
      int iAttrType;
      int nStartPos;
      int nDivisor;
    };

    std::vector<AttrInfo> m_attrs;

    /** number of instances for instanced rendering */
    int m_nInsts;

  public:
    AbstDrawAttrs() : m_nInsts(0) {}

    // attribute query methods

    inline void setAttrSize(int nsz) {
      m_attrs.resize(nsz);
    }
    inline size_t getAttrSize() const {
      return m_attrs.size();
    }

    inline void setAttrInfo(int ind, int al, int ae, int at, int pos) {
        MB_ASSERT(ind>=0 && ind<m_attrs.size());
        m_attrs[ind].nAttrLoc = al;
        m_attrs[ind].nAttrElems = ae;
        m_attrs[ind].iAttrType = at;
        m_attrs[ind].nStartPos = pos;
        m_attrs[ind].nDivisor = 0;
    }

    inline void setAttrDivisor(int ind, int div) {
        MB_ASSERT(ind>=0 && ind<m_attrs.size());
        m_attrs[ind].nDivisor = div;
    }

    inline int getAttrLoc(int ind) const {
      return m_attrs[ind].nAttrLoc;
    }
    inline int getAttrElemSize(int ind) const {
      return m_attrs[ind].nAttrElems;
    }
    inline int getAttrTypeID(int ind) const {
      return m_attrs[ind].iAttrType;
    }
    inline int getAttrPos(int ind) const {
      return m_attrs[ind].nStartPos;
    }
    inline int getAttrDivisor(int ind) const {
        return m_attrs[ind].nDivisor;
    }

  public:
    /// returns attribute buffer ptr
    virtual const void *getData() const;
    virtual size_t getElemSize() const;

    /// returns attribute buffer size (in byte unit)
    inline size_t getDataSize() const {
      return getElemSize() * getSize();
    }

    ///

    /// returns index buffer ptr
    virtual const void *getIndData() const;
    virtual size_t getIndElemSize() const;
    virtual size_t getIndSize() const;

    /// returns index buffer size (in byte unit)
    inline size_t getIndDataSize() const {
      return getIndElemSize() * getIndSize();
    }

    ///
    // instanciation support
    void setNumInstances(int ninsts)
    {
        m_nInsts = ninsts;
    }

    int getNumInstances() const
    {
        return m_nInsts;
    }

  };

}

#endif
