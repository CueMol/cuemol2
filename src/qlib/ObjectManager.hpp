//
// Singleton class for
// UID-based object instance management
//
// $Id: ObjectManager.hpp,v 1.3 2009/05/03 09:03:13 rishitani Exp $

#ifndef QLIB_OBJECT_MANAGER_HPP_INCLUDED
#define QLIB_OBJECT_MANAGER_HPP_INCLUDED

#include "qlib.hpp"

#include "LString.hpp"
#include "SingletonBase.hpp"
#include "LUIDObject.hpp"

#include <mutex>

namespace qlib {

  using std::map;

//  typedef unsigned long uid_t;
//  const uid_t invalid_uid = 0;

  /**
     Singleton class for
     UID-based object instance management
   */
  class QLIB_API ObjectManager : public SingletonBase<ObjectManager>
  {
  private:
    typedef map<uid_t, LUIDObject *> ObjTable;

    uid_t m_uidgen;

    /** UID --> object ptr table */
    ObjTable m_objtab;

    /// registerObject() runs on the IOThread worker (loadObjectAsync) while
    /// the main thread keeps calling getObjectByUID(); std::map must not be
    /// modified and searched concurrently
    mutable std::mutex m_mutex;

  public:
    
    ObjectManager() : m_uidgen(0) {}
    virtual ~ObjectManager() {}
    
    ///////////////////////

    uid_t createNewUID() {
      return ++m_uidgen;
    }

    /*
    static uid_t sget() {
      LUIDGen *pS = qlib::SingletonBase<LUIDGen>::getInstance();
      return pS->get();
    }
     */

    ///////////////////////

    uid_t registerObject(LUIDObject *pObj) {
      std::lock_guard<std::mutex> lk(m_mutex);
      uid_t uid = createNewUID();
      bool res = m_objtab.insert(ObjTable::value_type(uid, pObj)).second;
      if (res)
        return uid;
      else
        return invalid_uid;
    }

    LUIDObject *getObjectByUID(uid_t u) const {
      std::lock_guard<std::mutex> lk(m_mutex);
      ObjTable::const_iterator i = m_objtab.find(u);
      if (i==m_objtab.end()) return NULL;
      return i->second;
    }

    bool unregisterObject(uid_t u) {
      std::lock_guard<std::mutex> lk(m_mutex);
      ObjTable::iterator i = m_objtab.find(u);
      if (i==m_objtab.end()) return false;
      m_objtab.erase(i);
      return true;
    }

    template <class _Type>
    static _Type *sGetObj(uid_t u) {
      ObjectManager *pMgr = SingletonBase<ObjectManager>::getInstance();
      LUIDObject *pObj = pMgr->getObjectByUID(u);
      if (!pObj) return NULL;
      return dynamic_cast<_Type *>(pObj);
    }

    static uid_t sRegObj(LUIDObject *pObj) {
      ObjectManager *pMgr = SingletonBase<ObjectManager>::getInstance();
      return pMgr->registerObject(pObj);
    }

    static bool sUnregObj(uid_t u) {
      ObjectManager *pMgr = SingletonBase<ObjectManager>::getInstance();
      return pMgr->unregisterObject(u);
    }

    ///////////////////////

  };

}

SINGLETON_BASE_DECL(qlib::ObjectManager);

#endif // QLIB_OBJECT_MANAGER_HPP_INCLUDED

