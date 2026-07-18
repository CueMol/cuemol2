// -*-Mode: C++;-*-
//
// Abstract draw attribute array object
//

#ifndef GFX_ABSTDRAWATTRS_HPP_INCLUDE_
#define GFX_ABSTDRAWATTRS_HPP_INCLUDE_

#include <functional>
#include <vector>
#include "gfx.hpp"
#include "AbstDrawElem.hpp"

namespace gfx {

  class GFX_API AbstDrawAttrs : public AbstDrawElem
  {
  public:
    /// Finalizer callback invoked from dtor to release backend-specific
    /// external storage (e.g., release a V8 Persistent reference).
    using Finalizer = std::function<void()>;

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

    /// Opaque backend-specific handle for the vertex storage.
    /// E.g., a Napi::ObjectReference* in WebGL, so the backend can
    /// fetch the existing V8 ArrayBuffer reference without re-allocating.
    /// The gfx layer treats this as void* (impl-layer-non-dependent).
    void *m_pExtDataHandle;
    void *m_pExtIndDataHandle;

    /// Finalizers run from this object's dtor to release the external storage.
    Finalizer m_dataFinalizer;
    Finalizer m_indDataFinalizer;

  public:
    AbstDrawAttrs() : m_nInsts(0), m_pExtDataHandle(nullptr), m_pExtIndDataHandle(nullptr) {}

    ~AbstDrawAttrs() override
    {
        if (m_dataFinalizer) m_dataFinalizer();
        if (m_indDataFinalizer) m_indDataFinalizer();
    }

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
    //
    // Storage allocation hooks. allocBuffer() in DisplayContext routes
    // through these. allocOwned* allocates owning C++ heap memory in
    // the template subclass; setDataRef / setIndDataRef attach external
    // (non-owning) memory via qlib::Array::refer().
    //

    /// Allocate owning C++ heap storage (default impl path).
    virtual void allocOwnedData(int nelems) = 0;

    /// Allocate owning C++ heap storage for index buffer.
    /// Default no-op so the vertex-only DrawAttrArray doesn't need to override.
    virtual void allocOwnedIndData(int /*nelems*/) {}

    /// Attach external vertex storage (non-owning); template subclass
    /// routes through qlib::Array::refer().
    virtual void setDataRef(void *p, int nelems) = 0;

    /// Attach external index storage.
    /// Default no-op so the vertex-only DrawAttrArray doesn't need to override.
    virtual void setIndDataRef(void * /*p*/, int /*nelems*/) {}

    //
    // Opaque external storage handle (backend-specific).
    // The gfx layer keeps this as void* so AbstDrawAttrs does not depend
    // on N-API / V8 types.
    //

    inline void *getExtDataHandle() const { return m_pExtDataHandle; }
    inline void setExtDataHandle(void *p) { m_pExtDataHandle = p; }
    inline void *getExtIndDataHandle() const { return m_pExtIndDataHandle; }
    inline void setExtIndDataHandle(void *p) { m_pExtIndDataHandle = p; }

    /// Finalizers invoked from dtor to release the external storage.
    inline void setDataFinalizer(Finalizer cb) { m_dataFinalizer = std::move(cb); }
    inline void setIndDataFinalizer(Finalizer cb) { m_indDataFinalizer = std::move(cb); }

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
