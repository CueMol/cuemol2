// -*-Mode: C++;-*-
//
//  list of residue
//
// $Id: MolChain.cpp,v 1.7 2011/04/16 07:40:51 rishitani Exp $

#include <common.h>

#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "MolCoord.hpp"

#include <qsys/SceneManager.hpp>

using namespace molstr;

MolChain::MolChain()
{
}

MolChain::~MolChain()
{
  MB_DPRINTLN("Chain(%s) %p destructing", m_name.c_str(), this);

  //
  // MSVC map::clear() uses recursive algorithm that can cause stack overflow,
  // and therefore we cannot use map::clear() here!!
  //

  //m_data.clear();
  /*while (m_data.size()>0) {
    impl_t::iterator iter = m_data.begin();
    m_data.erase(iter);
  }*/

  MB_DPRINTLN("OK");
}

bool MolChain::appendResidue(MolResiduePtr pres)
{
  ResidIndex ind = pres->getIndex();
  bool res = m_map.insert(map_t::value_type(ind, pres)).second;
  if (!res)
    return false; // residue with ind already exists --> fail

/*
  // set seqence number
  if (m_data.empty())
    pres->setSeqNo(0);
  else {
    int lastno = m_data.back()->getSeqNo();
    pres->setSeqNo(lastno+1);
  }
*/
  
  m_data.push_back(pres);

  pres->setChainName(m_name);
  return true;
}

// get residue obj index
MolResiduePtr MolChain::getResidue(ResidIndex idx) const
{
  map_t::const_iterator iter = m_map.find(idx);
  if (iter==m_map.end())
    return MolResiduePtr();
  
  return iter->second;
}

bool MolChain::removeResidue(MolResiduePtr pRes)
{
  ResidIndex idx = pRes->getIndex();
  //int seqno = pRes->getSeqNo();
  map_t::iterator iter = m_map.find(idx);
  if (iter==m_map.end())
    return false;

  impl_t::iterator i2 = std::find(m_data.begin(), m_data.end(), pRes);
  if (i2==m_data.end())
    return false;

  m_map.erase(iter);
  i2 = m_data.erase(i2);

/*
  // shift seqno
  impl_t::iterator i2end = m_data.end();
  for (int i=seqno; i2!=i2end; ++i2, ++i) {
    (*i2)->setSeqNo(i);
  }
*/
  
  return true;
}

MolCoordPtr MolChain::getParent() const
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(m_molID);
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj);
}

LString MolChain::getResidsJSON() const
{
  MolCoordPtr pMol = getParent();
  SelectionPtr pSel = pMol->getSelection();

  // sort residues by res index
  typedef std::map<ResidIndex, MolResiduePtr> ResMap;
  ResMap resmap;
  ResidCursor iter = begin();
  ResidCursor eiter = end();
  for (; iter!=eiter; ++iter) {
    MolResiduePtr pRes = *iter;
    ResidIndex ind = pRes->getIndex();
    resmap.insert(ResMap::value_type(ind, pRes));
  }
  
  // conv to JSON str
  LString rval = "[";

  //ResidCursor iter = begin();
  //ResidCursor eiter = end();
  bool bcomma = false;
  BOOST_FOREACH (ResMap::value_type &elem, resmap) {
    MolResiduePtr pRes = elem.second;
    //for (; iter!=eiter; ++iter) {
    if (bcomma) rval += ",";
    //MolResiduePtr pRes = *iter;
    ResidIndex ind = pRes->getIndex();
    LString single;
    pRes->getPropStr("single", single);

    LString strsel("false");
    if (!pSel->isEmpty()) {
      int isel = pSel->isSelectedResid(pRes);
      if (isel!=Selection::SEL_NONE)
        strsel = "true";
    }
    
    rval += "{";
    rval += "\"name\":\""+pRes->getName().escapeQuots()+"\",";
    rval += "\"single\":\""+single.escapeQuots()+"\",";
    rval += "\"sel\":"+strsel+",";
    rval += "\"index\":\""+ind.toString().escapeQuots()+"\"";
    rval += "}";
    bcomma = true;
  }
  rval += "]";

  return rval;
}

