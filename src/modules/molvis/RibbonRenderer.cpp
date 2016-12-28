// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//
//  $Id: RibbonRenderer.cpp,v 1.8 2011/01/02 13:11:02 rishitani Exp $

#include <common.h>

#include "RibbonRenderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>

using namespace molvis;
using namespace molstr;
using gfx::ColorPtr;

/////////////////////////////////////////////////////

namespace molvis {
  // Specialized evaluator for ribbon smoothness values
  class RibbonSmoothEval : public RealNumEvaluator
  {
  public:
    double m_helix;
    double m_sheet;
    double m_coil;

    RibbonSmoothEval() : m_helix(0.0), m_sheet(0.5), m_coil(0.0) {}
    virtual ~RibbonSmoothEval() {}

    virtual bool getAtomValue(MolAtom *pAtom, double &value) {
      // not used
      return false;
    }

    virtual bool getResidValue(MolResidue *pRes, double &value) {
      if (pRes==NULL) return false;
      LString sec("coil");
      pRes->getPropStr("secondary", sec);
      if (sec.equals("helix"))
        value = m_helix;
      else if (sec.equals("sheet"))
        value = m_sheet;
      else
        value = m_coil;

      return true;
    }

  };
}

/////////////////////////////////////////////////////

RibbonRenderer::RibbonRenderer()
     : SplineRenderer(),
       m_ptsHelix(MB_NEW TubeSection()),
       m_ptsSheet(MB_NEW TubeSection()),
       m_ptsCoil(MB_NEW TubeSection()),
       m_pHelixTail(MB_NEW JctTable()),
       m_pHelixHead(MB_NEW JctTable()),
       m_pSheetTail(MB_NEW JctTable()),
       m_pSheetHead(MB_NEW JctTable())
{
  m_pSmoothEval = MB_NEW RibbonSmoothEval();
  super_t::setSmoothEval(m_pSmoothEval);

  super_t::setupParentData("helix");
  super_t::setupParentData("sheet");
  super_t::setupParentData("coil");
  super_t::setupParentData("helixhead");
  super_t::setupParentData("helixtail");
  super_t::setupParentData("sheethead");
  super_t::setupParentData("sheettail");

  m_bHelixBackCol = false;
  m_bSheetSideCol = false;
  m_pHelixBackCol = gfx::SolidColor::createRGB(1.0, 1.0, 1.0);
  m_pSheetSideCol = gfx::SolidColor::createRGB(1.0, 1.0, 1.0);

  m_bPrevBnormInv = false;
  m_bNextBnormInv = false;
}

RibbonRenderer::~RibbonRenderer()
{
  delete m_pSmoothEval;
}

const char *RibbonRenderer::getTypeName() const
{
  return "ribbon";
}

/////////////////////////////////////////////////////

void RibbonRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void RibbonRenderer::beginRend(DisplayContext *pdl)
{
  if (!m_ptsHelix->isValid()) {
    m_ptsHelix->setupSectionTable();
    m_pHelixTail->invalidate();
    m_pHelixHead->invalidate();
  }

  if (!m_ptsSheet->isValid()) {
    m_ptsSheet->setupSectionTable();
    m_pSheetTail->invalidate();
    m_pSheetHead->invalidate();
  }
  
  if (!m_ptsCoil->isValid()) {
    m_ptsCoil->setupSectionTable();
    m_pHelixTail->invalidate();
    m_pHelixHead->invalidate();
    m_pSheetTail->invalidate();
    m_pSheetHead->invalidate();
  }
  
  if (!m_pHelixTail->isValid())
    m_pHelixTail->setup(getAxialDetail()+1, m_ptsCoil.get(), m_ptsHelix.get());
  if (!m_pHelixHead->isValid())
    m_pHelixHead->setup(getAxialDetail()+1, m_ptsHelix.get(), m_ptsCoil.get(), true);
  if (!m_pSheetTail->isValid())
    m_pSheetTail->setup(getAxialDetail()+1, m_ptsCoil.get(), m_ptsSheet.get());
  if (!m_pSheetHead->isValid())
    m_pSheetHead->setup(getAxialDetail()+1, m_ptsSheet.get(), m_ptsCoil.get(), true);

  super_t::beginRend(pdl);
}

/////////////////////////////////////////////////////

