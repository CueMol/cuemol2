// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//

#include <common.h>
#include "molvis.hpp"

#include "Spline2Renderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>

using namespace molvis;
using namespace molstr;

Spline2Renderer::Spline2Renderer()
{
  // m_scs.setParent(this);
  // m_scs.setSmooth(0.0);

  m_nAxialDetail = 6;
  m_dLineWidth = 1.2;

  //m_bInterpColor = true;
  //m_nStCapType = TUBE_CAP_SPHR;
  //m_nEnCapType = TUBE_CAP_SPHR;
  //m_bSegEndFade = false;

  // m_pVBO = NULL;
}

Spline2Renderer::~Spline2Renderer()
{
}

const char *Spline2Renderer::getTypeName() const
{
  return "spline2";
}

void Spline2Renderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

void Spline2Renderer::display(DisplayContext *pdc)
{
  // Always use VBO (DrawElem)
  if (m_seglist.empty()) {
    createSegList();

    if (m_seglist.empty())
      return; // Error, Cannot draw anything (ignore)

    BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
      elem.updateVBOColor(this);
      if (isUseAnim())
        elem.updateDynamicVBO(this);
      else
        elem.updateStaticVBO(this);
    }
  }

  preRender(pdc);
  BOOST_FOREACH (Spline2Seg &elem, m_seglist) {
    //m_pVBO->setLineWidth(m_dLineWidth);
    //pdc->drawElem(*m_pVBO);
    elem.draw(this);
  }
  postRender(pdc);

}

void Spline2Renderer::invalidateDisplayCache()
{
  if (!m_seglist.empty()) {
    m_seglist.clear();
  }

  super_t::invalidateDisplayCache();
}

void Spline2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void Spline2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED) {
    // invalidateSplineCoeffs();
    invalidateDisplayCache();
    return;
  }
  
  super_t::objectChanged(ev);
}

void Spline2Renderer::createSegList()
{
  MolCoordPtr pCMol = getClientMol();

  // visit all residues
  ResidIterator iter(pCMol);
  
  MolResiduePtr pPrevResid;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MB_ASSERT(!pRes.isnull());
    
    MolAtomPtr pPiv = getPivotAtom(pRes);
    if (pPiv.isnull()) {
      // This resid doesn't has pivot, so we cannot draw backbone!!
      if (!pPrevResid.isnull()) {
        // endSegment(pdl, pPrevResid);
        m_seglist.back().generate(this);
      }
      pPrevResid = MolResiduePtr();
      continue;
    }
    
    if (isNewSegment(pRes, pPrevResid)) {
      if (!pPrevResid.isnull()) {
        //endSegment(pdl, pPrevResid);
        m_seglist.back().generate(this);
      }
      //beginSegment(pdl, pRes);
      m_seglist.push_front(Spline2Seg());
    }

    //rendResid(pdl, pRes);
    m_seglist.back().append(pPiv);
    pPrevResid = pRes;
  }

  if (!pPrevResid.isnull()) {
    //endSegment(pdl, pPrevResid);
    m_seglist.back().generate(this);
  }
}

//////////////////////////////////////////////////////////////

Spline2Seg::Spline2Seg()
{
  m_pVBO = NULL;
}

Spline2Seg::~Spline2Seg()
{
  if (m_pVBO!=NULL)
    delete m_pVBO;
}

void Spline2Seg::append(MolAtomPtr pAtom)
{
  m_aidtmp.push_back(pAtom->getID());
}

