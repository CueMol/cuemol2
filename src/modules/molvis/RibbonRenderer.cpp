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
    ~RibbonSmoothEval() override {}

    bool getAtomValue(MolAtom *pAtom, double &value) override {
      // not used
      return false;
    }

    bool getResidValue(MolResidue *pRes, double &value) override {
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
     : super_t(),
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
  tubeGpuBeginRend(pdl);
  if (pdl==NULL && tubeGpuBuilder().getMode()==TubeMeshBuilder::MODE_BUILD) {
    // the segments of the mesh being built (see renderSpline())
    m_splineSegs.clear();
    m_nSegTopoGen = -1;
  }

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

void RibbonRenderer::makeHSCTable(SegCtx &c, SplineCoeff *pCoeff, int istart, int iend)
{
  int i;
  int nsize = iend-istart+1;
  if (nsize<=0) return;

  std::vector<char> vtmp(nsize);
  for (i=0; i<nsize; ++i) {
    vtmp[i] = RB_COIL;

    // kept in the topology part of the spline coeffs (no residue/property
    // lookup on every traversal)
    const LString &sec = pCoeff->getSecondary2(i+istart);
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

  c.hscTab.resize(nsize);

  c.hscTab[0] = vtmp[0];
  c.hscTab[nsize-1] = vtmp[nsize-1];
  
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
      c.hscTab[i] = RB_SHEET;
      continue;
    }
      */
    
    // predefined head/tail
    c.hscTab[i] = ccurr;
  }
}

void RibbonRenderer::renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                                  MolResiduePtr pStartRes, double fstart,
                                  MolResiduePtr pEndRes, double fend)
{
  TubeMeshBuilder &mb = tubeGpuBuilder();
  // Building the GPU mesh: record the segment as one chunk, so that a
  // coordinate update can redraw the segments concurrently
  const bool bRecord = (mb.getMode()==TubeMeshBuilder::MODE_BUILD);
  if (bRecord) {
    mb.beginChunk();
    recordSplineSeg(pCoeff, pStartRes, fstart, pEndRes, fend);
  }
  renderSplineTo(&mb, pCoeff, pStartRes, fstart, pEndRes, fend);
  if (bRecord)
    mb.endChunk();
}

void RibbonRenderer::tubeGpuUpdateChunk(int i, TubeMeshBuilder *pmb)
{
  const SplineSeg &seg = m_splineSegs[i];
  renderSplineTo(pmb, seg.pCoeff, seg.pStartRes, seg.fstart, seg.pEndRes, seg.fend);
}

