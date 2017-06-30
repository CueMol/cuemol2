//
// PropContainer class implementation
//
// $Id: LPropSupport.cpp,v 1.1 2009/08/15 11:29:04 rishitani Exp $

#include <common.h>

#include "LPropSupport.hpp"
#include "LVariant.hpp"
#include "NestedPropHandler.hpp"

using namespace qlib;

bool LPropSupport::setPropBool(const char *propname, bool value)
{
  LVariant var;
  var.setBoolValue(value);
  return setProperty(propname, var);
}

bool LPropSupport::setPropInt(const char *propname, int value)
{
  LVariant var;
  var.setIntValue(value);
  return setProperty(propname, var);
}

bool LPropSupport::setPropReal(const char *propname, double value)
{
  LVariant var;
  var.setRealValue(value);
  return setProperty(propname, var);
}

bool LPropSupport::setPropStr(const char *propname, const LString &value)
{
  LVariant var;
  var.setStringValue(value);
  return setProperty(propname, var);
}


/////////////////

bool LPropSupport::getPropBool(const char *propname, bool &value) const
{
  LVariant var;
  if (!getProperty(propname, var))
    return false;
  if (!var.isBool())
    return false;
  value = var.getBoolValue();
  return true;
}

bool LPropSupport::getPropInt(const char *propname, int &value) const
{
  LVariant var;
  if (!getProperty(propname, var))
    return false;
  if (!var.isInt())
    return false;
  value = var.getIntValue();
  return true;
}

bool LPropSupport::getPropReal(const char *propname, double &value) const
{
  LVariant var;
  if (!getProperty(propname, var))
    return false;
  if (!var.isReal())
    return false;
  value = var.getRealValue();
  return true;
}

bool LPropSupport::getPropStr(const char *propname, LString &value) const
{
  LVariant var;
  if (!getProperty(propname, var))
    return false;
  if (!var.isString())
    return false;
  value = var.getStringValue();
  return true;
}

/////////////////

#if 0
int LPropSupport::getPropNames(LString **ppStrNames) const
{
  int i;
  std::set<LString> toacm;
  
  getPropNames(toacm);

  int nsize = toacm.size();
  *ppStrNames = MB_NEW LString[nsize];

  std::set<LString>::const_iterator iter = toacm.begin();
  for (i=0; iter!=toacm.end(); ++i, ++iter) {
    (*ppStrNames)[i] = *iter;
    //MB_DPRINTLN("propname: %s", (*ppStrNames)[i].c_str());
  }

  return i;
}

int LPropSupport::getPropNames(LString **ppStrNames,
				 LString **ppTypeNames) const
{
  int i;
  int nprops = getPropNames(ppStrNames);
  if (nprops<=0) return nprops;

  *ppTypeNames = MB_NEW LString[nprops];

  for (i=0; i<nprops; ++i) {
    LString nam = (*ppStrNames)[i];
    // MB_DPRINTLN("propname: %s", nam.c_str());
    (*ppTypeNames)[i] = getPropTypeName(nam);
  }

  return i;
}
#endif


bool LPropSupport::hasNestedProperty(const LString &propname) const
{
  NestedPropHandler nph(propname, const_cast<LPropSupport*>(this));
  return nph.apply()->hasProperty(nph.last_name());
}

bool LPropSupport::hasNestedWritableProperty(const LString &propname) const
{
  NestedPropHandler nph(propname, const_cast<LPropSupport*>(this));
  return nph.apply()->hasWritableProperty(nph.last_name());
}

bool LPropSupport::getNestedProperty(const LString &propname, LVariant &presult) const
{
  NestedPropHandler nph(propname, const_cast<LPropSupport*>(this));
  return nph.apply()->getProperty(nph.last_name(), presult);
}

bool LPropSupport::setNestedProperty(const LString &propname, const LVariant &pvalue)
{
  NestedPropHandler nph(propname, this);
  return nph.apply()->setProperty(nph.last_name(), pvalue);
}

bool LPropSupport::resetNestedProperty(const LString &propname)
{
  NestedPropHandler nph(propname, this);
  return nph.apply()->resetProperty(nph.last_name());
}

bool LPropSupport::hasNestedPropDefault(const LString &propname) const
{
  NestedPropHandler nph(propname, const_cast<LPropSupport*>(this));
  return nph.apply()->hasPropDefault(nph.last_name());
}

bool LPropSupport::isNestedPropDefault(const LString &propname) const
{
  NestedPropHandler nph(propname, const_cast<LPropSupport*>(this));
  return nph.apply()->isPropDefault(nph.last_name());
}

