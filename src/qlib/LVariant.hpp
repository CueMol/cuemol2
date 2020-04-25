//
// Variant class
//

#ifndef __QLIB_VARIANT_HPP__
#define __QLIB_VARIANT_HPP__

#include "LExceptions.hpp"
#include "LScrSmartPtr.hpp"
#include "LString.hpp"
#include "qlib.hpp"

namespace qlib {

class LScriptable;
class LVarArray;
class LVarList;
class LVarDict;

class QLIB_API LVariant
{
private:
    int type;

    union
    {
        LBool boolValue;
        LInt intValue;
        LReal realValue;
        LString *pStrValue;
        LScriptable *pObjValue;
        LSupScrSp *pSpValue;
        LVarArray *pArrayValue;
        LVarList *pListValue;
        LVarDict *pDictValue;
    } value;

    bool m_bOwned;

public:
    static const int LT_NULL = 0;
    static const int LT_BOOLEAN = 1;
    static const int LT_INTEGER = 2;
    static const int LT_REAL = 3;
    static const int LT_STRING = 4;
    static const int LT_OBJECT = 5;
    static const int LT_SMARTPTR = 6;
    static const int LT_ENUM = 7;
    static const int LT_ARRAY = 8;
    static const int LT_LIST = 9;
    static const int LT_DICT = 10;

    struct copy_tag
    {
    };
    struct no_copy_tag
    {
    };

public:
    /// Default ctor (initialize null value)
    LVariant() : type(LT_NULL), m_bOwned(true) {}

    /// Copy ctor
    LVariant(const LVariant &src)
    {
        LVariant::copyFrom(src);
    }

    /// Destructor
    ~LVariant()
    {
        cleanup();
    }

    LVariant(int i) : type(LT_INTEGER), m_bOwned(true)
    {
        value.intValue = i;
    }
    LVariant(double v) : type(LT_REAL), m_bOwned(true)
    {
        value.realValue = v;
    }
    LVariant(bool v) : type(LT_BOOLEAN), m_bOwned(true)
    {
        value.boolValue = v;
    }
    LVariant(const LString &v) : type(LT_STRING), m_bOwned(true)
    {
        value.pStrValue = MB_NEW LString(v);
    }
    LVariant(const char *v) : type(LT_STRING), m_bOwned(true)
    {
        value.pStrValue = MB_NEW LString(v);
    }

    // v should already be a copy
    LVariant(LScriptable *v) : type(LT_OBJECT), m_bOwned(true)
    {
        value.pObjValue = v;
    }

    LVariant(LScriptable *v, copy_tag) : type(LT_OBJECT), m_bOwned(true)
    {
        value.pObjValue = v->copy();
    }

    // v should already be a copy
    LVariant(LScriptable *v, no_copy_tag) : type(LT_OBJECT), m_bOwned(true)
    {
        value.pObjValue = v;
    }

    //  LVariant(LSupScrSp *v) : type(LT_SMARTPTR), m_bOwned(true) { value.pSpValue = v;
    //  }

    LVariant(LVarArray *v) : type(LT_ARRAY), m_bOwned(true)
    {
        value.pArrayValue = v;
    }

    LVariant(LVarList *v) : type(LT_LIST), m_bOwned(true)
    {
        value.pListValue = v;
    }

    LVariant(LVarDict *v) : type(LT_DICT), m_bOwned(true)
    {
        value.pDictValue = v;
    }

    ///////////////////////////

    // = operator
    const LVariant &operator=(const LVariant &arg)
    {
        if (&arg != this) {
            cleanup();
            copyFrom(arg);
        }
        return *this;
    }

    ///////////////////////////////////////////////////////////
    // utility methods

    /// Cleanup this variant value
    /// This sets the content value as "null" and SETs the Owned FLAG!!
    /// This calls destruct (for Object) or delete (for Array)
    void cleanup();

    //
    void dump() const;