void RibbonRenderer::renderSplineTo(TubeMeshBuilder *pmb, SplineCoeff *pCoeff,
                                    const MolResiduePtr &pStartRes, double fstart,
                                    const MolResiduePtr &pEndRes, double fend)
{
  SegCtx c;
  c.pmb = pmb;

  c.pmb->setPolygonMode(DisplayContext::POLY_FILL);
  // pdl->setPolygonMode(DisplayContext::POLY_LINE);

  const int naxdet = getAxialDetail();
  const int istart = pCoeff->getIndex(pStartRes);
  const int iend = pCoeff->getIndex(pEndRes);
  int i;
  bool res;
  double fcstart, fcend, fccent;

  MB_DPRINTLN("Ribbon> rendering segment %d:%d", istart, iend);

  // make HSC table
  makeHSCTable(c, pCoeff, istart, iend);

  c.bStart = true;
  c.prev_escl = Vector4D(1.0, 1.0, 0.0, 0.0);
  // raw pointers: the shared sections and junction tables must not be
  // reference counted from concurrently drawn segments
  TubeSection *pCurTs = NULL, *pPrevTs = NULL;
  bool bReqPartNext = false;
  char ccurr;

  for (i=istart; i<=iend; ++i) {
    if (!pCoeff->getParamRange(i, fcstart, fcend, fccent)) {
      // To DO: error handling
      return;
    }

    ccurr = c.hscTab[i-istart];
    JctTable *pJct = NULL;
    switch (ccurr) {
    case RB_HELIX:
      pCurTs = m_ptsHelix.get();
      break;
    case RB_SHEET:
      pCurTs = m_ptsSheet.get();
      break;
    case RB_COIL:
      pCurTs = m_ptsCoil.get();
      break;
    case RB_HELIX_HEAD:
      pCurTs = m_ptsHelix.get();
      pJct = m_pHelixHead.get();
      break;
    case RB_HELIX_TAIL:
      pCurTs = m_ptsHelix.get();
      pJct = m_pHelixTail.get();
      break;
    case RB_SHEET_HEAD:
      pCurTs = m_ptsSheet.get();
      pJct = m_pSheetHead.get();
      break;
    case RB_SHEET_TAIL:
      pCurTs = m_ptsSheet.get();
      pJct = m_pSheetTail.get();
      break;
    }

    c.bMakePartition = false;

    if ( bReqPartNext ) {
      c.bMakePartition = true;
      bReqPartNext = false;
    }
      
    if (pJct!=NULL && pJct->isReqPart() &&
        (ccurr==RB_HELIX_TAIL||ccurr==RB_SHEET_TAIL))
      c.bMakePartition = true;

    if (c.bMakePartition) {
      // (the geometry-only update computes no colors)
      if (pPrevTs==NULL ||
          (c.pmb->wantColor() && c.pPrevCol.isnull())) {
        LOG_DPRINTLN("***");
      }
      else {
        // Close the previous tube section
        c.pmb->loadName(c.nPrevHitName);
        c.pmb->color(c.pPrevCol);
        pPrevTs->makeFlatCap(c.pmb, false, 
                           c.prev_f1, c.prev_vpt,
                           c.prev_e1.scale(c.prev_escl.x()),
                           c.prev_e2.scale(c.prev_escl.y()));
      }
    }

    if (ccurr==RB_HELIX||ccurr==RB_SHEET||ccurr==RB_COIL)
      renderTube(c, ccurr, pCurTs, pCoeff, fcstart, fcend, naxdet);
    else
      renderJct(c, ccurr, pCurTs, pJct, pCoeff, fcstart, fcend, naxdet);

    if (pJct!=NULL && pJct->isReqPart() &&
        (ccurr==RB_HELIX_HEAD||ccurr==RB_SHEET_HEAD))
      bReqPartNext = true;

    pPrevTs = pCurTs;
  }


  // postprocessing
  if (!isSegEndFade() || !isSegEnd(c.prev_par, pCoeff)) {
    c.pmb->loadName(c.nPrevHitName);
    c.pmb->color(c.pPrevCol);
    if (ccurr==RB_COIL)
      pCurTs->makeCap(c.pmb, false, getEndCapType(), c.prev_f1, c.prev_vpt,
                      c.prev_e1.scale(c.prev_escl.x()),
                      c.prev_e2.scale(c.prev_escl.y()));
    else
      pCurTs->makeFlatCap(c.pmb, false, c.prev_f1, c.prev_vpt,
                          c.prev_e1.scale(c.prev_escl.x()),
                          c.prev_e2.scale(c.prev_escl.y()));
  }
  
  return;
}

