// -*-Mode: C++;-*-
//
// int -> ptr table with automatic index generation
//
// $Id: IndexedTable.hpp,v 1.2 2008/12/21 14:24:09 rishitani Exp $

#ifndef INDEXED_TABLE_HPP_INCLUDED_
#define INDEXED_TABLE_HPP_INCLUDED_

#include "GenericTable.hpp"

namespace qlib {

  // index version

#if 0
  template <typename _Value,
	    template <class, typename, template <class, typename> class> class _QueSuper = GenericPtrTable >
  class GenericIndexedTable
    : public _QueSuper<int, _Value, detail::HashMapAdaptor>
  {
  private:
    int m_nNextIndex;
    typedef _QueSuper<int, _Value, detail::HashMapAdaptor> super_t;

  public:
    GenericIndexedTable() : m_nNextIndex(0) {}

    int put(_Value *p) {
      int key = m_nNextIndex;
      super_t::insert(typename super_t::value_type(key,p));
      m_nNextIndex++;
      return key;
    }
  };
#endif

  template <typename _Value>
  class IndexedTable : public qlib::GenericPtrTable<int, _Value, detail::HashMapAdaptor>
  {
  private:
    int m_nNextIndex;
    typedef GenericPtrTable<int, _Value, detail::HashMapAdaptor> super_t;

  public:
    IndexedTable() : m_nNextIndex(0) {}

    int put(_Value *p) {
      int key = m_nNextIndex;
      super_t::insert(typename super_t::value_type(key,p));
      m_nNextIndex++;
      return key;
    }

  };

#if 0
  template <typename _Value>
  class SerIndexedTable : public SerObjTable<int, _Value, detail::HashMapAdaptor>
  {
  private:
    int m_nNextIndex;
    typedef SerObjTable<int, _Value, detail::HashMapAdaptor> super_t;

  public:
    SerIndexedTable() : m_nNextIndex(0) {}

    int put(_Value *p) {
      int key = m_nNextIndex;
      super_t::insert(typename super_t::value_type(key,p));
      m_nNextIndex++;
      return key;
    }

  };
#endif
}

#endif // INDEXED_TABLE_H__
