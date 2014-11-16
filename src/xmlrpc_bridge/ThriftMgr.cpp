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
    return (int32_t) objid;
  }

  int32_t getService(const std::string& cred, const std::string& clsnm)
  {
    checkCred(cred);
    qlib::uid_t objid = m_pMgr->getService(clsnm);
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
    return (int8_t) m_pMgr->hasProp(objid, propnm);
  }

  virtual void getProp(Variant& _return,
		       const std::string& cred,
		       const int32_t objid,
		       const std::string& propnm)
  {
    checkCred(cred);
    qlib::LVariant lvar;

    if (!m_pMgr->getProp(objid, propnm, lvar)) {
      AuthException e;
      e.why = "Property not found";
      MB_DPRINTLN("getProp ERROR: %s", e.why.c_str());
      throw e;
    }

    convLVarToTVar(lvar, _return);
  }


  /////////////////////////////////////////

  bool convLVarToTVar(const LVariant &lvar, Variant& _return)
  {
    return false;
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
