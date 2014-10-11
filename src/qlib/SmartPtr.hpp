// -*-Mode: C++;-*-
//
// smart pointer
//   taken and modified from boost C++ library
//
// $Id: SmartPtr.hpp,v 1.1 2007/03/30 15:20:56 rishitani Exp $

//
//  detail/shared_ptr_nmt.hpp - shared_ptr.hpp without member templates
//
//  (C) Copyright Greg Colvin and Beman Dawes 1998, 1999.
//  Copyright (c) 2001, 2002 Peter Dimov
//
//  Permission to copy, use, modify, sell and distribute this software
//  is granted provided this copyright notice appears in all copies.
//  This software is provided "as is" without express or implied
//  warranty, and with no claim as to its suitability for any purpose.
//
//  See http://www.boost.org/libs/smart_ptr/shared_ptr.htm for documentation.
//

#ifndef QLIB_SMART_POINTER_H__
#define QLIB_SMART_POINTER_H__

#include <algorithm>

namespace qlib {
  
  namespace detail {
    struct static_cast_tag {};
    struct const_cast_tag {};
    struct dynamic_cast_tag {};
    struct polymorphic_cast_tag {};
    struct get_ref_cnt_tag {};
  }

  ///
  /// Generic smart ptr template class
  ///
  template<class T>
  class sp {
    
  //private:
  protected:
    /// type def of ref. counter (TO DO: thr-safe impl.)
    typedef int count_type;
    
    /// contained pointer
    T *m_ptr;

    /// reference counter
    count_type *m_pcnt;   // ptr to reference counter

  private:
    template<class Y> friend class sp;

  public:
    
    typedef T element_type;
    typedef T value_type;
    
    explicit sp(T *p = 0): m_ptr(p)
    {
      try { // prevent leak if new throws
	m_pcnt = MB_NEW count_type(1);
      }
      catch(...) {
	delete p;
	throw;
      }
    }

    /*
    explicit sp(T *p, detail::get_ref_cnt_tag): m_ptr(p)
    {

      if (p!=NULL) {
        int *pcnt = p->getSpRefCounter();
        if (pcnt!=NULL) {
          m_pcnt = pcnt;
          ++*m_pcnt;
          return;
        }
      }

      try { // prevent leak if new throws
	m_pcnt = MB_NEW count_type(1);
      }
      catch(...) {
	delete p;
	throw;
      }

      if (p!=NULL)
        p->setSpRefCounter(m_pcnt);

    }
    */
    
    //////////////////////////////////////////////////
    
    ~sp() {
      if(--*m_pcnt == 0) {
	delete m_ptr;
	delete m_pcnt;
      }
    }
    
    /// copy ctor
    sp(sp const & r): m_ptr(r.m_ptr) {
      // never throws
      m_pcnt = r.m_pcnt;
      ++*m_pcnt;
    }
    
    /// copy ctor with template (static cast)
    template<class Y>
    sp(sp<Y> const & r): m_ptr(r.m_ptr) {
      // never throws
      m_pcnt = r.m_pcnt;
      ++*m_pcnt;
    }

    template<class Y>
      sp(sp<Y> const & r, detail::static_cast_tag): m_ptr(static_cast<element_type *>(r.m_ptr)) {
        // never throws
        m_pcnt = r.m_pcnt;
        ++*m_pcnt;
      }
                      
      template<class Y>
    sp(sp<Y> const & r, detail::const_cast_tag): m_ptr(const_cast<element_type *>(r.m_ptr))
    {
        // never throws
        m_pcnt = r.m_pcnt;
        ++*m_pcnt;
    }

    template<class Y>
    sp(sp<Y> const & r, detail::dynamic_cast_tag): m_ptr(dynamic_cast<element_type *>(r.m_ptr))
    {
      if(m_ptr != NULL) {
        // never throws
        m_pcnt = r.m_pcnt;
        ++*m_pcnt;
      }
      else  // need to allocate new counter -- the cast failed
        {
          m_pcnt = MB_NEW count_type(1);
          // pn = detail::shared_count();
        }
    }

    ////////////////////////////////////////////////////////////////////////

    /** copy operator */
    sp & operator=(sp const & r) {
      sp(r).swap(*this);
      return *this;
    }

    /** copy operator with template (static cast) */
    template<class Y>
    sp &operator=(sp<Y> const & r) {
      // never throws
      sp(r).swap(*this);
      return *this;
    }


#if 0
    explicit sp(std::auto_ptr<T> & r) { 
      m_pcnt = MB_NEW count_type(1); // may throw
      m_ptr = r.release(); // fix: moved here to stop leak if new throws
    } 
    
    sp & operator=(std::auto_ptr<T> & r) {
      sp(r).swap(*this);
      return *this;
    }
#endif
    
    void reset(T *p = 0) {
      // MB_ASSERT(p == 0 || p != m_ptr);
      sp(p).swap(*this);
    }
    
    T & operator*() const {
      // never throws
      // MB_ASSERT(m_ptr != 0);
      return *m_ptr;
    }
    
    T * operator->() const {
      // never throws
      // MB_ASSERT(m_ptr != 0);
      return m_ptr;
    }
    
    T * get() const {
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
    
    void swap(sp<T> & other) {
      // never throws
      std::swap(m_ptr, other.m_ptr);
      std::swap(m_pcnt, other.m_pcnt);
    }
    
    bool isnull() const {
      return get() == 0;
    }
  };

  template<class T, class U> inline
  bool operator==(sp<T> const & a, sp<U> const & b)
  {
    return a.get() == b.get();
  }
  
  template<class T, class U> inline
  bool operator!=(sp<T> const & a, sp<U> const & b)
  {
    return a.get() != b.get();
  }
  
  /*  template<class T> inline
  bool operator<(sp<T> const & a, sp<T> const & b)
  {
    return std::less<T*>()(a.get(), b.get());
    }*/
  
  template<class T>
  void swap(sp<T> & a, sp<T> & b)
  {
    a.swap(b);
  }

  //
  //  type cast
  //

  template<class T, class U> sp<T> static_pointer_cast(sp<U> const & r)
  {
    return sp<T>(r, detail::static_cast_tag());
  }
  
  template<class T, class U> sp<T> const_pointer_cast2(sp<U> const & r)
  {
    return sp<T>(r, detail::const_cast_tag());
  }
  
  template<class T> sp<T> const_pointer_cast(sp<T> const & r)
  {
    return sp<T>(r, detail::const_cast_tag());
  }

  template<class T, class U> sp<T> dynamic_pointer_cast(sp<U> const & r)
  {
    return sp<T>(r, detail::dynamic_cast_tag());
  }
  

  ///
  ///  T should implement getSpRefCounter()/setSpRefCounter() methods
  ///
  template<class T>
  class sp2 : public sp<T>
  {
  public:
  };

}

///
/// Convenience macro for SmartPtr declaration
///
#define MC_DECLSP(clsname) \
  class clsname; \
  typedef qlib::sp<clsname> clsname##Sp;

#define MC_DECLSP2(clsname, spclsname) \
  class clsname; \
  typedef qlib::sp<clsname> spclsname;

#endif
