// -*-Mode: C++;-*-
//
// Thrift RMI Manager
//

#include <common.h>
#include <qlib/LVariant.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>

#undef PACKAGE 
#undef VERSION
#undef PACKAGE_BUGREPORT
#undef PACKAGE_NAME
#undef PACKAGE_STRING
#undef PACKAGE_TARNAME
#undef PACKAGE_VERSION

#include "ThriftMgr.hpp"

#include <thrift/concurrency/ThreadManager.h>
#include <thrift/concurrency/PosixThreadFactory.h>
#include <thrift/protocol/TBinaryProtocol.h>
#include <thrift/server/TSimpleServer.h>
#include <thrift/server/TThreadPoolServer.h>
#include <thrift/server/TThreadedServer.h>
#include <thrift/transport/TServerSocket.h>
#include <thrift/transport/TTransportUtils.h>

#include "gen-cpp/CueMol.h"

using qlib::LVariant;

using namespace std;
using namespace apache::thrift;
using namespace apache::thrift::concurrency;
using namespace apache::thrift::protocol;
using namespace apache::thrift::transport;
using namespace apache::thrift::server;

using namespace xrbr;

ThriftMgr::ThriftMgr()
{
  m_pThr = NULL;
}

ThriftMgr::~ThriftMgr()
{
  if (m_pThr!=NULL)
    delete m_pThr;
}

void ThriftMgr::start()
{
  MB_ASSERT(m_pThr==NULL);

  m_pThr = MB_NEW ThriftThrImpl;

  // start the server thread
  m_pThr->kick();
  
  MB_DPRINTLN("Thrift thread start: thread running %d", m_pThr->isRunning());
}

///////

class CueMolHandler : public CueMolIf
{

  RMIMgr *m_pMgr;

public:

  CueMolHandler(RMIMgr *pMgr)
  {
    m_pMgr = pMgr;
  }

  void test()
  {
    MB_DPRINTLN("Test called!!");
  }

  void checkCred(const std::string& cred)
  {
    if (!m_pMgr->chkCred(cred)) {
      AuthException io;
      io.why = "Invalid credential";
      MB_DPRINTLN("ERROR: %s", io.why.c_str());
      throw io;
    }
  }

  int32_t createObj(const std::string& cred, const std::string& clsnm)
  {
    checkCred(cred);
    qlib::uid_t objid = m_pMgr->createObj(clsnm);
    if (objid==qlib::invalid_uid) {
    }
    return (int32_t) objid;
  }

  int32_t getService(const std::string& cred, const std::string& clsnm)
  {
    checkCred(cred);
    qlib::uid_t objid = m_pMgr->getService(clsnm);
    if (objid==qlib::invalid_uid) {
    }
    return (int32_t) objid;
  }

  void destroyObj(const std::string& cred, const int32_t objid)
  {
    checkCred(cred);
    m_pMgr->destroyObj(objid);
  }
  
  void destroyObjAsyn(const std::string& cred, const int32_t objid)
  {
    destroyObj(cred, objid);
  }

  virtual int8_t hasProp(const std::string& cred,
			 const int32_t objid,
			 const std::string& propnm)
  {
    checkCred(cred);
    int res = m_pMgr->hasProp(objid, propnm);
    if (res==0) {
      PropertyException e;
      e.why = m_pMgr->getErrMsg();
      MB_DPRINTLN("hasProp ERROR: %s", e.why.c_str());
      throw e;
    }
    return (int8_t) res;
  }

  virtual void getProp(Variant& _return,
		       const std::string& cred,
		       const int32_t objid,
		       const std::string& propnm)
  {
    checkCred(cred);

    qlib::LVariant lvar;

    if (!m_pMgr->getProp(objid, propnm, lvar)) {
      PropertyException e;
      e.why = m_pMgr->getErrMsg();
      MB_DPRINTLN("getProp ERROR: %s", e.why.c_str());
      throw e;
    }

    convLVarToTVar(lvar, _return);
  }

  virtual void setProp(const std::string& cred,
		       const int32_t objid,
		       const std::string& propnm,
		       const Variant& value)
  {
    checkCred(cred);

    qlib::LVariant lvar;

    convTVarToLVar(value, lvar);

    if (!m_pMgr->setProp(objid, propnm, lvar)) {
      PropertyException e;
      e.why = m_pMgr->getErrMsg();
      MB_DPRINTLN("setProp ERROR: %s", e.why.c_str());
      throw e;
    }
  }

  virtual void callMethod(Variant& _return,
			  const std::string& cred,
			  const int32_t objid,
			  const std::string& mthnm,
			  const std::vector<Variant> & argv)
  {
    checkCred(cred);

    const int nargs = argv.size();

    // Convert arguments
    qlib::LVarArgs largs(nargs);
    int i;
    
    for (i = 0; i < nargs; ++i)
      convTVarToLVar(argv[i], largs.at(i));
    
    if (!m_pMgr->callMethod(objid, mthnm, largs)) {
      PropertyException e;
      e.why = m_pMgr->getErrMsg();
      MB_DPRINTLN("callMethod ERROR: %s", e.why.c_str());
      throw e;
    }

    convLVarToTVar(largs.retval(), _return);
  }

