// -*-Mode: C++;-*-
//
// RangeSet : set of integer ranges
//
// $Id: RangeSet.cpp,v 1.4 2011/04/16 12:44:39 rishitani Exp $

#include <common.h>
#include <limits>

#include "LScrRangeSet.hpp"

using namespace qlib;

LScrRangeSet::~LScrRangeSet()
{
}

LScrRangeSet LScrRangeSet::negate() const
{
  const int pinfty = std::numeric_limits<int>::max();
  const int minfty = std::numeric_limits<int>::min();
  super_t retval;
  
  if (m_data.empty()) {
    retval.append(minfty, pinfty);
    return retval;
  }

  const elem_type &hd = m_data.front();
  const elem_type &tl = m_data.back();

  if (minfty<hd.nstart) {
    retval.append(minfty, hd.nstart);
  }

  if (hd.nend<pinfty) {
    retval.append(hd.nend, pinfty);
  }

  if (m_data.size()==1) {
    return retval;
  }

  data_t::const_iterator iter = m_data.begin(), iter2;
  iter2 = iter;
  ++iter2;
  for ( ; iter2!=m_data.end(); ++iter, ++iter2)
    retval.append(iter->nend, iter->nstart);

  return retval;
}

LScrRangeSet LScrRangeSet::scr_append(const qlib::LScrRangeSet &rng)
{
  LScrRangeSet res(*this);
  res.merge(rng);
  return res;
}

LScrRangeSet LScrRangeSet::scr_appendInt(int nst, int nen)
{
  LScrRangeSet res(*this);
  res.append(nst, nen);
  return res;
}

LScrRangeSet LScrRangeSet::scr_remove(const qlib::LScrRangeSet &rng)
{
  LScrRangeSet res(*this);
  res.remove(rng);
  return res;
}

LScrRangeSet LScrRangeSet::scr_removeInt(int nst, int nen)
{
  LScrRangeSet res(*this);
  res.remove(nst, nen);
  return res;
}

void LScrRangeSet::dump() const
{
  if (m_data.empty()) {
    LOG_DPRINTLN("(empty)");
    return;
  }

  data_t::const_iterator iter = m_data.begin();
  for (; iter!=m_data.end(); ++iter) {
    LOG_DPRINT("[%d-%d) ", iter->nstart, iter->nend);
  }  
  LOG_DPRINTLN("");
}

bool LScrRangeSet::isStrConv() const
{
  return true;
}

LString LScrRangeSet::toString() const
{
  if (m_data.empty())
    return LString();

  LString rval;

  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    int nstart = iter->nstart, nend = iter->nend;

    if (iter!=m_data.begin())
      rval += ",";

    if (nstart==nend-1)
      rval += LString::format("%d",nstart);
    else
      rval += LString::format("%d:%d",nstart,nend-1);
  }  

  return rval;

}

bool LScrRangeSet::fromString(const LString &src)
{
  LScrRangeSet res;

  // tokenize by comma
  LStringList ls;
  src.split(',', ls);
  BOOST_FOREACH (const LString &elem, ls) {
    int cc = elem.indexOf(':');
    if (cc<0) {
      int num;
      if (!elem.toInt(&num))
        return false;
      res.append(num, num+1);

    }
    else {
      LString sst = elem.substr(0, cc);
      LString sen = elem.substr(cc+1);
      int nst;
      if (!sst.toInt(&nst))
        return false;
      int nen;
      if (!sen.toInt(&nen))
        return false;
      res.append(nst, nen+1);
    }
  }

  m_data = res.m_data;
  return true;
}

//static
LScrRangeSet *LScrRangeSet::fromStringS(const LString &src)
{
  LScrRangeSet *pRes = MB_NEW LScrRangeSet();
  if (!pRes->fromString(src))
    return NULL;
  return pRes;
}