    /// Variation of cleanup()
    ///   This never call destruct (for object) or delete (for array),
    ///   so inapropriate use may cause memory leaking.
    inline void forget()
    {
        if (type == LT_OBJECT) {
            type = LT_NULL;
            value.pObjValue = NULL;
        } else if (type == LT_ARRAY) {
            type = LT_NULL;
            value.pArrayValue = NULL;
        } else if (type == LT_LIST) {
            type = LT_NULL;
            value.pListValue = NULL;
        } else if (type == LT_DICT) {
            type = LT_NULL;
            value.pDictValue = NULL;
        } else {
            cleanup();
        }
    }

    //

    // Copy value from "src".
    // This may call copy()
    void copyFrom(const LVariant &src);

    ////////////////

    // Convert to a string representation
    LString toString() const;

    // Is convertable between string?
    bool isStrConv() const
    {
        if (type == LT_OBJECT) return value.pObjValue->isStrConv();
        if (type == LT_ARRAY) return false;  // Array cannot be converted to string
        if (type == LT_LIST) return false;   // List cannot be converted to string
        if (type == LT_DICT) return false;   // Dict cannot be converted to string
        return true;
    }

    int getTypeID() const
    {
        return type;
    }

    bool isOwned() const
    {
        return m_bOwned;
    }

    LString getTypeString() const;

    //////

    inline bool isNull() const
    {
        return type == LT_NULL;
    }

    inline void setNull()
    {
        cleanup();
        type = LT_NULL;
        value.pObjValue = NULL;
    }

    //////

    inline bool isBool() const
    {
        return type == LT_BOOLEAN;
    }

    inline void setBoolValue(LBool b)
    {
        cleanup();
        type = LT_BOOLEAN;
        value.boolValue = b;
    }

