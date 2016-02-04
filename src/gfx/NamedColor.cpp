// -*-Mode: C++;-*-
//
//  Named color class
//
// $Id: NamedColor.cpp,v 1.10 2011/04/10 10:46:09 rishitani Exp $

#include <common.h>

#include "NamedColor.hpp"
#include "SolidColor.hpp"
// #include "StyleMgr.hpp"
#include <qlib/Utils.hpp>
#include <qlib/Vector4D.hpp>

using namespace gfx;

/// Named color resolver object (static)
//static
NamedColorResolver *NamedColor::m_pResolver = NULL;

//static
void NamedColor::setResolver(NamedColorResolver *p)
{
  m_pResolver = p;
}

//static
NamedColorResolver *NamedColor::getResolver()
{
  return m_pResolver;
}

//////////

NamedColor::NamedColor()
     : super_t(),
       m_nCtxtID(qlib::invalid_uid),
       m_nCacheID(qlib::invalid_uid)
{
  //LOG_DPRINTLN("Color (%p) created\n", this);
  m_dSetAlpha = -1.0;
  m_dModHue = 0.0;
  m_dModSat = 0.0;
  m_dModBri = 0.0;
}

NamedColor::NamedColor(const NamedColor &r)
     : super_t(r),
       m_name(r.m_name),
       m_nCtxtID(r.m_nCtxtID),
       m_nCacheID(qlib::invalid_uid)
{
  //LOG_DPRINTLN("Color copy (%p) created\n", this);
  m_material = r.m_material;
  m_dSetAlpha = r.m_dSetAlpha;
  m_dModHue = r.m_dModHue;
  m_dModSat = r.m_dModSat;
  m_dModBri = r.m_dModBri;
}

NamedColor::NamedColor(const LString &name)
     : super_t(),
       m_nCacheID(qlib::invalid_uid)
{
  //m_nCtxtID = qlib::invalid_uid;
  if (m_pResolver!=NULL)
    m_nCtxtID = m_pResolver->getContextID();
  else
    m_nCtxtID = qlib::invalid_uid;

  m_name = name;
  m_dSetAlpha = -1.0;
  m_dModHue = 0.0;
  m_dModSat = 0.0;
  m_dModBri = 0.0;
}

NamedColor::NamedColor(const LString &name, qlib::uid_t nCtxtID)
     : super_t(),
       m_nCacheID(qlib::invalid_uid)
{
  m_nCtxtID = nCtxtID;
  m_name = name;
  m_dSetAlpha = -1.0;
  m_dModHue = 0.0;
  m_dModSat = 0.0;
  m_dModBri = 0.0;
}

NamedColor::~NamedColor()
{
  if (m_nCacheID!=qlib::invalid_uid)
    m_pResolver->setCached(m_nCacheID, false);

  //if (!m_name.isEmpty())
  //MB_DPRINTLN("NamedColor(%s, %p) destructed\n", m_name.c_str(), this);
}

const NamedColor &NamedColor::operator=(const NamedColor &r)
{
  if(&r!=this){
    m_name = r.m_name;
    m_nCtxtID = r.m_nCtxtID;

    m_pRef = ColorPtr();

    // release old cache ID
    if (m_nCacheID!=qlib::invalid_uid)
      m_pResolver->setCached(m_nCacheID, false);
    m_nCacheID = qlib::invalid_uid;

    m_dSetAlpha = r.m_dSetAlpha;
    m_dModHue = r.m_dModHue;
    m_dModSat = r.m_dModSat;
    m_dModBri = r.m_dModBri;
  }
  return *this;
}

////////////////////////////////////////////////////

bool NamedColor::isModSet() const
{
  if (qlib::isNear4(m_dModHue, 0.0) &&
      qlib::isNear4(m_dModSat, 0.0) &&
      qlib::isNear4(m_dModBri, 0.0))
    return false;
  return true;
}

