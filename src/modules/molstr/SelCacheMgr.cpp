// -*-Mode: C++;-*-
//
//  Selection Cache Manager
//
//  $Id: SelCacheMgr.cpp,v 1.4 2011/01/27 15:08:33 rishitani Exp $

#include <common.h>

#include "SelCacheMgr.hpp"
#include "MolCoord.hpp"
#include "SelNodes.hpp"

using namespace molstr;

SINGLETON_BASE_IMPL(molstr::SelCacheMgr);

///////////////

SelCacheMgr::~SelCacheMgr()
{
  CacheEntTab::iterator i = m_data.begin();
  for (; i!=m_data.end(); ++i)
    delete i->second;
}

//////////

/// Create new cache entry
SelCacheData *SelCacheMgr::createCacheEntry()
{
  int id = m_nAtomNewID;
  m_nAtomNewID++;
  if (m_nAtomNewID<0) {
    LOG_DPRINTLN("FATAL ERROR: MolSel cache is exhausted!!");
    return NULL;
  }

  SelCacheData *pNewData = MB_NEW SelCacheData;
  bool res = m_data.insert(CacheEntTab::value_type(id, pNewData)).second;
  if (!res) {
    LOG_DPRINTLN("FATAL ERROR: cannot create molsel cache entry!!");
    return NULL;
  }

  pNewData->m_nCacheID = id;

  MB_DPRINTLN("SelCacheMgr> molsel cache entry is created (%d); curr cache size=%d",id, m_data.size());

  while (m_data.size()>m_nCacheMax) {
    CacheEntTab::iterator i = m_data.begin();
    //MB_DPRINTLN("discard cache data ID=%d", i->first);
    delete i->second;
    m_data.erase(i);
  }

  return pNewData;
}

const SelCacheData *SelCacheMgr::getCacheEntry(int id) const
{
  if (id<0)
    return NULL;

  CacheEntTab::const_iterator iter = m_data.find(id);
  if (iter==m_data.end())
    return NULL;

  return iter->second;
}

LString SelCacheMgr::makeCacheTag(qlib::uid_t mol_id, SelectionPtr pSel) const
{
  return LString::format("%d:%s", int(mol_id), pSel->toString().c_str());
}

const SelCacheData *SelCacheMgr::findCacheData(MolCoordPtr pMol, SelectionPtr pSel) const
{
  qlib::uid_t mol_id = pMol->getUID();
  LString tagname = makeCacheTag(mol_id, pSel);
  TagTable::const_iterator itag = m_tagTable.find(tagname);
  if (itag==m_tagTable.end())
    return NULL;

  int cid = itag->second;
  return getCacheEntry(cid);
}

const SelCacheData *SelCacheMgr::findOrMakeCacheData(MolCoordPtr pMol, SelectionPtr pSel) const
{
  const SelCacheData *pRes = findCacheData(pMol, pSel);
  if (pRes!=NULL)
    return pRes;

  SelCacheMgr *pthis = const_cast<SelCacheMgr *>(this);
  return pthis->makeCache(pMol, pSel);
}

//////////

/// make selection cache for atoms
const SelCacheData *SelCacheMgr::makeCache(MolCoordPtr pMol, SelectionPtr pSel)
{
  SelCacheData *pEnt = createCacheEntry();
  if (pEnt==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "cannot create molsel cache entry");
    return NULL;
  }

  int ncid = pEnt->m_nCacheID;
  pEnt->m_nMolID = pMol->getUID();

  // Make AtomID set and bounding box
  // Here we cannot use AtomIterator, because AtomIterator may access the SelCacheMgr.
  MolCoord::AtomIter iter = pMol->beginAtom();
  MolCoord::AtomIter eiter = pMol->endAtom();
  Vector4D pos, cen(0,0,0);
  int nsel = 0;
  for (; iter!=eiter; ++iter) {
    MolAtomPtr pAtom = iter->second;
    MB_ASSERT(!pAtom.isnull());
    if (!pSel->isSelected(pAtom))
      continue;
    pos = pAtom->getPos();
    pEnt->m_atomIdSet.insert(iter->first);
    pEnt->m_bbox.merge(pos);
    cen += pos;
    nsel ++;
  }
  pEnt->m_nSel = nsel;
  if (nsel>0)
    pEnt->m_vCenter = cen.divide(nsel);
  pEnt->m_bAsetValid = true;
  pEnt->m_bBboxValid = true;
  
  // register tag name (force overwriting the existing tag name)
  LString tagname = makeCacheTag(pMol->getUID(), pSel);
  m_tagTable.forceSet(tagname, ncid);

  // observe the change of the target molecule
  pMol->addListener(this);

  MB_DPRINTLN("SelCacheMgr> molsel cache is created (size=%d)", nsel);

  return pEnt;
}