namespace {
  MolResiduePtr safeGetResid(SplineCoeff *pCoeff, int nid) {

    MolAtomPtr pAtom = pCoeff->getAtom(nid);
    if (pAtom.isnull()) {
      return MolResiduePtr();
    }
    return pAtom->getParentResidue();
  }
}

void RibbonRenderer::makeHSCTable(SplineCoeff *pCoeff, int istart, int iend)
{
  int i;
  int nsize = iend-istart+1;
  if (nsize<=0) return;

  std::vector<char> vtmp(nsize);
  for (i=0; i<nsize; ++i) {
    vtmp[i] = RB_COIL;

    MolResiduePtr pRes = safeGetResid(pCoeff, i+istart);
    if (pRes.isnull())
      continue;
    LString sec;
    //pRes->getPropStr("secondary", sec);
    pRes->getPropStr("secondary2", sec);
    LString pfx;
    if (sec.length()>=2)
      pfx= sec.substr(1,1);
    if (sec.startsWith("H")||sec.startsWith("G")||sec.startsWith("I")) {
      if (pfx.equals("s"))
        vtmp[i] = RB_HELIX_TAIL;
      else if (pfx.equals("e"))
        vtmp[i] = RB_HELIX_HEAD;
      else
        vtmp[i] = RB_HELIX;
    }
    else if (sec.startsWith("E")) {
      if (pfx.equals("s"))
        vtmp[i] = RB_SHEET_TAIL;
      else if (pfx.equals("e"))
        vtmp[i] = RB_SHEET_HEAD;
      else
        vtmp[i] = RB_SHEET;
    }
  }

  m_hscTab.resize(nsize);

  m_hscTab[0] = vtmp[0];
  m_hscTab[nsize-1] = vtmp[nsize-1];
  
  for (i=1; i<nsize-1; ++i) {
    char cprev = vtmp[i-1];
    char ccurr = vtmp[i];
    char cnext = vtmp[i+1];

    /*
    // head-tail junction
    if ( (ccurr==RB_SHEET_HEAD &&
          cnext==RB_SHEET_TAIL) ||
         (cprev==RB_SHEET_HEAD &&
          ccurr==RB_SHEET_TAIL) ) {
      m_hscTab[i] = RB_SHEET;
      continue;
    }
      */
    
    // predefined head/tail
    m_hscTab[i] = ccurr;
  }
}

