//
// Interface for the property handling class
//

#ifndef _QLIB_PROP_SUPPORT_HPP__
#define _QLIB_PROP_SUPPORT_HPP__

#include "qlib.hpp"

#include "LString.hpp"

namespace qlib {

  class PropSpec;
  class LVariant;
  class LVarArgs;

  class QLIB_API LPropSupport
  {
  public:
    virtual ~LPropSupport() {}

    //
    // property support (high-level) interface
    //
    virtual bool getProperty(const LString &propnm, LVariant &presult) const =0;
    virtual bool setProperty(const LString &propnm, const LVariant &pvalue) =0;

    virtual LString getPropTypeName(const LString &) const =0;
    virtual bool hasProperty(const LString &propnm) const =0;
    virtual bool hasWritableProperty(const LString &propnm) const =0;

    virtual bool hasPropDefault(const LString &propnm) const =0;
    virtual bool isPropDefault(const LString &propnm) const =0;
    virtual bool resetProperty(const LString &propnm) =0;
    
    //
    // property support (implementation-level) interface
    //
    virtual bool getPropertyImpl(const LString &propnm, LVariant &presult) const =0;
    virtual bool setPropertyImpl(const LString &propnm, const LVariant &pvalue) =0;
    virtual bool resetPropertyImpl(const LString &propnm) =0;
    virtual bool getPropSpecImpl(const LString &, PropSpec *pspec) const =0;
    virtual void getPropNames(std::set<LString> &) const =0;

    //

    virtual qlib::uid_t getRootUID() const =0;

    //////////////////////
    // convenience methods

    bool setPropBool(const char *propname, bool value);
    bool setPropInt(const char *propname, int value);
    bool setPropReal(const char *propname, double value);
    bool setPropStr(const char *propname, const LString &value);
    bool getPropBool(const char *propname, bool &value) const;
    bool getPropInt(const char *propname, int &value) const;
    bool getPropReal(const char *propname, double &value) const;
    bool getPropStr(const char *propname, LString &value) const;
    // int getPropNames(LString **ppStrNames) const;
    // int getPropNames(LString **ppStrNames, LString **ppTypeNames) const;
    
    ///////////////////////////
    // convenience methods for nested prop handling

    bool hasNestedProperty(const LString &propnm) const;
    bool hasNestedWritableProperty(const LString &propnm) const;
    bool getNestedProperty(const LString &propnm, LVariant &presult) const;
    bool setNestedProperty(const LString &propnm, const LVariant &pvalue);
    bool resetNestedProperty(const LString &propnm);
    bool hasNestedPropDefault(const LString &propnm) const;
    bool isNestedPropDefault(const LString &propnm) const;

  };

  //
  // reflection support
  //
  class QLIB_API LInvokable
  {
  public:
    virtual bool hasMethod(const LString &nm) const =0;
    virtual bool invokeMethod(const LString &nm, LVarArgs &args) =0;
    
    virtual ~LInvokable() {}
  };

}

#endif

