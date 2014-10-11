// -*-Mode: C++;-*-
//
// ResidRangeSet : set of residue ranges
//

#include <common.h>
#include "ResidRangeSet.hpp"
#include "ResidIterator.hpp"
#include "SelCommand.hpp"

using namespace molstr;

ResidRangeSet::~ResidRangeSet()
{
}

void ResidRangeSet::copyFrom(const ResidRangeSet &orig)
{
  clear();

  data_type::const_iterator iter = orig.m_data.begin();
  data_type::const_iterator eiter = orig.m_data.end();
  for (; iter!=eiter; ++iter) {
    const LString &chname = iter->first;
    elem_type *pNewVal = new elem_type( *(iter->second) );
    m_data.set(chname, pNewVal);
  }
}

void ResidRangeSet::fromSel(MolCoordPtr pMol, SelectionPtr pSel)
{
  clear();
  append(pMol, pSel);
}

void ResidRangeSet::append(MolCoordPtr pMol, SelectionPtr pSel)
{
  if (pSel.isnull())
    return;
  if (pSel->isEmpty())
    return;
  
  ResidIterator iter(pMol, pSel);
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    append(pRes);
  }

  MB_DPRINTLN("ResidRngSet.append> result=%s", toString().c_str());
}

void ResidRangeSet::append(MolResiduePtr pRes)
{
  LString chname = pRes->getChainName();
  ResidIndex resid = pRes->getIndex();
  elem_type *pRng = m_data.get(chname);
  if (pRng==NULL) {
    pRng = new elem_type();
    m_data.set(chname, pRng);
  }

  // XXX:
  ResidIndex resid_plus1;
  resid_plus1.first = resid.first+1;
  resid_plus1.second = resid.second;
  
  pRng->append(resid, resid_plus1);
}

void ResidRangeSet::remove(MolCoordPtr pMol, SelectionPtr pSel)
{
  if (pSel.isnull())
    return;
  if (pSel->isEmpty())
    return;

  ResidIterator iter(pMol, pSel);
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    LString chname = pRes->getChainName();
    ResidIndex resid = pRes->getIndex();
    elem_type *pRng = m_data.get(chname);
    if (pRng==NULL) {
      pRng = new elem_type();
      m_data.set(chname, pRng);
    }

    // XXX:
    ResidIndex resid_plus1;
    resid_plus1.first = resid.first+1;
    resid_plus1.second = resid.second;

    pRng->remove(resid, resid_plus1);
  }

  MB_DPRINTLN("ResidRngSet.remove> result=%s", toString().c_str());
}

bool ResidRangeSet::contains(MolResiduePtr pRes) const
{
  LString chname = pRes->getChainName();
  elem_type *pRng = m_data.get(chname);
  if (pRng==NULL)
    return false; // no chain
  if (pRng->contains(pRes->getIndex()))
    return  true; // OK

  // no resid
  return false;
}

SelectionPtr ResidRangeSet::toSel(MolCoordPtr pMol) const
{
  LString str = toString();
  SelectionPtr res(new SelCommand(str));
  return res;
}

void ResidRangeSet::dump() const
{
  if (m_data.empty()) {
    LOG_DPRINTLN("(empty)");
    return;
  }

  LOG_DPRINTLN("%s", toString().c_str());
}

bool ResidRangeSet::isStrConv() const
{
  return true;
}

LString ResidRangeSet::toStringResid(const elem_type &range) const
{
  LString rval;

  elem_type::const_iterator ebegin = range.begin();
  elem_type::const_iterator eend = range.end();
  elem_type::const_iterator eiter = ebegin;
  for (; eiter!=eend; ++eiter) {
    if (eiter!=ebegin)
      rval += ",";
    
    int nstart = eiter->nstart.first, nend = eiter->nend.first-1;
    char cstart = eiter->nstart.second, cend = eiter->nend.second;

    if (!cstart)
      rval += LString::format("%d", nstart);
    else
      rval += LString::format("%d%c", nstart, cstart);

    if (nstart==nend && cstart==cend) {
      // single selection node
    }
    else {
      // range selection node
      rval += ":";
      if (!cend)
        rval += LString::format("%d", nend);
      else
        rval += LString::format("%d%c", nend, cend);
    }
  }
  
  return rval;
}

LString ResidRangeSet::toString() const
{
  if (m_data.empty())
    return LString();

  LString rval;

  data_type::const_iterator iend = m_data.end();
  data_type::const_iterator iter =  m_data.begin();
  bool bIni = true;
  for (; iter!=iend; ++iter) {
    elem_type *pVal = iter->second;
    if (pVal->isEmpty()) {
      continue;
    }

    if (bIni)
      bIni = false;
    else
      rval += "|";

    const LString &chname = iter->first;
    LString srng = toStringResid(*pVal);
    rval += chname + "." + srng + ".*";
  }

  return rval;
}

bool ResidRangeSet::fromString(const LString &src)
{
  ResidRangeSet res;

  // TO DO: XXX implementation

  m_data = res.m_data;
  return true;
}

//static
ResidRangeSet *ResidRangeSet::fromStringS(const LString &src)
{
  ResidRangeSet *pRes = new ResidRangeSet();
  if (!pRes->fromString(src))
    return NULL;
  return pRes;
}

