//
// Singleton class for
// Metaclass object management
//
// $Id: ClassRegistry.hpp,v 1.3 2008/12/23 12:04:54 rishitani Exp $

#ifndef __L_CLASS_REGISTRY_H__
#define __L_CLASS_REGISTRY_H__

#include "qlib.hpp"

#include "LString.hpp"
#include "LClass.hpp"
using std::map;

namespace qlib {

  //class LClass;
  class LDynamic;

  /**
     Singleton class for
     Metaclass object management
   */
  class QLIB_API ClassRegistry
  {
  private:
    typedef map<LString, LClass *> ClassTable;

    /** ABI name--> meta class obj table */
    ClassTable m_abitab;

    /** System-independent name --> meta class obj table */
    ClassTable m_nametab;
    
    static ClassRegistry *m_sInstance;

  public:
    virtual ~ClassRegistry();
    
    ///////////////////////

    /**
       Register a new metaclass object pcls.
       pcls object is owned by this manager.
     */
    bool regClassObj(LClass *pcls);

    /**
       Find and Unregister a metaclass object pcls.
       pcls will be destructed.
     */
    bool unregClassObj(const std::type_info &t);

    /**
       Convenience method for unregClassObj()
    */
    template <typename _Type>
    bool unregClassObj() {
      return unregClassObj(typeid(_Type));
    }

    /**
       Check if the class _Type is already registered.
    */
    template <typename _Type>
    bool isRegistered() const {
      return isRegistered(typeid(_Type));
    }

    bool isRegistered(const std::type_info &t) const {
      ClassTable::const_iterator i = m_abitab.find(t.name());
      return i!=m_abitab.end();
    }

    ///////////////////////

    /** get class object by system dependent ABI's name (not throw exception) */
    LClass *getClassObjByAbiNameNx(const LString &name) noexcept;

    /** get class object by system dependent ABI's name (throws exception) */
    LClass *getClassObjByAbiName(const LString &name);

    /**
       Get class object by RTTI's type_info structure
    */
    template <class _Type>
    LClass *getClassObj() {
      return getClassObjByAbiName(typeid(_Type).name());
    }

    /**
       Get class object by system-independent class name.
    */
    LClass *getClassObj(const LString &name);

    /**
       Create an instance of the class by its name.
       Default constructor will be called.
    */
    LDynamic *createObj(const LString &name);
    // LDynamic *cloneObj(const LDynamic &src);

    /**
       Get the instance of a singleton class by name.
       Returns NULL if the class is not a singleton.
    */
    LDynamic *getSingletonObj(const LString &name);

    /// Get class objects of derivative classes of _Type
    template<class _Type>
    void getDerivClasses(std::list<LClass *> &list)
    {
      ClassTable::const_iterator iter = m_abitab.begin();
      for (; iter!=m_abitab.end(); ++iter) {
	LClass *pcls = iter->second;
	if (pcls->instanceOf<_Type>())
	  list.push_back(pcls);
      }
    }

    /// Get all (qif) class names registered
    void getAllClassNames(std::list<LString> &ls);

    ///////////////////////

    static bool init();
    static void fini();

    /** get the singleton object */
    static ClassRegistry *getInstance() {
      return m_sInstance;
    }

  };

}

#endif //  __L_CLASS_REGISTRY_H__
