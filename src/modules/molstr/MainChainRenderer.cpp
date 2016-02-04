// -*-Mode: C++;-*-
//
//  superclass of main-chain molecular renderers
//
//  $Id: MainChainRenderer.cpp,v 1.20 2011/04/16 14:32:28 rishitani Exp $

#include <common.h>

#include "MainChainRenderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "ResiToppar.hpp"
#include "ResidIterator.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Hittest.hpp>
#include <gfx/GradientColor.hpp>
#include <qlib/RangeSet.hpp>

using namespace molstr;

MainChainRenderer::MainChainRenderer()
  : MolRenderer()
{
  // m_dBondBrkDist = ;
}

MainChainRenderer::~MainChainRenderer()
{
}

/**
  Determine where the new segment begins.
*/
bool MainChainRenderer::isNewSegment(MolResiduePtr pcur, MolResiduePtr pprev)
{
  // If there is no previous residue,
  //  pcur may be the begining of the segment.
  if (pprev.isnull())
    return true;

  // check chains
  MolChainPtr pcurch = pcur->getParentChain();
  MolChainPtr pprevch = pprev->getParentChain();
  MB_ASSERT(!pcurch.isnull());
  MB_ASSERT(!pprevch.isnull());
  if (pcurch.get()!=pprevch.get())
    return true;

  //
  // Segment break only occurs on the inter-resid distance,
  //   irrespective of the residue indeces
  //

  if (!pprev->isLinkedTo(pcur)) {
    // pprev and pnext is not linked --> new segment!!
    return true;
  }

  return false;
}

void MainChainRenderer::render(DisplayContext *pdl)
{
  MolCoordPtr pCliMol = getClientMol();
  if (pCliMol.isnull()) {
    MB_DPRINTLN("MolAtomRenderer::render> Client mol is null");
    return;
  }

  // initialize the coloring scheme
  getColSchm()->start(pCliMol, this);
  pCliMol->getColSchm()->start(pCliMol, this);

  beginRend(pdl);
  
  {
    // visit selected residues
    ResidIterator iter(pCliMol, getSelection());
    
    MolResiduePtr pPrevResid;
    for (iter.first(); iter.hasMore(); iter.next()) {
      MolResiduePtr pRes = iter.get();
      // MB_DPRINTLN("** Selected resid %d", pRes->getIndex());
      MB_ASSERT(!pRes.isnull());
      MolAtomPtr pPiv = getPivotAtom(pRes);
      if (pPiv.isnull()) {

        //MB_DPRINTLN("render resid %s:%s%d pivot not found",
        //pRes->getChainName().c_str(),
        //pRes->getName().c_str(),
        //int(pRes->getIndex()));

        // This resid doesn't has pivot, so we cannot draw backbone!!
        if (!pPrevResid.isnull())
          endSegment(pdl, pPrevResid);
        pPrevResid = MolResiduePtr();
        continue;
      }

      if (isNewSegment(pRes, pPrevResid)) {
        if (!pPrevResid.isnull())
          endSegment(pdl, pPrevResid);
        beginSegment(pdl, pRes);
      }

      rendResid(pdl, pRes);
      pPrevResid = pRes;
    }

    if (!pPrevResid.isnull())
      endSegment(pdl, pPrevResid);
  }

  endRend(pdl);
  
  getColSchm()->end();
  pCliMol->getColSchm()->end();

  // MB_DPRINTLN("MainChainRenderer::display() end OK.");
}

//////////////////////////////////////////////////////////////////////////

bool MainChainRenderer::isHitTestSupported() const
{
  return true;
}

void MainChainRenderer::renderHit(DisplayContext *phl)
{
  beginHitRend(phl);
  
  {
    // visit selected residues
    ResidIterator iter(getClientMol(), getSelection());
    
    MolResiduePtr pPrevResid;
    for (iter.first(); iter.hasMore(); iter.next()) {
      MolResiduePtr pRes = iter.get();
      // MB_DPRINTLN("** Selected resid %d", pRes->getIndex());
      MB_ASSERT(!pRes.isnull());
      MolAtomPtr pPiv = getPivotAtom(pRes);
      if (pPiv.isnull()) {

        // MB_DPRINTLN("render resid %s:%s%d pivot not found",
        // pRes->getChainName().c_str(),
        // pRes->getName().c_str(),
        // int(pRes->getIndex()));

        // This resid doesn't has pivot, so we cannot draw backbone!!
        if (!pPrevResid.isnull())
          endHitSegment(phl, pPrevResid);
        pPrevResid = MolResiduePtr();
        continue;
      }

      if (isNewSegment(pRes, pPrevResid)) {
        if (!pPrevResid.isnull())
          endHitSegment(phl, pPrevResid);
        beginHitSegment(phl, pRes);
      }

      rendHitResid(phl, pRes);
      pPrevResid = pRes;
    }

    if (!pPrevResid.isnull())
      endHitSegment(phl, pPrevResid);
  }

  endHitRend(phl);
}