bool RibbonRenderer::setupHelper(SegCtx &c,
                                 TubeSection *pCurTs,
                                 int index, double par, SplineCoeff *pCoeff)
{
  TubeMeshBuilder *pmb = c.pmb;

  int nprev = int(::floor(par));
  int nnext = int(::ceil(par));
  c.bPrevBnormInv = pCoeff->getBnormDirFlag(nprev);
  c.bNextBnormInv = pCoeff->getBnormDirFlag(nnext);

  // The geometry-only update skips the color/name computation
  if (pmb->wantColor()) {
    c.pCol = calcColor(par, pCoeff);
    if (m_bHelixBackCol)
      c.pCurHBCol = evalMolColor(m_pHelixBackCol, c.pCol);
    if (m_bSheetSideCol)
      c.pCurSSCol = evalMolColor(m_pSheetSideCol, c.pCol);
  }
  if (pmb->wantName())
    c.nHitName = calcHitName(par, pCoeff);
  pmb->loadName(c.nHitName);

  c.par = par;
  pCoeff->interpNormal(par, &c.bnorm);
  pCoeff->interpAxis(par, &c.f1, &c.vpt);

  c.e12 = ( c.bnorm - c.f1 );
  c.e11 = ( c.e12.cross(c.vpt) ).normalize();

  if (c.bStart) {
    // Starting point of the segment:
    c.bStart = false;
    return false;
  }

  c.e21 = c.prev_e1;
  c.e22 = c.prev_e2;
  c.f2 = c.prev_f1;
  
  if ((c.e11.isZero() || c.e12.isZero()) &&
      (!c.e21.isZero() && !c.e22.isZero())) {
    c.e11 = c.e21;
    c.e12 = c.e22;
  }
  else if ((c.e21.isZero() || c.e22.isZero()) &&
           (!c.e11.isZero() && !c.e12.isZero())) {
    c.e21 = c.e11;
    c.e22 = c.e12;
  }
  
  if (index>0) {
    if (c.bMakePartition) {
      c.pmb->color(c.pCol);
      pCurTs->makeFlatCap(c.pmb, true, 
                          c.prev_f1, c.prev_vpt,
                          c.prev_e1.scale(c.prev_escl.x()),
                          c.prev_e2.scale(c.prev_escl.y()));
      c.bMakePartition = false;
    }

  }
  return true;
}

