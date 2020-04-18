// -*-Mode: C++;-*-
//
//  Selection Cache Manager
//

#ifndef SEL_CACHE_MGR_HPP_INCLUDED
#define SEL_CACHE_MGR_HPP_INCLUDED

#include "molstr.hpp"

//#include <qlib/Array.hpp>
#include <qlib/Box3D.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/SingletonBase.hpp>
#include <qsys/ObjectEvent.hpp>

namespace molstr {

using qlib::Box3D;
using qlib::Vector4D;
class SelSuperNode;

///
/// Cache entry's data structure for selections
///
class MOLSTR_API SelCacheData
{
  friend class SelCacheMgr;
  
private:
  int m_nCacheID;
  
  // molecule's obj UID
  qlib::uid_t m_nMolID;
    
  bool m_bAsetValid;
  
  std::set<int> m_atomIdSet;
  
  /// number of the selected atoms
  int m_nSel;
  
  /// validity flag for the bounding box value
  bool m_bBboxValid;
  
  /// bounding box for the selected atoms
  qlib::Box3D m_bbox;
  qlib::Vector4D m_vCenter;
  
  /// Kd-tree data (for around op impl ver2)
  void *m_pExtData;

public:
  SelCacheData()
       : m_nCacheID(-1), m_nMolID(qlib::invalid_uid), m_bAsetValid(false),
         m_nSel(0), m_bBboxValid(false), m_pExtData(NULL)
    {
    }
  
  ~SelCacheData()
  {
    clearExtData();
  }

  int getCacheID() const {
    return m_nCacheID;
  }

  qlib::uid_t getMolID() const {
    return m_nMolID;
  }

  const std::set<int> &getAtomIdSet() const {
    return m_atomIdSet;
  }
  
  const Box3D &getBoundBox() const {
    return m_bbox;
  }

  const Vector4D &getCenter() const {
    return m_vCenter;
  }

  void *getExtData() const {
    return m_pExtData;
  }
  void setExtData(void *p) {
    m_pExtData = p;
  }

  /// Impl in SelAroundImpl2.cpp
  void clearExtData();
};
  

class MOLSTR_API SelCacheMgr
     : public qsys::ObjectEventListener,
       public qlib::SingletonBase<SelCacheMgr>
{
private:
  typedef std::map < int, SelCacheData * > CacheEntTab;
  CacheEntTab m_data;
  
  /// Next cache ID
  int m_nAtomNewID;
  
  /// Maximum cache entry size
  int m_nCacheMax;
  
  /// Cache tag to cache ID mapping
  typedef qlib::MapTable<int> TagTable;
  TagTable m_tagTable;

public:
  SelCacheMgr() : m_nAtomNewID(0), m_nCacheMax(10) {}
  virtual ~SelCacheMgr();

  /// Make selection cache for atoms  by selection obj
  const SelCacheData *makeCache(MolCoordPtr pMol, SelectionPtr pSel);

  const SelCacheData *makeCacheBySet(MolCoordPtr pMol, SelectionPtr pSel, const std::set<int> &aidset);

  /// Find cache object by mol and sel objects
  const SelCacheData *findCacheData(MolCoordPtr pMol, SelectionPtr pSel) const;

  /// Find cache object by mol and sel objects
  /// If cached data is not found, makes a new cache data and returns it.
  const SelCacheData *findOrMakeCacheData(MolCoordPtr pMol, SelectionPtr pSel) const;

  /// get cache object by cache ID
  const SelCacheData *getCacheEntry(int id) const;

  bool isCacheValid(int id) {
    if (id==-1) return false;
    return getCacheEntry(id)!=NULL;
  }

  /// invalidate the cache entry 
  void invalidateCache(int id);

  virtual void objectChanged(qsys::ObjectEvent &ev);

private:
  // Implementations

  /// create new cache entry
  SelCacheData *createCacheEntry();

  LString makeCacheTag(qlib::uid_t mol_id, SelectionPtr pSel) const;

};

} // namespace molstr

SINGLETON_BASE_DECL(molstr::SelCacheMgr);

#endif // MOL_SEL_MGR_H__
