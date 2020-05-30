//
// Superclass of scriptable objects
//
// $Id: LWrapper.hpp,v 1.26 2010/12/26 12:26:17 rishitani Exp $

#ifndef __QLIB_LWRAPPER_HPP__
#define __QLIB_LWRAPPER_HPP__

#include "LVarArgs.hpp"
#include "LVarArray.hpp"
#include "LVarDict.hpp"
#include "ClassRegistry.hpp"
#include "LPropSupport.hpp"
#include "PropSpec.hpp"

namespace qlib {

  class LScriptable;

  //////////////////////////////////
  // Utility classes/methods

  /// Wrapper registration error
  MB_DECL_EXCPT_CLASS(QLIB_API, WrapperException, RuntimeException);
  

  /// Function object for the wrapper impl.
  class FuncTuple
  {
  public:
    typedef bool (*FuncPtr)(LVarArgs &args);

    LString m_name;
    FuncPtr m_pfun;

  public:
    FuncTuple() : m_pfun(NULL) {}
    FuncTuple(const char *name, FuncPtr p) : m_name(name), m_pfun(p) {}

    LString getName() const { return m_name; }

    bool execute(LVarArgs &arg) {
      return (*m_pfun)(arg);
    }
  };

  ///
  /// Wrapper's superclass
  ///
  class FuncMap
  {
  public:
    typedef FuncTuple funcobj_t;
    typedef std::map<LString, funcobj_t *> funcmap_t;
    typedef std::map<LString, LString> propdb_t;
    typedef std::map<LString, LVariant> deftab_t;
    typedef std::map<LString, int> enumtab_t;
    
    funcmap_t m_funcmap;
    propdb_t m_propdb;
    deftab_t m_deftab;
    enumtab_t m_enumtab;

    ////////////////////////////////////////
    // cleanup

    // remove all data
    void cleanup() {
      funcmap_t::const_iterator iter = m_funcmap.begin();
      for (; iter!=m_funcmap.end(); ++iter)
	delete iter->second;
      m_funcmap.clear();
      m_propdb.clear();
      m_deftab.clear();
      m_enumtab.clear();
    }

    ////////////////////////////////////////
    // setup (method/prop)

    /// Register a new function object
    /// putFunc() will do nothing, if the same func has already been registered.
    /// (This is required to implement the overloading of methods)
    void putFunc(const char *fname, FuncTuple::FuncPtr pfunc) {
      funcmap_t::const_iterator iter = m_funcmap.find(fname);
      if (iter!=m_funcmap.end()) {
        // do nothing
        return;
      }

      funcobj_t *pft = MB_NEW funcobj_t(fname, pfunc);
      bool res = ( m_funcmap.insert(funcmap_t::value_type(fname, pft)) ).second;
      if (!res) {
        MB_THROW(WrapperException, "LWrapper.putFunc error");
      }
    }

    /// Register a new attribute (typename of prop, etc)
    void putPropAttr(const char *name, const char *typenm) {
      propdb_t::const_iterator iter = m_propdb.find(name);
      if (iter!=m_propdb.end()) {
        // ignore error
        return;
      }
      bool res = ( m_propdb.insert(propdb_t::value_type(name, typenm)) ).second;
      if (!res) {
        MB_THROW(WrapperException, "LWrapper.putPropAttr error");
      }
    }

    ////////////////////////////////////////
    // primitive access methods

    funcobj_t *getFunc(const qlib::LString &name) const
    {
      funcmap_t::const_iterator iter = m_funcmap.find(name);
      if (iter==m_funcmap.end()) {
	// MB_DPRINTLN("getFunc %s not found", name.c_str());
	return NULL;
      }
      return iter->second;
    }

    funcobj_t *getSetPropFunc(const qlib::LString &propnm) const
    {
      LString name = "set_"+propnm;
      return getFunc(name);
    }

    funcobj_t *getGetPropFunc(const qlib::LString &propnm) const
    {
      LString name = "get_"+propnm;
      return getFunc(name);
    }

    funcobj_t *getMthFunc(const qlib::LString &propnm) const
    {
      LString name = "mth_"+propnm;
      return getFunc(name);
    }

