//
// Variant class implementation
//
// $Id: LVariant.cpp,v 1.18 2010/12/26 12:26:17 rishitani Exp $

#include <common.h>

#include "LVariant.hpp"
#include "LObject.hpp"
#include "LString.hpp"
#include "LScriptable.hpp"
#include "LVarArray.hpp"

using namespace qlib;

void LVariant::cleanup()
{
  switch (type) {
  case LT_NULL:
    return;

  case LT_BOOLEAN:
  case LT_INTEGER:
  case LT_REAL:
  default:
    value.pObjValue = NULL;
    break;

  case LT_ENUM:
  case LT_STRING: {
    //MB_DPRINTLN("LVar(%p) Deleting string variant %p", this, value.pStrValue);
    delete value.pStrValue;
    value.pStrValue = NULL;
    //MB_DPRINTLN("LVar(%p) Delete string variant %p OK", this, value.pStrValue);
    break;
  }
	
  case LT_OBJECT: {
    if (m_bOwned)
      value.pObjValue->destruct();
    value.pObjValue = NULL;
    break;
  }

  case LT_ARRAY: {
    if (m_bOwned)
      delete value.pArrayValue;
    value.pArrayValue = NULL;
    break;
  }
  }

  type = LT_NULL;
  m_bOwned = true;
}

void LVariant::copyFrom(const LVariant &src)
{
  switch (src.type) {
  case LT_NULL:
    break;

  case LT_BOOLEAN:
    value.boolValue = src.value.boolValue;
    break;

  case LT_INTEGER:
    value.intValue = src.value.intValue;
    break;

  case LT_REAL:
    value.realValue = src.value.realValue;
    break;

  case LT_ENUM:
  case LT_STRING:
    // String is always owned.
    value.pStrValue = MB_NEW LString(*(src.value.pStrValue));
    break;

  case LT_OBJECT:
    value.pObjValue = src.value.pObjValue->copy();
    break;

  case LT_SMARTPTR:
    value.pSpValue = static_cast<LSupScrSp *>(src.value.pSpValue->copy());
    break;

  case LT_ARRAY:
    value.pArrayValue = MB_NEW LVarArray(*src.value.pArrayValue);
    break;

  default:
    MB_ASSERT(false);
    break;
  }

  type = src.type;
  m_bOwned = true;
}

LString LVariant::toString() const
{
  switch (type) {
  case LT_NULL:
    // ??
    return LString("null");
    break;

  case LT_BOOLEAN:
    return LString::fromBool(value.boolValue);
    break;

  case LT_INTEGER:
    return LString::format("%d", value.intValue);
    break;

  case LT_REAL:
    //return LString::format("%f", value.realValue);
    return LString::fromReal(value.realValue, 6);
    break;

  case LT_ENUM:
  case LT_STRING:
    return *(value.pStrValue);
    break;

  case LT_ARRAY:
    return LString::format("array(len=%d)", value.pArrayValue->getSize());
    break;

  case LT_OBJECT:
    LScriptable *pSCC = value.pObjValue;
    if (pSCC->isStrConv())
      return pSCC->toString();

    LOG_DPRINTLN("FatalERROR: toString() is called for non-StrConvCap object(%p)!!", value.pObjValue);
    return LString("[ERROR:unknown object]");
    break;

  }

  return LString();
}

void LVariant::setArrayValue(const LVarArray &array)
{
  cleanup();
  type = LT_ARRAY;
  value.pArrayValue = MB_NEW LVarArray(array);
}

LString LVariant::getTypeString() const
{
  switch (type) {
  case LT_NULL:
    return LString("null");
    break;

  case LT_BOOLEAN:
    return LString("boolean");
    break;

  case LT_INTEGER:
    return LString("integer");
    break;

  case LT_REAL:
    return LString("real");
    break;

  case LT_ENUM:
    return LString("enum");
    break;

  case LT_STRING:
    return LString("string");
    break;

  case LT_ARRAY:
    return LString("array");
    break;

  case LT_OBJECT: {
    LScriptable *pObj = value.pObjValue;
    return LString::format("object(%s)", typeid(*pObj).name());
    break;
  }

  }

  return LString("unkown");
}

