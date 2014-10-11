// -*-Mode: C++;-*-
//
// LString <--> Object table ver. 2
//   This impl. uses STL map class explicitly.
//
// $Id: MapTable.hpp,v 1.2 2009/09/05 10:45:52 rishitani Exp $
//

#ifndef MAP_TABLE_VER2_H
#define MAP_TABLE_VER2_H

#include "LString.hpp"
#include "GenericTable.hpp"

namespace qlib {

  /////////////////////////////////////////////////////////////
  //
  // generation of specific classes
  //

  // LString/std::map version

  template <typename _Value>
  class MapTable : public GenericValueTable<LString, _Value, detail::StlMapAdaptor>
  {
  };

  template <typename _Value>
  class MapPtrTable : public GenericPtrTable<LString, _Value, detail::StlMapAdaptor>
  {
  };

#if 0
  template <typename _Value>
  class SerMapTable : public SerImTable<LString, _Value, detail::StlMapAdaptor>
  {
  };

  template <typename _Value>
  class SerMapObjTable : public SerObjTable<LString, _Value, detail::StlMapAdaptor>
  {
  };

  template <typename _Value>
  class SerMapPtrTable : public SerPtrTable<LString, _Value, detail::StlMapAdaptor>
  {
  };
#endif
  
  //////////////////////////////////////////

  // LString/qlib::hash_map version

  template <typename _Value>
  class HashTable : public GenericValueTable<LString, _Value, detail::HashMapAdaptor>
  {
  };

  template <typename _Value>
  class HashPtrTable : public GenericPtrTable<LString, _Value, detail::HashMapAdaptor>
  {
  };

#if 0
  template <typename _Value>
  class SerHashTable : public SerImTable<LString, _Value, detail::HashMapAdaptor>
  {
  };

  template <typename _Value>
  class SerHashObjTable : public SerObjTable<LString, _Value, detail::HashMapAdaptor>
  {
  };

  template <typename _Value>
  class SerHashPtrTable : public SerPtrTable<LString, _Value, detail::HashMapAdaptor>
  {
  };
#endif

} // namespace qlib

#endif