    inline LBool getBoolValue() const
    {
        if (type != LT_BOOLEAN) {
            LString msg = LString::format("Cannot cast type \"%s\" to boolean",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        return value.boolValue;
    }

    //////

    inline bool isInt() const
    {
        return type == LT_INTEGER;
    }

    inline void setIntValue(LInt val)
    {
        cleanup();
        type = LT_INTEGER;
        value.intValue = val;
    }

    inline LInt getIntValue() const
    {
        if (type != LT_INTEGER) {
            LString msg = LString::format("Cannot cast type \"%s\" to integer",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        return value.intValue;
    }

    //////

    inline bool isReal() const
    {
        return (type == LT_INTEGER) || (type == LT_REAL);
    }

    inline void setRealValue(LReal val)
    {
        cleanup();
        type = LT_REAL;
        value.realValue = val;
    }

    inline LReal getRealValue() const
    {
        if (type == LT_REAL)
            return value.realValue;
        else if (type == LT_INTEGER)
            return value.intValue;

        LString msg = LString::format("Cannot cast type \"%s\" to real number",
                                      getTypeString().c_str());
        MB_THROW(InvalidCastException, msg);
    }

    //////

    inline bool isString() const
    {
        return type == LT_STRING;
    }

    void setStringValue(const LString &val)
    {
        cleanup();
        type = LT_STRING;
        value.pStrValue = MB_NEW LString(val);
        // MB_DPRINTLN("LVar(%p) Create string variant %p", this, value.pStrValue);
    }

    inline const LString &getStringValue() const
    {
        if (type != LT_STRING) {
            LString msg = LString::format("Cannot cast type \"%s\" to string",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }

        return *(value.pStrValue);
    }

    //////

    inline bool isEnum() const
    {
        return type == LT_ENUM;
    }

    inline void setEnumValue(const LString &val)
    {
        cleanup();
        type = LT_ENUM;
        value.pStrValue = MB_NEW LString(val);
    }

    inline const LString &getEnumValue() const
    {
        if (type != LT_ENUM) {
            LString msg = LString::format("Cannot cast type \"%s\" to enum",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }

        return *(value.pStrValue);
    }

    //////

    inline bool isArray() const
    {
        return type == LT_ARRAY;
    }

    /// This create a new copy of LVarArray object form pArray
    void setArrayValue(const LVarArray &array);

    /// Set array pointer (ownership is transferred).
    inline void setArrayPtr(LVarArray *pArray)
    {
        cleanup();
        type = LT_ARRAY;
        value.pArrayValue = pArray;
        m_bOwned = true;
    }

    /// Set array pointer (ownership is NOT transferred).
    inline void shareArrayPtr(LVarArray *pArray)
    {
        cleanup();
        type = LT_ARRAY;
        value.pArrayValue = pArray;
        m_bOwned = false;
    }

    inline LVarArray *getArrayPtr() const
    {
        if (type != LT_ARRAY) {
            LString msg = LString::format("Cannot cast type \"%s\" to array",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        return value.pArrayValue;
    }

    //////

    inline bool isList() const
    {
        return type == LT_LIST;
    }

    /// This create a new copy of LVarList object form pList
    void setListValue(const LVarList &array);

    inline LVarList *getListPtr() const
    {
        if (type != LT_LIST) {
            LString msg = LString::format("Cannot cast type \"%s\" to list",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        return value.pListValue;
    }

    //////

    inline bool isDict() const
    {
        return type == LT_DICT;
    }

    /// This create a new copy of LVarDict object form arg
    void setDictValue(const LVarDict &arg);

    /// set dict pointer (ownership is transferred)
    inline void setDictPtr(LVarDict *pDict)
    {
        cleanup();
        type = LT_DICT;
        value.pDictValue = pDict;
        m_bOwned = true;
    }

    inline LVarDict *getDictPtr() const
    {
        if (type != LT_DICT) {
            LString msg = LString::format("Cannot cast type \"%s\" to dict",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        return value.pDictValue;
    }

    ////////////////////////////////////////////////////////////
    // Object (LScriptable ptr) handling

    inline bool isObject() const
    {
        return type == LT_OBJECT;
    }

    // pobj is NOT owned by this variant
    inline void shareObjectPtr(LScriptable *pobj)
    {
        cleanup();
        type = LT_OBJECT;
        value.pObjValue = pobj;
        m_bOwned = false;
    }

    // pobj is owned by this variant
    inline void setObjectPtr(LScriptable *pobj)
    {
        cleanup();
        type = LT_OBJECT;
        value.pObjValue = pobj;
    }

    inline LScriptable *getObjectValue() const
    {
        if (type != LT_OBJECT) {
            LString msg = LString::format("Cannot cast type \"%s\" to object value",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        return value.pObjValue->copy();
    }

    inline LScriptable *getObjectPtr() const
    {
        if (type != LT_OBJECT) {
            LString msg = LString::format("Cannot cast type \"%s\" to object ptr",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        return value.pObjValue;
    }

    /**
       Return the bare object pointer (if the value is smart ptr)
     */
    inline LScriptable *getBareObjectPtr() const
    {
        if (type != LT_OBJECT) {
            LString msg = LString::format("Cannot cast type \"%s\" to object ptr",
                                          getTypeString().c_str());
            MB_THROW(InvalidCastException, msg);
        }
        if (value.pObjValue == NULL) return NULL;
        if (!value.pObjValue->isSmartPtr()) return value.pObjValue;
        return value.pObjValue->getSPInner();
    }

    // utility method with dynamic_cast
    template <typename _Type>
    _Type *getObjectPtrT() const
    {
        // pObj is not a smart pointer
        LScriptable *pObj = LVariant::getBareObjectPtr();
        if (pObj == NULL) {
            MB_THROW(NullPointerException, "Variant content is null or invalid");
        }
        _Type *pCasted = dynamic_cast<_Type *>(pObj);
        if (pCasted == NULL) {
            LString msg = LString::format("Cannot cast object (%s) to %s",
                                          typeid(*pObj).name(), typeid(_Type).name());
            MB_THROW(InvalidCastException, msg);
        }
        return pCasted;
    }

};  // class LVariant

/// Dummy Comparison method
inline bool operator==(const LVariant &arg1, const LVariant &arg2)
{
    return false;
}

}  // namespace qlib

#endif
