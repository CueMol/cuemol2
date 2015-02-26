// -*-Mode: C++;-*-
//
// Dictionary of LVariant
//

#ifndef L_VARIANT_DICT_HPP_INCLUDED_
#define L_VARIANT_DICT_HPP_INCLUDED_

#include "qlib.hpp"

#include "LVariant.hpp"
#include "MapTable.hpp"

//#include "LScrObjects.hpp"
//#include "LScrSmartPtr.hpp"
//#include "mcutils.hpp"

namespace qlib {

  ///
  /// Scriptable list of variants
  ///
  class QLIB_API LVarDict : public MapPtrTable<LVariant>
  {
    typedef MapPtrTable<LVariant> super_t;

  public:
    LVarDict()
         : super_t()
    {
    }

    LVarDict(const LVarDict &a)
         : super_t(a)
    {
    }

    ~LVarDict()
    {
      super_t::iterator i = super_t::begin();
      super_t::iterator e = super_t::end();
      for (; i!=e; ++i) {
        if (i->second!=NULL)
          delete i->second;
      }
    }
    //////

    LString getString(const LString &key) const
    {
      LVariant *pval = super_t::get(key);
      if (pval==NULL || !pval->isString()) {
        MB_THROW(qlib::RuntimeException, "LVarDict, getString key not found");
        return LString();
      }
      return pval->getStringValue();
    }

    int getInt(const LString &key) const
    {
      LVariant *pval = super_t::get(key);
      if (pval==NULL || !pval->isInt()) {
        MB_THROW(qlib::RuntimeException, "LVarDict, getInt key not found");
        return 0;
      }
      return pval->getIntValue();
    }

    double getReal(const LString &key) const
    {
      LVariant *pval = super_t::get(key);
      if (pval==NULL || !pval->isReal()) {
        MB_THROW(qlib::RuntimeException, "LVarDict, getReal key not found");
        return 0.0;
      }
      return pval->getRealValue();
    }

    LVarList *getList(const LString &key) const
    {
      LVariant *pval = super_t::get(key);
      if (pval==NULL || !pval->isList()) {
        MB_THROW(qlib::RuntimeException, "LVarDict, getList key not found");
        return NULL;
      }
      return pval->getListPtr();
    }

  };

  // typedef LScrSp<LVarDict> LVarDictPtr;

}

#endif // L_VARIANT_ARRAY_HPP_INCLUDED_

