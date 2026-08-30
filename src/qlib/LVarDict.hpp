// -*-Mode: C++;-*-
//
// Dictionary of LVariant
//

#ifndef L_VARIANT_DICT_HPP_INCLUDED_
#define L_VARIANT_DICT_HPP_INCLUDED_

#include <utility>

#include "LVariant.hpp"
#include "MapTable.hpp"
#include "qlib.hpp"

namespace qlib {

///
/// Scriptable dict of variants
///
/// Values are stored by value: copying the dict deep-copies list/dict
/// contents, and the getters hand out pointers into the stored entries.
///
class QLIB_API LVarDict : public MapTable<LVariant>
{
    using super_t = MapTable<LVariant>;

public:
    LVarDict() : super_t() {}

    LVarDict(const LVarDict &a);

    ~LVarDict();

    //////

    using super_t::set;

    /// Move val into the dict without copying list/dict contents.
    /// Returns false (and leaves the dict unchanged) when the key already exists.
    bool set(const LString &key, LVariant &&val)
    {
        // find + insert(value_type&&) instead of try_emplace: the header is also
        // compiled by consumers whose build may predate C++17
        if (super_t::find(key) != super_t::end()) return false;
        super_t::insert(typename super_t::value_type(key, std::move(val)));
        return true;
    }

    /// Pointer to the stored value, or nullptr when the key is absent.
    /// The pointer stays valid as long as the entry is in this dict.
    const LVariant *lookup(const LString &key) const
    {
        super_t::const_iterator iter = super_t::find(key);
        if (iter == super_t::end()) return nullptr;
        return &iter->second;
    }

    LString getString(const LString &key) const
    {
        const LVariant *pval = lookup(key);
        if (pval == nullptr || !pval->isString()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getString key not found");
            return LString();
        }
        return pval->getStringValue();
    }

    int getInt(const LString &key) const
    {
        const LVariant *pval = lookup(key);
        if (pval == nullptr || !pval->isInt()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getInt key not found");
            return 0;
        }
        return pval->getIntValue();
    }

    double getReal(const LString &key) const
    {
        const LVariant *pval = lookup(key);
        if (pval == nullptr || !pval->isReal()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getReal key not found");
            return 0.0;
        }
        return pval->getRealValue();
    }

    LVarList *getList(const LString &key) const
    {
        const LVariant *pval = lookup(key);
        if (pval == nullptr || !pval->isList()) {
            MB_THROW(qlib::RuntimeException, "LVarDict, getList key not found");
            return nullptr;
        }
        return pval->getListPtr();
    }

    void dump() const;
};

using LVarDictPtr = LScrSp<LVarDict>;
using LDict = LVarDict;

}  // namespace qlib

#endif  // L_VARIANT_DICT_HPP_INCLUDED_
