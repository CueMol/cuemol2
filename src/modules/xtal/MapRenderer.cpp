// -*-Mode: C++;-*-
//
// superclass of density-map renderers
//
// $Id: MapRenderer.cpp,v 1.5 2011/01/08 18:28:29 rishitani Exp $

#include <common.h>

#include "MapRenderer.hpp"
#include "DensityMap.hpp"

#include <qsys/ScalarObject.hpp>
#include <gfx/SolidColor.hpp>

#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

using namespace xtal;
using qsys::ScalarObject;
using molstr::AtomIterator;

// default constructor
MapRenderer::MapRenderer()
     : super_t()
{
  //m_pcolor = gfx::SolidColor::createRGB(0.0, 0.0, 1.0);
  //m_dSigLevel = 1.1;
  //m_dMapRange = 15.0;

  m_bUseMolBndry = false;
  m_bUseAbsLev = false;
  m_nRegionMode = REGION_AUTO;

  m_pGrad = qsys::MultiGradientPtr(MB_NEW qsys::MultiGradient());
  super_t::setupParentData("multi_grad");
}

// destructor
MapRenderer::~MapRenderer()
{
}

bool MapRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  ScalarObject *ptest = dynamic_cast<ScalarObject *>(pobj.get());
  return ptest!=NULL;
}

LString MapRenderer::toString() const
{
  return LString::format("MapRenderer %p", this);
}

double MapRenderer::getMaxLevel() const
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  //if (qlib::isNear4(sig, 0.0))
  //return 0.0;
  return pMap->getMaxDensity()/sig;
}

double MapRenderer::getMinLevel() const
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  //if (qlib::isNear4(sig, 0.0))
  //return 0.0;
  return pMap->getMinDensity()/sig;
}

double MapRenderer::getLevel() const
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  return m_dSigLevel * sig;
}

void MapRenderer::setLevel(double value)
{
  ScalarObject *pMap = qlib::ensureNotNull( getScalarObj() );

  double sig = pMap->getRmsdDensity();
  setSigLevel(value/sig);
}

///////////////////////////////////////////////////
// Display region policy / periodic boundary

int MapRenderer::getEffectiveRegionMode() const
{
  if (m_nRegionMode != REGION_AUTO)
    return m_nRegionMode;

  const DensityMap *pXtal = dynamic_cast<const DensityMap *>(getScalarObj());
  if (pXtal != NULL &&
      pXtal->getEffectiveMapType() == DensityMap::MAPTYPE_EM)
    return REGION_FULL;

  return REGION_BOX;
}

LString MapRenderer::getRegionModeResolvedStr() const
{
  return (getEffectiveRegionMode() == REGION_FULL) ? LString("full")
                                                   : LString("box");
}

bool MapRenderer::isPBCEligible(const ScalarObject *pMap, bool bSpansCell) const
{
  const DensityMap *pXtal = dynamic_cast<const DensityMap *>(pMap);
  if (pXtal == NULL)
    return false;
  if (!isUsePBC())
    return false;
  if (!pXtal->isPeriodic())
    return false;
  if (!bSpansCell)
    return false;
  if (getEffectiveRegionMode() == REGION_FULL)
    return false;
  return true;
}

void MapRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  // The map kind decides the effective region policy and the PBC
  // eligibility, so a map_type change of the client map is a geometry
  // change of every renderer on it.
  if (ev.getType() == qsys::ObjectEvent::OBE_PROPCHG &&
      ev.getTarget() == getClientObjID()) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE != NULL && pPE->getName().equals("map_type"))
      invalidateGeomCache();
  }

  super_t::objectChanged(ev);
}

///////////////////////////////////////////////////
// Mol boundary mode routines

void MapRenderer::setBndryMolName(const LString &s)
{
  if (s.equals(m_strBndryMol))
    return;
  m_strBndryMol = s;

  /// target mol is changed-->redraw map
  invalidateGeomCache();
}

void MapRenderer::setBndrySel(const SelectionPtr &pSel)
{
  ensureNotNull(pSel);
  
  if (!m_pSelBndry.isnull())
    if (m_pSelBndry->equals(pSel.get()))
      return;

  m_pSelBndry = pSel;
  //setupMolBndry();

  /// selection is changed-->redraw map
  invalidateGeomCache();
}

void MapRenderer::setBndryRng(double d)
{
  if (qlib::isNear4(d, m_dBndryRng))
    return;
  m_dBndryRng = d;
  if (m_dBndryRng<0.0)
    m_dBndryRng = 0.0;
  // setupMolBndry();

  if (m_bUseMolBndry)
    invalidateGeomCache();
}

void MapRenderer::setupMolBndry()
{
  m_boundary.clear();
  m_bUseMolBndry = false;

  if (m_strBndryMol.isEmpty())
    return;

  qsys::ObjectPtr pobj = ensureNotNull(getScene())->getObjectByName(m_strBndryMol);
  MolCoordPtr pMol = MolCoordPtr(pobj, qlib::no_throw_tag());

  if (pMol.isnull()) {
    m_strBndryMol = LString();
    return;
  }

  AtomIterator aiter(pMol, m_pSelBndry);
  int i, natoms=0;
  for (aiter.first();
       aiter.hasMore();
       aiter.next()) {
    ++natoms;
  }

  m_boundary.alloc(natoms);

  for (aiter.first(), i=0;
       aiter.hasMore() && i<natoms ;
       aiter.next(), ++i) {
    m_boundary.setAt(i, aiter.get()->getPos(), aiter.getID());
  }

  m_boundary.build();
  m_bUseMolBndry = true;
}

qsys::ObjectPtr MapRenderer::getColorMapObj() const
{
  qsys::ObjectPtr pobj = ensureNotNull(getScene())->getObjectByName(getColorMapName());
  return pobj;
}

void MapRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("multi_grad") &&
      m_nMode==MAPREND_MULTIGRAD) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}


