// -*-Mode: C++;-*-
//
// Convert Mol to array of positions
//
// $Id: MolArrayMap.cpp,v 1.2 2011/04/16 14:32:28 rishitani Exp $

#include <common.h>

#include <qlib/Vector4D.hpp>
#include "MolArrayMap.hpp"
#include "AtomIterator.hpp"

using namespace molstr;
using qlib::Vector4D;

bool MolArrayMapElem::less_fcn::operator() (const MolArrayMapElem &x, const MolArrayMapElem &y) const
{
  int chain_comp = ::strcmp(x.chain.c_str(), y.chain.c_str());
  if (chain_comp<0)
    return true;
  else if (chain_comp>0)
    return false;
  
  if (x.resid<y.resid)
    return true;
  else if (x.resid>y.resid)
    return false;
        
  return ::strcmp(x.atom.c_str(), y.atom.c_str())<0;
}

void MolArrayMap::setup(MolCoordPtr pRefMol, SelectionPtr pRefSel)
{
  m_data.erase(m_data.begin(), m_data.end());
  int i = 0;
  AtomIterator iter(pRefMol, pRefSel);
  for (iter.first(); iter.hasMore(); iter.next(), ++i) {
    MolAtomPtr pa = iter.get();
    MolArrayMapElem a;
    a.chain = pa->getChainName().c_str();
    a.resid = pa->getResIndex().toInt();
    a.atom = pa->getName().c_str();
    a.pA = pa;
    m_data.insert(data_t::value_type(a, -1));
    //MB_DPRINTLN("fitref %s %d %s", a.chain.c_str(), a.resid, a.atom.c_str());
  }

  setupIndex();
}

void MolArrayMap::setup(MolCoordPtr pRefMol)
{
  m_data.erase(m_data.begin(), m_data.end());
  int i = 0;
  AtomIterator iter(pRefMol);
  for (iter.first(); iter.hasMore(); iter.next(), ++i) {
    MolAtomPtr pa = iter.get();
    MolArrayMapElem a;
    a.chain = pa->getChainName().c_str();
    a.resid = pa->getResIndex().toInt();
    a.atom = pa->getName().c_str();
    a.pA = pa;
    m_data.insert(data_t::value_type(a, -1));
    //MB_DPRINTLN("fitref %s %d %s", a.chain.c_str(), a.resid, a.atom.c_str());
  }

  setupIndex();
}

void MolArrayMap::setupIndex()
{
  int i;
  data_t::iterator iter = m_data.begin();
  data_t::iterator eiter = m_data.end();
  
  for (i=0; iter!=eiter; ++iter, ++i) {
    iter->second = i;
  }
}

void MolArrayMap::convertd(qlib::Array<double> &refary)
{
  int i;
  const_iterator iter = begin();
  for (i=0; iter!=end(); ++iter, ++i) {
    Vector4D pos = iter->first.pA->getPos();
    refary[i*3] = pos.x();
    refary[i*3+1] = pos.y();
    refary[i*3+2] = pos.z();
    //comref += pos;
  }
  //comref /= nLsqAtoms;
}

void MolArrayMap::convertf(qlib::Array<float> &refary)
{
  int i;
  const_iterator iter = begin();
  for (i=0; iter!=end(); ++iter, ++i) {
    Vector4D pos = iter->first.pA->getPos();
    refary[i*3] = (float)pos.x();
    refary[i*3+1] = (float)pos.y();
    refary[i*3+2] = (float)pos.z();
  }
}

void MolArrayMap::convertID(std::vector<int> &array)
{
  int i;
  const_iterator iter = begin();
  for (i=0; iter!=end(); ++iter, ++i) {
    array[i] = iter->first.pA->getID();
  }
}

int MolArrayMap::getIndex(const MolArrayMapElem &key)
{
  const_iterator iter = m_data.find(key);
  if (iter==m_data.end())
    return -1;
  return iter->second;
}

