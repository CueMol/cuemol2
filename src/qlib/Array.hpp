// -*-Mode: C++;-*-
//
// Array.h
//   1D array class Array
//
// $Id: Array.hpp,v 1.3 2010/11/23 11:19:33 rishitani Exp $

#ifndef ARRAY_1D_H__
#define ARRAY_1D_H__

#include "LDebugAssert.hpp"
#include "LDebugNew.hpp"

namespace qlib {

  template <class _Type>
  class Array
  {
  private:
    /// data
    _Type *m_array;

    /// number of elements
    int m_nSize;
    
    /// This object own the m_array or not (usually true)
    bool m_bOwn;

  public:
    typedef _Type value_type;

    ///
    /// Make empty array (we must allocate memory by resize() later.)
    ///
    Array() : m_array(NULL), m_nSize(0), m_bOwn(false)
    {
    }
    
    ///
    ///  Make array with size sz
    ///
    explicit Array(int sz)
      : m_nSize(sz), m_bOwn(true)
    {
      m_array = MB_NEW _Type[sz];
    }

    ///
    ///  Make array with size sz and initialize all elements by ini
    ///
    explicit Array(const _Type &ini, int sz)
      : m_nSize(sz), m_bOwn(true)
    {
      m_array = MB_NEW _Type[sz];
      for (int i=0; i<sz; i++)
        m_array[i] = ini;
    }

    ///
    ///  Make array from existing C array
    ///
    explicit Array(int sz, const _Type *p)
      : m_nSize(sz), m_bOwn(true)
    {
      m_array = MB_NEW _Type[sz];
      for (int i=0; i<sz; i++)
        m_array[i] = p[i];
    }
    
    ///
    /// Copy constructor
    ///
    Array(const Array<_Type> &arg)
      : m_nSize(arg.m_nSize), m_bOwn(true)
    {
      m_array = MB_NEW _Type[arg.m_nSize];
      for(int i=0; i<arg.m_nSize; i++)
        m_array[i] = arg.m_array[i];
    }
    
    ~Array()
    {
      clear();
    }

    /////////////////////////////////////////////////////
    // member methods

    inline int size() const { return m_nSize; }
    inline int getSize() const { return size(); }

    void clear() {
      if (m_array!=NULL && m_bOwn)
	delete [] m_array;
      m_array = NULL;
      m_nSize = 0;
      m_bOwn = false;
    }

    /// Yield the ownership of m_array
    void yield() {
      m_array = NULL;
      m_nSize = 0;
      m_bOwn = false;
    }

    /// Allocate new memory (clear old m_array if nescessary)
    void resize(int newsz) {
      clear();

      if (newsz>0) {
        m_array = MB_NEW _Type[newsz];
	m_bOwn = true;
        m_nSize = newsz;
      }
    }

    /// Setup reference (un-owned) array
    void refer(int sz, _Type *p) {
      clear();
      if (sz>0) {
	m_array = p;
	m_bOwn = false;
	m_nSize = sz;
      }
    }

    inline bool isOwn() const { return m_bOwn; }

    inline void allocate(int newsz) { resize(newsz); }
    inline void destroy() { resize(0); }

    const _Type &at(int i) const {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nSize);
      return m_array[i];
    }

    _Type &at(int i) {
      MB_ASSERT(i>=0); MB_ASSERT(i<m_nSize);
      return m_array[i];
    }

    const _Type *data() const {
      return m_array;
    }

    _Type *data() {
      return m_array;
    }

    /////////////////////////////////////////////////////
    // member operators

    operator const _Type *() const {
      return data();
    }

    const Array<_Type> &operator =(const Array<_Type> &arg)
    {
      if(&arg!=this){
	clear();
	m_array = MB_NEW _Type[arg.getSize()];
	m_bOwn = true;
	m_nSize = arg.m_nSize;
	for(int i=0; i<arg.getSize(); i++)
	  m_array[i] = arg[i];
      }
      return *this;
    }

    const Array<_Type> &operator =(const _Type &arg)
    {
      for(int i=0; i<getSize(); i++)
	m_array[i] = arg;
      return *this;
    }

    const _Type &operator [](int i) const {
      return at(i);
    }

    _Type &operator [](int i) {
      return at(i);
    }
  };

}

#endif // ARRAY_1D_H__
