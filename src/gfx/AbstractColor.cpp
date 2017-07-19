// -*-Mode: C++;-*-
//
//  Abstract color class
//
// $Id: AbstractColor.cpp,v 1.5 2010/12/25 13:13:21 rishitani Exp $

#include <common.h>

#include "AbstractColor.hpp"
#include <qlib/Utils.hpp>
#include <qlib/LDOM2Tree.hpp>
#include <qlib/PropSpec.hpp>

#include "ColProfMgr.hpp"

using namespace gfx;

AbstractColor::~AbstractColor()
{
  //LOG_DPRINTLN("AbstractColor(%p) destructed\n", this);
}

int AbstractColor::r() const
{
  return getRCode(getCode());
}

int AbstractColor::g() const
{
  return getGCode(getCode());
}

int AbstractColor::b() const
{
  return getBCode(getCode());
}

int AbstractColor::a() const
{
  return getACode(getCode());
}

////////////////////////////////

void AbstractColor::HSBtoRGB(double hue, double saturation, double brightness,
                   double &r, double &g, double &b)
{
  hue = ::fmod(hue, 1.0);
  saturation = qlib::trunc<double>(saturation, 0.0, 1.0);
  brightness = qlib::trunc<double>(brightness, 0.0, 1.0);

  // int r = 0, g = 0, b = 0;
  if (qlib::isNear4(saturation, 0.0)) {
    r = g = b = brightness;
  }
  else {
    double h = hue * 6.0;

    double hi = (double)::floor(h);
    double f = h - hi;
    double p = brightness * (1.0 - saturation);
    double q = brightness * (1.0 - saturation * f);
    double t = brightness * (1.0 - (saturation * (1.0 - f)));
    switch (int(hi)) {
    case 0:
      r = brightness;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = brightness;
      b = p;
      break;
    case 2:
      r = p;
      g = brightness;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = brightness;
      break;
    case 4:
      r = t;
      g = p;
      b = brightness;
      break;
    default:
    //case 5:
      r = brightness;
      g = p;
      b = q;
      break;
    }
  }
}

quint32 AbstractColor::HSBtoRGB(double hue, double saturation, double brightness)
{
  // hue = qlib::trunc<double>(hue, 0.0, 1.0);
  hue = ::fmod(hue, 1.0);
  saturation = qlib::trunc<double>(saturation, 0.0, 1.0);
  brightness = qlib::trunc<double>(brightness, 0.0, 1.0);

  int r = 0, g = 0, b = 0;
  if (qlib::isNear4(saturation, 0.0)) {
    r = g = b = (int) (brightness * 255.0 + 0.5);
  } else {
    double h = (hue - (double)::floor(hue)) * 6.0;
    double f = h - (double)::floor(h);
    double p = brightness * (1.0 - saturation);
    double q = brightness * (1.0 - saturation * f);
    double t = brightness * (1.0 - (saturation * (1.0 - f)));
    switch ((int) h) {
    case 0:
      r = (int) (brightness * 255.0 + 0.5);
      g = (int) (t * 255.0 + 0.5);
      b = (int) (p * 255.0 + 0.5);
      break;
    case 1:
      r = (int) (q * 255.0 + 0.5);
      g = (int) (brightness * 255.0 + 0.5);
      b = (int) (p * 255.0 + 0.5);
      break;
    case 2:
      r = (int) (p * 255.0 + 0.5);
      g = (int) (brightness * 255.0 + 0.5);
      b = (int) (t * 255.0 + 0.5);
      break;
    case 3:
      r = (int) (p * 255.0 + 0.5);
      g = (int) (q * 255.0 + 0.5);
      b = (int) (brightness * 255.0 + 0.5);
      break;
    case 4:
      r = (int) (t * 255.0 + 0.5);
      g = (int) (p * 255.0 + 0.5);
      b = (int) (brightness * 255.0 + 0.5);
      break;
    case 5:
      r = (int) (brightness * 255.0 + 0.5);
      g = (int) (p * 255.0 + 0.5);
      b = (int) (q * 255.0 + 0.5);
      break;
    }
  }
  return 0xff000000 | (r << 16) | (g << 8) | (b << 0);
}

void AbstractColor::RGBtoHSB(int r, int g, int b,
                    double &hue, double &saturation, double &brightness)
{
  r = qlib::trunc<int>(r, 0, 255);
  g = qlib::trunc<int>(g, 0, 255);
  b = qlib::trunc<int>(b, 0, 255);

  int cmax = (r > g) ? r : g;
  if (b > cmax) cmax = b;
  int cmin = (r < g) ? r : g;
  if (b < cmin) cmin = b;

  brightness = ((double) cmax) / 255.0f;
  if (cmax != 0)
    saturation = ((double) (cmax - cmin)) / ((double) cmax);
  else
    saturation = 0;
  if (saturation == 0)
    hue = 0;
  else {
    double redc = ((double) (cmax - r)) / ((double) (cmax - cmin));
    double greenc = ((double) (cmax - g)) / ((double) (cmax - cmin));
    double bluec = ((double) (cmax - b)) / ((double) (cmax - cmin));
    if (r == cmax)
      hue = bluec - greenc;
    else if (g == cmax)
      hue = 2.0 + redc - bluec;
    else
      hue = 4.0 + greenc - redc;
    hue = hue / 6.0f;
    if (hue < 0)
      hue = hue + 1.0f;
  }
}

/// Convert object's property to color modifiers for object serialization
/// R/W Props with default value (and is not in default value)
/// will be written out to the result string as modifiers (e.g. material, mod_s, etc).
LString AbstractColor::makeModifFromProps(bool bIgnoreAlpha) const
{
  std::set<LString> names;
  std::list<LString> modif;
  getPropNames(names);

  BOOST_FOREACH(const LString &nm, names) {
    if (bIgnoreAlpha && nm.equals("alpha"))
      continue;
    
    qlib::PropSpec spec;
    if (!getPropSpecImpl(nm, &spec))
      continue;
    qlib::LVariant value;

    // Ignore read-only property
    if (spec.bReadOnly)
      continue;

    // Ignore property without default value
    if (!spec.bHasDefault)
      continue;

    // Prop value is default --> not convert to modifier
    if (isPropDefault(nm))
      continue;

    if (!getProperty(nm, value))
      continue;
      
    if (value.isNull())
      continue;

    if (!value.isStrConv())
      continue;

    modif.push_back(nm+":"+value.toString());
  }

  if (modif.empty()) return LString();
  return LString::join(";", modif);
}

/*void writeTo2(qlib::LDom2Node *pNode) const
{
  super_t::writeTo2(pNode);
  pNode->setValue(toString());
  // remove type attribute, because value contains type's info
  pNode->setTypeName(LString());
  }*/

////////////////////////////////////////////////////////////

quint32 AbstractColor::getDevCode(qlib::uid_t ctxtid) const
{
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  CmsXform *pxfm = pMgr->getCmsByID(ctxtid);
  if (pxfm==NULL)
    return getCode();
  quint32 rval;
  pxfm->doXForm(getCode(), rval);
  return rval;
}

bool AbstractColor::isInGamut(qlib::uid_t ctxtid) const
{
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  CmsXform *pxfm = pMgr->getCmsByID(ctxtid);
  if (pxfm==NULL)
    return true;
  return pxfm->isInGamut(getCode());
}

