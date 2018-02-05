/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
//
// Metaclass utilities
//
//  $Id: mcutils.hpp,v 1.20 2010/09/15 15:42:44 rishitani Exp $

#ifndef __MC_UTILS_H__
#define __MC_UTILS_H__

#include "qlib.hpp"

//
// dynamic class macros
//

#define MC_DYNCLASS \
  public: \
    virtual qlib::LClass *getClassObj() const; \
    static void regClass(); \
    static void unregClass(); \
    static qlib::LClass *getClassObjS(); \

#define MC_DYNCLASS_IMPL(fqclsnm, commonname, mcclsname)                \
  static qlib::LClass *sClassObj_##commonname;                          \
  qlib::LClass *fqclsnm::getClassObjS()                                 \
  {                                                                     \
    return sClassObj_##commonname;                                      \
  }                                                                     \
  qlib::LClass *fqclsnm::getClassObj() const                            \
  {                                                                     \
    return sClassObj_##commonname;                                      \
  }                                                                     \
  void fqclsnm::regClass()                                              \
  {                                                                     \
    sClassObj_##commonname = MB_NEW mcclsname(#commonname);                \
    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();     \
    pMgr->regClassObj(sClassObj_##commonname);                          \
  }                                                                     \
  void fqclsnm::unregClass()                                            \
  {                                                                     \
    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();     \
    bool res = pMgr->unregClassObj<fqclsnm>();                          \
    MB_ASSERT(res);                                                     \
    delete sClassObj_##commonname;                                      \
    sClassObj_##commonname = NULL;                                      \
  }

#define MC_CLONEABLE \
  public: \
    virtual qlib::LCloneableObject *clone() const; \

#define MC_CLONEABLE_IMPL(fqclsnm) \
qlib::LCloneableObject *fqclsnm::clone() const \
{ \
  return MB_NEW fqclsnm(*this); \
}


#define MC_SCRIPTABLE                                                   \
  MC_DYNCLASS;                                                          \
  virtual bool getPropertyImpl(const qlib::LString &propnm,             \
                               qlib::LVariant &presult) const;          \
  virtual bool setPropertyImpl(const qlib::LString &propnm,             \
                               const qlib::LVariant &pvalue);           \
  virtual bool resetPropertyImpl(const qlib::LString &nm);              \
  virtual void resetAllProps();                                         \
  virtual bool getPropSpecImpl(const qlib::LString &name,               \
                               qlib::PropSpec *pspec) const;            \
  virtual void getPropNames(std::set<qlib::LString> &) const;           \
  virtual bool hasMethod(const qlib::LString &nm) const;                \
  virtual bool invokeMethod(const qlib::LString &nm, qlib::LVarArgs &args);\
  virtual qlib::LClass *getScrClassObj() const; \
  virtual bool implements(const qlib::LString &nm) const; \
  

#define MC_SCRIPTABLE_EMPTY_IMPL(fqclsnm) \
bool fqclsnm::getPropertyImpl(const qlib::LString &, \
                              qlib::LVariant &) const \
{ \
  return false; \
} \
bool fqclsnm::setPropertyImpl(const qlib::LString &, \
                              const qlib::LVariant &) \
{ \
  return false; \
} \
bool fqclsnm::resetPropertyImpl(const qlib::LString &) \
{ \
  return false; \
} \
void fqclsnm::resetAllProps() \
{ \
} \
bool fqclsnm::getPropSpecImpl(const qlib::LString &, \
                               qlib::PropSpec *) const \
{ \
  return false; \
} \
void fqclsnm::getPropNames(std::set<qlib::LString> &) const \
{ \
} \
bool fqclsnm::hasMethod(const qlib::LString &nm) const \
{ \
  return false; \
} \
bool fqclsnm::invokeMethod(const qlib::LString &nm, qlib::LVarArgs &args) \
{ \
  return false; \
} \
qlib::LClass *fqclsnm::getScrClassObj() const\
{ \
  return fqclsnm::getClassObj(); \
} \
qlib::LClass *fqclsnm::implements() const\
{ \
  return false \
} \

  

#include "LScrSmartPtr.hpp"

namespace mcutils {

  template <class _Type>
  void setupCtorThisObj(qlib::LScriptable *pCli, qlib::LScrSp<_Type> **ppobj) {
    if (!pCli->isSmartPtr()) {
      //
      // We must make a smartptr for the bare ptr pCli
      //
      _Type *pTmp = static_cast<_Type *>(pCli);
      (*ppobj) = MB_NEW qlib::LScrSp<_Type>(pTmp);
    }
    else {
      //
      // pCli is an instance of LSupScrSp.
      //
      qlib::LSupScrSp *pTmp = static_cast<qlib::LSupScrSp *>(pCli);

      // But there is still possibility that
      //   pCli is not an instance of qlib::LScrSp<_Type>.

      // This ctor correctly invokes dynamic_cast to client_t !!
      (*ppobj) = MB_NEW qlib::LScrSp<_Type>(*pTmp);
    }
  }

  /**
    Try conversion from pointer to smart pointer.
    If pObj is not a smart pointer, new smart pointer will be created.
   */
  template<class _Type>
  _Type convSptr2Sptr(qlib::LScriptable *pObj)
  {
    return _Type::createFrom(pObj);
  }
  
  /**
    Try conversion from pointer to non-smart pointer.
    If pObj is not a smart pointer, just dynamic_cast will be performed.
   */
  template<class _Type>
  _Type *convSptr2Ptr(qlib::LScriptable *pObj)
  {
    if (pObj==NULL) {
      LOG_DPRINTLN("convSptr2Ptr: invalid argument NULL");
      return NULL;
    }

    qlib::LScriptable *pscr = (pObj->isSmartPtr()) ? pObj->getSPInner() : pObj;

    _Type *prval = dynamic_cast<_Type *>(pscr);
    if (prval==NULL) {
      LOG_DPRINTLN("convSptr2Ptr: cannot cast to specified object ptr");
      return NULL;
    }
    return prval;
  }
  
}

#endif // __MC_UTILS_H__
