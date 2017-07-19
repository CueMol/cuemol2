// -*-Mode: C++;-*-
//
//  Solid RGBA color class
//
// $Id: SolidColor.cpp,v 1.10 2010/12/26 15:58:07 rishitani Exp $

#include <common.h>

#include "SolidColor.hpp"
#include <qlib/Utils.hpp>
#include <qlib/Vector4D.hpp>

using namespace gfx;

SolidColor::SolidColor()
     : m_code(0), m_nMode(CM_RGB)
{
  //LOG_DPRINTLN("Color (%p) created\n", this);
}

SolidColor::SolidColor(const SolidColor &r)
     : m_code(r.m_code), m_nMode(r.m_nMode), m_material(r.m_material)
{
  //LOG_DPRINTLN("Color copy (%p) created\n", this);
}

const SolidColor &SolidColor::operator=(const SolidColor &r)
{
  if(&r!=this){
    m_code = r.m_code;
    m_nMode = r.m_nMode;
	m_material = r.m_material;
  }
  return *this;
}

SolidColor::SolidColor(unsigned int c)
{
  m_code = c;
  m_nMode = CM_RGB;
}

SolidColor::SolidColor(int r, int g, int b)
{
  m_code = makeRGBACode(r,g,b,255);
  m_nMode = CM_RGB;
}

SolidColor::SolidColor(int r, int g, int b, int a)
{
  m_code = makeRGBACode(r,g,b,a);
  m_nMode = CM_RGB;
}

SolidColor::SolidColor(double r, double g, double b)
{
  /*
  r = (double) qlib::trunc<double>(r, 0.0, 1.0);
  g = (double) qlib::trunc<double>(g, 0.0, 1.0);
  b = (double) qlib::trunc<double>(b, 0.0, 1.0);
  m_code = makeRGBACode((int)(r*255.0+0.5),
			(int)(g*255.0+0.5),
			(int)(b*255.0+0.5),
			255);
  */
  setRGBA(r, g, b);
  m_nMode = CM_RGB;
}

SolidColor::SolidColor(double r, double g, double b, double a)
{
  /*
  r = (double) qlib::trunc<double>(r, 0.0, 1.0);
  g = (double) qlib::trunc<double>(g, 0.0, 1.0);
  b = (double) qlib::trunc<double>(b, 0.0, 1.0);
  a = (double) qlib::trunc<double>(a, 0.0, 1.0);
  m_code = makeRGBACode((int)(r*255.0+0.5),
			(int)(g*255.0+0.5),
			(int)(b*255.0+0.5),
			(int)(a*255.0+0.5));
  */
  setRGBA(r, g, b, a);
  m_nMode = CM_RGB;
}

SolidColor::SolidColor(const qlib::Vector4D &v)
{
  /*
  double r = (double) qlib::trunc<double>(v.x(), 0.0, 1.0);
  double g = (double) qlib::trunc<double>(v.y(), 0.0, 1.0);
  double b = (double) qlib::trunc<double>(v.z(), 0.0, 1.0);
  double a = (double) qlib::trunc<double>(v.w(), 0.0, 1.0);

  m_code = makeRGBACode((int)(r*255.0+0.5),
			(int)(g*255.0+0.5),
			(int)(b*255.0+0.5),
			(int)(a*255.0+0.5));
  */
  setRGBA(v.x(), v.y(), v.z(), v.w());
  m_nMode = CM_RGB;
}

SolidColor::~SolidColor()
{
}

////////////////////////////////////////////////////

int SolidColor::r() const
{
  return getRCode(m_code);
}

int SolidColor::g() const
{
  return getGCode(m_code);
}

int SolidColor::b() const
{
  return getBCode(m_code);
}

int SolidColor::a() const
{
  return getACode(m_code);
}

quint32 SolidColor::getCode() const
{
  return m_code;
}
    
LString SolidColor::getMaterial() const
{
  return m_material;
}

bool SolidColor::equals(const AbstractColor &c) const
{
  return m_code==c.getCode();
}

