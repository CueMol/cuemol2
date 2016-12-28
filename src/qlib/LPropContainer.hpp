//
// Implementation of the dinamic property container class
//

#ifndef _QLIB_PROP_CONTAINER_HPP__
#define _QLIB_PROP_CONTAINER_HPP__

#include "qlib.hpp"

#include "MapTable.hpp"
#include "LVariant.hpp"
#include "LExceptions.hpp"

namespace qlib {

  class PropSpec;
  class LVariant;
  class LVarArgs;

  class QLIB_API LDynPropContainer
  {
  public:
    LDynPropContainer();
    virtual ~LDynPropContainer();

    //////////////////////
    // dynamic properties
  private:
    typedef MapTable<LVariant> DynPropTab;
    
    DynPropTab m_props;

  public:
    
    bool getDynProp(const LString &propnm, qlib::LVariant &presult) const;
    bool setDynProp(const LString &propnm, const qlib::LVariant &pvalue);
    bool removeDynProp(const LString &propnm);
    int getDynPropNames(std::set<LString> &names) const;
    LString getDynPropTypeName(const LString &propnm) const;

    //////////////////////
    // convenience methods

    bool setDynPropBool(const LString &propname, bool value);
    bool setDynPropInt(const LString &propname, int value);
    bool setDynPropReal(const LString &propname, double value);
    bool setDynPropStr(const LString &propname, const LString &value);

    bool getDynPropBool(const LString &propname, bool &value) const;
    bool getDynPropInt(const LString &propname, int &value) const;
    bool getDynPropReal(const LString &propname, double &value) const;
    bool getDynPropStr(const LString &propname, LString &value) const;

    bool getDynPropBool(const LString &propname) const;
    int getDynPropInt(const LString &propname) const;
    double getDynPropReal(const LString &propname) const;
    LString getDynPropStr(const LString &propname) const;

  };

}

#endif


