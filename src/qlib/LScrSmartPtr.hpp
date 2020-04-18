// -*-Mode: C++;-*-
//
// smart pointer for scriptable objects
//

#ifndef __LSCR_SMART_PTR_HPP__
#define __LSCR_SMART_PTR_HPP__

#include "LString.hpp"
#include "LScriptable.hpp"
#include "TypeTraits.hpp"
#include "LExceptions.hpp"

namespace qlib {

  class LScriptable;

  /**
    Superclass of the scriptable smart ptrs
   */
  class QLIB_API LSupScrSp
    : public LScriptable, public LCloneableObject
  {

  private:
    /** type def of ref. counter (TO DO: thr-safe impl.) */
    typedef int count_type;

    /** reference counter */
    count_type *m_pcnt;   // ptr to reference counter

  protected:
    /** contained pointer */
    LScriptable *m_ptr;

  public:
    explicit LSupScrSp(LScriptable *p = 0);

    virtual ~LSupScrSp();

    /** copy ctor */
    LSupScrSp(LSupScrSp const &r): m_ptr(r.m_ptr) {
      // never throws
      m_pcnt = r.m_pcnt;
      ++*m_pcnt;
#ifdef MB_DEBUG
      check_copy();
#endif
    }

    void check_copy();

    LScriptable *get() const {
      // never throws
      return m_ptr;
    }

    long use_count() const {
      // never throws
      return *m_pcnt;
    }
    
    bool unique() const {
      // never throws
      return *m_pcnt == 1;
    }
    
    bool isnull() const {
      return LSupScrSp::get() == 0;
    }

    void swap(LSupScrSp & other) {
      // never throws
      std::swap(m_ptr, other.m_ptr);
      std::swap(m_pcnt, other.m_pcnt);
    }
    
    virtual LClass *getClassObj() const;
    
    virtual bool isSmartPtr() const;

    /** get the wrapped raw ptr if this is smartptr, otherwise returns null */
    virtual LScriptable *getSPInner() const;

    ///////////////////////////
    // Memory management

    virtual LScriptable *copy() const;
    virtual void destruct();

    ///////////////////////////
    // Property support

    virtual bool getProperty(const LString &propnm, LVariant &presult) const;
    virtual bool setProperty(const LString &propnm, const LVariant &pvalue);

    virtual LString getPropTypeName(const LString &) const;
    virtual bool hasProperty(const LString &propnm) const;
    virtual bool hasWritableProperty(const LString &propnm) const;

    virtual bool hasPropDefault(const LString &propnm) const;
    virtual bool isPropDefault(const LString &propnm) const;
    virtual bool resetProperty(const LString &propnm);

    ////

    virtual bool getPropertyImpl(const LString &propnm, LVariant &presult) const;
    virtual bool setPropertyImpl(const LString &propnm, const LVariant &pvalue);
    virtual bool resetPropertyImpl(const LString &propnm);
    virtual bool getPropSpecImpl(const LString &, PropSpec *pspec) const;
    virtual void getPropNames(std::set<LString> &) const;

    ////

    virtual qlib::uid_t getRootUID() const;


    ///////////////////////////
    // reflection

    virtual bool hasMethod(const LString &nm) const;
    virtual bool invokeMethod(const LString &nm, LVarArgs &args);

    ///////////////////////////
    // string conversions

    virtual bool isStrConv() const;
    virtual LString toString() const;

    ///////////////////////////
    // serialization
    virtual void writeTo2(LDom2Node *pNode) const;
    virtual void readFrom2(LDom2Node *pNode);

    //
    
    virtual LClass *getScrClassObj() const;

    virtual bool implements(const qlib::LString &nm) const;

  };

  /// Comparison of smart pointers (equal if the refering pointer address is the same)
  inline bool operator==(const LSupScrSp &arg1,const LSupScrSp &arg2)
  {
    return arg1.get() == arg2.get();
  }

  ////////////////////////////////////////////////////////////////////////////

  template<class _Type>
  class LScrSp : public LSupScrSp
  {
  private:
    typedef LSupScrSp super_t;

    template<class Y> friend class LScrSp;

    mutable _Type *m_pCached;

    // should not be called (<== WHY ?? 09.08.23)
    explicit LScrSp(LScriptable *p) : super_t(p) {
      MB_ASSERT(false);
    }

  public:
    typedef _Type element_type;
    typedef _Type value_type;
    
//    explicit LScrSp(_Type *p = 0) : super_t(reinterpret_cast<LScriptable *>(p)), m_pCached(p) {}
    explicit LScrSp(_Type *p = 0) : super_t(p), m_pCached(p) {}
    
    /// copy ctor (from the same class)
    LScrSp(LScrSp const & r): super_t(r), m_pCached(r.get()) {}
    
      /// Copy ctor (dynamic_cast from base class "super_t")
      LScrSp(super_t const & r): super_t(r) {
          LScriptable *pscr = super_t::get();
          if (pscr==NULL) {
              MB_DPRINTLN("LScrSP> in copy ctor (dynamic_cast), src is NULL");
              m_pCached = NULL;
              return;
          }
          MB_ASSERT(pscr!=NULL);
          m_pCached = dynamic_cast<_Type *>(pscr);
          if (m_pCached==NULL) {
              LString msg = LString::format("LScrSp<>: dynamic cast from %s to %s failed.",
                                            typeid(_Type).name(), typeid(r).name());
              MB_DPRINTLN("%s", msg.c_str());
              MB_THROW(InvalidCastException, msg);
          }
      }
    
