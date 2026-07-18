//
// Template utility classes for Metaclass implementation
//

#ifndef QLIB_L_CLASS_UTILS_HPP
#define QLIB_L_CLASS_UTILS_HPP

#include "qlib.hpp"

#include "LClass.hpp"
#include "LScrSmartPtr.hpp"

#include <type_traits>

using std::set;

namespace qlib {

  template <class _Type>
  class LBaseSpecClass : public LClass
  {
  private:

    /// full-qualified system-independent name of this class (i.e. includes namespace)
    LString m_strClassName;

    /// system-dependent name of this class (RTTI's type_info name)
    LString m_strAbiName;

  public:
    /// Construct without the system independent name
    LBaseSpecClass()
      : LClass(),
	m_strClassName(typeid(_Type).name()),
	m_strAbiName(typeid(_Type).name())
    {
    }

    /// Construct with both of the system independent and ABI name
    LBaseSpecClass(const char *name)
      : LClass(), m_strClassName(name), m_strAbiName(typeid(_Type).name())
    {
    }

    ~LBaseSpecClass() override {}

    /** returns full-qualified system-independent name */
    const LString &getClassName() const override {
      return m_strClassName;
    }

    /**
       returns system-dependent name of this class
       (same as the RTTI's type_info name)
    */
    const LString &getAbiClassName() const override {
      return m_strAbiName;
    }

    LDynamic *dynamicCast(LDynamic *pobj) const override
    {
      return dynamic_cast<_Type *>(pobj);
    }
  };

  //////////

  /**
     metaclass for normal classes.
     _Type may have init(), fini() and fromStringS() static methods
  */
  template <class _Type>
  class LSpecificClass : public LBaseSpecClass<_Type>
  {
  public:
    LSpecificClass() : LBaseSpecClass<_Type>()
    {
    }

    LSpecificClass(const char *name) : LBaseSpecClass<_Type>(name)
    {
    }

    ~LSpecificClass() override
    {
    }
    
  private:
    static inline
    LDynamic *createObj_helper(std::integral_constant<bool, false>) { return MB_NEW _Type(); }
    static inline
    LDynamic *createObj_helper(std::integral_constant<bool, true>) {
      LOG_DPRINTLN("createObj() is called for abstract object!!");
      return NULL;
    }

  public:
    LDynamic *createObj() const override
    {
      return createObj_helper(std::integral_constant<bool, std::is_abstract<_Type>::value>());
    }

    LDynamic *createFromString(const LString &aStr) const override
    {
      return _Type::fromStringS(aStr);
    }

    bool callInit() override { return _Type::initClass(this); }
    void callFini() override { _Type::finiClass(this); }
  };

  //////////////////////////////////////////////////////////////////////

  /**
     metaclass for singleton classes.
     _Type must has init() and fini() methods
  */
  template <class _Type>
  class LSingletonSpecificClass : public LBaseSpecClass<_Type>
  {
  public:
    LSingletonSpecificClass(const char *name) : LBaseSpecClass<_Type>(name)
    {
    }

    ~LSingletonSpecificClass() override
    {
    }
    
    LDynamic *createObj() const override
    {
      return _Type::getInstance();
    }

    bool isSingleton() const override {
      return true;
    }

    bool callInit() override { return _Type::initClass(this); }
    void callFini() override { _Type::finiClass(this); }
  };

  //////////

  ///
  ///  Metaclass for normal classes (with smart pointer support for scriptable obj)
  ///  _Type must be LScriptable derivative class
  ///
  template <class _Type>
  class LSmartPtrSupportClass : public LSpecificClass<_Type>
  {
  public:
    LSmartPtrSupportClass(const char *name) : LSpecificClass<_Type>(name)
    {
    }
    
  public:

    /// Create new object suitable for scripting interface.
    /// (i.e., SmartPtr (LScrSp) wrapped object)
    LDynamic *createScrObj() const override
    {
      //return LSpecificClass<_Type>::createObj();
      return MB_NEW qlib::LScrSp<_Type>(static_cast<_Type *>( LSpecificClass<_Type>::createObj() ));
    }

    /// Create new object suitable for scripting interface from string representation.
    /// (i.e., SmartPtr (LScrSp) wrapped object)
    LDynamic *createScrObjFromStr(const LString &aStr) const override
    {
      _Type *pNewObj = static_cast<_Type *>( LSpecificClass<_Type>::createFromString(aStr) );
      return MB_NEW qlib::LScrSp<_Type>(pNewObj);
    }

  };

}

#endif // QLIB_L_CLASS_UTILS_HPP
