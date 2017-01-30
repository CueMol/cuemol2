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

void TubeRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

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

  // pdl->setLighting(true);
  pdl->setPolygonMode(DisplayContext::POLY_FILL_NORGLN);
  //pdl->setPolygonMode(DisplayContext::POLY_LINE);

  // ???
  // pdl->color(pCol);

  // Declare Vector variables used in the loop
  Vector4D bnorm, vpt, vnorm;
  Vector4D e11, e12, e21, e22, f1, f2;
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
    pCoeff->interpAxis(par, &f1, &vpt, &vnorm);

    double vlen = vpt.length();
    Vector4D e10 = vpt.divide(vlen);
    Vector4D bnf = bnorm - f1;
    Vector4D v12 = bnf-e10.scale(e10.dot(bnf));
    e12 = v12.normalize();
    e11 = e12.cross(e10);

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

#ifdef SHOW_NORM
    std::deque<Vector4D> tmpv;
#endif

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

#ifdef SHOW_NORM
      tmpv.push_back(f1+g1);
      tmpv.push_back(f1+g1+dg1.scale(0.2));
#endif
    }

    pdl->end();

#ifdef SHOW_NORM
    pdl->startLines();
    BOOST_FOREACH (const Vector4D &elem, tmpv) {
      pdl->vertex(elem);
    }
    pdl->end();
#endif

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
  
  // pdl->setLighting(false);
  // test1(pdl, pCoeff, pStartRes, fstart, pEndRes, fend);
}

void TubeRenderer::test1(DisplayContext *pdl, SplineCoeff *pCoeff,
                         MolResiduePtr pStartRes, double fstart,
                         MolResiduePtr pEndRes, double fend)
{
  int nstart = int( ::floor(fstart) );
  int nend = int( ::floor(fend) );
  CubicSpline &cs = pCoeff->getAxisInt();
  int npoints = cs.getSize();

  for (int i=nstart; i<=nend; ++i) {
    int ncoeff = qlib::clamp(i, 0, npoints-2);
    
    const Vector3F coeff0 = cs.getCoeff(0, ncoeff);
    const Vector3F coeff1 = cs.getCoeff(1, ncoeff);
    const Vector3F coeff2 = cs.getCoeff(2, ncoeff);
    const Vector3F coeff3 = cs.getCoeff(3, ncoeff);
    
    const Vector3F &b0 = coeff0;
    Vector3F b1 = coeff1.divide(3.0) + b0;
    Vector3F b2 = coeff2.divide(3.0) + b1.scale(2.0) - b0;
    Vector3F b3 = coeff3 + b2.scale(3.0) - b1.scale(3.0) + b0;
    
    pdl->setLineWidth(2.0);
    pdl->startLineStrip();
    pdl->color(1.0,1.0,1.0);
    pdl->vertex(b0.x(), b0.y(), b0.z());
    pdl->vertex(b1.x(), b1.y(), b1.z());
    pdl->vertex(b2.x(), b2.y(), b2.z());
    pdl->vertex(b3.x(), b3.y(), b3.z());
    pdl->end();

    /////
    
    Vector4D bn0, bn1;
    pCoeff->interpNormal(ncoeff, &bn0);
    pCoeff->interpNormal(ncoeff+1, &bn1);

    Vector4D p0, p1, t0, t1;
    pCoeff->interpAxis(ncoeff, &p0, &t0);
    pCoeff->interpAxis(ncoeff+1, &p1, &t1);

    Vector4D e12_0 = (bn0 - p0);
    Vector4D e11_0 = ( e12_0.cross(t0) ).normalize();

    Vector4D e12_3 = (bn1 - p1);
    Vector4D e11_3 = ( e12_3.cross(t1) ).normalize();

    const double par1 = 1.0/3.0;
    Vector4D e11_1 = e11_0.scale(1-par1) + e11_3.scale(par1);
    Vector4D e12_1 = e12_0.scale(1-par1) + e12_3.scale(par1);

    Vector4D e11_2 = e11_0.scale(par1) + e11_3.scale(1-par1);
    Vector4D e12_2 = e12_0.scale(par1) + e12_3.scale(1-par1);

    Vector4D db0(b0.x(), b0.y(), b0.z());
    Vector4D db1(b1.x(), b1.y(), b1.z());
    Vector4D db2(b2.x(), b2.y(), b2.z());
    Vector4D db3(b3.x(), b3.y(), b3.z());

    const double c = 0.55;
    pdl->setPointSize(10.0);
    pdl->startPoints();

    pdl->vertex(db0 + e11_0);
    pdl->vertex(db0 + e11_0 + e12_0.scale(c));
    pdl->vertex(db0 + e12_0);
    pdl->vertex(db0 + e12_0 + e11_0.scale(c));

    pdl->vertex(db1 + e11_0);
    pdl->vertex(db1 + e11_0 + e12_0.scale(c));
    pdl->vertex(db1 + e12_0);
    pdl->vertex(db1 + e12_0 + e11_0.scale(c));

    pdl->vertex(db2 + e11_3);
    pdl->vertex(db2 + e11_3 + e12_3.scale(c));
    pdl->vertex(db2 + e12_3);
    pdl->vertex(db2 + e12_3 + e11_3.scale(c));

    pdl->vertex(db3 + e11_3);
    pdl->vertex(db3 + e11_3 + e12_3.scale(c));
    pdl->vertex(db3 + e12_3);
    pdl->vertex(db3 + e12_3 + e11_3.scale(c));
    pdl->end();
  }
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

