//
// Property container with std::map implementation
//
// $Id: LMapPropContainer.hpp,v 1.2 2009/08/15 11:29:04 rishitani Exp $

#ifndef __QLIB_MAP_PROP_CONTAINER_HPP__
#define __QLIB_MAP_PROP_CONTAINER_HPP__

#if 0

#include "qlib.hpp"
#include "LPropContainer.hpp"
#include "LVariant.hpp"

namespace qlib {

  class QLIB_API LMapPropContainer : public LPropContainer
  {
  private:
    struct PropEnt {
      LVariant value;
      bool bWritable;
      LString typenm;
    };

    typedef std::map<LString, PropEnt> PropMap;
    PropMap m_props;

  public:
    LMapPropContainer() : LPropContainer() {}
    virtual ~LMapPropContainer();

  public:
    // property support
    virtual bool hasProperty(const LString &propnm) const;
    virtual bool hasWritableProperty(const LString &propnm) const;
    virtual bool getProperty(const LString &propnm, LVariant &presult) const;
    virtual bool setProperty(const LString &propnm, const LVariant &pvalue);
    virtual void getPropNames(std::set<LString> &) const;
    virtual const char *getPropTypeName(const char *) const;
    
    // property event (implementation)
    // virtual void nodePropChgImpl(const LPropEvent &ev);
    // virtual void firePropChanged(const LPropEvent &ev, const LString &parentname);
    // virtual uid_t getRootUID() const;

    //////////////////////
    // serialization

    virtual void writeTo(ObjOutStream &oos) const;
    virtual void readFrom(ObjInStream &ois);

    //////////////////////
    // specific methods
    
    bool addProperty(const LString &propnm, bool bWritable, const LString &typenm, const LVariant &inivalue);
    bool removeProperty(const LString &propnm);

  };

}

#endif

#endif // __QLIB_PROP_CONTAINER_HPP__
