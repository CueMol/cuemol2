// -*-Mode: C++;-*-
//
//  Abstract/Solid coloring classes
//
//  $Id: ColoringScheme.cpp,v 1.2 2011/03/30 14:17:36 rishitani Exp $

#include <common.h>

#include "ColoringScheme.hpp"
#include "MolAtom.hpp"
#include "MolResidue.hpp"
#include "MolCoord.hpp"
#include "MolRenderer.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>

using namespace molstr;

/////////////////////////////////////////////////////////////////////////////

ColoringScheme::~ColoringScheme()
{
  MB_DPRINTLN("Destroy ColoringScheme(%p)", this);
}

bool ColoringScheme::start(MolCoordPtr,Renderer*)
{
  return true;
}

void ColoringScheme::end()
{
}

bool ColoringScheme::getResidColor(MolResiduePtr pResid, ColorPtr &color)
{
  MolAtomPtr pA = pResid->getPivotAtom();
  if (pA.isnull()) return false;
  return getAtomColor(pA, color);
}

ColoringSchemePtr ColoringScheme::createDefaultS()
{
  return ColoringSchemePtr(MB_NEW SolidColoring());
}

//////////

SolidColoring::~SolidColoring()
{
}

bool SolidColoring::getAtomColor(MolAtomPtr pAtom, ColorPtr &pcol)
{
  return false;
}

//qlib::LCloneableObject *SolidColoring::clone() const
//{
//  return MB_NEW SolidColoring(*this);
//}

//////////

ColorPtr ColSchmHolder::getColor(MolAtomPtr pAtom, bool bRslvMol /*= true*/) const
{
  ColorPtr pRval;
  if (m_pcoloring.isnull()) {
    pRval = m_defaultColor;
  }
  else {
    if (!m_pcoloring->getAtomColor(pAtom, pRval))
      pRval = m_defaultColor;
  }

  if (!bRslvMol)
    return pRval;

  MolCoordPtr pMol = pAtom->getParent();
  if (pMol.isnull())
    return pRval;

  ColorPtr pMolCol = pMol->getColor(pAtom, false);
  return MolRenderer::evalMolColor(pRval, pMolCol);

/*
  gfx::MolColorRef *pNmcol = dynamic_cast<gfx::MolColorRef *>(pRval.get());
  if (pNmcol==NULL)
    return pRval;

  // if (!pNmcol->getName().equals("molcolor"))
  // return pRval;

  // molcol reference
  MolCoordPtr pMol = pAtom->getParent();
  if (pMol.isnull())
    return pRval;

  pRval = pMol->getColor(pAtom, false);
  return pNmcol->modifyColor(pRval);
 */
}

ColorPtr ColSchmHolder::getColor(MolResiduePtr pRes, bool bRslvMol /*= true*/) const
{
  ColorPtr pRval;
  if (m_pcoloring.isnull()) {
    pRval = m_defaultColor;
  }
  else {
    if (!m_pcoloring->getResidColor(pRes, pRval))
      pRval = m_defaultColor;
  }

  if (!bRslvMol)
    return pRval;

  // molcol reference
  MolCoordPtr pMol = pRes->getParent();
  if (pMol.isnull())
    return pRval;

  ColorPtr pMolCol = pMol->getColor(pRes, false);
  return MolRenderer::evalMolColor(pRval, pMolCol);

/*
  gfx::MolColorRef *pNmcol = dynamic_cast<gfx::MolColorRef *>(pRval.get());
  if (pNmcol==NULL)
    return pRval;

  // molcol reference
  MolCoordPtr pMol = pRes->getParent();
  if (pMol.isnull())
    return pRval;

  //return pMol->getColor(pRes, false);

  pRval = pMol->getColor(pRes, false);
  return pNmcol->modifyColor(pRval);
 */
}