void RibbonRenderer::renderTube(SegCtx &c,
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
  c.prev_escl = Vector4D(1.0, 1.0, 0.0, 0.0);

  for (i=0; i<=ndelta; i++) {
    const double par = fcstart + double(i)*fdelta; ///double(naxdet);
    // MB_DPRINTLN("Ribbon> i=%d par=%f", i, par);

    if (!setupHelper(c, pCurTs, i, par, pCoeff)) {
      if (!isSegEndFade() || !isSegEnd(par, pCoeff)) {
        // Make the tube's start cap.
        c.pmb->color(c.pCol);
        if (ss_type==RB_COIL)
          pCurTs->makeCap(c.pmb, true, getStartCapType(), c.f1, c.vpt, c.e11, c.e12);
        else {
          pCurTs->makeFlatCap(c.pmb, true, c.f1, c.vpt, c.e11, c.e12);
        }
      }
      // update prev values
      c.updatePrevValues();
      continue;
    }

    if (i==0) {
      // update prev values
      c.updatePrevValues();
      continue;
    }

    c.pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
    //pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
    // Hit names (pick pass): one name for the whole segment strip, so the
    // residue boundary lies on a ring (see TubeSection::doTess).
    c.pmb->loadName(c.nHitName);
    c.pmb->startTriangleStrip();
    
    for (j=0; j<=pCurTs->getSize(); j++) {
      char nt = pCurTs->getSfType(j);
      bool bb = false;
      if (isHelixBackCol(c, ss_type, nt))
        c.pmb->color(c.pCurHBCol);
      else if (isSheetSideCol(ss_type, nt))
        c.pmb->color(c.pCurSSCol);
      else {
        bb = true;
        c.pmb->color(c.pCol);
      }

      g1 = pCurTs->getVec(j, c.e11, c.e12);
      g2 = pCurTs->getVec(j, c.e21, c.e22);
      dg1 = pCurTs->getNormVec(j, c.e11, c.e12);
      dg2 = pCurTs->getNormVec(j, c.e21, c.e22);
      c.pmb->normal(dg1);
      c.pmb->vertex(c.f1+g1);
      
      if (bb && isSmoothColor())
        c.pmb->color(c.pPrevCol);

      c.pmb->normal(dg2);
      c.pmb->vertex(c.f2+g2);
    }
    c.pmb->end();
    c.pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    // pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);

    // postprocessing
    c.updatePrevValues();
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

void RibbonRenderer::renderJct(SegCtx &c,
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
  pJct->get(0, dpar, c.prev_escl);
  double prev_dpar = -1.0;

  for (i=0; i<ndelta; i++) {
    // Get E-scale value
    pJct->get(i, dpar, escl);
    const double par = fcstart + dpar;

    if (!setupHelper(c, pCurTs, i, par, pCoeff)) {
      // make the tube's start cap
      // (junction is not a coil so always render the flat cap)
      c.pmb->color(c.pCol);
      pCurTs->makeFlatCap(c.pmb, true, c.f1, c.vpt, c.e11, c.e12);
      // update prev values
      c.updatePrevValues();
      c.prev_escl = escl;
      prev_dpar = dpar;
      continue;
    }

    if (i==0) {
      // update prev values
      c.updatePrevValues();
      c.prev_escl = escl;
      prev_dpar = dpar;
      continue;
    }
    
    if ( qlib::isNear4(dpar,prev_dpar) ) {
      // dpar value is degenerated (i.e. is the same as the previous one)
      // --> discontinuous part of the junction, such as the arrow head
      // --> Render the partitions at the arrowhead junction
      c.pmb->color(c.pCol);
      pCurTs->makeDisconJct(c.pmb, c.f1, c.vpt.normalize(), c.e11, c.e12, c.prev_escl, escl);
      c.updatePrevValues();
      c.prev_escl = escl;
      prev_dpar = dpar;
      continue;
    }

    //pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
    c.pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
    //pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    // Hit names (pick pass): one name for the whole segment strip, so the
    // residue boundary lies on a ring (see TubeSection::doTess).
    c.pmb->loadName(c.nHitName);
    c.pmb->startTriangleStrip();
    
    const Vector4D xe11 = c.e11.scale(escl.x());
    const Vector4D xe12 = c.e12.scale(escl.y());
    const Vector4D xe21 = c.e21.scale(c.prev_escl.x());
    const Vector4D xe22 = c.e22.scale(c.prev_escl.y());

    const Vector4D te11 = c.e11.scale(escl.y());
    const Vector4D te12 = c.e12.scale(escl.x());
    const Vector4D te21 = c.e21.scale(c.prev_escl.y());
    const Vector4D te22 = c.e22.scale(c.prev_escl.x());

    for (j=0; j<=pCurTs->getSize(); j++) {
      char nt = pCurTs->getSfType(j);
      bool bb = false;
      if (isHelixBackCol(c, ss_type, nt))
        c.pmb->color(c.pCurHBCol);
      else if (isSheetSideCol(ss_type, nt))
        c.pmb->color(c.pCurSSCol);
      else {
        bb = true;
        c.pmb->color(c.pCol);
      }

      g1 = pCurTs->getVec(j, xe11, xe12);
      g2 = pCurTs->getVec(j, xe21, xe22);
      dg1 = pCurTs->getNormVec(j, te11, te12) +
        calcDnorm(pCurTs->getSectTab(j), escl, c.vpt);
      dg2 = pCurTs->getNormVec(j, te21, te22) +
        calcDnorm(pCurTs->getSectTab(j), c.prev_escl, c.prev_vpt);

      c.pmb->normal(dg1);
      c.pmb->vertex(c.f1+g1);
      
      if (bb && isSmoothColor())
        c.pmb->color(c.pPrevCol);

      c.pmb->normal(dg2);
      c.pmb->vertex(c.f2+g2);
    }
    c.pmb->end();
    c.pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    //pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);

    // postprocessing
    c.updatePrevValues();
    c.prev_escl = escl;
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