void SolidColor::setCode(unsigned int c)
{
  m_nMode = CM_RGB;
  m_code = c;
}

void SolidColor::setR(int v)
{
  m_code &= 0xFF00FFFF;
  m_code |= ((v & 0xFF) << 16);
  m_nMode = CM_RGB;
}

void SolidColor::setG(int v)
{
  m_code &= 0xFFFF00FF;
  m_code |= ((v & 0xFF) << 8);
  m_nMode = CM_RGB;
}

void SolidColor::setB(int v)
{
  m_code &= 0xFFFFFF00;
  m_code |= ((v & 0xFF) << 0);
  m_nMode = CM_RGB;
}

void SolidColor::setA(int v)
{
  m_code &= 0x00FFFFFF;
  m_code |= ((v & 0xFF) << 24);
  // m_nMode = CM_RGB;
}

//static
qlib::LScrSp<SolidColor> SolidColor::createRGB(double R, double G, double B, double A /*=1.0*/)
{
  return qlib::LScrSp<SolidColor>(new SolidColor(R,G,B,A)); 
}

// static
qlib::LScrSp<SolidColor> SolidColor::createHSB(double H, double S, double B, double A/*=1.0*/)
{
  return qlib::LScrSp<SolidColor>(SolidColor::createRawHSB(H,S,B,A)); 
}

//static
SolidColor *SolidColor::createRawHSB(double H, double S, double B, double A/*=1.0*/)
{
  double dr,dg,db;
  AbstractColor::HSBtoRGB(H, S, B, dr, dg, db);
  SolidColor *pRet = new SolidColor(dr, dg, db, A);
  pRet->m_nMode = CM_HSB;
  return pRet;
}

bool SolidColor::isStrConv() const
{
//  if (m_material.isEmpty())
    return true;
}

LString SolidColor::toString() const
{
  LString rval;
  
  if (a()==255) {
    if (m_nMode==CM_HSB) {
      double h, s, b;
      getHSB(h, s, b);
      //rval = LString::format("hsb(%f,%f,%f)", h*360.0, s, b);
      rval = "hsb("+ LString::fromReal(h*360.0) + "," +
        LString::fromReal(s) + "," +
          LString::fromReal(b) + ")";
    }
    else {
      rval = LString::format("#%06X", m_code&0xFFFFFF);
    }
  }
  else {
    if (m_nMode==CM_HSB) {
      double h, s, b;
      getHSB(h, s, b);
      //rval = LString::format("hsba(%f,%f,%f)", h*360.0, s, b, fa());
      rval = "hsba("+ LString::fromReal(h*360.0) + "," +
        LString::fromReal(s) + "," +
          LString::fromReal(b) + "," +
            LString::fromReal(fa()) + ")";
    }
    else {
      //rval = LString::format("rgba(%f,%f,%f,%f)", fr(), fg(), fb(), fa());
      rval = "rgba("+ LString::fromReal(fr()) + "," +
        LString::fromReal(fg()) + "," +
          LString::fromReal(fb()) + "," +
            LString::fromReal(fa()) + ")";
    }
  }

  // conv props to modifiers (but ignoring alpha)
  LString modif = makeModifFromProps(true);
  if (!modif.isEmpty())
    rval += "{" + modif + "}";

  return rval;
}

void SolidColor::setRGBA(double R, double G, double B, double A)
{
  const double r = (double) qlib::trunc<double>(R, 0.0, 1.0);
  const double g = (double) qlib::trunc<double>(G, 0.0, 1.0);
  const double b = (double) qlib::trunc<double>(B, 0.0, 1.0);
  const double a = (double) qlib::trunc<double>(A, 0.0, 1.0);
  m_code = makeRGBACode((int)(r*255.0+0.5),
			(int)(g*255.0+0.5),
			(int)(b*255.0+0.5),
			(int)(a*255.0+0.5));
}

void SolidColor::setHSBA(double H, double S, double B, double A)
{
  double dr,dg,db;
  AbstractColor::HSBtoRGB(H, S, B, dr, dg, db);
  setRGBA(dr, dg, db, A);
}