    ////////

    bool hasProp(const LString &propnm) const
    {
      if (getGetPropFunc(propnm)!=NULL)
	return true;
      else
	return false;
    }
    
    bool hasWProp(const LString &propnm) const
    {
      if (getSetPropFunc(propnm)!=NULL)
	return true;
      else
	return false;
    }
    
    bool setProp(qlib::LScriptable *pthis,
		 const qlib::LString &propnm,
		 const qlib::LVariant &val)
    {
      FuncMap::funcobj_t *pfunc = getSetPropFunc(propnm);
      if (pfunc==NULL) {
	LOG_DPRINTLN("setProp %s not found", propnm.c_str());
	return false;
      }
      //MB_DPRINTLN("*** setProp %s", propnm.c_str());

      LVarArgs args(1);
      args.setThisPtr(pthis);
      args.at(0) = val;
      
      return pfunc->execute(args);
    }

    bool getProp(const qlib::LScriptable *pthis,
		 const qlib::LString &propnm,
		 qlib::LVariant &val)
    {
      FuncMap::funcobj_t *pfunc = getGetPropFunc(propnm);
      if (pfunc==NULL) {
	LOG_DPRINTLN("getProp %s not found", propnm.c_str());
	return false;
      }
      
      LVarArgs args(0);
      args.setThisPtr( const_cast<qlib::LScriptable *>(pthis) );
      
      //MB_DPRINTLN("*** getProp %s", propnm.c_str());
      if (!pfunc->execute(args))
	return false;
      
      val = args.retval();
      return true;
    }

    void getPropNames(std::set<LString> &rs) const
    {
      propdb_t::const_iterator iter = m_propdb.begin();
      for (; iter!=m_propdb.end(); ++iter) {
        // skip attribute definitions
        if (iter->first.startsWith("@"))
          continue;
	rs.insert(iter->first);
      }
    }

    LString getPropTypeName(const char *nm) const
    {
      propdb_t::const_iterator iter = m_propdb.find(nm);
      if (iter==m_propdb.end()) return LString();
      return iter->second;
    }

    bool isNoPersist(const char *nm) const
    {
      LString key = LString("@") + nm + "_nopersist";
      propdb_t::const_iterator iter = m_propdb.find(key);
      if (iter==m_propdb.end())
        return false;
      return (iter->second.equals("yes"));
    }

    bool implements(const char *ifname) const
    {
      LString key = LString("@implement_") + ifname;
      propdb_t::const_iterator iter = m_propdb.find(key);
      if (iter==m_propdb.end())
        return false;
      return (iter->second.equals("yes"));
    }

    //////////

    bool hasMethod(const qlib::LString &mthnm) const {
      if (getMthFunc(mthnm)!=NULL)
	return true;
      else
	return false;
    }

    bool invokeMethod(const qlib::LScriptable *pthis,
		      const qlib::LString &mthnm,
		      LVarArgs &args)
    {
      FuncMap::funcobj_t *pfunc = getMthFunc(mthnm);
      if (pfunc==NULL) {
	LOG_DPRINTLN("invokeMethod %s not found", mthnm.c_str());
	return false;
      }
      //MB_DPRINTLN("*** invk mth %s", mthnm.c_str());
      
      args.setThisPtr( const_cast<qlib::LScriptable *>(pthis) );
      
      if (!pfunc->execute(args))
	return false;
      
      return true;
    }

    //////////

    ///
    /// Register a new default value
    ///
    bool putDefVal(const char *name, const LVariant &value)
    {
      bool res;
      deftab_t::iterator iter = m_deftab.find(name);
      if (iter!=m_deftab.end()) {
        // erase old value (to override the superclass's default value)
        m_deftab.erase(iter);
        res = false;
      }
      else {
        res = true;
      }

      m_deftab.insert(deftab_t::value_type(name, value));
      return res;
    }

    // get a default value
    bool getDefVal(const qlib::LString &propnm,
		   qlib::LVariant &val) const
    {
      deftab_t::const_iterator iter = m_deftab.find(propnm);
      if (iter==m_deftab.end()) {
	// MB_DPRINTLN("getFunc %s not found", propnm.c_str());
	return false;
      }

      val = iter->second;
      return true;
    }

