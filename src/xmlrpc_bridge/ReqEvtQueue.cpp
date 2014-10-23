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

    //throw ( xmlrpc_c::fault(msg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    //return qlib::invalid_uid;
  }

  qlib::LScriptable *pNewObj = dynamic_cast<qlib::LScriptable *>(pCls->createScrObj());
  if (pNewObj==NULL) {
    LString msg = LString::format("createObj %s failed", m_clsname.c_str());
    LOG_DPRINTLN(msg);
    // ERROR!!
    m_errmsg = msg;
    m_bOK = false;
    return;
    //throw ( xmlrpc_c::fault(msg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    //return qlib::invalid_uid;
  }

  m_pRval = pNewObj;
  m_bOK = true;
}

void ReoCallMethod::doit()
{
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
    m_bOK = m_pObj->invokeMethod(m_mthname, m_vargs);
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


