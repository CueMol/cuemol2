// -*-Mode: C++;-*-
//
//  Coloring by bfactor or occupancy
//
//  $Id: BfacColoring.cpp,v 1.4 2011/03/30 14:17:36 rishitani Exp $

#include <common.h>

#include "BfacColoring.hpp"
#include "MolAtom.hpp"
#include "MolRenderer.hpp"
#include "MolResidue.hpp"
#include "AtomIterator.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/GradientColor.hpp>

#include <qsys/Renderer.hpp>

using namespace molstr;
using gfx::SolidColor;

BfacColoring::BfacColoring()
{
 // m_nMode = MOLREND_SIMPLE;
  //m_colHigh = SolidColor::createRGB(1.0, 0.0, 0.0);
  //m_colLow = SolidColor::createRGB(0.0, 0.0, 1.0);
  //m_parHigh = 80.0;
  //m_parLow = 20.0;

  resetAllProps();
  m_pGrad = qsys::MultiGradientPtr(MB_NEW qsys::MultiGradient());
  // Until this is a renderer's property, the gradient's name is only its own.
  setupParentData("multi_grad");
  MB_DPRINTLN("BfacColoring: new obj(%p) is created.", this);
}

BfacColoring::BfacColoring(const BfacColoring &r)
{
  m_nMode = r.m_nMode;
  m_nAuto = r.m_nAuto;
  m_colLow = r.m_colLow;
  m_colHigh = r.m_colHigh;
  m_parLow = r.m_parLow;
  m_parHigh = r.m_parHigh;

  // A copy owns its nodes: editing one coloring must not change another.
  m_pGrad = qsys::MultiGradientPtr(MB_NEW qsys::MultiGradient());
  if (!r.m_pGrad.isnull())
    m_pGrad->copyFromImpl(r.m_pGrad.get());
  setupParentData("multi_grad");

  MB_DPRINTLN("BfacColoring: copy obj(%p) of %p is created.", this, &r);
}

BfacColoring::~BfacColoring()
{
  MB_DPRINTLN("BfacColoring: destructing (%p).", this);
}

bool BfacColoring::start(MolCoordPtr pMol, Renderer *pRend)
{
  if (m_nMode!=BFC_CENTER && !isAutoMode()) return true;

  m_parAutoLo = m_parAutoHi = 0.0;
  // MolCoordPtr pMol(pRend->getClientObj(), qlib::no_throw_tag());
  if (pMol.isnull()) {
    return false;
  }
  
  if (m_nMode==BFC_CENTER) {
    m_vCenter = pMol->getCenterPos(false);
    if (!isAutoMode())
      return true;
  }

  SelectionPtr pSel;
  MolRenderer *pMolRend = dynamic_cast<MolRenderer *>(pRend);
  if (pMolRend!=NULL && m_nAuto==BFA_REND)
    pSel = pMolRend->getSelection();

  {
    double dmin = 1.0e100, dmax = -1.0e100, val;
    AtomIterator iter(pMol, pSel);
    for (iter.first(); iter.hasMore(); iter.next()) {
      val = getParam(iter.get());
      dmin = qlib::min(dmin, val);
      dmax = qlib::max(dmax, val);
    }

    MB_DPRINTLN("BfaxColoring> init high=%f, low=%f, OK.", dmax, dmin);
    m_parAutoHi = dmax;
    m_parAutoLo = dmin;
  }

  return true;
}

void BfacColoring::parentDataChanged()
{
  setupParentData("multi_grad");
}

double BfacColoring::getParam(MolAtomPtr pAtom) const
{
  if (m_nMode==BFC_OCC)
    return pAtom->getOcc();
  else if (m_nMode==BFC_CENTER)
    return (pAtom->getPos()-m_vCenter).length();
  else
    return pAtom->getBfac();
}

bool BfacColoring::getAtomColor(MolAtomPtr pAtom, gfx::ColorPtr &col)
{
  const double par = getParam(pAtom);

  // The gradient's nodes are absolute parameter values: auto and
  // lowpar / highpar belong to the two-colour ramp below.
  if (isMultiGrad()) {
    col = m_pGrad->getColor(par);
    return true;
  }

  col = m_colLow;
  
  double parLo = m_parLow;
  double parHi = m_parHigh;

  if (isAutoMode()) {
    parLo = m_parAutoLo;
    parHi = m_parAutoHi;
  }

  if (par<parLo)
    col = m_colLow;
  else if (par>parHi)
    col = m_colHigh;
  else {
    double ratio;
    if (qlib::isNear4(parHi, parLo))
      ratio = 1.0;
    else
      ratio = (par-parLo)/(parHi-parLo);

    col = ColorPtr(MB_NEW gfx::GradientColor(m_colHigh, m_colLow, ratio));
  }

  return true;
}

