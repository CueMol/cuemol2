// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//
//  $Id: SplineRenderer.cpp,v 1.16 2010/12/30 17:49:41 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "SplineRenderer.hpp"
#include "TubeSection.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>

//#include <qsys/ObjectEvent.hpp>
//#include <molstr/MolEvent.hpp>
//#include <molstr/ResiToppar.hpp>
//#include <molstr/ResiLink.hpp>

using namespace molvis;
using namespace molstr;

SplineRenderer::SplineRenderer()
{
  m_scs.setParent(this);
  m_scs.setSmooth(0.0);
}

SplineRenderer::~SplineRenderer()
{
}

const char *SplineRenderer::getTypeName() const
{
  return "spline";
}

/*
void SplineRenderer::targetChanged(MbObjEvent &ev)
{
  if (ev.instanceOf<MolAtomsMovedEvent>()) {
    // atoms are moved: we must remake the spline coefficients!
    m_scs.cleanup();
  }
  MainChainRenderer::targetChanged(ev);
}
*/

void SplineRenderer::setPivAtomName(const LString &aname)
{
  m_scs.cleanup();
  super_t::setPivAtomName(aname);
}

void SplineRenderer::beginRend(DisplayContext *pdl)
{
  //
  // Generate (or regenerate) the spline coeff set object, (if required)
  //
  if (!m_scs.isValid()) {
    MolCoordPtr pmol = getClientMol();
    if (!m_scs.generate(pmol)) {
      LOG_DPRINTLN("SplineRenderer> Fatal error: cannot create spline interpolator.");
    }
  }
  pdl->setLineWidth(m_dLineWidth);
}

void SplineRenderer::endRend(DisplayContext *pdl)
{
  pdl->setLineWidth(1.0);
}

//////////

void SplineRenderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  m_pStartRes = pRes;
}

void SplineRenderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
}

void SplineRenderer::endSegment(DisplayContext *pdl, MolResiduePtr pEndRes)
{
  //
  // get coeff obj for the start residue
  //
  SplineCoeff *pCoeff = m_scs.searchCoeff(m_pStartRes);

  if (pCoeff==NULL) {
    LOG_DPRINTLN("SplineRenderer> fatal error at endSegment(coeff not found for %s.%s:%s.%s)",
                 m_pStartRes->getParentChain()->getName().c_str(),
                 m_pStartRes->getIndex().toString().c_str(),
                 pEndRes->getParentChain()->getName().c_str(),
                 pEndRes->getIndex().toString().c_str());
    LOG_DPRINTLN("SplineRenderer> rendering aborted.");
    return;
  }

  //
  // calculate f-parameter for the start and end residues
  //

  double fdum1, fcent, fstart, fend;

  if (!pCoeff->getParamRange(m_pStartRes, fstart, fdum1, fcent)) {
    LOG_DPRINTLN("SplineRenderer> Fatal Error: get param for start residue failed.");
    return;
  }
  if (!qlib::isNear4(fstart, fcent)) {
    // fstart!=fcent --> start from the halfway
    // TO DO: configurable
    fstart = fcent;
  }

  if (!pCoeff->getParamRange(pEndRes, fdum1, fend, fcent)) {
    LOG_DPRINTLN("SplineRenderer> Fatal Error: get param for start residue failed.");
    return;
  }
  if (!qlib::isNear4(fend, fcent)) {
    // fend!=fcent --> end with the halfway
    // TO DO: configurable
    fend = fcent;
  }

  renderSpline(pdl, pCoeff, m_pStartRes, fstart, pEndRes, fend);
}

void SplineRenderer::renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                                MolResiduePtr pStartRes, double fstart,
                                MolResiduePtr pEndRes, double fend)
{
  //
  // calculate num of drawing points ndelta
  //
  int ndelta = (int) ::floor( (fend-fstart)*m_nAxialDetail );
  if (ndelta<=0) {
    // degenerated (single point)
    // TO DO: impl
    return;
  }

  pdl->setLighting(false);
  ColorPtr pPrevCol;

  pdl->startLineStrip();
  int i;
  for (i=0; i<=ndelta; i++) {
    double par = fstart + double(i)/double(m_nAxialDetail);

    ColorPtr pCol = calcColor(par, pCoeff);

    Vector4D f1, vpt;
    Vector4D bnorm;
    pCoeff->interpNormal(par, &bnorm);
    pCoeff->interpAxis(par, &f1, &vpt);

    Vector4D e12 = (bnorm - f1);
    Vector4D e11 = ( e12.cross(vpt) ).normalize();

    if (!isSmoothColor() && i!=0) {
      pdl->color(pPrevCol);
      pdl->vertex(f1);
    }
    pdl->color(pCol);
    pdl->vertex(f1);
    if (i%m_nAxialDetail==0) {
      pdl->vertex(f1+e11.scale(0.5));
      pdl->vertex(f1);
      pdl->vertex(f1+e12);
      pdl->vertex(f1);
    }
    pPrevCol = pCol;
  }
  pdl->end();
  
  pdl->setLighting(false);

}

//virtual
void SplineRenderer::setAxialDetail(int nlev)
{
  m_nAxialDetail = nlev;
  invalidateSplineCoeffs();
}

void SplineRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void SplineRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED) {
    invalidateSplineCoeffs();
    invalidateDisplayCache();
    return;
  }
  
  super_t::objectChanged(ev);
}

void SplineRenderer::invalidateSplineCoeffs()
{
  m_scs.cleanup();
  invalidateDisplayCache();
}

ColorPtr SplineRenderer::calcColor(double par, SplineCoeff *pCoeff)
{
  int nprev = int(::floor(par));
  int nnext = int(::ceil(par));
  double rho = par - double(nprev);

  MolResiduePtr pNext(pCoeff->getResidue(nnext));
  MolResiduePtr pPrev(pCoeff->getResidue(nprev));

  return super_t::calcColor(rho, isSmoothColor(), pPrev, pNext);
}

bool SplineRenderer::getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec)
{
  SplineCoeff *pCoeff = m_scs.searchCoeff(pRes);
  if (pCoeff==NULL)
    return false;
  
  double fcent, fstart, fend;
  if (!pCoeff->getParamRange(pRes, fstart, fend, fcent)) {
    LOG_DPRINTLN("SplineRenderer> Fatal Error: get param for start residue failed.");
    return false;
  }
  
  MB_DPRINTLN("coeff res %s start=%f, end=%f, cent=%f",
              pRes->toString().c_str(), fstart, fend, fcent);

  Vector4D f1, vpt;
  pCoeff->interpAxis(fcent, &f1, &vpt);
  
  rpos = f1;
  rvec = vpt;

  return true;
}