    bool hasDefVal(const qlib::LString &name) const
    {
      deftab_t::const_iterator iter = m_deftab.find(name);
      if (iter==m_deftab.end()) {
	// MB_DPRINTLN("getFunc %s not found", name.c_str());
	return false;
      }
      return true;
    }

    //////////

    static inline
    LString makeEnumKeyName(const LString &propname,
			const LString &enumname) {
      return propname+"/"+enumname;
    }

    // register a new enum definition
    bool putEnumDef(const LString &propname,
		    const LString &enumname,
		    int value) {
      LString name = makeEnumKeyName(propname, enumname);
      enumtab_t::const_iterator iter = m_enumtab.find(name);
      if (iter!=m_enumtab.end())
	return false;
      m_enumtab.insert(enumtab_t::value_type(name, value));
      return true;
    }

    // get a enum definition (key --> int value)
    bool getEnumDef(const LString &propname,
		    const LString &enumname,
		    int &value) const
    {
      LString name = makeEnumKeyName(propname, enumname);
      enumtab_t::const_iterator iter = m_enumtab.find(name);
      if (iter==m_enumtab.end()) {
	// MB_DPRINTLN("getFunc %s not found", name.c_str());
	return false;
      }

      value = iter->second;
      return true;
    }

    // get a enum definition (int value-->key)
    bool getEnumDef(const LString &propname,
		    int value,
		    LString &enumname) const
    {
      LString hdrname = propname+"/";
      int nhdr = hdrname.length();
      enumtab_t::const_iterator iter = m_enumtab.begin();
      for (; iter!=m_enumtab.end(); ++iter) {
	if (! iter->first.startsWith(hdrname) )
	  continue;
	if (value==iter->second) {
	  // found
	  enumname = iter->first.substr(nhdr);
	  return true;
	}
      }

      // not found
      return false;
    }

    // get a enum definition
    int getEnumDefSet(const LString &propname,
		      EnumDef &rs) const
    {
      LString hdrname = propname+"/";
      int nhdr = hdrname.length();
      int nfound = 0;
      enumtab_t::const_iterator iter = m_enumtab.begin();
      for (; iter!=m_enumtab.end(); ++iter) {
	if (! iter->first.startsWith(hdrname) )
	  continue;
	LString enumkey = iter->first.substr(nhdr);
	rs.insert(EnumDef::value_type(enumkey, iter->second));
	++nfound;
      }

      return nfound;
    }

    bool hasEnumDef(const LString &propname,
		    const LString &enumname) const
    {
      LString name = makeEnumKeyName(propname, enumname);
      enumtab_t::const_iterator iter = m_enumtab.find(name);
      if (iter==m_enumtab.end()) {
	// MB_DPRINTLN("getFunc %s not found", name.c_str());
	return false;
      }
      return true;
    }

  };

  ////////////////////////////////////
  
  class QLIB_API LWrapperImpl : public qlib::FuncMap
  {

  public:
    LWrapperImpl();

    ~LWrapperImpl();

    //////////

    bool getPropSpec(const qlib::LString &name, PropSpec *pspec) const;

    // reset property to the default value
    template <class _Class>
    bool resetProp(const qlib::LString &name,
		   _Class *pthat)
    {
      LVariant var; // transient
      if (!hasWProp(name))
        return false; // readonly (-->cannot reset)
      if (!getDefVal(name, var))
	return false; // no default value
      if (!setProp(pthat, name, var))
	return false; // set failed
      // update the parent data
      pthat->setupParentData(name);
      return true;
    }