/// make selection cache for atoms
const SelCacheData *SelCacheMgr::makeCacheBySet(MolCoordPtr pMol, SelectionPtr pSel, const std::set<int> &aidset)
{
  SelCacheData *pEnt = createCacheEntry();
  if (pEnt==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "cannot create molsel cache entry");
    return NULL;
  }

  int nsel = aidset.size();
  int ncid = pEnt->m_nCacheID;
  pEnt->m_nMolID = pMol->getUID();
  pEnt->m_atomIdSet = aidset;
  pEnt->m_nSel = nsel;
  pEnt->m_bAsetValid = true;
  // pEnt->m_bBboxValid = false;

  /*
  // Make bounding box
  const std::set<int>::const_iterator = 
  MolCoord::AtomIter iter = pMol->beginAtom();
  MolCoord::AtomIter eiter = pMol->endAtom();
  Vector4D pos, cen(0,0,0);
  int nsel = 0;
  for (; iter!=eiter; ++iter) {
    MolAtomPtr pAtom = iter->second;
    MB_ASSERT(!pAtom.isnull());
    if (!pSel->isSelected(pAtom))
      continue;
    pos = pAtom->getPos();
    pEnt->m_atomIdSet.insert(iter->first);
    pEnt->m_bbox.merge(pos);
    cen += pos;
    nsel ++;
  }
  pEnt->m_nSel = nsel;
  if (nsel>0)
    pEnt->m_vCenter = cen.divide(nsel);
  pEnt->m_bAsetValid = true;
  pEnt->m_bBboxValid = true;
   */  
  // register tag name (force overwriting the existing tag name)
  LString tagname = makeCacheTag(pMol->getUID(), pSel);
  m_tagTable.forceSet(tagname, ncid);

  // observe the change of the target molecule
  pMol->addListener(this);

  MB_DPRINTLN("SelCacheMgr> molsel cache is created (size=%d)", nsel);

  return pEnt;
}

/*
const std::set<int> *SelCacheMgr::findAtomIDSet(MolCoordPtr pMol, SelectionPtr pSel) const
{
  SelCacheData *pEnt = findCacheEntry(pMol, pSel);
  if (pEnt==NULL)
    return NULL;
  return &(pEnt->m_atomIdSet);
}

const qlib::Box3D *SelCacheMgr::findBoundingBox(MolCoordPtr pMol, SelectionPtr pSel) const
{
  SelCacheData *pEnt = findCacheEntry(pMol, pSel);
  if (pEnt==NULL)
    return NULL;
  return &(pEnt->m_bbox);
}

const Vector4D *SelCacheMgr::findCenter(MolCoordPtr pMol, SelectionPtr pNode) const
{
  SelCacheData *pEnt = findCacheEntry(pMol, pSel);
  if (pEnt==NULL)
    return NULL;
  return &(pEnt->m_vCenter);
}
*/
void SelCacheMgr::invalidateCache(int id)
{
  MB_DPRINTLN("SelCacheMgr> cache %d is removing", id);

  CacheEntTab::iterator ii = m_data.find(id);
  if (ii==m_data.end())
    return;
  delete ii->second;
  m_data.erase(ii);
}

/// object-changed event handler
void SelCacheMgr::objectChanged(qsys::ObjectEvent &ev)
{
  qlib::uid_t target_id = ev.getTarget();

  // TO DO: implementation
}

