// -*-Mode: C++;-*-
//
// ResidIterator : atom iterator class
//
// $Id: ResidIterator.cpp,v 1.3 2011/04/16 07:40:51 rishitani Exp $

#include <common.h>

#include "ResidIterator.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"

// #include "MolSelection.hpp"

using namespace molstr;

void ResidIterator::setTarget(MolCoordPtr pmol)
{
  m_pTarg = pmol;

  // re-initialize the cursor position
  first();
}

MolCoordPtr ResidIterator::getTarget() const
{
  return m_pTarg;
}

void ResidIterator::setSelection(SelectionPtr psel)
{
  m_pSel = psel;
  // re-initialize the cursor position
  first();
}

SelectionPtr ResidIterator::getSelection() const
{
  return m_pSel;
}

///////////////////////////////////////////////////////////////
// cursor type interface

void ResidIterator::first()
{
  m_citer = m_pTarg->begin();

  if (m_citer==m_pTarg->end())
    return; // no chains in mol (error)

  MolChainPtr pchain = m_citer->second;
  m_riter = m_citer->second->begin();

  if (m_riter==pchain->end()) {
    // pchain is empty (no residue)
    // --> try the next chain
    next();
    return;
  }

  if (m_pSel.isnull()) return;

  //

  if (m_pSel->isSelectedResid(*m_riter)!=Selection::SEL_NONE)
    return; // OK

  // proceed to the next selected residue
  next();
}

void ResidIterator::next()
{
  while (m_citer != m_pTarg->end()) {
    MolChainPtr pchain = m_citer->second;
    MB_ASSERT(!pchain.isnull());
    
    if (m_riter != pchain->end()) {
      ++m_riter;
    }
    else  {
      // the m_riter reached to the end of the chain
      ++m_citer;
      if (m_citer == m_pTarg->end())
	break; // end of chain --> no more resid!!

      pchain = m_citer->second;
      m_riter = pchain->begin();
    }

    if (m_riter == pchain->end()) {
      // the m_riter reached to the end of the chain
      // --> check the next residue
      continue;
    }

    if (m_pSel.isnull()) return;

    if (m_pSel->isSelectedResid(*m_riter)!=Selection::SEL_NONE)
      return; // OK

    // check the next residue
  }

  return;
}

bool ResidIterator::hasMore()
{
  return m_citer!=m_pTarg->end() && m_riter!=m_citer->second->end();
}

MolResiduePtr ResidIterator::get()
{
  MB_ASSERT(hasMore());
  return  *m_riter;
}

bool ResidIterator::checkAllAtoms(MolResiduePtr pRes)
{
  /*
  MolResidue::AtomCursor iter = pRes->atomBegin();
  for ( ; iter!=pRes->atomEnd(); iter++) {
    MolAtom *pAtom = m_pTarg->getAtom((*iter).second);
    if (!m_pSel->isSelected(pAtom))
      return false;
  }
  */
  return true;
}


#if 0
// callback type interface
void ResidIterator::iterate(ResidIteratorCb *pcback)
{
  MolCoord::ChTabIter iter = m_pTarg->begin();
  for ( ; iter!=m_pTarg->end(); ++iter) {
    MolChain *pCh = iter->second;
    MB_ASSERT(pCh!=NULL);
    
    int ires=pCh->getBegin();
    for ( ; ires<=pCh->getEnd(); ires++) {
      MolResiduePtr pRes = pCh->getAt(ires);
      if (pRes==NULL)
        continue;
      
      if (m_pSel.isnull()) {
        pcback->residIterCalled(pRes);
        continue;
      }
      
      int res = m_pSel->isSelectedResid(pRes);
      if (res==MolSelection::SEL_NONE)
        continue;
      if (res==MolSelection::SEL_ALL) {
        pcback->residIterCalled(pRes);
        continue;
      }
      if (res!=MolSelection::SEL_UNKNOWN) {
        // PARTial case
        // partial selection are interpreted as 'not-selected'.
        continue;
      }

      // UNKNOWN case ---
      //  we should check all atoms of the residue.
      if (checkAllAtoms(pRes))
        pcback->residIterCalled(pRes);
    }
  }
  
}

#endif