void MainChainRenderer::beginHitRend(DisplayContext *phl)
{
  // phl->loadName(getID());
  // phl->pushName(0);
  // phl->pushName(-1);
}

void MainChainRenderer::endHitRend(DisplayContext *phl)
{
  // phl->popName();
}

void MainChainRenderer::beginHitSegment(DisplayContext *phl, MolResiduePtr)
{
}

void MainChainRenderer::endHitSegment(DisplayContext *phl, MolResiduePtr)
{
}

void MainChainRenderer::rendHitResid(DisplayContext *phl, MolResiduePtr pRes)
{
  MolAtomPtr pAtom = getPivotAtom(pRes);
  if (pAtom.isnull())
    return;
  
  int aid = pAtom->getID();
  if (aid<0)
    return;

  const Vector4D pos1 = pAtom->getPos();
  phl->drawPointHit(aid, pos1);
  /*
  phl->loadName(aid);
  phl->startPoints();
  phl->vertex(pos1);
  phl->end();
   */
}

LString MainChainRenderer::interpHit(const gfx::RawHitData &rhit)
{
  MolCoordPtr pCliMol = getClientMol();
  if (pCliMol.isnull()) {
    MB_DPRINTLN("MolAtomRenderer::render> Client mol is null");
    return LString();
  }

  qlib::uid_t rend_id = getUID();
  int nsize = rhit.getDataSize(getUID());
  if (nsize<=0)
    return LString();

  LString rval;
  int aid;

  rval += "\"objtype\": \"MolCoord\",\n";
  rval += LString::format("\"size\": %d, ", nsize);

  if (nsize==1) {
    // Single hit
    aid = rhit.getDataAt(rend_id, 0, 0);

    if (aid<0) {
      MB_DPRINTLN("MolRend> invalid hitdata entry ignored");
      return LString();
    }

    // add common atom results
    MolAtomPtr pAtom = pCliMol->getAtom(aid);
    rval += interpHitAidImpl(pAtom);

    // Selection str (residue)
    MolResiduePtr pRes = pAtom->getParentResidue();
    MolChainPtr pCh = pAtom->getParentChain();
    rval += LString::format("\"sel\": \"%s.%s.*\", ",
                            pCh->getName().c_str(),
                            pRes->getStrIndex().c_str());

    //return super_t::interpHit(rhit);
  }
  else {
    // multiple hit (rectangle, etc)

    typedef qlib::RangeSet<int> RngMapElem;
    typedef std::map<LString, RngMapElem> RngMap;
    RngMap ranges;

    for (int ii=0; ii<nsize; ++ii) {
      aid = rhit.getDataAt(rend_id, ii, 0);
      if (aid<0) {
        MB_DPRINTLN("MolRend> invalid hitdata entry (%d) ignored", ii);
        continue;
      }
      MolAtomPtr pAtom = pCliMol->getAtom(aid);
      if (pAtom.isnull())
        continue;

      MolResiduePtr pRes = pAtom->getParentResidue();
      MolChainPtr pCh = pAtom->getParentChain();
      if (pRes.isnull()||pCh.isnull())
        continue;

      LString chname = pCh->getName();
      RngMap::iterator iter = ranges.find(chname);
      if (iter==ranges.end())
        iter = ranges.insert(RngMap::value_type(chname, RngMapElem())).first;

      int ind = pRes->getIndex().toInt();
      iter->second.append(ind, ind+1);
    }

    RngMap::const_iterator iter = ranges.begin();
    RngMap::const_iterator end = ranges.end();
    std::vector<LString> selstrs;
    for (; iter!=end; ++iter) {
      LString rngstr = qlib::rangeToString(iter->second);
      if (!rngstr.isEmpty())
        selstrs.push_back((iter->first) + "." + rngstr + ".*");
    }

    // Selection str
    if (selstrs.empty())
      rval += "\"sel\": \"none\", ";
    else
      rval += "\"sel\": \""+ LString::join("|", selstrs.begin(), selstrs.end()) +"\", ";

    return rval;

  }

  return rval;
}

