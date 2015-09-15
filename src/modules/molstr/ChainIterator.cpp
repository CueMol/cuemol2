// -*-Mode: C++;-*-
//
// ChainIterator : chain iterator class
//

#include <common.h>

#include "ChainIterator.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"

using namespace molstr;

void ChainIterator::setTarget(MolCoordPtr pmol)
{
  m_pTarg = pmol;

  // re-initialize the cursor position
  first();
}

MolCoordPtr ChainIterator::getTarget() const
{
  return m_pTarg;
}

void ChainIterator::setSelection(SelectionPtr psel)
{
  m_pSel = psel;
  // re-initialize the cursor position
  first();
}

SelectionPtr ChainIterator::getSelection() const
{
  return m_pSel;
}

///////////////////////////////////////////////////////////////
// cursor type interface

void ChainIterator::first()
{
  m_citer = m_pTarg->begin();

  if (m_citer==m_pTarg->end())
    return; // no chains in mol (error)

  MolChainPtr pchain = m_citer->second;

  if (m_pSel.isnull())
    return; // (ignore selection-->) OK

  if (m_pSel->isSelectedChain(pchain)!=Selection::SEL_NONE)
    return; // OK

  // proceed to the next selected residue
  next();
}

void ChainIterator::next()
{
  for (;;) {
    ++m_citer;
    if (m_citer == m_pTarg->end())
      break; // end of chain

    MolChainPtr pchain = m_citer->second;
    MB_ASSERT(!pchain.isnull());
    
    if (m_pSel.isnull())
      break; // (ignore selection-->) OK

    if (m_pSel->isSelectedChain(pchain)!=Selection::SEL_NONE)
      break; // OK

    // pchain is not selected
    // --> check the next residue
  }

  return;
}

bool ChainIterator::hasMore()
{
  return m_citer!=m_pTarg->end();
}

MolChainPtr ChainIterator::get()
{
  MB_ASSERT(hasMore());
  return  m_citer->second;
}

