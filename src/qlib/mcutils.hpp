/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
//
// Metaclass utilities
//
//  $Id: mcutils.hpp,v 1.20 2010/09/15 15:42:44 rishitani Exp $

#ifndef __MC_UTILS_H__
#define __MC_UTILS_H__

#include "qlib.hpp"

//
// Class registration macros for the script-bridge metaclass system.
// See docs/architecture/cpp-scripting-bridge.md for the contract that
// MC_DYNCLASS / MC_SCRIPTABLE / MC_DYNCLASS_IMPL participate in --
// in particular, the getClassObj() vs getScrClassObj() distinction
// and what external scripting bridges must do to wrap native objects.
//
//   MC_DYNCLASS   -- class is reachable from script but exposes no
//                    scripted surface of its own. Script sees
//                    instances as the nearest MC_SCRIPTABLE ancestor.
//   MC_SCRIPTABLE -- class has its own scripted properties / methods
//                    (declared in a .qif). Pair with MC_INVOKE_IMPL2
//                    in the auto-generated _wrap.cpp; see LWrapper.hpp.
//

#define MC_DYNCLASS \
  public: \
    qlib::LClass *getClassObj() const override; \
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
    qlib::LCloneableObject *clone() const override; \

#define MC_CLONEABLE_IMPL(fqclsnm) \
qlib::LCloneableObject *fqclsnm::clone() const \
{ \
  return MB_NEW fqclsnm(*this); \
}


#define MC_SCRIPTABLE                                                   \
  MC_DYNCLASS;                                                          \
  bool getPropertyImpl(const qlib::LString &propnm,                     \
                       qlib::LVariant &presult) const override;         \
  bool setPropertyImpl(const qlib::LString &propnm,                     \
                       const qlib::LVariant &pvalue) override;          \
  bool resetPropertyImpl(const qlib::LString &nm) override;             \
  void resetAllProps() override;                                        \
  bool getPropSpecImpl(const qlib::LString &name,                       \
                       qlib::PropSpec *pspec) const override;           \
  void getPropNames(std::set<qlib::LString> &) const override;          \
  bool hasMethod(const qlib::LString &nm) const override;               \
  bool invokeMethod(const qlib::LString &nm, qlib::LVarArgs &args) override;\
  qlib::LClass *getScrClassObj() const override; \
  bool implements(const qlib::LString &nm) const override; \
  

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
