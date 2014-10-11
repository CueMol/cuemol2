// -*-Mode: C++;-*-
//
// Generic table class
//
// $Id: GenericTable.hpp,v 1.3 2011/04/06 13:09:32 rishitani Exp $

#ifndef GENERIC_TABLE_HPP_INCLUDED_
#define GENERIC_TABLE_HPP_INCLUDED_

// #include "LSerial.hpp"
// #include "ObjStream.hpp"
// #include "is_polymorphic.hpp"

#ifdef USE_HASH_MAP
#  include "HashMap.hpp"
#endif

namespace qlib {

  namespace detail {
    /** adaptor for stl::map */
    template <class _QueKey, class _QueValue>
    class StlMapAdaptor : public std::map< _QueKey, _QueValue, 
					   typename _QueKey::less_fcn >
    {
    };

    //////////////////////////

#ifdef USE_HASH_MAP
    /** adaptor for hash_map (_QueKey!=CLASS case) */
    template <class _QueKey, class _QueValue, bool _IsClass = is_class<_QueKey>::value >
    class __HashMapAdaptorSelector : public qlib::hash_map< _QueKey, _QueValue>
    {
    };

    /** adaptor for hash_map (_QueKey==CLASS case) */
    template <class _QueKey, class _QueValue>
    class __HashMapAdaptorSelector<_QueKey, _QueValue, true> :
      public qlib::hash_map< _QueKey, _QueValue, typename _QueKey::hash_fcn, typename _QueKey::equal_fcn >
    {
    };

    template <class _QueKey, class _QueValue>
    class HashMapAdaptor :
      public __HashMapAdaptorSelector< _QueKey, _QueValue >
    {
    };
#else

    template <class _QueKey, class _QueValue>
    class HashMapAdaptor : public std::map<_QueKey, _QueValue>
    {
    };

#endif

  }

  /** generic table */
  template <class _QueKey, typename _QueValue, template <class, class> class _QueColl>
  class GenericTable : public _QueColl<_QueKey, _QueValue>
  {
  public:
    typedef _QueColl<_QueKey, _QueValue> super_t;
    typedef typename super_t::value_type value_type;
    
  public:

    bool containsKey(const _QueKey &key) const {
      typename super_t::const_iterator iter = super_t::find(key);
      if (iter==super_t::end()) return false;
      return true;
    }

    //bool put(const _QueKey &key, _QueValue &value) {
    //return (super_t::insert(value_type(key,value))).second;
    //}

    bool set(const _QueKey &key, const _QueValue &value) {
      return (super_t::insert(value_type(key,value))).second;
    }

    _QueKey topkey() const {
      typename super_t::const_iterator iter = super_t::begin();
      return iter->first;
    }

  };

  /** generic immediate value table */
  template <class _QueKey, typename _QueValue, template <class, class> class _QueColl>
  class GenericValueTable : public GenericTable<_QueKey, _QueValue, _QueColl>
  {
  public:
    typedef GenericTable<_QueKey, _QueValue, _QueColl> super_t;
    typedef typename super_t::value_type value_type;

    bool containsValue(const _QueValue &value) const {
      typename super_t::const_iterator iter = super_t::begin();
      for ( ; iter!=super_t::end() ; iter++ )
	if (iter->second == value)
	  return true;
      return false;
    }

    _QueValue get(const _QueKey &key) const {
      typename super_t::const_iterator iter = super_t::find(key);
      if (iter==super_t::end()) return _QueValue();
      return iter->second;
    }

    void forceSet(const _QueKey &key, const _QueValue &value) {
      std::pair<typename super_t::iterator, bool> result =
	super_t::insert(value_type(key,value));
      if (result.second) return;
      MB_ASSERT(key.equals((result.first)->first));
      (result.first)->second = value;
    }

    bool remove(const _QueKey &key){
      return super_t::erase(key)!=0;
    }
  };

  /** generic pointer table */
  template <class _QueKey, typename _QueValue, template <class, class> class _QueColl>
  class GenericPtrTable : public GenericTable<_QueKey, _QueValue *, _QueColl>
  {
  public:
    typedef GenericTable<_QueKey, _QueValue *, _QueColl> super_t;
    typedef typename super_t::value_type value_type;

    bool containsValue(const _QueValue *value) const {
      typename super_t::const_iterator iter = super_t::begin();
      for ( ; iter!=super_t::end() ; iter++ )
	if (iter->second == value)
	  return true;
      return false;
    }

    _QueValue *get(const _QueKey &key) const {
      typename super_t::const_iterator iter = super_t::find(key);
      if (iter==super_t::end()) return NULL;
      return iter->second;
    }

    void forceSet(const _QueKey &key, _QueValue *value) {
      std::pair<typename super_t::iterator, bool> result =
	super_t::insert(value_type(key,value));

      if (result.second) return;
      MB_ASSERT(key.equals((result.first)->first));
      if ((result.first)->second!=NULL)
        delete (result.first)->second;
      (result.first)->second = value;
    }

    _QueValue *remove(const _QueKey &key) {
      _QueValue *pold = get(key);
      if (pold!=NULL)
	super_t::erase(key);
      return pold;
    }

    void removeAndDelete(const _QueKey &key) {
      _QueValue *pold = get(key);
      if (pold!=NULL)
	super_t::erase(key);
      delete pold;
    }

    void clearAndDelete()
    {
      while (super_t::size()>0) {
	delete remove(super_t::topkey());
      }
    }

  //private:
  //  void clear();
  };

} // namespace qlib

#endif
