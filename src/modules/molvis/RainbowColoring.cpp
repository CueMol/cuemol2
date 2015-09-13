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
    ResidIterator iter(pMol);
    int nresid = 0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      MolResiduePtr pRes = iter.get();
      if (pRes->getPivotAtom().isnull())
	continue;
      ++nresid;
    }

    if (nresid==0) {
      m_bInit = true;
      return true;
    }

    double delHue = (m_dEndHue-m_dStartHue)/double(nresid);

    int i=0;
    for (iter.first(); iter.hasMore(); iter.next()) {
      MolResiduePtr pRes = iter.get();
      if (pRes->getPivotAtom().isnull())
	continue;
      key_tuple key(pRes->getChainName(), pRes->getIndex()); 
      double hue = m_dStartHue + i*delHue;
      m_map.insert(mapping_t::value_type(key, hue));
      ++i;
    }
    MB_DPRINTLN("RainbowColoring> init nres=%d, delHue=%f, OK.", nresid, delHue);
  }
  else {
    MolCoord::ChainIter ci = pMol->begin();
    MolCoord::ChainIter cie = pMol->end();
    for (; ci!=cie; ++ci) {
      MolChainPtr pCh = ci->second;

      int nresid = 0;
      MolChain::ResidCursor rc = pCh->begin();
      MolChain::ResidCursor rce = pCh->end();
      for (; rc!=rce; ++rc) {
	MolResiduePtr pRes = *rc;
	if (pRes->getPivotAtom().isnull())
	  continue;
	++nresid;
      }

      if (nresid==0)
	continue;
      double delHue = (m_dEndHue-m_dStartHue)/double(nresid);

      int i=0;
      rc = pCh->begin();
      for (; rc!=rce; ++rc) {
	MolResiduePtr pRes = *rc;
	if (pRes->getPivotAtom().isnull())
	  continue;
	key_tuple key(pRes->getChainName(), pRes->getIndex()); 
	double hue = m_dStartHue + i*delHue;
	m_map.insert(mapping_t::value_type(key, hue));
	++i;

	//MB_DPRINTLN("%s %s , Hue=%f",
	//pCh->getName().c_str(),
	//pRes->getStrIndex().c_str(), hue);
      }

      MB_DPRINTLN("RainbowColoring> chain %s nres=%d, delHue=%f",
		  pCh->getName().c_str(), nresid, delHue);
    }
  }
  
  m_bInit = true;
  return true;
}

