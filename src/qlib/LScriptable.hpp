//
// Superclass of scriptable objects
//

#ifndef QLIB_LSCRIPTABLE_HPP_INCLUDED
#define QLIB_LSCRIPTABLE_HPP_INCLUDED

#include "qlib.hpp"

#include "LDynamic.hpp"
#include "LPropSupport.hpp"
#include "LSerializable.hpp"

namespace qlib {
  class LVarArgs;
  class LVariant;

  class LWrapper;

  //
  // Base interface for the scriptable objects (including smart ptr)
  //
  class QLIB_API LScriptable
       : public LDynamic, public LPropSupport, public LInvokable, public LSerializable
  {
  private:
    int *m_pRefCounter;

  public:

    LScriptable() : m_pRefCounter(NULL) {}
    LScriptable(const LScriptable &) : m_pRefCounter(NULL) {}
    virtual ~LScriptable() {}

    ///////////////////////////
    // memory management
    //
    virtual LScriptable *copy() const =0;
    virtual void destruct() =0;

    ///////////////////////////
    //
    /// Deserialization from string
    virtual LString toString() const =0;
    /// Is convertable between string?
    virtual bool isStrConv() const =0;

    /// Get metaclass obj of scriptable class.
    /// Returns the nearest MC_SCRIPTABLE ancestor's class object;
    /// MC_DYNCLASS-only classes do not override this, so virtual
    /// dispatch falls through to the parent's MC_INVOKE_IMPL2 override.
    /// External scripting bridges must call this (not getClassObj)
    /// when surfacing a class name to script -- see
    /// docs/architecture/cpp-scripting-bridge.md.
    virtual LClass *getScrClassObj() const =0;
    
    /// scriptable interface query method
    virtual bool implements(const LString &ifname) const =0;

    ///////////////////////////
    // smartpointer support

    virtual bool isSmartPtr() const { return false; }
    // get the wrapped raw ptr if this is smartptr, otherwise returns null.
    virtual LScriptable *getSPInner() const { return NULL; }

    // these should not be called (used by LScrSP implementation only)
    /// Returns ptr to refcounter, if this is managed by smartptr
    int *getSpRefCounter() const { return m_pRefCounter; }
    void setSpRefCounter(int *p) { m_pRefCounter = p; }

  };

  LString QLIB_API getPropsJSONImpl(LScriptable *pObj);


}

#endif // __QLIB_SCR_OBJECT_HPP__
