// -*-Mode: C++;-*-
//
// Simple list of LVariant
//

#ifndef L_VARIANT_LIST_HPP_INCLUDED_
#define L_VARIANT_LIST_HPP_INCLUDED_

#include "qlib.hpp"

#include "LVariant.hpp"
//#include "LScrObjects.hpp"
//#include "LScrSmartPtr.hpp"
//#include "mcutils.hpp"

namespace qlib {

  ///
  /// Scriptable list of variants
  ///
  class QLIB_API LVarList : public std::deque<LVariant *>
  {
    typedef std::deque<LVariant *> super_t;

  public:
    LVarList()
         : super_t()
    {
    }

    LVarList(int nsize)
         : super_t(nsize)
    {
    }

    /// Deep copy: the elements are owned, so each one is cloned
    LVarList(const LVarList &a)
         : super_t()
    {
      copyElems(a);
    }

    LVarList &operator=(const LVarList &a)
    {
      if (this!=&a) {
        clearAndDelete();
        copyElems(a);
      }
      return *this;
    }

    ~LVarList()
    {
      clearAndDelete();
    }

    /// Delete all owned elements and empty the list
    /// (clear() alone drops the pointers without deleting them)
    void clearAndDelete()
    {
      for (LVariant *p : *this)
        delete p;
      super_t::clear();
    }

  private:
    void copyElems(const LVarList &a)
    {
      for (const LVariant *p : a)
        super_t::push_back(p!=nullptr ? MB_NEW LVariant(*p) : nullptr);
    }

  public:
    //////

    LVariant *front_pop_front()
    {
      LVariant *p = super_t::front();
      super_t::pop_front();
      return p;
    }

    LVariant *back_pop_back()
    {
      LVariant *p = super_t::back();
      super_t::pop_back();
      return p;
    }

    LString getString(int ind) const
    {
      LVariant *pval = super_t::at(ind);
      if (pval==NULL || !pval->isString()) {
        LString msg = LString::format("LVarDict, getString index (%d) not found", ind);
        MB_THROW(qlib::RuntimeException, msg);
        return LString();
      }
      return pval->getStringValue();
    }

    int getInt(int ind) const
    {
      LVariant *pval = super_t::at(ind);
      if (pval==NULL || !pval->isInt()) {
        MB_THROW(qlib::RuntimeException, "LVarDict, getInt key not found");
        return 0;
      }
      return pval->getIntValue();
    }

    double getReal(int ind) const
    {
      LVariant *pval = super_t::at(ind);
      if (pval==NULL || !pval->isReal()) {
        LString msg = LString::format("LVarDict, getReal index (%d) not found", ind);
        MB_THROW(qlib::RuntimeException, msg);
        return 0.0;
      }
      return pval->getRealValue();
    }

    LVarList *getList(int ind) const
    {
      LVariant *pval = super_t::at(ind);
      if (pval==NULL || !pval->isList()) {
        MB_THROW(qlib::RuntimeException, "LVarDict, getList key not found");
        return NULL;
      }
      return pval->getListPtr();
    }

    void dump() const;

  };

  // typedef LScrSp<LVarList> LVarListPtr;

}

#endif // L_VARIANT_ARRAY_HPP_INCLUDED_

