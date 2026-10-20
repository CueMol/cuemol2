// -*-Mode: C++;-*-
//
//  Per-atom colour and visibility memo for colouring many points by atom
//

#include <common.h>

#include "AtomColorMemo.hpp"
#include "MolAtom.hpp"
#include "MolCoord.hpp"
#include "Selection.hpp"

using namespace molstr;

namespace {
  /// Ids at or above this are resolved without memoizing (bounds the memo).
  const int MEMO_MAX_ID = 1 << 26;
}

AtomColorMemo::AtomColorMemo(MolCoordPtr pMol, const ColSchmHolder *pHolder,
                             SelectionPtr pShowSel, qlib::uid_t nSceneID, bool bColor)
  : m_pMol(pMol), m_pHolder(pHolder), m_nSceneID(nSceneID), m_bColor(bColor)
{
  if (!pShowSel.isnull() && !pShowSel->isEmpty())
    m_pShowSel = pShowSel;
}

AtomColorMemo::Entry AtomColorMemo::resolve(int aid) const
{
  Entry e;
  MolAtomPtr pAtom = m_pMol->getAtom(aid);
  if (pAtom.isnull())
    return e;

  e.bAtom = true;
  if (!m_pShowSel.isnull() && !m_pShowSel->isSelected(pAtom)) {
    e.bShown = false;
    return e;
  }
  if (!m_bColor)
    return e;

  e.pCol = m_pHolder->getColor(pAtom);
  if (!e.pCol.isnull())
    e.nDevCode = e.pCol->getDevCode(m_nSceneID);
  return e;
}

const AtomColorMemo::Entry &AtomColorMemo::get(int aid)
{
  if (aid<0)
    return m_unknown;

  if (aid>=MEMO_MAX_ID) {
    m_scratch = resolve(aid);
    return m_scratch;
  }

  const size_t idx = (size_t) aid;
  if (idx>=m_memo.size()) {
    m_memo.resize(idx+1);
    m_bResolved.resize(idx+1, 0);
  }
  if (!m_bResolved[idx]) {
    m_memo[idx] = resolve(aid);
    m_bResolved[idx] = 1;
  }
  return m_memo[idx];
}