void Spline2Seg::generate(Spline2Renderer *pthis)
{
  quint32 nsz = m_aidtmp.size();
  if (nsz<2) {
    m_aidtmp.clear();
    return;
  }

  m_aids.resize(nsz);
  m_aids.assign(m_aidtmp.begin(), m_aidtmp.end());
  m_aidtmp.clear();
  m_nSize = nsz;

  MolCoordPtr pCMol = pthis->getClientMol();

  m_pos.resize(nsz);
  MolAtomPtr pAtom;
  Vector4D pos4d;
  quint32 i;
  for (i=0; i<m_nSize; ++i) {
    pAtom = pCMol->getAtom(m_aids[i]);
    pos4d = pAtom->getPos();
    m_pos[i] = Vector3F(pos4d.x(), pos4d.y(), pos4d.z());
  }

  m_coeff0.resize(nsz);
  m_coeff1.resize(nsz);
  m_coeff2.resize(nsz);
  m_coeff3.resize(nsz);

  if (nsz==2) {
    // Degenerated case (line)
    const Vector3F &p0 = m_pos[0];
    const Vector3F &p1 = m_pos[1];

    m_coeff3[0] = Vector3F();
    m_coeff2[0] = Vector3F();
    m_coeff1[0] = p1-p0;
    m_coeff0[0] = p0;
    return;
  }

  ///////////////////////////////////////////////////
  // calculate natural spline coeffs

  int intNo = nsz - 1;  // number of intervals
  int equNo = intNo - 1;  // number of equations

  // interval sizes
  std::vector<float> h(intNo), ih(intNo);

  // diagonal of tridiagonal matrix
  std::vector<float> a(equNo);
  // constant part of linear equations
  VecArray dvec(equNo);
  
  // LR decomposition of tridiagonal matrix
  std::vector<float> m(equNo), l(equNo - 1);
  // ??
  VecArray yvec(equNo), xvec(equNo);

  Vector3F d0, d1;

  const VecArray &invec = m_pos;
  
  // calculate interval sizes as distance between points
  for (i = 0; i < intNo; i++) {
    //h[i] = Vec3DiffAbs(invec[i], invec[i + 1]);
    h[i] = (invec[i]-invec[i+1]).length();
    ih[i] = 1.0f / h[i];
  }

  // calculate diagonal of tridiagonal matrix
  for (i = 0; i < equNo; i++)
    a[i] = 2.0f * (h[i] + h[i + 1]);

  // calculate LR decomposition of tridiagonal matrix
  m[0] = a[0];
  for (i = 0; i < equNo - 1; i++) {
    l[i] = h[i + 1] / m[i];
    m[i + 1] = a[i + 1] - l[i] * h[i + 1];
  }

  // interpolation is done separately for all 3 coordinates

  for (i = 0; i < equNo; i++) {
    // dvec[i] = 6.0*(ih[i]*(invec[i+1] - invec[i]) - ih[i+1]*(invec[i+2] - invec[i+1]));
    Vector3F dif1 = invec[i+1] - invec[i];
    Vector3F dif2 = invec[i+2] - invec[i+1];
    dvec[i] = dif1.scale(ih[i]) - dif2.scale(ih[i+1]);
    dvec[i] = dvec[i].scale(6.0f);
  }

  // forward elimination
  yvec[0] = dvec[0];
  for (i = 1; i < equNo; i++)
    yvec[i] = dvec[i] - yvec[i-1].scale(l[i-1]);

  // back substitution
  xvec[equNo-1] = yvec[equNo-1].scale(-1.0f/m[equNo-1]);
  for (i = equNo - 2; i >= 0; i--) {
    xvec[i] = yvec[i] + xvec[i+1].scale(h[i+1]);
    xvec[i] = xvec[i].scale(-1.0f/m[i]);
  }
  
  // calculate spline points
  for (i = 0; i < intNo; i++) {
    // calculate polynom coefficients
    if (i == 0)
      d0 = Vector3F(); // zero vector
    else
      d0 = xvec[i-1];
    
    if (i == intNo-1)
      d1 = Vector3F(); // zero vector
    else
      d1 = xvec[i];
    
    float hsq = h[i]*h[i];
    m_coeff3[i] = (d1 - d0).scale(hsq/6.0f);
    m_coeff2[i] = d0.scale(0.5f*hsq);
    m_coeff1[i] = invec[i+1] - invec[i] - (d1 + d0.scale(2.0f)).scale(hsq/6.0f);
    m_coeff0[i] = invec[i];

  }

}

void Spline2Seg::updateDynamicVBO(Spline2Renderer *pthis)
{
}

void Spline2Seg::updateStaticVBO(Spline2Renderer *pthis)
{
}

void Spline2Seg::updateVBOColor(Spline2Renderer *pthis)
{
}

void Spline2Seg::draw(Spline2Renderer *pthis)
{
}