  /////////////////////////////////////////

  void convLVarToTVar(LVariant &lvar, Variant& _return)
  {
    switch (lvar.getTypeID()) {
    case qlib::LVariant::LT_NULL:
      // MB_DPRINTLN("LVariant: null");
      _return.__set_type(Type::LT_NULL);
      return;

    case qlib::LVariant::LT_BOOLEAN:
      _return.__set_type(Type::LT_BOOLEAN);
      _return.__set_boolValue(lvar.getBoolValue());
      return;

    case qlib::LVariant::LT_INTEGER:
      // MB_DPRINTLN("LVar: integer(%d)", lvar.getIntValue());
      _return.__set_type(Type::LT_INTEGER);
      _return.__set_intValue(lvar.getIntValue());
      return;

    case qlib::LVariant::LT_REAL: 
      // MB_DPRINTLN("LVar: real(%f)", lvar.getRealValue());
      _return.__set_type(Type::LT_REAL);
      _return.__set_realValue(lvar.getRealValue());
      return;

    case qlib::LVariant::LT_STRING: {
      _return.__set_type(Type::LT_STRING);
      _return.__set_strValue(lvar.getStringValue().c_str());
      return;
    }

    case qlib::LVariant::LT_OBJECT: {
      qlib::LScriptable *pObj = lvar.getObjectPtr();
      qlib::LClass *pCls = pObj->getScrClassObj();
      LString clsname = pCls->getClassName();
      qlib::uid_t id = m_pMgr->registerObj(pObj);

      if (id==qlib::invalid_uid) {
	ValueException e;
	e.why = LString::format("Error in converting Object LVar (%s;%p) to TVar",
				clsname.c_str(), pObj);
	MB_DPRINTLN("getProp ERROR: %s", e.why.c_str());
	throw e;
      }

      _return.__set_type(Type::LT_OBJECT);
      _return.__set_objidValue((int32_t) id);
      _return.__set_className(clsname.c_str());
      
      // At this point, the ownership of value is passed to RMIMgr
      //  (forget() avoids deleting the ptr transferred to RMIMgr)
      lvar.forget();
      return;
    }
    
    case qlib::LVariant::LT_ARRAY: {
      // TO DO: impl

      ValueException e;
      e.why = "Array LVar to TVar not implemented";
      MB_DPRINTLN("getProp ERROR: %s", e.why.c_str());
      throw e;
    }

    default: {
      ValueException e;
      e.why = LString::format("Unknown LVariant type (%d)", lvar.getTypeID());
      MB_DPRINTLN("LVar to TVar ERROR: %s", e.why.c_str());
      throw e;
    }
    }

  }
  
  /// Type conversion from Thrift variant to qlib::LVariant
  void convTVarToLVar(const Variant &tvar, LVariant& rval)
  {
    switch (tvar.type) {
    case Type::LT_NULL:
      rval.setNull();
      return;
    case Type::LT_BOOLEAN:
      rval.setBoolValue(tvar.boolValue);
      return;
    case Type::LT_INTEGER:
      rval.setIntValue(tvar.intValue);
      return;
    case Type::LT_REAL:
      rval.setRealValue(tvar.realValue);
      return;
    case Type::LT_STRING:
      rval.setStringValue(tvar.strValue);
      return;
    case Type::LT_OBJECT: {
      qlib::uid_t id = tvar.objidValue;
      qlib::LScriptable *pScr = m_pMgr->getObj(id);
      if (pScr==NULL) {
	ValueException e;
	e.why = m_pMgr->getErrMsg();
	MB_DPRINTLN("TVar to LVar ERROR: %s", e.why.c_str());
	throw e;
      }
      // pScr is owned by obj_tab
      // (variant share the ptr and won't have the ownership!!)
      rval.shareObjectPtr(pScr);
      return;
    }

    default: {
      ValueException e;
      e.why = LString::format("Unknown Thrift variant type (%d)", tvar.type);
      MB_DPRINTLN("TVar to LVar ERROR: %s", e.why.c_str());
      throw e;
    }
    }
  }


};

void ThriftThrImpl::run()
{
  RMIMgr *pMgr = RMIMgr::getInstance();

  boost::shared_ptr<TProtocolFactory> protocolFactory(new TBinaryProtocolFactory());
  boost::shared_ptr<CueMolHandler> handler(new CueMolHandler(pMgr));
  boost::shared_ptr<TProcessor> processor(new CueMolProcessor(handler));
  boost::shared_ptr<TServerTransport> serverTransport(new TServerSocket(9090));
  boost::shared_ptr<TTransportFactory> transportFactory(new TBufferedTransportFactory());

  TSimpleServer server(processor,
                       serverTransport,
                       transportFactory,
                       protocolFactory);

  MB_DPRINTLN("Server start...");
  server.serve();
  MB_DPRINTLN("Server done.");
}
