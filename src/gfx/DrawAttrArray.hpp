// -*-Mode: C++;-*-
//
// Draw (glsl) attribute array object
//

#ifndef GFX_DRAWATTRARY_HPP_INCLUDE_
#define GFX_DRAWATTRARY_HPP_INCLUDE_

#include <qlib/Array.hpp>
#include "gfx.hpp"
#include "DrawElem.hpp"

#define HAVE_OGL_INTATTR 1

#ifdef WIN32
#endif

namespace gfx {

  /// integer type for attribute array
#ifdef HAVE_OGL_INTATTR
  typedef qint32 attr_int32;
  static const int DATTR_INT32 = qlib::type_consts::QTC_INT32;
#else
  typedef qfloat32 attr_int32;
  static const int DATTR_INT32 = qlib::type_consts::QTC_FLOAT32;
#endif
  
  ///
  /// Common super class of attribute array objects
  ///
  class GFX_API AbstDrawAttrs : public AbstDrawElem
  {
  private:
    struct AttrInfo {
      int nAttrLoc;
      int nAttrElems;
      int iAttrType;
      int nStartPos;
    };

    std::vector<AttrInfo> m_attrs;

  public:

    // attribute query methods

    void setAttrSize(int nsz) {
      m_attrs.resize(nsz);
    }
    size_t getAttrSize() const {
      return m_attrs.size();
    }

    void setAttrInfo(int ind, int al, int ae, int at, int pos) {
      m_attrs[ind].nAttrLoc = al;
      m_attrs[ind].nAttrElems = ae;
      m_attrs[ind].iAttrType = at;
      m_attrs[ind].nStartPos = pos;
    }

    int getAttrLoc(int ind) const {
      return m_attrs[ind].nAttrLoc;
    }
    int getAttrElemSize(int ind) const {
      return m_attrs[ind].nAttrElems;
    }
    int getAttrTypeID(int ind) const {
      return m_attrs[ind].iAttrType;
    }
    int getAttrPos(int ind) const {
      return m_attrs[ind].nStartPos;
    }

  public:
    /// returns attribute buffer ptr
    /*virtual const void *getData() const
    {
      return NULL;
    }*/

    /// Returns the size of the emelent
    // virtual size_t getElemSize() const =0
    /*{
      return 0;
    }*/

    ///

    /// returns index buffer ptr
    /*virtual const void *getIndData() const
    {
      return NULL;
    }*/

  };

  /// Attribute array for shading language
  template <class _ElemType>
  class DrawAttrArray : public AbstDrawAttrs
  {
  private:
    typedef AbstDrawAttrs super_t;

    typedef _ElemType elem_t;

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

    virtual const qbyte *getData() const
    {
      return (const qbyte *) m_data.data();
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

  };


  /// Empty attribute array for attrbute-less rendering
  class EmptyDrawArray : public AbstDrawAttrs
  {
  private:
    typedef AbstDrawAttrs super_t;

  public:

    EmptyDrawArray() : super_t() {
      setAttrSize(0);
    }

    virtual ~EmptyDrawArray() {}

    virtual int getType() const {
      return AbstDrawElem::VA_ATTRS;
    }

    virtual void alloc(int nsize)
    {
      // m_data.allocate(nsize);
      super_t::setSize(nsize);
    }

    virtual const qbyte *getData() const
    {
      return NULL;
    }

    virtual size_t getElemSize() const {
      return 0;
    }

  };


  /// Attribute array with indeces for shading language
  template <class _IndType, class _ElemType>
  class DrawAttrElems : public DrawAttrArray<_ElemType>
  {
  private:
    typedef DrawAttrArray<_ElemType> super_t;

    qlib::Array<_IndType> m_inds;

  public:
    DrawAttrElems() : super_t() {}
    //virtual ~DrawAttrElems() {}

    virtual int getType() const {
      return AbstDrawElem::VA_ATTR_INDS;
    }

    void allocInd(int nsize)
    {
      m_inds.allocate(nsize);
    }

    virtual const void *getIndData() const
    {
      return m_inds.data();
    }

    virtual size_t getIndElemSize() const {
      return sizeof(_IndType);
    }

    virtual size_t getIndSize() const {
      return m_inds.size();
    }

    ///

    const _IndType &atind(int i) const {
      return m_inds.at(i);
    }

    _IndType &atind(int i) {
      return m_inds.at(i);
    }

  };

}

#endif

