// -*-Mode: C++;-*-
//
// superclass of density-map renderers
//
// $Id: MapRenderer.cpp,v 1.5 2011/01/08 18:28:29 rishitani Exp $

#include <common.h>

#include "MapRenderer.hpp"

#include <qsys/ScalarObject.hpp>
#include <gfx/SolidColor.hpp>

/*
#include <qlib/Utils.hpp>
#include <qlib/LChar.hpp>
#include <gfx/DisplayContext.hpp>
#include <gfx/DisplayList.hpp>
#include <mbsys/MbSysDB.hpp>
#include <mbsys/ObjDict.hpp>
using qlib::LChar;
*/

using namespace xtal;
using qsys::ScalarObject;

// default constructor
MapRenderer::MapRenderer()
     : super_t()
{
  //m_pcolor = gfx::SolidColor::createRGB(0.0, 0.0, 1.0);
  //m_dSigLevel = 1.1;
  //m_dMapRange = 15.0;
}

// destructor
MapRenderer::~MapRenderer()
{
}

/*
bool MapRenderer::setClientObj(MbObject *pobj)
{
  if (!pobj->instanceOf<ScalarObject>())
    return false;

  if (!RendererAdapter::setClientObj(pobj))
    return false;

  ScalarObject *pMap = (ScalarObject *)getClientObj();
  Vector3D cen = pMap->getCenter();
  m_center.x = cen.x;
  m_center.y = cen.y;
  m_center.z = cen.z;
  m_clevel = pMap->getRmsdDensity()*1.1;
  m_maprange = 15.0;

  return true;
}

 void MapRenderer::invalidateDisplayCache()
{
  if (m_pdl!=NULL)
    delete m_pdl;
  m_pdl = NULL;
}
*/


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
  MapRenderer *pthis = const_cast<MapRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();

  double sig = pMap->getRmsdDensity();
  //if (qlib::isNear4(sig, 0.0))
  //return 0.0;
  return pMap->getMaxDensity()/sig;
}

double MapRenderer::getMinLevel() const
{
  MapRenderer *pthis = const_cast<MapRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();

  double sig = pMap->getRmsdDensity();
  //if (qlib::isNear4(sig, 0.0))
  //return 0.0;
  return pMap->getMinDensity()/sig;
}

double MapRenderer::getLevel() const
{
  MapRenderer *pthis = const_cast<MapRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();
  double sig = pMap->getRmsdDensity();
  return m_dSigLevel * sig;
}

void MapRenderer::setLevel(double value)
{
  MapRenderer *pthis = const_cast<MapRenderer *>(this);
  ScalarObject *pMap = (ScalarObject *) pthis->getClientObj().get();
  double sig = pMap->getRmsdDensity();
  setSigLevel(value/sig);
}