    // reset all propertis to their default values
    template <class _Class>
    void resetAllProps(_Class *pthat)
    {
      // MB_DPRINTLN("ResetAllProp<%s> called", typeid(_Class).name());
      std::set<LString> nameset;
      getPropNames(nameset);
      std::set<LString>::const_iterator iter = nameset.begin();
      std::set<LString>::const_iterator eiter = nameset.end();
      for (; iter!=eiter; ++iter) {
	const LString &name = *iter;
	// MB_DPRINTLN("ResetAllProp: %s", name.c_str());
	if (!hasDefVal(name)) continue;
        if (!hasWProp(name)) continue; // readonly (-->cannot reset)
	resetProp<_Class>(name, pthat);
	// MB_DPRINTLN("ResetAllProp: %s OK", name.c_str());
      }
      // MB_DPRINTLN("ResetAllProp<%s> END", typeid(_Class).name());
    }

    template <class _Wrapper>
    static inline
    bool setPropHelper(const qlib::LString &name,
		       const qlib::LVariant &rvalue,
		       typename _Wrapper::client_t *pthat)
    {
      bool res = _Wrapper::getInstance()->setProp(pthat, name, rvalue);
      if (!res) return false;

      pthat->setupParentData(name);
      return true;
    }

    //////////
  
    template <class _MetaClass>
    static inline
    void regClassHelper()
    {
      _MetaClass::init();
      qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();     
      pMgr->regClassObj(_MetaClass::getInstance());                          
    }
  
    template <class _MetaClass>
    static inline
    void unregClassHelper()
    {
      qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();     
      bool res = pMgr->unregClassObj<typename _MetaClass::client_t>();                          
      MB_ASSERT(res);                                                     
      _MetaClass::fini();
    }

    ////////////////////////////////////////////////////////////
    // Type conversion methods for mcwgen3-generated wrapper

    //////////
    // variant conversion methods (variant --> C++)

    ///////////////
    // Boolean

    static void convToBoolValue(LBool &aDest, const LVariant &aSrc, const LString &propname);

    static inline
    void setByBoolValue(LVariant &aDest, LBool aSrc, const LString &propname)
    {
      aDest.setBoolValue(aSrc);
    }

    ///////////////
    // Integer

    static void convToIntValue(LInt &aDest, const LVariant &aSrc, const LString &propname);

    static inline
    void setByIntValue(LVariant &aDest, LInt aSrc, const LString &propname)
    {
      aDest.setIntValue(aSrc);
    }

    ///////////////
    // Real

    static void convToRealValue(LReal &aDest, const LVariant &aSrc, const LString &propname);

    static inline
    void setByRealValue(LVariant &aDest, LReal aSrc, const LString &propname)
    {
      aDest.setRealValue(aSrc);
    }

    ///////////////
    // String

    static inline
    void convToStringValue(LString &aDest, const LVariant &aSrc, const LString &propname)
    {
      aDest = aSrc.getStringValue();
    }

    static inline
    void setByStringValue(LVariant &aDest, const LString &aSrc, const LString &propname)
    {
      aDest.setStringValue(aSrc);
    }

    ///////////////
    // List
    // TO DO: implementation

    ///////////////
    // Array
    //   substantial class of "List" type is LVarArray
    
    static inline
    void convToArrayValue(LVarArray &aDest, const LVariant &aSrc, const LString &propname)
    {
      aDest = LVarArray(*aSrc.getArrayPtr());
    }

    static inline
    void setByArrayValue(LVariant &aDest, const LVarArray &aSrc, const LString &propname)
    {
      aDest.setArrayValue(aSrc);
    }

    ///////////////
    // Dict
    
    static inline
    void convToDictValue(LVarDict &aDest, const LVariant &aSrc, const LString &propname)
    {
      aDest = LVarDict(*aSrc.getDictPtr());
    }

    static inline
    void setByDictValue(LVariant &aDest, const LVarDict &aSrc, const LString &propname)
    {
      aDest.setDictValue(aSrc);
    }

    ///////////////
    // Enum
    template <class _Wrapper>
    static inline
    void convToEnumInt(LInt &aDest, const LVariant &value, const LString &name) {
      if (value.isInt()) {
	aDest = value.getIntValue();
	return;
      }
      LString enumkey = value.toString();
      int rval;
      LWrapperImpl *pthat = _Wrapper::getInstance();
      if (!pthat->getEnumDef(name, enumkey, rval)) {
	LString msg = LString::format("ConvEnum: cannot convert %s/%s to enum",
				      name.c_str(), enumkey.c_str());
	MB_THROW(InvalidCastException, msg);
	return;
      }
      aDest = rval;
    }

