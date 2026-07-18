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
    ~LScrObjBase() override;

    typedef std::false_type has_fromString;

  public:
    //////////////////////
    // property support (high-level) interface
    bool getProperty(const LString &propnm, LVariant &presult) const override;
    bool setProperty(const LString &propnm, const LVariant &pvalue) override;

    bool hasProperty(const LString &propnm) const override;
    bool hasWritableProperty(const LString &propnm) const override;
    LString getPropTypeName(const LString &) const override;

    bool resetProperty(const LString &propnm) override;
    bool hasPropDefault(const LString &propnm) const override;
    // virtual bool isPropDefault(const LString &propnm) const;
    bool getPropDefault(const LString &propnm, LVariant &value) override;

    // property event (implementation)
    virtual void nodePropChgImpl(LPropEvent &ev);
    virtual void firePropChanged(LPropEvent &ev, const LString &parentname);

    uid_t getRootUID() const override;

    // default state handling
    virtual void setDefaultPropFlag(const LString &propnm, bool bflag) =0;

    //////////////////////
    // scriptable support

    bool isStrConv() const override;
    virtual bool fromString(const LString &src);
    LString toString() const override;

    //////////////////////
    // serialization

    void writeTo2(LDom2Node *pNode) const override;
    void readFrom2(LDom2Node *pNode) override;

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
    ~LDefSupportScrObjBase() override;

    bool isPropDefault(const LString &propnm) const override;
    void setDefaultPropFlag(const LString &propnm, bool bflag) override;

    /// Has the property default value (of class or instance)?
    bool hasPropDefault(const LString &propnm) const override;

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

    LScriptable *copy() const override;
    void destruct() override;
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

    LScriptable *copy() const override;
    void destruct() override;
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

    LScriptable *copy() const override;
    void destruct() override;
    //virtual bool isPropDefault(const LString &propnm) const;
    //virtual void setDefaultPropFlag(const LString &propnm, bool bflag);
  };

}

#endif // __QLIB_PROP_CONTAINER_HPP__
