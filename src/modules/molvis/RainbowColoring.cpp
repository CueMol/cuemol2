// -*-Mode: C++;-*-
//
//  Rainbow coloring class implementation
//
//  $Id: RainbowColoring.cpp,v 1.4 2011/04/16 07:40:51 rishitani Exp $

#include <common.h>
#include "molvis.hpp"
#include "RainbowColoring.hpp"
#include <modules/molstr/ResidIterator.hpp>

using namespace molvis;
using namespace molstr;
using gfx::ColorPtr;

RainbowColoring::RainbowColoring()
{
  m_bInit = false;
  m_nMode = RBC_CHAIN;
  m_nIncrMode = RBC_INCR_RESID;

  resetAllProps();
}

RainbowColoring::~RainbowColoring()
{
}

bool RainbowColoring::getAtomColor(MolAtomPtr pAtom, ColorPtr &color)
{
  MolResiduePtr pRes = pAtom->getParentResidue();
  if (pRes.isnull())
    return false;
  return getResidColor(pRes, color);
}

bool RainbowColoring::getResidColor(MolResiduePtr pResid, ColorPtr &rColor)
{
  MB_ASSERT(m_bInit);
  if (!m_bInit)
    return false;

  key_tuple key(pResid->getChainName(), pResid->getIndex()); 
  mapping_t::const_iterator iter = m_map.find(key);
  if (iter==m_map.end())
    return false;

  double hue = iter->second;
  rColor = gfx::SolidColor::createHSB(hue/360.0, m_dSat, m_dBri);
  return true;
}

bool RainbowColoring::start(MolCoordPtr pMol, Renderer *pRend)
{
  // MolCoordPtr pMol(pRend->getClientObj(), qlib::no_throw_tag());
  if (pMol.isnull()) {
    return false;
  }

  m_map.clear();

  if (m_nMode==RBC_MOL) {
    makeMolMap2(pMol);
  }
  else {
    MolCoord::ChainIter ci = pMol->begin();
    MolCoord::ChainIter cie = pMol->end();
    for (; ci!=cie; ++ci) {
      MolChainPtr pCh = ci->second;
      makeChainMap2(pCh);
    }
  }
  
  m_bInit = true;
  return true;
}

///////////////////
// Implementation

void RainbowColoring::procRes_ProtSS(MolResiduePtr pRes)
{
  LString ss, grp;
  pRes->getPropStr("group", grp);
  pRes->getPropStr("secondary", ss);
  
  if (ss.equals("helix") || ss.equals("sheet"))
    m_resset.append(pRes);
}

void RainbowColoring::mkInkPos_ProtSS()
{
  ResidRangeSet::const_iterator riter = m_resset.begin();
  ResidRangeSet::const_iterator rend = m_resset.end();
  for (; riter!=rend; ++riter) {
    LString chname = riter->first;
    ResidRangeSet::elem_type &range = *(riter->second);
    ResidRangeSet::elem_type::const_iterator eiter = range.begin();
    ResidRangeSet::elem_type::const_iterator eend = range.end();
    int j = 0, rsize = range.size();
    for (; eiter!=eend; ++eiter, j++) {
      ResidRangeSet::elem_type::const_iterator enx = eiter;
      enx++;
      if (enx!=eend) {
        ResidIndex ibeg = eiter->nend;
        ResidIndex iend = enx->nstart;
        key_tuple kt(chname, (ibeg.toInt()+iend.toInt())/2);
        m_mkset.insert(kt);
        MB_DPRINTLN("RNB Incr at %s %d", kt.first.c_str(), int(kt.second.toInt()));
      }
    }
    
  }
}

void RainbowColoring::procRes_Chain(MolResiduePtr pRes, MolResiduePtr pPrevRes)
{
  if (pPrevRes.isnull())
    return;
  
  // prev chain!=curr chain --> increment color!!
  if (!pRes->getChainName().equals( pPrevRes->getChainName() )) {
    key_tuple kt(pPrevRes->getChainName(), pPrevRes->getIndex());
    m_mkset.insert(kt);
  }
  
}

