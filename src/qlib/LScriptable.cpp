//
// Superclass of scriptable objects
//
// $Id: LScriptable.cpp,v 1.16 2009/08/14 14:59:40 rishitani Exp $

#include <common.h>

#include "LScriptable.hpp"
#include "LWrapper.hpp"

using namespace qlib;

bool LScriptable::isStrConv() const
{
  return false;
}

bool LScriptable::fromString(const LString &src)
{
  return false;
}

LString LScriptable::toString() const
{
  MB_DPRINTLN("LScriptable::toString() called");
  return LString();
}

/////////////////////////////////////////

LScriptable *LSimpleCopyScrObject::copy() const
{
  LObject *pnew = clone();
  // LScriptable *pret = reinterpret_cast<LScriptable *>(pnew);
  // MB_ASSERT(pret==dynamic_cast<LScriptable *>(pnew));

  LScriptable *pret = dynamic_cast<LScriptable *>(pnew);
  return pret;
}

void LSimpleCopyScrObject::destruct()
{
  //MB_DPRINTLN("LSimpleCopyScrObject::destruct");
  //MB_DPRINTLN("delete this %s(%p) ",
  //typeid(*this).name(), this);
  delete this;
}

bool LSimpleCopyScrObject::getDefaultPropFlag(const LString &propnm) const
{
  return m_df.getDefaultPropFlag(propnm, this);
}

void LSimpleCopyScrObject::setDefaultPropFlag(const LString &propnm, bool bflag)
{
  m_df.setDefaultPropFlag(propnm, bflag, this);
}

/////////////////////////////////////////

LScriptable *LSingletonScrObject::copy() const
{
  return const_cast<LSingletonScrObject *>(this);
}

void LSingletonScrObject::destruct()
{
}

bool LSingletonScrObject::getDefaultPropFlag(const LString &propnm) const
{
  return false;
}

void LSingletonScrObject::setDefaultPropFlag(const LString &propnm, bool bflag)
{
}

/////////////////////////////////////////

LScriptable *LNoCopyScrObject::copy() const
{
  LOG_DPRINTLN("FATAL ERROR: copy() is called for NoCopy object %s(%p)",
	       typeid(*this).name(), this);
  MB_ASSERT(false);
  return NULL;
}

void LNoCopyScrObject::destruct()
{
  LOG_DPRINTLN("FATAL ERROR: destruct() is called for NoCopy object %s(%p)",
	       typeid(*this).name(), this);
  MB_ASSERT(false);
}

bool LNoCopyScrObject::getDefaultPropFlag(const LString &propnm) const
{
  return m_df.getDefaultPropFlag(propnm, this);
}

void LNoCopyScrObject::setDefaultPropFlag(const LString &propnm, bool bflag)
{
  m_df.setDefaultPropFlag(propnm, bflag, this);
}

/////////////////////////////////////////