quint32 NamedColor::decodeModSet() const
{
  double hue, bri, sat;
  AbstractColor::RGBtoHSB(m_pRef->r(), m_pRef->g(), m_pRef->b(),
                          hue, sat, bri);
  hue += m_dModHue/360.0;
  sat += m_dModSat;
  bri += m_dModBri;

  return AbstractColor::HSBtoRGB(hue, sat, bri);
}

int NamedColor::r() const
{
  if (!isCached())
    updateNamedColor();

  // apply modification, if exists
  if (isModSet())
    return getRCode( decodeModSet() );

  return m_pRef->r();
}

int NamedColor::g() const
{
  if (!isCached())
    updateNamedColor();

  // apply modification, if exists
  if (isModSet())
    return getGCode( decodeModSet() );

  return m_pRef->g();
}

int NamedColor::b() const
{
  if (!isCached())
    updateNamedColor();

  // apply modification, if exists
  if (isModSet())
    return getBCode( decodeModSet() );

  return m_pRef->b();
}

int NamedColor::a() const
{
  if (!isCached())
    updateNamedColor();

  if (!isAlphaDefault())
    return int( qlib::trunc<double>(m_dSetAlpha, 0.0, 1.0) * 255.0 + 0.5 );

  return m_pRef->a();
}

quint32 NamedColor::getCode() const
{
  if (!isCached())
    updateNamedColor();

  quint32 rval;
  if (isModSet())
    rval = decodeModSet();
  else
    rval = m_pRef->getCode();

  if ( !isAlphaDefault() ) {
    quint32 a = quint32( qlib::trunc<double>(m_dSetAlpha, 0.0, 1.0) * 255.0 + 0.5 );
    rval &= 0xFFFFFF;
    return rval | (a<<24);
  }

  return rval;
}
    
LString NamedColor::getMaterial() const
{
  if (!m_material.isEmpty())
    return m_material;
  
  if (!isCached())
    updateNamedColor();
  return m_pRef->getMaterial();
}

bool NamedColor::equals(const AbstractColor &c) const
{
  if (!isCached())
    updateNamedColor();
  return getCode() == c.getCode();
}

void NamedColor::updateNamedColor() const
{
  if (m_pResolver==NULL) {
    MB_THROW(UnknownColorNameException, "Named color resolver is not initialized.");
    return;
  }
  
  ColorPtr rcol = m_pResolver->getColor(m_name, m_nCtxtID);
  
  if (rcol.isnull()) {
    // LString msg = LString::format("Cannot resolve named color %s", m_name.c_str());
    // MB_THROW(UnknownColorNameException, msg);
    m_pRef = SolidColor::createRGB(0.5,0.5,0.5,0.5);
    setCached();
    return;
  }

  // check to avoid cyclic reference
  // by trying dynamic casting to NamedColor
  qlib::LScrSp<NamedColor> dummy(rcol, qlib::no_throw_tag());
  if (!dummy.isnull()) {
    LString msg = LString::format("Cannot resolve named color %s (cyclic reference)",
                                  m_name.c_str());
    MB_THROW(UnknownColorNameException, msg);
    m_pRef = SolidColor::createRGB(0.5,0.5,0.5,0.5);
    setCached();
    return;
  }

  m_pRef = rcol;
  setCached();
}

bool NamedColor::isStrConv() const
{
  /*
  if (!m_material.isEmpty())
    return false;
  if (isModSet())
    return false;
  if (!qlib::isNear4(m_dSetAlpha, 0.0))
    return false;
  */  
  return true;
}

LString NamedColor::toString() const
{
  LString rval = m_name;

  LString modif = makeModifFromProps();
  if (!modif.isEmpty())
    rval += "{" + modif + "}";

  return rval;
}

bool NamedColor::isCached() const
{
  if (m_nCacheID==qlib::invalid_uid)
    return false;

  return m_pResolver->isCached(m_nCacheID);
}

void NamedColor::setCached() const
{
  if (m_nCacheID==qlib::invalid_uid)
    m_nCacheID = m_pResolver->makeCache();
  else
    m_pResolver->setCached(m_nCacheID, true);
}

//////////

NamedColorResolver::~NamedColorResolver()
{
}

