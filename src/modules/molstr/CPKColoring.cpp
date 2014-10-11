// -*-Mode: C++;-*-
//
//  CPK coloring class
//
//  $Id: CPKColoring.cpp,v 1.9 2011/01/01 15:58:20 rishitani Exp $

#include <common.h>

// #include <qlib/LChar.hpp>
// #include <qlib/LSerial.hpp>

#include "CPKColoring.hpp"
#include "MolAtom.hpp"
#include "MolResidue.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>
// #include <gfx/Hittest.hpp>

using namespace molstr;
using gfx::SolidColor;

CPKColoring::CPKColoring()
{
/*
  m_atomcol_H = SolidColor::createRGB(0.0, 1.0, 1.0);
  m_atomcol_C = SolidColor::createRGB(1.0, 1.0, 0.75);
  m_atomcol_N = SolidColor::createRGB(0.0, 0.0, 1.0);
  m_atomcol_O = SolidColor::createRGB(1.0, 0.0, 0.0);
  m_atomcol_P = SolidColor::createRGB(1.0, 1.0, 0.0);
  m_atomcol_S = SolidColor::createRGB(0.0, 1.0, 0.0);
  m_atomcol_X = SolidColor::createRGB(0.7, 0.7, 0.7);
*/

  
  m_nMode = MOLREND_SIMPLE;
  m_colHigh = SolidColor::createRGB(1.0, 0.0, 0.0);
  m_colLow = SolidColor::createRGB(0.0, 0.0, 1.0);
  m_parHigh = 80.0;
  m_parLow = 20.0;

  resetAllProps();
  MB_DPRINTLN("CPKColoring: new obj(%p) is created.", this);
}

CPKColoring::CPKColoring(const CPKColoring &r)
{
  m_atomcol_C = r.m_atomcol_C;
  m_atomcol_N = r.m_atomcol_N;
  m_atomcol_O = r.m_atomcol_O;
  m_atomcol_H = r.m_atomcol_H;
  m_atomcol_S = r.m_atomcol_S;
  m_atomcol_P = r.m_atomcol_P;
  m_atomcol_X = r.m_atomcol_X;

  m_nMode = r.m_nMode;
  m_colLow = r.m_colLow;
  m_colHigh = r.m_colHigh;
  m_parLow = r.m_parLow;
  m_parHigh = r.m_parHigh;

  MB_DPRINTLN("CPKColoring: copy obj(%p) of %p is created.", this, &r);
}

CPKColoring::~CPKColoring()
{
  MB_DPRINTLN("CPKColoring: destructing (%p).", this);
}

void CPKColoring::setAtomColor(ElemID no, const gfx::ColorPtr & col)
{
  switch (no) {
  case ElemSym::H:
    m_atomcol_H = col;
    break;

  case ElemSym::C:
    m_atomcol_C = col;
    break;

  case ElemSym::N:
    m_atomcol_N = col;
    break;

  case ElemSym::O:
    m_atomcol_O = col;
    break;

  case ElemSym::S:
    m_atomcol_S = col;
    break;

  case ElemSym::P:
    m_atomcol_P = col;
    break;

  default:
    m_atomcol_X = col;
    break;
  }
}

bool CPKColoring::getAtomColor(MolAtomPtr pAtom, gfx::ColorPtr &col)
{
  double par;
  
  switch (m_nMode) {
  default:
  case MOLREND_SIMPLE: {
    ElemID no = pAtom->getElement();

    switch (no) {
    case ElemSym::H:
      col = m_atomcol_H;
      break;

    case ElemSym::C:
      col = m_atomcol_C;
      break;

    case ElemSym::N:
      col = m_atomcol_N;
      break;

    case ElemSym::O:
      col = m_atomcol_O;
      break;

    case ElemSym::S:
      col = m_atomcol_S;
      break;

    case ElemSym::P:
      col = m_atomcol_P;
      break;

    default:
      col = m_atomcol_X;
      break;
    }
    
    return true;
  }

  case MOLREND_OCC:
    par = pAtom->getOcc();
    break;

  case MOLREND_BFAC:
    par = pAtom->getBfac();
    break;
  }

  col = m_colLow;

#if 0
  if (par<m_parLow)
    col = m_colLow;
  else if (par>m_parHigh)
    col = m_colHigh;
  else {
    double ratio;
    if (Util::isNear(m_parHigh, m_parLow))
      ratio = 1.0;
    else
      ratio = (par-m_parLow)/(m_parHigh-m_parLow);
    col = LColor(m_colHigh, m_colLow, ratio);
  }
#endif

  return true;
}

