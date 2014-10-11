// -*-Mode: C++;-*-
//
// BondIterator : atom iterator class
//
// $Id: BondIterator.cpp,v 1.4 2010/10/13 09:36:30 rishitani Exp $

#include <common.h>

#include "BondIterator.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "Selection.hpp"

//#include "MolCachedSel.hpp"
//#include "AtomSel.hpp"

using namespace molstr;

BondIterator::~BondIterator()
{
}

////////////////////////////////////////////////////////////
// cursor type interface

/*
void BondIterator::checkAndCreateCache()
{
  if (m_pSel.isnull() || m_biter!=m_pTarg->endBond())
    return;

  MolSelMgr *pMgr = MolSelMgr::getInstance();
  MolCachedSel *pp = dynamic_cast<MolCachedSel *>(m_pSel.get());
  if (pMgr==NULL||pp==NULL)
    return;
  
  pMgr->setupCacheHelper(m_pTarg, pp, NULL, &m_cacheList);
  m_cacheList.erase(m_cacheList.begin(), m_cacheList.end());
}
*/

namespace {
  template <class _Type, class _T>
  class SetAdaptor
  {
  private:
    _Type &orig;

  public:
    SetAdaptor(_Type &t) : orig(t) {}

    void push_back(const _T &value) {
      orig.insert(value);
    }
  };
}

void BondIterator::setupAidSet()
{
  if (m_pSel.isnull())
    return;

#if 0
  MolCachedSel *pMCS=NULL;
  m_aidset.erase(m_aidset.begin(), m_aidset.end());

  pMCS = dynamic_cast<MolCachedSel *>(m_pSel.get());
  if (pMCS!=NULL) {
    const std::set<int> *pacache = pMCS->getAtomCache(m_pTarg);
    if (pacache==NULL) {
      pMCS->makeAtomCache(m_pTarg);      
      pacache = pMCS->getAtomCache(m_pTarg);
      MB_ASSERT(pacache!=NULL);
    }

    // now we can use the cached data
    m_aidset = *pacache;
    return;
  }
#endif
  
  // no valid cache is found --> create AID set
  m_aidset.clear();
  MolCoord::AtomIter atm = m_pTarg->beginAtom();
  for ( ;atm!=m_pTarg->endAtom(); atm++) {
    MolAtomPtr pAtom = atm->second;
    MB_ASSERT(!pAtom.isnull());
    if (!m_pSel->isSelected(pAtom))
      continue;
    m_aidset.insert(atm->first);
  }
  
}

void BondIterator::first()
{
  setupAidSet();

  m_biter = m_pTarg->beginBond();

  if (m_pSel.isnull())
    return;

  // proceed to the first selected bond
  for ( ;m_biter!=m_pTarg->endBond(); m_biter++) {
    MolBond *pBond = m_biter->second;
    MB_ASSERT(pBond!=NULL);
    int aid1 = pBond->getAtom1();
    int aid2 = pBond->getAtom2();

    if (m_aidset.find(aid1)==m_aidset.end() ||
        m_aidset.find(aid2)==m_aidset.end())
      continue; // skip unselected bond

    break;
  }
}

void BondIterator::next()
{

  while (m_biter!=m_pTarg->endBond()) {
    m_biter ++;
    if (m_biter==m_pTarg->endBond())
      break;
    MolBond *pBond = m_biter->second;
    MB_ASSERT(pBond!=NULL);
    int aid1 = pBond->getAtom1();
    int aid2 = pBond->getAtom2();

    if (m_pSel.isnull()) {
      if (m_pTarg->getAtom(aid1).isnull()||
          m_pTarg->getAtom(aid2).isnull())
        continue; // skip invalid bond
      // OK.
      break;
    }

    if (m_aidset.find(aid1)==m_aidset.end() ||
        m_aidset.find(aid2)==m_aidset.end())
      continue; // skip unselected bond

    // pBond is selected bond
    break;
  }

  return;
}

bool BondIterator::hasMore()
{
  return m_biter!=m_pTarg->endBond();
}

bool BondIterator::get(MolAtomPtr &pa1, MolAtomPtr &pa2)
{
  int aid1, aid2;
  getID(aid1, aid2);
  pa1 = m_pTarg->getAtom(aid1);
  pa2 = m_pTarg->getAtom(aid2);
  return !pa1.isnull() && !pa2.isnull();
}

void BondIterator::getID(int &aid1, int &aid2)
{
  MolBond *pbon = m_biter->second;
  aid1 = pbon->getAtom1();
  aid2 = pbon->getAtom2();
}

