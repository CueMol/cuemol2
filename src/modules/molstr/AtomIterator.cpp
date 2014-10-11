// -*-Mode: C++;-*-
//
// AtomIterator : atom iterator class
//
// $Id: AtomIterator.cpp,v 1.2 2009/01/08 10:27:25 rishitani Exp $

#include <common.h>

#include "AtomIterator.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "Selection.hpp"

//#include "MolCachedSel.hpp"
// #include "AtomSel.hpp"

using namespace molstr;

void AtomIterator::setTarget(MolCoordPtr pmol)
{
  m_pTarg = pmol;

  // re-initialize the cursor position
  first();
}

MolCoordPtr AtomIterator::getTarget() const
{
  return m_pTarg;
}

void AtomIterator::setSelection(SelectionPtr psel)
{
  m_pSel = psel;
  // re-initialize the cursor position
  first();
}

SelectionPtr AtomIterator::getSelection() const
{
  return m_pSel;
}

///////////////////////////////////////////////////////////////
// cursor type interface

void AtomIterator::first()
{
  m_aiter = m_pTarg->beginAtom();

  if (m_pSel.isnull())
    return;

  // proceed to the first selected atom
  for ( ;m_aiter!=m_pTarg->endAtom(); m_aiter++) {
    MolAtomPtr pAtom = m_aiter->second;
    MB_ASSERT(!pAtom.isnull());
    if (!m_pSel->isSelected(pAtom))
      continue;
    // pAtom is a selected atom.
    break;
  }

}

void AtomIterator::next()
{

  while (m_aiter!=m_pTarg->endAtom()) {
    ++ m_aiter;

    if (m_pSel.isnull())
      break;
    if (m_aiter==m_pTarg->endAtom())
      break;
    MolAtomPtr pAtom = m_aiter->second;
    MB_ASSERT(!pAtom.isnull());
    if (!m_pSel->isSelected(pAtom))
      continue;
    // pAtom is a selected atom
    break;
  }

  return;
}

bool AtomIterator::hasMore()
{
  return m_aiter!=m_pTarg->endAtom();
}

MolAtomPtr AtomIterator::get()
{
  return (m_aiter)->second;
}

int AtomIterator::getID()
{
  return m_aiter->first;
}

#if 0

//////////////////////////////////////////////////////////
// MolCachedSel specific implementations

bool AtomIterator::checkAndCreateCache()
{
  if(m_pSel.isnull())
    return false;

  qlib::sp<MolCachedSel> pMCS;
  pMCS = qlib::dynamic_pointer_cast<MolCachedSel>(m_pSel);
  if (pMCS.isnull())
    return false;
  
  m_pAtomSet = pMCS->getAtomCache(m_pTarg);
  if (m_pAtomSet!=NULL) {
    // we can use the cached data
    return true;
  }
  
  // no valid cache is found
  // --> make new cache data
  pMCS->makeAtomCache(m_pTarg);
  m_pAtomSet = pMCS->getAtomCache(m_pTarg);
  MB_ASSERT(m_pAtomSet!=NULL);
  return true;
}

//////////////////////////////////////////////////////////
// AtomSel specific implementations

void AtomIterator::molAtomSel_first(AtomSel *psel)
{
  const TagName &chname = psel->getChainName();
  int resid = psel->getResid();
  const TagName &atomname = psel->getAtomName();
  
  MolChain *pch = m_pTarg->getChain(chname);
  if (pch==NULL) {
    m_molAtomSel_pobj = NULL;
    return;
  }
  
  MolResidue *pres = pch->getAt(resid);
  if (pres==NULL) {
    m_molAtomSel_pobj = NULL;
    return;
  }

  MolAtom *patom = pres->getAtom(atomname);
  m_molAtomSel_pobj = patom;
  return;
}

void AtomIterator::molAtomSel_next(AtomSel *psel)
{
  if (m_molAtomSel_pobj!=NULL)
    m_molAtomSel_pobj = NULL;
}

bool AtomIterator::molAtomSel_hasMore(AtomSel *psel)
{
  return m_molAtomSel_pobj!=NULL;
}

MolAtom *AtomIterator::molAtomSel_get(AtomSel *psel)
{
  return m_molAtomSel_pobj;
}

int AtomIterator::molAtomSel_getID(AtomSel *psel)
{
  return m_molAtomSel_pobj->getID();
}

//////////////////////////////////////////////////////////
#endif
