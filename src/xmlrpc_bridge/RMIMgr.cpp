//
// RMI manager superclass
//

#include <common.h>

#include "RMIMgr.hpp"

using namespace xrbr;

SINGLETON_BASE_IMPL(RMIMgr);

RMIMgr::RMIMgr()
{
  m_pMgrImpl = NULL;
}

RMIMgr::~RMIMgr()
{
  if (m_pMgrImpl!=NULL)
    delete m_pMgrImpl;
}

void RMIMgr::processReq(int n)
{
  m_que.processReq(n);
}

////////////////////////////

qlib::uid_t RMIMgr::registerObj(LScriptable *pObj)
{
  qlib::uid_t uid = createNewUID();
  Entry ent;
  ent.p = pObj;
  ent.icnt = 1;
  std::pair<ObjTable::iterator,bool> res =
    m_objtab.insert(ObjTable::value_type(uid, ent));
  if (!res.second)
    return qlib::invalid_uid;

  /*
  // register to the ptr-to-uid table
  bool res2 = m_revtab.insert(RevTable::value_type((uintptr_t)pObj, uid)).second;
  if (!res2) {
    m_objtab.erase(res.first);
    return qlib::invalid_uid;
  }
  */

  MB_DPRINTLN("Object %p was registered as UID=%d", pObj, uid);
  return uid;
}

qlib::uid_t RMIMgr::createObj(const LString &clsname)
{
  ReoCreateObj evt;
  evt.m_clsname = clsname;
  evt.m_pRval = NULL;
  m_que.putWait(&evt);

  if (!evt.m_bOK || evt.m_pRval==NULL) {
    return qlib::invalid_uid;
  }

  return registerObj(evt.m_pRval);
}

qlib::uid_t RMIMgr::getService(const LString &clsname)
{
  return qlib::invalid_uid;
}

bool RMIMgr::destroyObj(qlib::uid_t uid)
{
  ObjTable::iterator i = m_objtab.find(uid);
  if (i==m_objtab.end()) {
    MB_DPRINTLN("destroyObj uid %d not found!!", uid);
    return false;
  }

  i->second.icnt--;
  MB_DPRINTLN("destroyObj icnt %d", i->second.icnt);
  if (i->second.icnt<=0) {
    LScriptable *pObj = i->second.p;
    // i->second.p->destruct();
    m_objtab.erase(i);

    ReoDestroyObj evt;
    evt.m_pObj = pObj;
    m_que.putWait(&evt);

    if (!evt.m_bOK) {
      return false;
    }
  }

  MB_DPRINTLN("Object %d destroy OK", uid);
  return true;
}

LScriptable *RMIMgr::getObj(qlib::uid_t uid)
{
  ObjTable::const_iterator i = m_objtab.find(uid);
  if (i==m_objtab.end()) {
    m_errmsg = LString::format("getObj unknown object ID: %d", uid);
    MB_DPRINTLN(m_errmsg);
    return NULL;
  }

  return i->second.p;
}

int RMIMgr::hasProp(qlib::uid_t uid, const LString &propnm)
{
  qlib::LScriptable *pObj = getObj(uid);
  if (pObj==NULL)
    return 0;

  if (pObj->hasProperty(propnm)) {
    if (pObj->hasWritableProperty(propnm)) {
      // has wrprop (1)
      return 1;
    }
    else {
      // has roprop (2)
      return 2;
    }
  }

  if (pObj->hasMethod(propnm)) {
    // name is method (3)
    return 3;
  }

  return 0;
}

bool RMIMgr::getProp(qlib::uid_t uid, const LString &propnm, qlib::LVariant &result)
{
  qlib::LScriptable *pObj = getObj(uid);
  if (pObj==NULL) {
    m_errmsg = LString::format("GetProp error, object %d not found", uid);
    return false;
  }

  if (!pObj->hasProperty(propnm)) {
    m_errmsg =
      LString::format("GetProp error, Property(\"%s\") not found.", propnm.c_str());
    return false;
  }

  ReoGetProp evt;
  evt.m_pObj = pObj;
  evt.m_propname = propnm;
  evt.m_pRval = &result;
  m_que.putWait(&evt);

  if (!evt.m_bOK) {
    m_errmsg = evt.m_errmsg;
    return false;
  }

  return true;
}

bool RMIMgr::setProp(qlib::uid_t uid, const LString &propnm, const qlib::LVariant &value)
{
  qlib::LScriptable *pObj = getObj(uid);
  if (pObj==NULL) {
    m_errmsg = LString::format("SetProp error, object %d not found", uid);
    return false;
  }
  
  if (!pObj->hasWritableProperty(propnm)) {
    m_errmsg = LString::format("SetProp error, object %d not writable", uid);
    return false;
  }

  MB_DPRINTLN("SetProp object %d ", uid);

  ReoSetProp evt;
  evt.m_pObj = pObj;
  evt.m_propname = propnm;
  evt.m_pValue = &value;
  m_que.putWait(&evt);

  if (!evt.m_bOK) {
    m_errmsg = evt.m_errmsg;
    return false;
  }

  return true;
}

////////////////////////////

bool RMIMgr::chkCred(const LString &c)
{
  std::set<LString>::const_iterator i = m_creds.find(c);
  if (i==m_creds.end()) {
    return false;
  }
  return true;
}

void RMIMgr::registerCred(const LString &c)
{
  std::set<LString>::const_iterator i = m_creds.find(c);
  if (i!=m_creds.end()) {
    LString msg = "Credential already registered";
    MB_THROW(qlib::RuntimeException, msg);
  }

  m_creds.insert(c);

  MB_DPRINTLN("New credential %s registered", c.c_str());
}

void RMIMgr::unregisterCred(const LString &c)
{
  std::set<LString>::iterator i = m_creds.find(c);
  if (i==m_creds.end()) {
    LString msg = "Credential not found";
    MB_THROW(qlib::RuntimeException, msg);
  }

  m_creds.erase(i);
}

#ifdef USE_THRIFT
#include "ThriftMgr.hpp"
#endif

bool RMIMgr::startServer()
{
  MB_ASSERT(m_pMgrImpl==NULL);

#ifdef USE_THRIFT
  m_pMgrImpl = new ThriftMgr();
#endif

  if (m_pMgrImpl==NULL)
    return false;

  m_pMgrImpl->start();

  return true;
}