void RibbonRenderer::renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                                  MolResiduePtr pStartRes, double fstart,
                                  MolResiduePtr pEndRes, double fend)
{
  pdl->setPolygonMode(DisplayContext::POLY_FILL);
  // pdl->setPolygonMode(DisplayContext::POLY_LINE);

  const int naxdet = getAxialDetail();
  const int istart = pCoeff->getIndex(pStartRes);
  const int iend = pCoeff->getIndex(pEndRes);
  int i;
  bool res;
  double fcstart, fcend, fccent;

  MB_DPRINTLN("Ribbon> rendering segment %d:%d", istart, iend);

  // make HSC table
  makeHSCTable(pCoeff, istart, iend);

  m_bStart = true;
  m_prev_escl = Vector4D(1.0, 1.0, 0.0, 0.0);
  TubeSectionPtr pCurTs, pPrevTs;
  bool bReqPartNext = false;
  char ccurr;

  for (i=istart; i<=iend; ++i) {
    if (!pCoeff->getParamRange(i, fcstart, fcend, fccent)) {
      // To DO: error handling
      return;
    }

    ccurr = m_hscTab[i-istart];
    JctTablePtr pJct;
    switch (ccurr) {
    case RB_HELIX:
      pCurTs = m_ptsHelix;
      break;
    case RB_SHEET:
      pCurTs = m_ptsSheet;
      break;
    case RB_COIL:
      pCurTs = m_ptsCoil;
      break;
    case RB_HELIX_HEAD:
      pCurTs = m_ptsHelix;
      pJct = m_pHelixHead;
      break;
    case RB_HELIX_TAIL:
      pCurTs = m_ptsHelix;
      pJct = m_pHelixTail;
      break;
    case RB_SHEET_HEAD:
      pCurTs = m_ptsSheet;
      pJct = m_pSheetHead;
      break;
    case RB_SHEET_TAIL:
      pCurTs = m_ptsSheet;
      pJct = m_pSheetTail;
      break;
    }

    m_bMakePartition = false;

    if ( bReqPartNext ) {
      m_bMakePartition = true;
      bReqPartNext = false;
    }
      
    if (!pJct.isnull() && pJct->isReqPart() &&
        (ccurr==RB_HELIX_TAIL||ccurr==RB_SHEET_TAIL))
      m_bMakePartition = true;

    if (m_bMakePartition) {
      if (m_pPrevCol.isnull() || pPrevTs.isnull()) {
        LOG_DPRINTLN("***");
      }
      else {
        // Close the previous tube section
        pdl->color(m_pPrevCol);
        pPrevTs->makeFlatCap(pdl, false, 
                           m_prev_f1, m_prev_vpt,
                           m_prev_e1.scale(m_prev_escl.x()),
                           m_prev_e2.scale(m_prev_escl.y()));
      }
    }

    if (ccurr==RB_HELIX||ccurr==RB_SHEET||ccurr==RB_COIL)
      renderTube(pdl, ccurr, pCurTs.get(), pCoeff, fcstart, fcend, naxdet);
    else
      renderJct(pdl, ccurr, pCurTs.get(), pJct.get(), pCoeff, fcstart, fcend, naxdet);

    if (!pJct.isnull() && pJct->isReqPart() &&
        (ccurr==RB_HELIX_HEAD||ccurr==RB_SHEET_HEAD))
      bReqPartNext = true;

    pPrevTs = pCurTs;
  }


  // postprocessing
  if (!isSegEndFade() || !isSegEnd(m_prev_par, pCoeff)) {
    pdl->color(m_pPrevCol);
    if (ccurr==RB_COIL)
      pCurTs->makeCap(pdl, false, getEndCapType(), m_prev_f1, m_prev_vpt,
                      m_prev_e1.scale(m_prev_escl.x()),
                      m_prev_e2.scale(m_prev_escl.y()));
    else
      pCurTs->makeFlatCap(pdl, false, m_prev_f1, m_prev_vpt,
                          m_prev_e1.scale(m_prev_escl.x()),
                          m_prev_e2.scale(m_prev_escl.y()));
  }
  
  m_pPrevCol = ColorPtr();
  m_pCol = ColorPtr();

  return;
}

bool RibbonRenderer::setupHelper(DisplayContext *pdl,
                                 TubeSection *pCurTs,
                                 int index, double par, SplineCoeff *pCoeff)
{
  int nprev = int(::floor(par));
  int nnext = int(::ceil(par));
  m_bPrevBnormInv = pCoeff->getBnormDirFlag(nprev);
  m_bNextBnormInv = pCoeff->getBnormDirFlag(nnext);

  m_pCol = calcColor(par, pCoeff);

  if (m_bHelixBackCol)
    m_pCurHBCol = evalMolColor(m_pHelixBackCol, m_pCol);
  if (m_bSheetSideCol)
    m_pCurSSCol = evalMolColor(m_pSheetSideCol, m_pCol);

  m_par = par;
  pCoeff->interpNormal(par, &m_bnorm);
  pCoeff->interpAxis(par, &m_f1, &m_vpt);

  m_e12 = ( m_bnorm - m_f1 );
  m_e11 = ( m_e12.cross(m_vpt) ).normalize();

  if (m_bStart) {
    // Starting point of the segment:
    m_bStart = false;
    return false;
  }

  m_e21 = m_prev_e1;
  m_e22 = m_prev_e2;
  m_f2 = m_prev_f1;
  
  if ((m_e11.isZero() || m_e12.isZero()) &&
      (!m_e21.isZero() && !m_e22.isZero())) {
    m_e11 = m_e21;
    m_e12 = m_e22;
  }
  else if ((m_e21.isZero() || m_e22.isZero()) &&
           (!m_e11.isZero() && !m_e12.isZero())) {
    m_e21 = m_e11;
    m_e22 = m_e12;
  }
  
  if (index>0) {
    if (m_bMakePartition) {
      pdl->color(m_pCol);
      pCurTs->makeFlatCap(pdl, true, 
                          m_prev_f1, m_prev_vpt,
                          m_prev_e1.scale(m_prev_escl.x()),
                          m_prev_e2.scale(m_prev_escl.y()));
      m_bMakePartition = false;
    }

  }
  return true;
}