    /// Copy ctor with template (dynamic_cast)
    template<class Y>
    LScrSp(LScrSp<Y> const & r): super_t(r) {
      LScriptable *pscr = super_t::get();
      if (pscr==NULL) {
        MB_DPRINTLN("LScrSp> in copy ctor with template (dynamic_cast), src is NULL");
        m_pCached = NULL;
        return;
      }
      m_pCached = dynamic_cast<_Type *>(pscr);
      if (m_pCached==NULL) {
        LString msg = LString::format("LScrSp<Y>=(%s):"
                                      " dynamic cast from %s(pscr) to %s(_Type) failed.",
                                      typeid(r).name(),
				      typeid(*pscr).name(), typeid(_Type).name());
        MB_DPRINTLN("%s", msg.c_str());
        MB_THROW(InvalidCastException, msg);
        super_t::m_ptr = NULL;
      }
    }

    /// Copy ctor with template (dynamic_cast), without throwing null ptr xcpt
    template<class Y>
    LScrSp(LScrSp<Y> const & r, no_throw_tag): super_t(r) {
      LScriptable *pscr = super_t::get();
      if (pscr==NULL) {
        MB_DPRINTLN("LScrSp> in copy ctor with template (dynamic_cast), src is NULL");
	m_pCached = NULL;
	return;
      }
      m_pCached = dynamic_cast<_Type *>(pscr);
      if (m_pCached==NULL) {
        super_t::m_ptr = NULL;
        return;
      }
    }

    ////////////////////////////////////////////////////////////////////////

    /// Copy operator
    LScrSp<_Type> & operator=(LScrSp<_Type> const & r) {
      LScrSp(r).swap(*this);
      return *this;
    }

    /// Copy operator with template
    template<class Y>
    LScrSp<_Type> &operator=(LScrSp<Y> const & r) {
      // never throws
      //LScrSp(r, no_throw_tag()).swap(*this);
      LScrSp(r).swap(*this);
      return *this;
    }

    void reset(_Type *p = 0) {
      // MB_ASSERT(p == 0 || p != m_ptr);
      LScrSp(p).swap(*this);
    }
    
    _Type & operator*() const {
      // never throws
      // MB_ASSERT(m_ptr != 0);
      return *m_pCached;
    }
    
    _Type * operator->() const {
      // never throws
      // MB_ASSERT(m_ptr != 0);
      return m_pCached;
    }
    
    _Type * get() const {
      return m_pCached;
    }
    
    void swap(LScrSp<_Type> & other) {
      // never throws
      super_t::swap(other);
      std::swap(m_pCached, other.m_pCached);
    }

    //////////////////////////////////

    virtual LCloneableObject *clone() const
    {
      return MB_NEW LScrSp(*this);
    }

  private:
    static inline
    _Type *defctor_helper(integral_constant<bool, false>) { return MB_NEW _Type(); }

    static inline
    _Type *defctor_helper(integral_constant<bool, true>) {
      LOG_DPRINTLN("defctor() is called for abstract object!!");
      return NULL;
    }

  public:
    /**
       create and assign default object by default ctor
     */
    static LScrSp<_Type> *defctor() {
      _Type * pdefobj = defctor_helper(integral_constant<bool, qlib::is_abstract<_Type>::value>());
      LScrSp<_Type> *rval = MB_NEW LScrSp<_Type>(pdefobj);
      MB_DPRINTLN("defctor() %p contruct", rval);
      return rval;
    }

    /**
      Create LScrSp<_Type> from a pointer.
      If pscr is a smart pointer, dynamic_cast will be performed,
      else a new smart pointer will be created (and dynamic_cast will be performed as well).
      If dynamic_cast is failed, empty (null) smart ptr will be returned.
     */
    static LScrSp<_Type> createFrom(LScriptable *pscr) {
      MB_ASSERT(pscr!=NULL);

      if (pscr->isSmartPtr()) {
	LSupScrSp *pss = static_cast<LSupScrSp *>(pscr);
        // This performs dynamic cast.
	return LScrSp<_Type>(*pss);
      }
      else {
        // create new sptr from pointer
        _Type *pObj = dynamic_cast<_Type*>(pscr);
        if (pObj!=NULL)
          return LScrSp<_Type>(pObj);
      }

      MB_DPRINTLN("LScrSp<_Type>::createFrom(): cannot dyncast %p(%s) to LSupScrSp",
                  pscr, typeid(*pscr).name());
      return LScrSp<_Type>();
    }

  };

  template <typename _UType>
  LScrSp<_UType> ensureNotNull(const LScrSp<_UType> &pArg) {
    if (pArg.isnull()) {
      MB_THROW(NullPointerException, "ensureNotNull failed");
    }
    return pArg;
  }

}

///
/// Convenience macro for SmartPtr declaration
///
#define MC_DECL_SCRSP(clsname) \
  class clsname; \
  typedef qlib::LScrSp<clsname> clsname##Ptr;

#define MC_DECL_SCRSP2(clsname, spclsname) \
  class clsname; \
  typedef qlib::LScrSp<clsname> spclsname;

namespace qlib {
  MC_DECL_SCRSP(LScrObjBase);
  MC_DECL_SCRSP(LByteArray);
  MC_DECL_SCRSP(LRegExpr);
  MC_DECL_SCRSP(LScrCallBack);
  MC_DECL_SCRSP(LScrMatrix4D);
  MC_DECL_SCRSP(LScrQuat);
  MC_DECL_SCRSP(LScrRangeSet);
  MC_DECL_SCRSP(LScrTime);
  MC_DECL_SCRSP(LScrVector4D);
}

#endif // __LSCR_SMART_PTR_HPP__