    template <class _Wrapper>
    static inline
    void setByEnumInt(LVariant &aDest, LInt aSrc, const LString &name) {
      LWrapperImpl *pthat = _Wrapper::getInstance();
      LString enumkey;
      // int-->enumkey conversion
      if (!pthat->getEnumDef(name, aSrc, enumkey)) {
	LString msg = LString::format("ConvEnum: cannot convert %s/%d to enum",
				      name.c_str(), aSrc);
	MB_THROW(InvalidCastException, msg);
	return;
      }
      aDest.setEnumValue(enumkey);
    }

    static inline
    void setByEnumInt(LVariant &aDest, const LString &aSrc, const LString &name) {
      aDest.setEnumValue(aSrc);
    }

    ///////////////
    // Object (1) normal pointer

    template <typename _Type>
    static inline
    void convToObjectPtrT(_Type *&aDest, const LVariant &aSrc, const LString &propname)
    {
      aDest = aSrc.getObjectPtrT<_Type>();
    }

    template <typename _Type>
    static inline
    void setByObjectPtrT(LVariant &aDest, const _Type *aSrc, const LString &propname)
    {
      LScriptable *pCopy = aSrc->copy();
      aDest.setObjectPtr(pCopy);
    }

    // string to obj conversion util
    template <typename _Type>
    static inline
    _Type *tryConvStrToObj_impl(const LString &aSrc, const boost::false_type&)
    {
      // doesn't have fromString() static method
      return NULL;
    }

    template <typename _Type>
    static inline
    _Type *tryConvStrToObj_impl(const LString &aSrc, const boost::true_type&)
    {
      qlib::LClass *pCls = _Type::getClassObjS();
      _Type *pObj = static_cast<_Type *>(pCls->createFromString(aSrc));
      if (pObj==NULL) {
        LString msg =
          LString::format("Cannot convert str \"%s\" to object<%s>",
                          aSrc.c_str(), typeid(_Type).name());
        MB_THROW(InvalidCastException, msg);
      }
      return pObj;
    }

    template <typename _Type>
    static inline
    _Type *tryConvStrToObj(const LVariant &aSrc)
    {
      if (aSrc.isString()) {
        const LString &strval = aSrc.getStringValue();
	typedef typename _Type::has_fromString HFS;
        return tryConvStrToObj_impl<_Type>(strval, HFS());
      }
      return NULL;
    }

    // Object (2) value/reference
    template <typename _Type>
    static inline
    void convToObjectRefT(_Type &aDest, const LVariant &aSrc, const LString &propname)
    {
      _Type *pObj = tryConvStrToObj<_Type>(aSrc);
      if (pObj!=NULL) {
	aDest = *pObj;
        delete pObj;
	return;
      }      

      aDest = *aSrc.getObjectPtrT<_Type>();
    }

    template <typename _Type>
    static inline
    void setByObjectRefT(LVariant &aDest, const _Type &aSrc, const LString &propname)
    {
      LScriptable *pCopy = aSrc.copy();
      aDest.setObjectPtr(pCopy);
    }

    // Object (3) smart pointer (value)

    template <typename _Type>
    static inline
    void convToSPtrValueT(LScrSp<_Type> &aDest, const LVariant &aSrc, const LString &propname)
    {
      _Type *pObj2 = tryConvStrToObj<_Type>(aSrc);
      if (pObj2!=NULL) {
        aDest = LScrSp<_Type>(pObj2);
        return;
      }

      LScriptable *pObj = aSrc.getObjectPtr();

      if (pObj->isSmartPtr()) {
	// This cast should not be fail
	LSupScrSp *pBaseSP = static_cast<LSupScrSp *>(pObj);
	// This performs dynamic_cast
	aDest = LScrSp<_Type>(*pBaseSP);
	//return;
      }
      else {
	_Type *pCasted = dynamic_cast<_Type *>(pObj);
	if (pCasted==NULL) {
	  LString msg =
	    LString::format("Cannot convert object variant (%s) to %s",
			    typeid(*pObj).name(), typeid(_Type).name());
	  MB_THROW(InvalidCastException, msg);
	}

	if (pObj->getSpRefCounter()!=NULL) {
	  // raw object, already reference-counted by LScrSp<>
	  aDest = LScrSp<_Type>(pCasted);
	  //return;
	}
	else {
	  // new object, not reference-counted by LScrSp<>
	  aDest = LScrSp<_Type>( static_cast<_Type*>(pCasted->copy()) );
	  //return;
	}
      }
    }