void RibbonRenderer::renderTube(DisplayContext *pdl,
                                char ss_type,
                                TubeSection *pCurTs,
                                SplineCoeff *pCoeff,
                                double fcstart, double fcend, int naxdet)
{
  // Render tube body
  int i, j;
  Vector4D g1, g2, dg1, dg2;

  const int ndelta = int( ::floor( (fcend-fcstart)*naxdet ) );
  if (ndelta<=0) {
    LOG_DPRINTLN("RibRend> Fatal error at endSegment(invalid coeff)");
    LOG_DPRINTLN("RibRend> start=%f, end=%f; rendering aborted.", fcstart, fcend);
    return;
  }

  const double fdelta = (fcend-fcstart)/double(ndelta);
  // MB_DPRINTLN("Ribbon> fcend=%f fcstart=%f fdelta=%f", fcend, fcstart, fdelta);

  // reset previous E scale
  m_prev_escl = Vector4D(1.0, 1.0, 0.0, 0.0);

  for (i=0; i<=ndelta; i++) {
    const double par = fcstart + double(i)*fdelta; ///double(naxdet);
    // MB_DPRINTLN("Ribbon> i=%d par=%f", i, par);

    if (!setupHelper(pdl, pCurTs, i, par, pCoeff)) {
      if (!isSegEndFade() || !isSegEnd(par, pCoeff)) {
        // Make the tube's start cap.
        pdl->color(m_pCol);
        if (ss_type==RB_COIL)
          pCurTs->makeCap(pdl, true, getStartCapType(), m_f1, m_vpt, m_e11, m_e12);
        else {
          pCurTs->makeFlatCap(pdl, true, m_f1, m_vpt, m_e11, m_e12);
        }
      }
      // update prev values
      updatePrevValues();
      continue;
    }

    if (i==0) {
      // update prev values
      updatePrevValues();
      continue;
    }

    pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
    //pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
    pdl->startTriangleStrip();
    
    for (j=0; j<=pCurTs->getSize(); j++) {
      char nt = pCurTs->getSfType(j);
      bool bb = false;
      if (isHelixBackCol(ss_type, nt))
        pdl->color(m_pCurHBCol);
      else if (isSheetSideCol(ss_type, nt))
        pdl->color(m_pCurSSCol);
      else {
        bb = true;
        pdl->color(m_pCol);
      }

      g1 = pCurTs->getVec(j, m_e11, m_e12);
      g2 = pCurTs->getVec(j, m_e21, m_e22);
      dg1 = pCurTs->getNormVec(j, m_e11, m_e12);
      dg2 = pCurTs->getNormVec(j, m_e21, m_e22);
      pdl->normal(dg1);
      pdl->vertex(m_f1+g1);
      
      if (bb && isSmoothColor())
        pdl->color(m_pPrevCol);

      pdl->normal(dg2);
      pdl->vertex(m_f2+g2);
    }
    
    pdl->end();
    pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    // pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);

    // postprocessing
    updatePrevValues();
  }
  
}

namespace {
Vector4D calcDnorm(const Vector4D &sect, const Vector4D &escl, const Vector4D &vpt)
{
  double dn =
    sect.z()*escl.y() * sect.x()*escl.z() -
      sect.w()*escl.x() * sect.y()*escl.w();
  
  dn /= vpt.sqlen();
  
  return vpt.scale(dn);
}
}

