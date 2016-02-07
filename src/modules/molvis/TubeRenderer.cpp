// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//
//  $Id: TubeRenderer.cpp,v 1.10 2010/11/03 11:34:20 rishitani Exp $

#include <common.h>

#include "TubeRenderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>

//#include <molstr/ResiToppar.hpp>
//#include <molstr/ResiLink.hpp>
#include <qlib/Vector2D.hpp>
using qlib::Vector2D;

using namespace molvis;
using namespace molstr;

TubeRenderer::TubeRenderer()
     : SplineRenderer(), m_pts(MB_NEW TubeSection())
{
  super_t::setupParentData("section");

  m_dParLo = 0.0;
  m_dParAver= 10.0;
  m_dParHi= 20.0;

  m_dPuttyScl = 3.0;
  m_nPuttyMode = TBR_PUTTY_OFF;
  m_nPuttyTgt = TBR_PUTTY_BFAC;

  //resetAllProps();
}

TubeRenderer::~TubeRenderer()
{
}

const char *TubeRenderer::getTypeName() const
{
  return "tube";
}

/////////////////////////////////////////////////////

void TubeRenderer::beginRend(DisplayContext *pdl)
{
  if (!m_pts->isValid())
    m_pts->setupSectionTable();

  super_t::beginRend(pdl);

  if (m_nPuttyMode==TBR_PUTTY_OFF) {
    return;
  }

  // calc max bfac/occ in the putty mode

  SelectionPtr pSel;
  MolCoordPtr pMol = getClientMol();
  //MolRenderer *pMolRend = dynamic_cast<MolRenderer *>(pRend);
  //if (pMolRend!=NULL && m_nAuto==BFA_REND)
  pSel = getSelection();

  double dmin = 1.0e100, dmax = -1.0e100, val, dsum = 0.0;
  int nadd=0;
  ResidIterator iter(pMol, pSel);
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MolAtomPtr pAtom = getPivotAtom(pRes);

    if (pAtom.isnull()) continue;
    
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      val = pAtom->getOcc();
    else
      val = pAtom->getBfac();
    
    dsum += val;
    dmin = qlib::min(dmin, val);
    dmax = qlib::max(dmax, val);
    ++nadd;
  }
  
  m_dParHi = dmax;
  m_dParLo = dmin;
  m_dParAver = dsum/double(nadd);

  MB_DPRINTLN("Tube> init high=%f, low=%f, aver=%f OK.", dmax, dmin, m_dParAver);
}

/////////////////////////////////////////////////////

//virtual
void TubeRenderer::renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                                MolResiduePtr pStartRes, double fstart,
                                MolResiduePtr pEndRes, double fend)
{
  // Calculate num of drawing points "ndelta"
  const int naxdet = getAxialDetail();
  int ndelta = (int) ::floor( (fend-fstart)* naxdet );
  if (ndelta<=0) {
    // degenerated (single point)
    // TO DO: impl
    return;
  }
  const double fdelta = (fend-fstart)/double(ndelta);

  pdl->setLighting(true);
  pdl->setPolygonMode(DisplayContext::POLY_FILL_NOEGLN);
  //pdl->setPolygonMode(DisplayContext::POLY_LINE);

  // ???
  // pdl->color(pCol);

  // Declare Vector variables used in the loop
  Vector4D bnorm, vpt, e11, e12, e21, e22, f1, f2;
  Vector4D prev_bnorm, prev_e1, prev_e2, prev_f;
  Vector4D g1, g2, dg1, dg2;

  // Color objects used in the loop
  ColorPtr pCol, pPrevCol;

  // Main loop for each drawing point
  //  i: drawing point index from 0 to ndelta
  //  par: spline coeffcient parameter (from fstart to fend)

  int i, j;
  for (i=0; i<=ndelta; i++) {
    double par = fstart + double(i)*fdelta; ///double( naxdet );

    pCol = calcColor(par, pCoeff);

    Vector2D escl = getEScl(par, pCoeff); //Vector2D(1.0, 1.0);

    pCoeff->interpNormal(par, &bnorm);
    pCoeff->interpAxis(par, &f1, &vpt);

    e12 = (bnorm - f1);
    e11 = ( e12.cross(vpt) ).normalize();

    // e11/e12 scaling
    e11 = e11.scale(escl.x());
    e12 = e12.scale(escl.y());

    e21 = prev_e1, e22 = prev_e2, f2 = prev_f;

    if (i==0) {
      // Starting point of the segment:
      prev_e1 = e11;
      prev_e2 = e12;
      prev_f = f1;
      pPrevCol = pCol;

      if (!isSegEndFade() || !isSegEnd(par, pCoeff)) {
        // make the tube cap.
        pdl->color(pCol);
        m_pts->makeCap(pdl, true, getStartCapType(), f1, vpt, e11, e12);
      }
      continue;
    }

    if ((e11.isZero() || e12.isZero()) &&
        (!e21.isZero() && !e22.isZero())) {
      e11 = e21;
      e12 = e22;
    }
    else if ((e21.isZero() || e22.isZero()) &&
             (!e11.isZero() && !e12.isZero())) {
      e21 = e11;
      e22 = e12;
    }

    //
    // Render tube body
    //

    //std::deque<Vector4D> tmpv;
    pdl->startTriangleStrip();

    for (j=0; j<=m_pts->getSize(); j++) {
      g1 = m_pts->getVec(j, e11, e12);
      g2 = m_pts->getVec(j, e21, e22);
      dg1 = m_pts->getNormVec(j, e11, e12);
      dg2 = m_pts->getNormVec(j, e21, e22);
      pdl->normal(dg1);
      pdl->color(pCol);
      pdl->vertex(f1+g1);

      pdl->normal(dg2);
      if (isSmoothColor())
        pdl->color(pPrevCol);
      pdl->vertex(f2+g2);

      //tmpv.push_back(f1+g1);
      //tmpv.push_back(f1+g1+dg1.scale(0.2));
    }

    pdl->end();

    //pdl->startLines();
    //BOOST_FOREACH (const Vector4D &elem, tmpv) {
    //pdl->vertex(elem);
    //}
    //pdl->end();

    // Post processing
    if (i==ndelta) {
      if (!isSegEndFade() || !isSegEnd(par, pCoeff)) {
        // make cap at the end point.
        pdl->color(pCol);
        m_pts->makeCap(pdl, false, getEndCapType(), f1, vpt, e11, e12);
      }
    }

    prev_e1 = e11;
    prev_e2 = e12;
    prev_f = f1;
    pPrevCol = pCol;
  }
  
  pdl->setLighting(false);

}

