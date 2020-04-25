// -*-Mode: C++;-*-
//
// Dictionary of LVariant
//

#ifndef L_VARIANT_DICT_HPP_INCLUDED_
#define L_VARIANT_DICT_HPP_INCLUDED_

#include "LVariant.hpp"
#include "MapTable.hpp"
#include "qlib.hpp"

//#include "LScrObjects.hpp"
//#include "LScrSmartPtr.hpp"
//#include "mcutils.hpp"

namespace qlib {

///
/// Scriptable dict of variants
///
// class QLIB_API LVarDict : public MapPtrTable<LVariant>
class QLIB_API LVarDict : public MapTable<LVariant>
{
    // typedef MapPtrTable<LVariant> super_t;
    using super_t = MapTable<LVariant>;

public:
    LVarDict() : super_t() {}

    LVarDict(const LVarDict &a);

    ~LVarDict();

    //////

    LString getString(const LString &key) const
    {
        // LVariant *pval = super_t::get(key);
        // if (pval == NULL || !pval->isString()) {
        //     MB_THROW(qlib::RuntimeException, "LVarDict, getString key not found");
        //     return LString();
        // }
        // return pval->getStringValue();
        LVariant val = super_t::get(key);
        if (!val.isString()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getString key not found");
            return LString();
        }
        return val.getStringValue();
    }

    int getInt(const LString &key) const
    {
        // LVariant *pval = super_t::get(key);
        // if (pval == NULL || !pval->isInt()) {
        //     MB_THROW(qlib::RuntimeException, "LVarDict, getInt key not found");
        //     return 0;
        // }
        // return pval->getIntValue();
        LVariant val = super_t::get(key);
        if (!val.isInt()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getInt key not found");
            return 0;
        }
        return val.getIntValue();
    }

    double getReal(const LString &key) const
    {
        // LVariant *pval = super_t::get(key);
        // if (pval == NULL || !pval->isReal()) {
        //     MB_THROW(qlib::RuntimeException, "LVarDict, getReal key not found");
        //     return 0.0;
        // }
        // return pval->getRealValue();
        LVariant val = super_t::get(key);
        if (!val.isReal()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getReal key not found");
            return 0.0;
        }
        return val.getRealValue();
    }

    LVarList *getList(const LString &key) const
    {
        // LVariant *pval = super_t::get(key);
        // if (pval == NULL || !pval->isList()) {
        //     MB_THROW(qlib::RuntimeException, "LVarDict, getList key not found");
        //     return NULL;
        // }
        // return pval->getListPtr();
        LVariant val = super_t::get(key);
        if (!val.isList()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getList key not found");
            return NULL;
        }
        return val.getListPtr();
    }

    void dump() const;
};

using LVarDictPtr = LScrSp<LVarDict>;
using LDict = LVarDict;

}  // namespace qlib

#endif  // L_VARIANT_ARRAY_HPP_INCLUDED_