#if 0
//////////////////////////////////////////////////////////////////////////

bool CPKColoring::setPropVec(const char *propname, const Vector3D &value)
{
  if (LChar::equals(propname, "atomcol_H")) {
    m_atomcol_H = value;
  }
  else if (LChar::equals(propname, "atomcol_C")) {
    m_atomcol_C = value;
  }
  else if (LChar::equals(propname, "atomcol_N")) {
    m_atomcol_N = value;
  }
  else if (LChar::equals(propname, "atomcol_O")) {
    m_atomcol_O = value;
  }
  else if (LChar::equals(propname, "atomcol_P")) {
    m_atomcol_P = value;
  }
  else if (LChar::equals(propname, "atomcol_S")) {
    m_atomcol_S = value;
  }
  else if (LChar::equals(propname, "atomcol_others")) {
    m_atomcol_X = value;
  }

  //

  else if (LChar::equals(propname, "lowcol")) {
    m_colLow = value;
  }
  else if (LChar::equals(propname, "highcol")) {
    m_colHigh = value;
  }
  else
    return false;

  return true;
}

//

bool CPKColoring::getPropVec(const char *propname, Vector3D &value)
{
  if (LChar::equals(propname, "atomcol_H"))
    value = m_atomcol_H.toVec();
  else if (LChar::equals(propname, "atomcol_C"))
    value = m_atomcol_C.toVec();
  else if (LChar::equals(propname, "atomcol_N"))
    value = m_atomcol_N.toVec();
  else if (LChar::equals(propname, "atomcol_O"))
    value = m_atomcol_O.toVec();
  else if (LChar::equals(propname, "atomcol_P"))
    value = m_atomcol_P.toVec();
  else if (LChar::equals(propname, "atomcol_S"))
    value = m_atomcol_S.toVec();
  else if (LChar::equals(propname, "atomcol_others"))
    value = m_atomcol_X.toVec();

  //

  else if (LChar::equals(propname, "lowcol"))
    value = m_colLow.toVec();
  else if (LChar::equals(propname, "highcol"))
    value = m_colHigh.toVec();
  else
    return false;

  return true;
}

/////////

bool CPKColoring::setPropInt(const char *propname, int value)
{
  if (LChar::equals(propname, "colormode")) {
    if (value!=MOLREND_SIMPLE &&
        value!=MOLREND_BFAC &&
        value!=MOLREND_OCC)
      return false;
    m_nMode = value;
    //invalidateCache();
    return true;
  }
  return false;
}
bool CPKColoring::getPropInt(const char *propname, int &value)
{
  if (LChar::equals(propname, "colormode")) {
    value = m_nMode;
    return true;
  }
  return false;
}

/////////

bool CPKColoring::setPropReal(const char *propname, double value)
{
  if (LChar::equals(propname, "lowpar")) {
    m_parLow = value;
    //invalidateCache();
    return true;
  }
  if (LChar::equals(propname, "highpar")) {
    m_parHigh = value;
    //invalidateCache();
    return true;
  }
  return false;
  //return Renderer::setPropReal(propname, value);
}
bool CPKColoring::getPropReal(const char *propname, double &value)
{
  if (LChar::equals(propname, "lowpar")) {
    value = m_parLow;
    return true;
  }
  if (LChar::equals(propname, "highpar")) {
    value = m_parHigh;
    return true;
  }
  return false;
  //return Renderer::getPropReal(propname, value);
}
#endif