qlib::Vector2D TubeRenderer::getEScl(double par, SplineCoeff *pCoeff)
{
  if (m_nPuttyMode==TBR_PUTTY_OFF)
    return Vector2D(1,1);

  const double prod = 1.0;
  const double plus = 0.0;
  
  int nprev = int(::floor(par));
  int nnext = int(::ceil(par));
  double rho = par - double(nprev);
  
  MolResiduePtr pNext(pCoeff->getResidue(nnext));
  MolResiduePtr pPrev(pCoeff->getResidue(nprev));
  MolAtomPtr pAtom1, pAtom2;
  double par1 = 1.0, par2 = 1.0;

  if (!pPrev.isnull()) {
    pAtom1 = getPivotAtom(pPrev);
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      par1 = pAtom1->getOcc();
    else
      par1 = pAtom1->getBfac();

  }
  if (!pNext.isnull()) {
    pAtom2 = getPivotAtom(pNext);
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      par2 = pAtom2->getOcc();
    else
      par2 = pAtom2->getBfac();
  }
      
  // linear interpolation between two residues (if exists)
  double val;
  if (rho<F_EPS4)
    val = par1;
  else if (1.0-F_EPS4<rho)
    val = par2;
  else
    val = par1 * (1.0-rho) + par2 * rho;

  // convert val to scaling factor
  if (m_nPuttyMode==TBR_PUTTY_LINEAR1) {
    // linear conversion
    val = (val-m_dParLo)/(m_dParHi-m_dParLo);
    val = (m_dPuttyScl-1.0/m_dPuttyLoScl)*val + 1.0/m_dPuttyLoScl;
  }
  else if (m_nPuttyMode==TBR_PUTTY_SCALE1) {
    // multiplication conversion 1
    // scale val to (1/Nlo -- 1.0 -- Nhi) for (min -- aver -- max)
    if (val<m_dParAver) {
      val = (val-m_dParLo)/(m_dParAver-m_dParLo);
      // val = ::pow(m_dPuttyLoScl, val-1.0);
      val = ((m_dPuttyLoScl-1)*val+1.0)/m_dPuttyLoScl;
    }
    else {
      val = (val-m_dParAver)/(m_dParHi-m_dParAver);
      // val = ::pow(m_dPuttyScl, val);
      val = (m_dPuttyScl-1.0)*val + 1.0;
    }
  }
  else {
    // ERROR
    MB_ASSERT(false);
  }

  return Vector2D(val, val);
}


void TubeRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("section")||
      ev.getParentName().startsWith("section.")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

