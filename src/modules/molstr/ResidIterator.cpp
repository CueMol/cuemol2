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

ResidIterator::ResidIterator()
     : m_bIndOrder(true)
{
}

/// construct iterator for the all part of the mol pmol
ResidIterator::ResidIterator(MolCoordPtr pmol)
     : m_pTarg(pmol), m_bIndOrder(true)
{
}

/// construct iterator for part of pmol selected by psel
ResidIterator::ResidIterator(MolCoordPtr pmol, SelectionPtr psel)
     : m_pTarg(pmol), m_pSel(psel), m_bIndOrder(true)
{
}
  
ResidIterator::~ResidIterator()
{
}

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
// cursor type interface (ver1)

void ResidIterator::first1()
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
  next1();
}

void ResidIterator::next1()
{
  while (m_citer != m_pTarg->end()) {
    MolChainPtr pchain = m_citer->second;
    MB_ASSERT(!pchain.isnull());
    
    if (m_riter != pchain->end()) {
      ++m_riter;
    }
    else  {
      // the m_riter2 reached to the end of the chain
      ++m_citer;
      if (m_citer == m_pTarg->end())
	break; // end of chain --> no more resid!!

      pchain = m_citer->second;
      m_riter = pchain->begin();
    }

    if (m_riter == pchain->end()) {
      // the m_riter2 reached to the end of the chain
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

bool ResidIterator::hasMore1()
{
  return m_citer!=m_pTarg->end() && m_riter!=m_citer->second->end();
}

MolResiduePtr ResidIterator::get1()
{
  MB_ASSERT(hasMore());
  return *m_riter;
}

///////////////////////////////////////////////////////////////
// cursor type interface (ResIndex-ordered; ver2)

void ResidIterator::first2()
{
  m_citer = m_pTarg->begin();

  if (m_citer==m_pTarg->end())
    return; // no chains in mol (error)

  MolChainPtr pchain = m_citer->second;
  m_riter2 = m_citer->second->begin2();

  if (m_riter2==pchain->end2()) {
    // pchain is empty (no residue)
    // --> try the next chain
    next();
    return;
  }

  if (m_pSel.isnull()) return;

  //

  if (m_pSel->isSelectedResid(m_riter2->second)!=Selection::SEL_NONE)
    return; // OK

  // proceed to the next selected residue
  next();
}

void ResidIterator::next2()
{
  while (m_citer != m_pTarg->end()) {
    MolChainPtr pchain = m_citer->second;
    MB_ASSERT(!pchain.isnull());
    
    if (m_riter2 != pchain->end2()) {
      ++m_riter2;
    }
    else  {
      // the m_riter2 reached to the end of the chain
      ++m_citer;
      if (m_citer == m_pTarg->end())
	break; // end of chain --> no more resid!!

      pchain = m_citer->second;
      m_riter2 = pchain->begin2();
    }

    if (m_riter2 == pchain->end2()) {
      // the m_riter2 reached to the end of the chain
      // --> check the next residue
      continue;
    }

    if (m_pSel.isnull()) return;

    if (m_pSel->isSelectedResid(m_riter2->second)!=Selection::SEL_NONE)
      return; // OK

    // check the next residue
  }

  return;
}

bool ResidIterator::hasMore2()
{
  return m_citer!=m_pTarg->end() && m_riter2!=m_citer->second->end2();
}

MolResiduePtr ResidIterator::get2()
{
  MB_ASSERT(hasMore());
  return m_riter2->second;
}

