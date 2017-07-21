// -*-Mode: C++;-*-
//
// Metaclass class
//

#ifndef QLIB_L_CLASS_HPP__
#define QLIB_L_CLASS_HPP__

#include "qlib.hpp"

#include "LString.hpp"
#include "LExceptions.hpp"

namespace qlib {

  using std::set;

  class CreationFunctor;
  class CopyCreationFunctorBase;
  class LDynamic;
  // class LWrapFactory;

  /////////////////////////////////////////////////
  // exception classes

  class ClassNotFoundException : public RuntimeException {
  public:
    ClassNotFoundException() {}
    explicit ClassNotFoundException(const LString &msg) :RuntimeException(msg) {}
  };

  class ConstructorNotFoundException : public RuntimeException {
  public:
    ConstructorNotFoundException() {}
    explicit ConstructorNotFoundException(const LString &msg) :RuntimeException(msg) {}
  };

  /////////////////////////////////////////////////

  class QLIB_API LClass : public LObject
  {
  private:


  public:
    LClass();

    virtual ~LClass();

    ///
    /// returns full-qualified system-independent name
    ///
    virtual const LString &getClassName() const =0;

    ///
    /// returns system-dependent name of this class
    /// (same as the RTTI's type_info name)
    ///
    virtual const LString &getAbiClassName() const =0;

    virtual bool isSingleton() const;

    ///
    /// Create new object by calling default ctor.
    ///
    virtual LDynamic *createObj() const =0;

    ///
    /// Create new object suitable for scripting interface.
    /// Default impl calls createObj()
    ///
    virtual LDynamic *createScrObj() const;

    // virtual LDynamic *cloneObj(const LDynamic &src) const =0;
    virtual LDynamic *dynamicCast(LDynamic *pobj) const =0;
    
    ///
    /// Call the initialization code for the class (corresponding to the class-ctor)
    /// This will be called at the class registration.
    ///
    virtual bool callInit();

    ///
    /// Call the initialization code for the class (corresponding to the class-ctor)
    /// This will be called at the finalization of the class registry.
    ///
    virtual void callFini();

    //
    /// Create instance from string representation (variation of createObj)
    //
    virtual LDynamic *createFromString(const LString &aStr) const;

    ///
    /// Create new object suitable for scripting interface.
    /// Default impl calls createFromString()
    ///
    virtual LDynamic *createScrObjFromStr(const LString &aStr) const;
  };

} // qlib

#endif // __L_CLASS_H__
