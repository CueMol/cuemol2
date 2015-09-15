// -*-Mode: C++;-*-
//
//  Gradient color class
//
// $Id: GradientColor.cpp,v 1.2 2009/12/10 14:09:59 rishitani Exp $

#include <common.h>

#include "GradientColor.hpp"
#include <qlib/Utils.hpp>
#include <qlib/Vector4D.hpp>

using namespace gfx;

// MC_CLONEABLE_IMPL(gfx::GradientColor);

GradientColor::GradientColor()
{
}

GradientColor::GradientColor(const GradientColor &r)
{
  m_pColor1 = r.m_pColor1;
  m_pColor2 = r.m_pColor2;
  m_rho = r.m_rho;
}

GradientColor::GradientColor(ColorPtr pc1, ColorPtr pc2, double par)
{
  m_pColor1 = pc1;
  m_pColor2 = pc2;
  m_rho = par;
}

GradientColor::~GradientColor()
{
}

const GradientColor &GradientColor::operator=(const GradientColor &r)
{
  if(&r!=this){
    m_pColor1 = r.m_pColor1;
    m_pColor2 = r.m_pColor2;
    m_rho = r.m_rho;
  }
  return *this;
}

///////////////////////////
// AbstractColor implementations

int GradientColor::r() const
{
  if (m_pColor1.isnull()||m_pColor2.isnull()) {
    MB_THROW(qlib::NullPointerException, "GradientColor is not initialized");
  }
  //double r = (double(m_pColor1->r())*m_rho +
  //double(m_pColor2->r())*(1.0-m_rho));
  //return (int)r;
  const int v1 = m_pColor1->r();
  const int v2 = m_pColor2->r();
  if (v1==v2)
    return v1;

  double vv = v1*m_rho + v2*(1.0-m_rho);
  return (int)vv;
}

int GradientColor::g() const
{
  if (m_pColor1.isnull()||m_pColor2.isnull()) {
    MB_THROW(qlib::NullPointerException, "GradientColor is not initialized");
  }

  //double r = (double(m_pColor1->g())*m_rho +
  //double(m_pColor2->g())*(1.0-m_rho));
  //return (int)r;

  const int v1 = m_pColor1->g();
  const int v2 = m_pColor2->g();
  if (v1==v2)
    return v1;

  double vv = v1*m_rho + v2*(1.0-m_rho);
  return (int)vv;
}

int GradientColor::b() const
{
  if (m_pColor1.isnull()||m_pColor2.isnull()) {
    MB_THROW(qlib::NullPointerException, "GradientColor is not initialized");
  }
  //double r = (double(m_pColor1->b())*m_rho +
  //double(m_pColor2->b())*(1.0-m_rho));
  //return (int)r;
  const int v1 = m_pColor1->b();
  const int v2 = m_pColor2->b();
  if (v1==v2)
    return v1;

  double vv = v1*m_rho + v2*(1.0-m_rho);
  return (int)vv;
}

int GradientColor::a() const
{
  if (m_pColor1.isnull()||m_pColor2.isnull()) {
    MB_THROW(qlib::NullPointerException, "GradientColor is not initialized");
  }
  const int v1 = m_pColor1->a();
  const int v2 = m_pColor2->a();
  if (v1==v2)
    return v1;

  double vv = v1*m_rho + v2*(1.0-m_rho);
  return (int)vv;
}

quint32 GradientColor::getCode() const
{
  return makeRGBACode(r(), g(), b(), a());
}

LString GradientColor::getMaterial() const
{
  return m_pColor1->getMaterial();
}
    
bool GradientColor::equals(const AbstractColor &c) const
{
  return GradientColor::getCode()==c.getCode();
}

    
////////////
// Simple copy obj implementation

bool GradientColor::isStrConv() const
{
  return false;
}

LString GradientColor::toString() const
{
  return LString();
}