void RibbonRenderer::renderJct(DisplayContext *pdl,
                               char ss_type,
                               TubeSection *pCurTs,
                               JctTable *pJct,
                               SplineCoeff *pCoeff,
                               double fcstart, double fcend, int naxdet)
{
  // Render tube body
  int i, j;
  Vector4D g1, g2, dg1, dg2, escl;

  double dpar;

  const int ndelta = pJct->getSize();

  // initialize previous E scale
  pJct->get(0, dpar, m_prev_escl);
  double prev_dpar = -1.0;

  for (i=0; i<ndelta; i++) {
    // Get E-scale value
    pJct->get(i, dpar, escl);
    const double par = fcstart + dpar;

    if (!setupHelper(pdl, pCurTs, i, par, pCoeff)) {
      // make the tube's start cap
      // (junction is not a coil so always render the flat cap)
      pdl->color(m_pCol);
      pCurTs->makeFlatCap(pdl, true, m_f1, m_vpt, m_e11, m_e12);
      // update prev values
      updatePrevValues();
      m_prev_escl = escl;
      prev_dpar = dpar;
      continue;
    }

    if (i==0) {
      // update prev values
      updatePrevValues();
      m_prev_escl = escl;
      prev_dpar = dpar;
      continue;
    }
    
    if ( qlib::isNear4(dpar,prev_dpar) ) {
      // dpar value is degenerated (i.e. is the same as the previous one)
      // --> discontinuous part of the junction, such as the arrow head
      // --> Render the partitions at the arrowhead junction
      pdl->color(m_pCol);
      pCurTs->makeDisconJct(pdl, m_f1, m_vpt.normalize(), m_e11, m_e12, m_prev_escl, escl);
      updatePrevValues();
      m_prev_escl = escl;
      prev_dpar = dpar;
      continue;
    }

    //pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
    pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
    //pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    pdl->startTriangleStrip();
    
    const Vector4D xe11 = m_e11.scale(escl.x());
    const Vector4D xe12 = m_e12.scale(escl.y());
    const Vector4D xe21 = m_e21.scale(m_prev_escl.x());
    const Vector4D xe22 = m_e22.scale(m_prev_escl.y());

    const Vector4D te11 = m_e11.scale(escl.y());
    const Vector4D te12 = m_e12.scale(escl.x());
    const Vector4D te21 = m_e21.scale(m_prev_escl.y());
    const Vector4D te22 = m_e22.scale(m_prev_escl.x());

    for (j=0; j<=pCurTs->getSize(); j++) {
      char nt = pCurTs->getSfType(j);
      bool bb = false;
      if (isHelixBackCol(ss_type, nt))
        pdl->color(m_pCurHBCol);
      else if (isSheetSideCol(ss_type, nt))
        pdl->color(m_pCurSSCol);
      else {
        bb = true;
        pdl->color(m_pCol);
      }

      g1 = pCurTs->getVec(j, xe11, xe12);
      g2 = pCurTs->getVec(j, xe21, xe22);
      dg1 = pCurTs->getNormVec(j, te11, te12) +
        calcDnorm(pCurTs->getSectTab(j), escl, m_vpt);
      dg2 = pCurTs->getNormVec(j, te21, te22) +
        calcDnorm(pCurTs->getSectTab(j), m_prev_escl, m_prev_vpt);

      pdl->normal(dg1);
      pdl->vertex(m_f1+g1);
      
      if (bb && isSmoothColor())
        pdl->color(m_pPrevCol);

      pdl->normal(dg2);
      pdl->vertex(m_f2+g2);
    }
    
    pdl->end();
    pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    //pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);

    // postprocessing
    updatePrevValues();
    m_prev_escl = escl;
    prev_dpar = dpar;
  }

}



void RibbonRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("helix")||
      ev.getParentName().equals("sheet")||
      ev.getParentName().equals("coil")||
      ev.getParentName().equals("helixhead")||
      ev.getParentName().equals("helixtail")||
      ev.getParentName().equals("sheethead")||
      ev.getParentName().equals("sheettail")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().equals("axialdetail")) {
    // JctTables should be also rebuilt
    m_pHelixTail->invalidate();
    m_pHelixHead->invalidate();
    m_pSheetTail->invalidate();
    m_pSheetHead->invalidate();
  }

  super_t::propChanged(ev);
}

void RibbonRenderer::setHelixSmooth(double d)
{
  m_pSmoothEval->m_helix = d;
  super_t::invalidateSplineCoeffs();
}

double RibbonRenderer::getHelixSmooth() const
{
  return m_pSmoothEval->m_helix;
}

void RibbonRenderer::setSheetSmooth(double d)
{
  m_pSmoothEval->m_sheet = d;
  super_t::invalidateSplineCoeffs();
}

double RibbonRenderer::getSheetSmooth() const
{
  return m_pSmoothEval->m_sheet;
}

void RibbonRenderer::setCoilSmooth(double d)
{
  m_pSmoothEval->m_coil = d;
  super_t::invalidateSplineCoeffs();
}

double RibbonRenderer::getCoilSmooth() const
{
  return m_pSmoothEval->m_coil;
}

/*
ColorPtr RibbonRenderer::calcColor(double par, SplineCoeff *pCoeff)
{
  if (!isSegEndFade())
    return super_t::calcColor(par, pCoeff);
  
}*/