    // set a smart ptr value (i.e. copy of aValue, but not a copy of obj)
    template <typename _Type>
    static inline
    void setBySPtrValueT(LVariant &aDest, const LScrSp<_Type> &aSrc, const LString &propname)
    {
      // Don't copy a null reference
      if (aSrc.isnull()) {
	aDest.setNull();
	return;
      }
      LScriptable *pCopy = aSrc.copy();
      aDest.setObjectPtr(pCopy);
    }

  };

  //////////////////////////////////////////////////////////////

#define MC_DYNCLASS_IMPL2(CLASSNAME, WRAPPER)         \
  qlib::LClass *CLASSNAME::getClassObjS() {           \
    return WRAPPER::getInstance();                    \
  }                                                   \
  qlib::LClass *CLASSNAME::getClassObj() const {      \
    return WRAPPER::getInstance();                    \
  }                                                   \
  void CLASSNAME::regClass()                          \
  {                                                   \
    qlib::LWrapperImpl::regClassHelper<WRAPPER>();    \
  }                                                   \
  void CLASSNAME::unregClass()                        \
  {                                                   \
    qlib::LWrapperImpl::unregClassHelper<WRAPPER>();  \
  }


#define MC_INVOKE_IMPL2(CLASSNAME, WRAPPER)                             \
  bool CLASSNAME::hasMethod(const qlib::LString &nm) const              \
  {                                                                     \
    return WRAPPER::getInstance()->hasMethod(nm);                       \
  }                                                                     \
  bool CLASSNAME::invokeMethod(const qlib::LString &nm,                 \
                               qlib::LVarArgs &args)                    \
  {                                                                     \
    return WRAPPER::getInstance()->invokeMethod(this, nm, args);        \
  } \
qlib::LClass *CLASSNAME::getScrClassObj() const\
{ \
  return CLASSNAME::getClassObj(); \
} \
bool CLASSNAME::implements(const qlib::LString &nm) const \
{ \
    return WRAPPER::getInstance()->implements(nm); \
} \


#define MC_PROP_IMPL2(CLASSNAME, WRAPPER)                               \
  bool CLASSNAME::getPropSpecImpl(const qlib::LString &name,		\
				  qlib::PropSpec *pspec) const		\
  {                                                                     \
    return WRAPPER::getInstance()->getPropSpec(name, pspec);		\
  }									\
    									\
  bool CLASSNAME::getPropertyImpl(const qlib::LString &name,		\
				  qlib::LVariant &result) const		\
  {									\
    return WRAPPER::getInstance()->getProp(this, name, result);		\
  }									\
    									\
  bool CLASSNAME::setPropertyImpl(const qlib::LString &nm,		\
				  const qlib::LVariant &rvalue)		\
  {									\
    return qlib::LWrapperImpl::setPropHelper<WRAPPER>(nm, rvalue, this); \
  }									\
    									\
  bool CLASSNAME::resetPropertyImpl(const qlib::LString &nm)		\
  {									\
    return WRAPPER::getInstance()->resetProp<CLASSNAME>(nm, this);	\
  }									\
									\
  void CLASSNAME::resetAllProps()					\
  {									\
    return WRAPPER::getInstance()->resetAllProps<CLASSNAME>(this);	\
  }									\
    									\
  void CLASSNAME::getPropNames(std::set<qlib::LString> &rs) const	\
  {									\
    WRAPPER::getInstance()->getPropNames(rs);				\
  }

}


#endif // __QLIB_LWRAPPER_HPP__
