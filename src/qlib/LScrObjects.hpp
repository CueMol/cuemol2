//
// Superclass of scriptable objects
//

#ifndef QLIB_SCR_OBJECTS_HPP_INCLUDED__
#define QLIB_SCR_OBJECTS_HPP_INCLUDED__

#include "qlib.hpp"
#include "LScriptable.hpp"
#include "LVariant.hpp"

namespace qlib {

  //class LVariant;
  class LPropEvent;
  class LPropEventListener;
  class LPropEventCaster;

  class QLIB_API LScrObjBase : public LScriptable
  {
  protected:
    uid_t m_rootuid;
    LString m_thisname;
    
    LPropEventCaster *m_pEvtCaster;

  public:
    LScrObjBase();
    virtual ~LScrObjBase();

    typedef boost::false_type has_fromString;

  public:
    //////////////////////
    // property support (high-level) interface
    virtual bool getProperty(const LString &propnm, LVariant &presult) const;
    virtual bool setProperty(const LString &propnm, const LVariant &pvalue);

    virtual bool hasProperty(const LString &propnm) const;
    virtual bool hasWritableProperty(const LString &propnm) const;
    virtual LString getPropTypeName(const LString &) const;

    virtual bool resetProperty(const LString &propnm);
    virtual bool hasPropDefault(const LString &propnm) const;
    // virtual bool isPropDefault(const LString &propnm) const;

    // property event (implementation)
    virtual void nodePropChgImpl(LPropEvent &ev);
    virtual void firePropChanged(LPropEvent &ev, const LString &parentname);

    virtual uid_t getRootUID() const;

    // default state handling
    virtual void setDefaultPropFlag(const LString &propnm, bool bflag) =0;

    //////////////////////
    // scriptable support

    virtual bool isStrConv() const;
    virtual bool fromString(const LString &src);
    virtual LString toString() const;

    //////////////////////
    // serialization

    virtual void writeTo2(LDom2Node *pNode) const;
    virtual void readFrom2(LDom2Node *pNode);

    //////////////////////
    // convenience methods

    const LString &getThisName() const { return m_thisname; }

    /*// XXX ATTN: this method returns NULL or addRefed ptr!!
    bool handleNestedProp(const LString &name, LString &last_name,
			  LVariant &rval) const;*/

    int addPropListener(LPropEventListener *pL);
    bool removePropListener(LPropEventListener *pL);
    void setupParentData(const LString &propname);

  };

  ////////////////////////////////////////

  class LDefaultFlagImpl;

  /// Scriptable object supporting instance default values
  class QLIB_API LDefSupportScrObjBase : public LScrObjBase
  {
  private:
    LDefaultFlagImpl *m_pdf;

  public:
    typedef LScrObjBase super_t;

    /// default ctor
    LDefSupportScrObjBase();

    /// dtor
    virtual ~LDefSupportScrObjBase();

    virtual bool isPropDefault(const LString &propnm) const;
    virtual void setDefaultPropFlag(const LString &propnm, bool bflag);

    /// Has the property default value (of class or instance)?
    virtual bool hasPropDefault(const LString &propnm) const;

    // /// set instance default value
    // virtual bool setInstDefault(const LString &name, const LVariant &value);

    // copy default flag
    void copyDefaultFlags(const LDefSupportScrObjBase &src);
  };

  ////////////////////////////////////////

  class QLIB_API LSimpleCopyScrObject 
       : public LDefSupportScrObjBase, public LCloneableObject
  {
  public:
    typedef LDefSupportScrObjBase super_t;

  private:

  public:
    /// default ctor
    LSimpleCopyScrObject() : super_t() {}
    
    /// copy ctor
    LSimpleCopyScrObject(const LSimpleCopyScrObject &) : super_t() {}

    /// copy operator
    const LSimpleCopyScrObject &operator=(const LSimpleCopyScrObject &arg)
    {
      return *this;
    }

    virtual LScriptable *copy() const;
    virtual void destruct();
  };

  class QLIB_API LNoCopyScrObject : public LDefSupportScrObjBase, public LObject
  {
  public:
    typedef LDefSupportScrObjBase super_t;

  private:

    /// copy ctor
    LNoCopyScrObject(const LNoCopyScrObject &) : super_t() {}

    /// copy operator
    const LNoCopyScrObject &operator=(const LNoCopyScrObject &arg)
    {
      return *this;
    }

  public:

    /// default ctor
    LNoCopyScrObject() : super_t() {}

    virtual LScriptable *copy() const;
    virtual void destruct();
  };

  class QLIB_API LSingletonScrObject : public LDefSupportScrObjBase, public LObject
  {
  private:
    typedef LDefSupportScrObjBase super_t;

    /// copy ctor
    LSingletonScrObject(const LSingletonScrObject &) : super_t() {}

    /// copy operator
    const LSingletonScrObject &operator=(const LSingletonScrObject &arg)
    {
      return *this;
    }

  public:
    LSingletonScrObject() : super_t() {}

    virtual LScriptable *copy() const;
    virtual void destruct();
    //virtual bool isPropDefault(const LString &propnm) const;
    //virtual void setDefaultPropFlag(const LString &propnm, bool bflag);
  };

}

#endif // __QLIB_PROP_CONTAINER_HPP__
