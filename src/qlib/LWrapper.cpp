// -*-Mode: C++;-*-
//
// String.cc
//   LString class LString
//
// $Id: LWrapper.cpp,v 1.1 2010/03/13 14:19:52 rishitani Exp $

#include <common.h>

#include "LWrapper.hpp"

using namespace qlib;

LWrapperImpl::LWrapperImpl()
{
}

LWrapperImpl::~LWrapperImpl()
{
  qlib::FuncMap::cleanup();
}

bool LWrapperImpl::getPropSpec(const qlib::LString &name,
                               PropSpec *pspec) const
{
  if (!hasProp(name))
    return false;
  if (pspec==NULL)
    return true;
  pspec->bReadOnly = !hasWProp(name);
  pspec->bHasDefault = hasDefVal(name);
  pspec->type_name = getPropTypeName(name);
  if (pspec->type_name.equals("enum")) {
    if (pspec->pEnumDef!=NULL)
      delete pspec->pEnumDef;
    pspec->pEnumDef = MB_NEW EnumDef;
    getEnumDefSet(name, *(pspec->pEnumDef));
  }

  pspec->bNoPersist = isNoPersist(name);

  return true;
}

//static
void LWrapperImpl::convToBoolValue(LBool &aDest, const LVariant &aSrc, const LString &propname)
{
  if (aSrc.isString()) {
    const LString &strval = aSrc.getStringValue();
    if (strval.equalsIgnoreCase("true") ||
        strval.equalsIgnoreCase("on") ||
        strval.equalsIgnoreCase("yes")) {
      aDest = true;
      return;
    }
    if (strval.equalsIgnoreCase("false") ||
        strval.equalsIgnoreCase("off") ||
        strval.equalsIgnoreCase("no")) {
      aDest = false;
      return;
    }
    
    LString msg = LString::format("Cannot cast string (%s) to boolean",
                                  strval.c_str());
    MB_THROW(InvalidCastException, msg);
  }
  else
    aDest = aSrc.getBoolValue();
}

//static
void LWrapperImpl::convToRealValue(LReal &aDest, const LVariant &aSrc, const LString &propname)
{
  if (aSrc.isString()) {
    const LString &strval = aSrc.getStringValue();
    if (!strval.toDouble(&aDest)) {
      LString msg = LString::format("Cannot cast string %s to real", strval.c_str());
      MB_THROW(InvalidCastException, msg);
    }
    return;
  }
  else if (aSrc.isInt()) {
    aDest = aSrc.getIntValue();
  }
  else {
    aDest = aSrc.getRealValue();
  }
}

// static
void LWrapperImpl::convToIntValue(LInt &aDest, const LVariant &aSrc, const LString &propname)
{
  if (aSrc.isString()) {
    const LString &strval = aSrc.getStringValue();
    if (!strval.toInt(&aDest)) {
      LString msg = LString::format("Cannot cast string %s to integer", strval.c_str());
      MB_THROW(InvalidCastException, msg);
    }
    return;
  }
  else if (aSrc.isReal()) {
    aDest = LInt( aSrc.getRealValue() );
  }
  else {
    aDest = aSrc.getIntValue();
  }
}