void RainbowColoring::makeMolMap2(MolCoordPtr pMol)
{
  m_resset.clear();
  m_mkset.clear();
  int nresid = 0;
  
  ResidIterator iter(pMol);
  MolResiduePtr pPrevRes;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    switch (m_nIncrMode) {
    case RBC_INCR_RESID:
      if (!pRes->getPivotAtom().isnull())
        ++nresid;
      break;
    case RBC_INCR_PROTSS:
      procRes_ProtSS(pRes);
      break;
    case RBC_INCR_CHAIN:
      procRes_Chain(pRes, pPrevRes);
      break;
    }
    
    pPrevRes = pRes;
  }
  
  if (m_nIncrMode==RBC_INCR_PROTSS)
    mkInkPos_ProtSS();
  
  int ninc = m_mkset.size();

  if (m_nIncrMode==RBC_INCR_RESID)
    ninc = nresid;

  double delHue = 0.0;

  if (ninc==0) {
    MB_DPRINTLN("Rainbow> makeChainMap(): nresid is zero!!");
    // return;
  }
  else {
    delHue = (m_dEndHue-m_dStartHue)/double(ninc);
  }

  double hue;
  int i=0;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    key_tuple key(pRes->getChainName(), pRes->getIndex());

    hue = m_dStartHue + i*delHue;
    m_map.insert(mapping_t::value_type(key, hue));

    if (m_nIncrMode==RBC_INCR_RESID) {
      if (!pRes->getPivotAtom().isnull())
        ++i;
    }
    else {
      std::set<key_tuple>::const_iterator jj = m_mkset.find(key);
      if (jj!=m_mkset.end())
        ++i;
    }
  }

  m_resset.clear();
  m_mkset.clear();
}

void RainbowColoring::makeChainMap2(MolChainPtr pCh)
{
  m_resset.clear();
  m_mkset.clear();

  int nresid = 0;
  MolResiduePtr pPrevRes;

  MolChain::ResidCursor rc = pCh->begin();
  MolChain::ResidCursor rce = pCh->end();
  for (; rc!=rce; ++rc) {
    MolResiduePtr pRes = *rc;

    switch (m_nIncrMode) {
    case RBC_INCR_RESID:
      if (!pRes->getPivotAtom().isnull())
        ++nresid;
      break;
    case RBC_INCR_PROTSS:
      procRes_ProtSS(pRes);
      break;
    case RBC_INCR_CHAIN:
      procRes_Chain(pRes, pPrevRes);
      break;
    }
    
    pPrevRes = pRes;
  }
  
  
  if (m_nIncrMode==RBC_INCR_PROTSS)
    mkInkPos_ProtSS();
  
  int ninc = m_mkset.size();

  if (m_nIncrMode==RBC_INCR_RESID)
    ninc = nresid;

  double delHue = 0.0;

  if (ninc==0) {
    MB_DPRINTLN("Rainbow> makeChainMap(): nresid is zero!!");
    // return;
  }
  else {
    delHue = (m_dEndHue-m_dStartHue)/double(ninc);
  }

  double hue;
  int i=0;

  rc = pCh->begin();
  for (; rc!=rce; ++rc) {
    MolResiduePtr pRes = *rc;
    key_tuple key(pRes->getChainName(), pRes->getIndex());

    hue = m_dStartHue + i*delHue;
    m_map.insert(mapping_t::value_type(key, hue));

    if (m_nIncrMode==RBC_INCR_RESID) {
      if (!pRes->getPivotAtom().isnull())
        ++i;
    }
    else {
      std::set<key_tuple>::const_iterator jj = m_mkset.find(key);
      if (jj!=m_mkset.end())
        ++i;
    }
  }

  m_resset.clear();
  m_mkset.clear();
}
