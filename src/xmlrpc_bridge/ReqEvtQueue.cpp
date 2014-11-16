// -*-Mode: C++;-*-
//
// Client Request Queue
// XML-RPC Manager
//

#include <common.h>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/LScrObjects.hpp>
// #include <qlib/LExceptions.hpp>

#include "ReqEvtQueue.hpp"

using namespace xrbr;

ReqEvtObj::~ReqEvtObj()
{
}

/*int ReoCreateObj::getType() const
{
  return REO_CREATEOBJ;
  }*/

void ReoCreateObj::doit()
{
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);

  qlib::LClass *pCls = NULL;
  try {
    pCls = pMgr->getClassObj(m_clsname);
    MB_DPRINTLN("LClass: %p", pCls);
  }
  catch (...) {
    LString msg = LString::format("createObj class %s not found", m_clsname.c_str());
    LOG_DPRINTLN(msg);
    // ERROR!!
    m_errmsg = msg;
    m_bOK = false;
    return;
  }

  qlib::LScriptable *pNewObj = dynamic_cast<qlib::LScriptable *>(pCls->createScrObj());
  if (pNewObj==NULL) {
    LString msg = LString::format("createObj %s failed", m_clsname.c_str());
    LOG_DPRINTLN(msg);
    // ERROR!!
    m_errmsg = msg;
    m_bOK = false;
    return;
  }

  m_pRval = pNewObj;
  m_bOK = true;
}

void ReoGetService::doit()
{
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);

  qlib::LDynamic *pObj = NULL;
  try {
    pObj = pMgr->getSingletonObj(m_clsname);
  }
  catch (...) {
    LString msg = LString::format("getService(%s) failed", m_clsname.c_str());
    LOG_DPRINTLN(msg);
    m_errmsg = msg;
    m_bOK = false;
    return;
  }

  if (pObj==NULL) {
    LString msg = LString::format("getService %s failed", m_clsname.c_str());
    LOG_DPRINTLN(msg);
    m_errmsg = msg;
    m_bOK = false;
    return;
  }

  m_pRval = (qlib::LScriptable *) pObj;
  m_bOK = true;
}

void ReoDestroyObj::doit()
{
  m_pObj->destruct();
  MB_DPRINTLN("Object destroyed.");
  m_bOK = true;
}

void ReoGetProp::doit()
{
  MB_ASSERT(m_pObj!=NULL);
  MB_ASSERT(m_pRval!=NULL);

  if (!m_pObj->getProperty(m_propname, *m_pRval)) {
    m_bOK = false;
    m_errmsg =
      LString::format("GetProp: getProperty(\"%s\") call failed.", m_propname.c_str());
  }

  m_bOK = true;
}


void ReoSetProp::doit()
{
  MB_ASSERT(m_pObj!=NULL);
  MB_ASSERT(m_pValue!=NULL);

  // perform setProperty
  //   pobj possibly owns the copy of lvar's content

  try {
    m_bOK = m_pObj->setProperty(m_propname, *m_pValue);
  }
  catch (const qlib::LException &e) {
    m_bOK = false;
    m_errmsg = 
      LString::format("SetProp(%s) failed: %s", m_propname.c_str(), e.getMsg().c_str());
    MB_DPRINTLN("Err: %s", m_errmsg.c_str());
  }
  catch (...) {
    m_bOK = false;
    m_errmsg = 
      LString::format("SetProp(%s) failed.", m_propname.c_str());
    MB_DPRINTLN("Err: %s", m_errmsg.c_str());
  }

}

void ReoCallMethod::doit()
{
  MB_ASSERT(m_pObj!=NULL);
  MB_ASSERT(m_pArgs!=NULL);

  if (!m_pObj->hasMethod(m_mthname)) {
    m_bOK = false;
    m_errmsg = LString::format("CallMethod error, object %p not has method %s",
			       m_pObj, m_mthname.c_str());
    return;
  }

  // Invoke method

  m_bOK = false;
  m_errmsg = LString();

  try {
    m_bOK = m_pObj->invokeMethod(m_mthname, *m_pArgs);
    if (!m_bOK)
      m_errmsg = LString::format("call method %s: failed", m_mthname.c_str());
  }
  catch (qlib::LException &e) {
    m_errmsg = 
      LString::format("Exception occured in native method %s: %s",
		      m_mthname.c_str(), e.getMsg().c_str());
  }
  catch (...) {
    m_errmsg = 
      LString::format("Unknown Exception occured in native method %s",
		      m_mthname.c_str());
  }

  return;
}

////////////////////////////

void ReqEvtQueue::putWait(ReqEvtObj *pObj)
{
  MB_ASSERT(m_pData1==NULL);
  MB_ASSERT(m_pData2==NULL);

  // put
  {
    boost::mutex::scoped_lock lk(m_mu1);
    m_pData1 = pObj;
    m_cond1.notify_all();
  }

  // wait
  {
    boost::mutex::scoped_lock lk(m_mu2);
  
    while (m_pData2==NULL)
      m_cond2.wait(lk);

    if (m_pData2==NULL)
      return; // ERROR!!

    MB_ASSERT(m_pData2==pObj);
    m_pData2 = NULL;

    //MB_DPRINTLN("thread read 1 ok");
  }
}

ReqEvtObj *ReqEvtQueue::peek1()
{
  boost::mutex::scoped_lock lk(m_mu1);
  ReqEvtObj *pRval = NULL;

  if (m_pData1!=NULL) {
    pRval = m_pData1;
    m_pData1 = NULL;
  }

  return pRval;
}

ReqEvtObj *ReqEvtQueue::wait1(int nWait)
{
  boost::system_time const t =
    boost::get_system_time()+ boost::posix_time::milliseconds(nWait);
  
  boost::mutex::scoped_lock lk(m_mu1);
  
  while (m_pData1==NULL) {
    if (!m_cond1.timed_wait(lk, t)) {
      // Time out
      return NULL;
    }
  }
  
  ReqEvtObj *pRval = NULL;

  if (m_pData1!=NULL) {
    pRval = m_pData1;
    m_pData1 = NULL;
  }

  return pRval;
}

void ReqEvtQueue::processReq(int nWait)
{
  ReqEvtObj *pDat = NULL;

  bool bFirst = true;
  for (int i=0;;++i) {

    // peek1
    {
      if (bFirst) {
	bFirst = false;
	pDat = peek1();
      }
      else {
	pDat = wait1(nWait);
      }

      if (pDat==NULL)
	return;
    }
    
    pDat->doit();
    
    // put2
    {
      boost::mutex::scoped_lock lk(m_mu2);
      m_pData2 = pDat;
      m_cond2.notify_all();
    }

    MB_DPRINTLN("ReqQue> Request %d(%p) processed", i, pDat);
  }

}


