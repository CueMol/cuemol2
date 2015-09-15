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
    makeMolMap(pMol);
  }
  else {
    MolCoord::ChainIter ci = pMol->begin();
    MolCoord::ChainIter cie = pMol->end();
    for (; ci!=cie; ++ci) {
      MolChainPtr pCh = ci->second;
      makeChainMap(pCh);
    }
  }
  
  m_bInit = true;
  return true;
}

namespace {
  bool ssHelixIncrCond(MolResiduePtr pRes, MolResiduePtr pPrevRes)
  {
    if (pPrevRes.isnull())
      return false;

    LString ss, ss_prev;
    pRes->getPropStr("secondary", ss);
    pPrevRes->getPropStr("secondary", ss_prev);

    if (ss.equals(ss_prev))
      return false;

    // ss_prev==helix && ss!=helix --> increment color!!
    if (ss_prev.equals("helix"))
      return true;

    return false;
  }

  bool ssSheetIncrCond(MolResiduePtr pRes, MolResiduePtr pPrevRes)
  {
    if (pPrevRes.isnull())
      return false;

    LString ss, ss_prev;
    pRes->getPropStr("secondary", ss);
    pPrevRes->getPropStr("secondary", ss_prev);

    if (ss.equals(ss_prev))
      return false;

    // ss_prev==sheet && ss!=sheet --> increment color!!
    if (ss_prev.equals("sheet"))
      return true;

    return false;
  }

  bool ssHelixSheetIncrCond(MolResiduePtr pRes, MolResiduePtr pPrevRes)
  {
    if (pPrevRes.isnull())
      return false;

    LString ss, ss_prev;
    pRes->getPropStr("secondary", ss);
    pPrevRes->getPropStr("secondary", ss_prev);

    if (ss.equals(ss_prev))
      return false;

    // ss_prev==(sheet|helix) && ss!=ss_prev --> increment color!!
    if (ss_prev.equals("sheet") || ss_prev.equals("helix"))
      return true;

    return false;
  }
  
  bool chainIncrCond(MolResiduePtr pRes, MolResiduePtr pPrevRes)
  {
    if (pPrevRes.isnull())
      return false;

    // prev chain!=curr chain --> increment color!!
    if (!pRes->getChainName().equals( pPrevRes->getChainName() ))
      return true;

    return false;
  }
}

void RainbowColoring::makeMolMap(MolCoordPtr pMol)
{
  int nresid = 0;

  // count color elements
  ResidIterator iter(pMol);
  MolResiduePtr pPrevRes;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();

    // // initialize by start-hue
    // key_tuple key(pRes->getChainName(), pRes->getIndex()); 
    // m_map.insert(mapping_t::value_type(key, m_dStartHue));

    if (m_nIncrMode==RBC_INCR_RESID) {
      if (!pRes->getPivotAtom().isnull())
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIX) {
      if (ssHelixIncrCond(pRes, pPrevRes))
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_SSSHEET) {
      if (ssSheetIncrCond(pRes, pPrevRes))
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIXSHEET) {
      if (ssHelixSheetIncrCond(pRes, pPrevRes))
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_CHAIN) {
      if (chainIncrCond(pRes, pPrevRes))
        ++nresid;
    }

    pPrevRes = pRes;
  }

  double delHue = 0.0;
  if (nresid==0) {
    MB_DPRINTLN("Rainbow> makeMolMap(): nresid is zero!!");
    // return;
  }
  else {
    delHue = (m_dEndHue-m_dStartHue)/double(nresid);
  }
  
  // calculate color for each element
  int i = 0;
  double hue = 0.0;
  pPrevRes = MolResiduePtr();
  
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    key_tuple key(pRes->getChainName(), pRes->getIndex()); 

    if (m_nIncrMode==RBC_INCR_RESID) {
      if (!pRes->getPivotAtom().isnull()) {
        hue = m_dStartHue + i*delHue;
        ++i;
      }
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIX) {
      if (ssHelixIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }
    else if (m_nIncrMode==RBC_INCR_SSSHEET) {
      if (ssSheetIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIXSHEET) {
      if (ssHelixSheetIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }
    else if (m_nIncrMode==RBC_INCR_CHAIN) {
      if (chainIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }

    m_map.insert(mapping_t::value_type(key, hue));
    pPrevRes = pRes;
  }

  MB_DPRINTLN("RainbowColoring> init nres=%d, delHue=%f, OK.", nresid, delHue);
}

void RainbowColoring::makeChainMap(MolChainPtr pCh)
{
  int nresid = 0;
  MolResiduePtr pPrevRes;

  // count color elements
  MolChain::ResidCursor rc = pCh->begin();
  MolChain::ResidCursor rce = pCh->end();
  for (; rc!=rce; ++rc) {
    MolResiduePtr pRes = *rc;

    // // init by start-hue color
    // key_tuple key(pRes->getChainName(), pRes->getIndex()); 
    // m_map.insert(mapping_t::value_type(key, m_dStartHue));

    if (m_nIncrMode==RBC_INCR_RESID) {
      if (!pRes->getPivotAtom().isnull())
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIX) {
      if (ssHelixIncrCond(pRes, pPrevRes))
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_SSSHEET) {
      if (ssSheetIncrCond(pRes, pPrevRes))
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIXSHEET) {
      if (ssHelixSheetIncrCond(pRes, pPrevRes))
        ++nresid;
    }
    else if (m_nIncrMode==RBC_INCR_CHAIN) {
      if (chainIncrCond(pRes, pPrevRes))
        ++nresid;
    }

    pPrevRes = pRes;
  }
  
  double delHue = 0.0;

  if (nresid==0) {
    MB_DPRINTLN("Rainbow> makeChainMap(): nresid is zero!!");
    // return;
  }
  else {
    delHue = (m_dEndHue-m_dStartHue)/double(nresid);
  }
  
  int i=0;
  double hue = 0.0;
  pPrevRes = MolResiduePtr();

  rc = pCh->begin();
  for (; rc!=rce; ++rc) {
    MolResiduePtr pRes = *rc;
    key_tuple key(pRes->getChainName(), pRes->getIndex()); 

    if (m_nIncrMode==RBC_INCR_RESID) {
      if (!pRes->getPivotAtom().isnull()) {
        hue = m_dStartHue + i*delHue;
        ++i;
      }
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIX) {
      if (ssHelixIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }
    else if (m_nIncrMode==RBC_INCR_SSSHEET) {
      if (ssSheetIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }
    else if (m_nIncrMode==RBC_INCR_SSHELIXSHEET) {
      if (ssHelixSheetIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }
    else if (m_nIncrMode==RBC_INCR_CHAIN) {
      if (chainIncrCond(pRes, pPrevRes))
        ++i;
      hue = m_dStartHue + i*delHue;
    }

    m_map.insert(mapping_t::value_type(key, hue));
    pPrevRes = pRes;
  }
  
  MB_DPRINTLN("RainbowColoring> chain %s nres=%d, delHue=%f",
              pCh->getName().c_str(), nresid, delHue);
}