//////////////////////////////////////////////////////////////////////////

MolAtomPtr MainChainRenderer::getPivotAtom(MolResiduePtr pRes) const
{
  if (m_sPivAtomName.isEmpty()) {
    LString pvnm = pRes->getPivotAtomName();
    //MB_DPRINTLN("pivot: <%s>", pvnm.c_str());
    return pRes->getAtom(pvnm);

    //return pRes->getPivotAtom();
  }

  MolAtomPtr pA = pRes->getAtom(m_sPivAtomName);
  if (pA.isnull())
    return pRes->getPivotAtom();
  else
    return pA;
}

qlib::Vector4D MainChainRenderer::getCenter() const
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    // TO DO: throw exception
    LOG_DPRINT("Renderer> cannot determine center");
    return qlib::Vector4D();
  }

  // visit selected residues
  MainChainRenderer *pthis = const_cast<MainChainRenderer *>(this);
  ResidIterator iter(pMol, pthis->getSelection());
    
  qlib::Vector4D pos;
  int i=0;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MB_ASSERT(!pRes.isnull());
    MolAtomPtr pPiv = getPivotAtom(pRes);
    if (pPiv.isnull()) {
      continue;
    }
    pos += pPiv->getPos();
    i++;
  }

  if (i==0) {
    // TO DO: throw exception
    LOG_DPRINT("Renderer> cannot determine the center for ");
    LOG_DPRINTLN("%s:%s",
                 (pMol->getName()).c_str(),
		 getName().c_str());
    return qlib::Vector4D();
  }

  pos = pos.divide(i);
  
  return pos;
}

//////////////////////////////////////////////////////////////////////////

/*
void MainChainRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("pivotatom")) {
  }

  super_t::propChanged(ev);
}
*/

void MainChainRenderer::setPivAtomName(const LString &aname)
{
  m_sPivAtomName = aname;
  invalidateDisplayCache();
}

//////////////////////////////////////////////////////////////////////////

gfx::ColorPtr MainChainRenderer::calcColor(double rho, bool bSmoCol,
                                           MolResiduePtr pRes1, MolResiduePtr pRes2,
                                           bool bRes1Transp/*=false*/, bool bRes2Transp/*=false*/)
{
  gfx::ColorPtr pCol1, pCol2;
  
  if (!pRes1.isnull()) {
    MolAtomPtr pAtom1 = getPivotAtom(pRes1);
    if (!pAtom1.isnull())
      pCol1 = ColSchmHolder::getColor(pAtom1);
  }
  
  if (!pRes2.isnull()) {
    MolAtomPtr pAtom2 = getPivotAtom(pRes2);
    if (!pAtom2.isnull())
      pCol2 = ColSchmHolder::getColor(pAtom2);
  }
  
  if (pCol1.isnull() && pCol2.isnull())
    return gfx::SolidColor::createRGB(0.7, 0.7, 0.7); // ERROR!!

  if (bRes1Transp && !pCol1.isnull()) {
    // make pCol1 transparent
    double r = pCol1->fr();
    double g = pCol1->fg();
    double b = pCol1->fb();
    pCol1 = gfx::SolidColor::createRGB(r, g, b, 0.0);
  }
  if (bRes2Transp && !pCol2.isnull()) {
    // make pCol2 transparent
    double r = pCol2->fr();
    double g = pCol2->fg();
    double b = pCol2->fb();
    pCol2 = gfx::SolidColor::createRGB(r, g, b, 0.0);
  }

  if (!bSmoCol) {
    if (rho>0.5)
      // next
      return pCol2;
    else
      // prev
      return pCol1;
  }

  if (pCol1.isnull())
    return pCol2;
  if (pCol2.isnull())
    return pCol1;

  if (pCol1->equals(*pCol2.get()))
    return pCol1;

  ColorPtr pGradCol = ColorPtr(MB_NEW gfx::GradientColor(pCol2, pCol1, rho));
  return pGradCol;
}


bool MainChainRenderer::getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec)
{
  return false;
}

