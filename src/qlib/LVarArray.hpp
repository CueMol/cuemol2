// -*-Mode: C++;-*-
//
// Simple array of LVariant
//   This class should be used to arg/retval conversion,
//   and shouldn't be used for data storing!!
//
// $Id: LVarArray.hpp,v 1.4 2010/12/26 12:26:17 rishitani Exp $

#ifndef L_VARIANT_ARRAY_HPP_INCLUDED_
#define L_VARIANT_ARRAY_HPP_INCLUDED_

#include "qlib.hpp"

#include "Array.hpp"
#include "LScrObjects.hpp"
#include "LVariant.hpp"
#include "LScrSmartPtr.hpp"
#include "mcutils.hpp"

namespace qlib {

  ///
  /// Scriptable array of variants
  ///
  class QLIB_API LVarArray : public Array<LVariant>
  {
  public:
    LVarArray()
      : Array<LVariant>()
    {
    }

    LVarArray(int nsize)
      : Array<LVariant>(nsize)
    {
    }

    LVarArray(const LVarArray &a)
      : Array<LVariant>(a)
    {
    }

    // LVariant getValue(int ind) const {
    // return at(ind);
    // }
    // void setValue(int ind, const LVariant &value) {
    // at(ind) = value;
    // }

    //////

    inline bool isNull(int index) const {
      return at(index).isNull();
    }

    inline void setNull(int index) {
      at(index).setNull();
    }

    //////

    inline bool isBool(int index) const {
      return at(index).isBool();
    }

    inline void setBoolValue(int index, LBool b) {
      at(index).setBoolValue(b);
    }

    inline LBool getBoolValue(int index) const {
      return at(index).getBoolValue();
    }

    //////

    inline bool isInt(int index) const {
      return at(index).isInt();
    }

    inline void setIntValue(int index, LInt b) {
      at(index).setIntValue(b);
    }

    inline LInt getIntValue(int index) const {
      return at(index).getIntValue();
    }

    //////

    inline bool isReal(int index) const {
      return at(index).isReal();
    }

    inline void setRealValue(int index, LReal b) {
      at(index).setRealValue(b);
    }

    inline LReal getRealValue(int index) const {
      return at(index).getRealValue();
    }

    //////

    inline bool isString(int index) const {
      return at(index).isString();
    }

    inline void setStringValue(int index, const LString &b) {
      at(index).setStringValue(b);
    }

    inline const LString &getStringValue(int index) const {
      return at(index).getStringValue();
    }

    //////

    inline bool isEnum(int index) const {
      return at(index).isEnum();
    }

    inline void setEnumValue(int index, const LString &b) {
      at(index).setEnumValue(b);
    }

    inline const LString &getEnumValue(int index) const {
      return at(index).getEnumValue();
    }

    //////

    inline bool isObject(int index) const {
      return at(index).isObject();
    }

    inline void setObjectPtr(int index, LScriptable *pObj) {
      at(index).setObjectPtr(pObj);
    }

    inline LScriptable *getObjectPtr(int index) const {
      return at(index).getObjectPtr();
    }

    void dump() const;

  };

  typedef LScrSp<LVarArray> LVarArrayPtr;
  typedef LVarArray LArray;

}

#endif // L_VARIANT_ARRAY_HPP_INCLUDED_

