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
#include "LVarList.hpp"
#include "LVarDict.hpp"

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

  case LT_LIST: {
    if (m_bOwned)
      delete value.pListValue;
    value.pListValue = NULL;
    break;
  }

  case LT_DICT: {
    if (m_bOwned)
      delete value.pDictValue;
    value.pDictValue = NULL;
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

  case LT_LIST:
    value.pListValue = MB_NEW LVarList(*src.value.pListValue);
    break;

  case LT_DICT:
    value.pDictValue = MB_NEW LVarDict(*src.value.pDictValue);
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

  case LT_LIST:
    return LString::format("list(len=%d)", value.pListValue->size());
    break;

  case LT_DICT:
    return LString::format("dict(len=%d)", value.pDictValue->size());
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

void LVariant::setListValue(const LVarList &alist)
{
  cleanup();
  type = LT_LIST;
  value.pListValue = MB_NEW LVarList(alist);
}

void LVariant::setDictValue(const LVarDict &arg)
{
  cleanup();
  type = LT_DICT;
  value.pDictValue = MB_NEW LVarDict(arg);
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

  case LT_LIST:
    return LString("list");
    break;

  case LT_DICT:
    return LString("dict");
    break;

  case LT_OBJECT: {
    LScriptable *pObj = value.pObjValue;
    return LString::format("object(%s)", typeid(*pObj).name());
    break;
  }

  }

  return LString("unkown");
}

void LVariant::dump() const
{
  switch (type) {
  case LT_NULL:
    MB_DPRINT("(null)");
    break;

  case LT_BOOLEAN:
    MB_DPRINT("bool(%s)", getBoolValue()?"true":"false");
    break;

  case LT_INTEGER:
    MB_DPRINT("int(%d)", getIntValue());
    break;

  case LT_REAL:
    MB_DPRINT("real(%f)", getRealValue());
    break;

  case LT_ENUM:
    MB_DPRINT("enum(%s)", getEnumValue().c_str());
    break;

  case LT_STRING:
    MB_DPRINT("string(%s)", getStringValue().c_str());
    break;

  case LT_ARRAY: {
    int nsz = getArrayPtr()->size();
    MB_DPRINTLN("array(%d)[", nsz);
    for (int i=0; i<nsz; ++i) {
      getArrayPtr()->at(i).dump();
    }
    MB_DPRINTLN("]");
    break;
  }
    
  case LT_LIST: {
    getListPtr()->dump();
    break;
  }
    
  case LT_DICT: {
    LVarDict::const_iterator iter = getDictPtr()->begin();
    LVarDict::const_iterator eiter = getDictPtr()->end();
    for (; iter!=eiter; ++iter) {
      MB_DPRINT("%s: ", iter->first.c_str());
      // iter->second->dump();
      iter->second.dump();
    }
    break;
  }
    
  case LT_OBJECT: {
    LScriptable *pObj = value.pObjValue;
    MB_DPRINT("object(%s)", typeid(*pObj).name());
    break;
  }
    
  }
  
}

//////////

void LVarList::dump() const
{
  int nsz = size();
  MB_DPRINTLN("list(%d)[", nsz);
  for (int i=0; i<nsz; ++i) {
    MB_DPRINT("%d: ", i);
    if (at(i)==NULL)
      MB_DPRINT("(null)");
    else
      at(i)->dump();
    MB_DPRINTLN("");
  }
  MB_DPRINTLN("]");
}


