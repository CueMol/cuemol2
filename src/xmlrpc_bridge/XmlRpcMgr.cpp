//
// Event manager
//

#include <common.h>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
// #include <qlib/LExceptions.hpp>

#include "XmlRpcMgr.hpp"
#include "ReqEvtQueue.hpp"

#include <xmlrpc-c/base.hpp>
#include <xmlrpc-c/registry.hpp>
#include <xmlrpc-c/server_abyss.hpp>

using namespace xrbr;

SINGLETON_BASE_IMPL(XmlRpcMgr);

XmlRpcMgr::XmlRpcMgr() : m_uidgen(0)
{
  m_pMgrThr = NULL;
  m_pQue = MB_NEW ReqEvtQueue;
}

XmlRpcMgr::~XmlRpcMgr()
{
  delete m_pQue;
}

qlib::uid_t XmlRpcMgr::registerObj(LScriptable *pObj)
{
  qlib::uid_t uid = createNewUID();
  Entry ent;
  ent.p = pObj;
  ent.icnt = 1;
  std::pair<ObjTable::iterator,bool> res =
    m_objtab.insert(ObjTable::value_type(uid, ent));
  if (!res.second)
    return qlib::invalid_uid;

  // register to the ptr-to-uid table
  bool res2 = m_revtab.insert(RevTable::value_type((uintptr_t)pObj, uid)).second;
  if (!res2) {
    m_objtab.erase(res.first);
    return qlib::invalid_uid;
  }
  
  MB_DPRINTLN("XMLRPC> Object %p was registered as UID=%d", pObj, uid);
  return uid;
}

qlib::uid_t XmlRpcMgr::createObj(const LString &clsname)
{
  ReoCreateObj evt;
  evt.m_clsname = clsname;
  evt.m_pRval = NULL;
  m_pQue->putWait(&evt);

  MB_DPRINTLN("XMLRPC> createObj: svrthr clsname=%s, result=%b!!",
	      clsname.c_str(), evt.m_bOK);

  if (!evt.m_bOK || evt.m_pRval==NULL) {
    throw ( xmlrpc_c::fault(evt.m_errmsg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    return qlib::invalid_uid;
  }

  return registerObj(evt.m_pRval);
}

qlib::uid_t XmlRpcMgr::getService(const LString &clsname)
{
  ReoGetService evt;
  evt.m_clsname = clsname;
  evt.m_pRval = NULL;
  m_pQue->putWait(&evt);

  MB_DPRINTLN("XMLRPC> getService: svrthr clsname=%s, result=%d!!",
	      clsname.c_str(), evt.m_bOK);

  if (!evt.m_bOK || evt.m_pRval==NULL) {
    throw ( xmlrpc_c::fault(evt.m_errmsg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    return qlib::invalid_uid;
  }

  return registerObj(static_cast<qlib::LScriptable*>(evt.m_pRval));
}

bool XmlRpcMgr::destroyObj(qlib::uid_t uid)
{
  ObjTable::iterator i = m_objtab.find(uid);
  if (i==m_objtab.end()) {
    MB_DPRINTLN("destroyObj uid %d not found!!", uid);
    return false;
  }

  i->second.icnt--;
  MB_DPRINTLN("destroyObj icnt %d", i->second.icnt);
  if (i->second.icnt<=0) {
    // remove from ptr-to-uid table
    uintptr_t iptr = (uintptr_t) i->second.p;
    RevTable::iterator i2 = m_revtab.find(iptr);
    if (i2!=m_revtab.end())
      m_revtab.erase(i2);

    //i->second.p->destruct();
    ReoDestroyObj evt;
    evt.m_pObj = i->second.p;
    m_pQue->putWait(&evt);

    MB_DPRINTLN("XMLRPC> svrthr destroyObj OK=%d", evt.m_bOK);
    
    // remove from obj table
    m_objtab.erase(i);
  }

  return true;
}

qlib::LScriptable *XmlRpcMgr::getObj(qlib::uid_t uid)
{
  ObjTable::const_iterator i = m_objtab.find(uid);
  if (i==m_objtab.end()) {
    LString msg = LString::format("getObj unknown object ID: %d", uid);
    throw( xmlrpc_c::fault(msg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    return NULL;
  }

  return i->second.p;
}

int XmlRpcMgr::hasProp(qlib::uid_t uid, const LString &propnm)
{
  qlib::LScriptable *pObj = getObj(uid);

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

bool XmlRpcMgr::getProp(qlib::uid_t uid, const LString &propnm, xmlrpc_c::value *pRval)
{
  qlib::LScriptable *pObj = getObj(uid);

  ReoGetProp evt;
  evt.m_pObj = pObj;
  evt.m_propname = propnm;

  m_pQue->putWait(&evt);
  if (!evt.m_bOK) {
    throw ( xmlrpc_c::fault(evt.m_errmsg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    return qlib::invalid_uid;
  }
  MB_DPRINTLN("XMLRPC> getProp() svrthr putWait OK");

  qlib::LVariant &lvar = evt.m_value;

  // Convert result

  if (!convLvar2Xrval(lvar, pRval)) {
    throw( xmlrpc_c::fault("Conv from LVar to XMLRPC val failed",
			   xmlrpc_c::fault::CODE_UNSPECIFIED) );
    return false;
  }

  return true;
}

bool XmlRpcMgr::setProp(qlib::uid_t uid, const LString &propnm, const xmlrpc_c::value *pVal)
{
  qlib::LScriptable *pObj = getObj(uid);
  if (pObj==NULL) {
    // TO DO: report error
    MB_DPRINTLN("SetProp error, object %d not found", uid);
    return false;
  }
  
  ReoSetProp evt;
  evt.m_pObj = pObj;
  evt.m_propname = propnm;

  //////////
  // convert to LVariant

  // variant (lvar) doesn't have ownership of its content
  qlib::LVariant &lvar = evt.m_value;
  bool ok = false;
  LString errmsg;
  try {
    convXrval2Lvar(pVal, lvar);
    ok = true;
  }
  catch (const qlib::LException &e) {
    errmsg = 
      LString::format("SetProp(%s) cannot converting PyObj to LVariant: %s",
		      propnm.c_str(), e.getMsg().c_str());
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }
  catch (...) {
    errmsg = 
      LString::format("SetProp(%s): Cannot converting PyObj to LVariant.", propnm.c_str());
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }

  if (!ok) {
    // TO DO: report error
    return false;
  }

  MB_DPRINTLN("XMLRPC> svrthr SetProp conv OK ");

  //////////
  // perform setProperty

  m_pQue->putWait(&evt);
  if (!evt.m_bOK) {
    throw ( xmlrpc_c::fault(evt.m_errmsg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    return qlib::invalid_uid;
  }
  
  MB_DPRINTLN("XMLRPC> svrthr setProp() putWait OK");

  // OK
  return true;
}

bool XmlRpcMgr::callMethod(qlib::uid_t uid, const LString &mthnm,
			   const xmlrpc_c::carray &vargs, xmlrpc_c::value *pRval)
{
  const int nargs = vargs.size();
  
  qlib::LScriptable *pObj = getObj(uid);
  if (pObj==NULL) {
    // TO DO: report error
    MB_DPRINTLN("CallMethod error, object %d not found", uid);
    return false;
  }
  
  ReoCallMethod evt(nargs);
  evt.m_pObj = pObj;
  evt.m_mthname = mthnm;

  // Convert arguments.

  //qlib::LVarArgs largs(nargs);
  qlib::LVarArgs &largs = evt.m_vargs;
  int i;
  bool ok;
  LString errmsg;

  for (i = 0; i < nargs; ++i) {
    ok = false;
    errmsg = LString();
    try {
      convXrval2Lvar(&vargs[i], largs.at(i));
      ok = true;
    }
    catch (const qlib::LException &e) {
      errmsg = LString::format("call method %s: cannot convert arg %d, %s",
			       mthnm.c_str(), i, e.getMsg().c_str());
    }
    catch (...) {
      errmsg = LString::format("call method %s: cannot convert arg %d",
			       mthnm.c_str(), i);
    }
    if (!ok) {
      MB_DPRINTLN("ERROR: %s", errmsg.c_str());
      // TO DO: report error
      return false;
    }
  }

  m_pQue->putWait(&evt);
  if (!evt.m_bOK) {
    throw ( xmlrpc_c::fault(evt.m_errmsg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
    return qlib::invalid_uid;
  }
  MB_DPRINTLN("XMLRPC> CallMethod(%d,%s) svrthr putWait OK", uid, mthnm.c_str());

  // Convert returned value

  errmsg = LString();

  try {
    if (!convLvar2Xrval(largs.retval(), pRval)) {
      // TO DO: report error
      return false;
    }
  }
  catch (const qlib::LException &e) {
    errmsg = LString::format("call method %s: cannot convert rval, %s",
			     mthnm.c_str(), e.getMsg().c_str());
  }
  catch (...) {
    errmsg = LString::format("call method %s: cannot convert rval",
			     mthnm.c_str());
  }

  if (pRval==NULL) {
    MB_DPRINTLN("ERROR: %s", errmsg.c_str());
    // TO DO: report error
    return false;
  }

  MB_DPRINTLN("XMLRPC> CallMethod svrthr OK");
  return true;
}

bool XmlRpcMgr::convLvar2Xrval(qlib::LVariant &variant, xmlrpc_c::value *pRval)
{
  switch (variant.getTypeID()) {
  case qlib::LVariant::LT_NULL:
    // MB_DPRINTLN("LVariant: null");
    *pRval = xmlrpc_c::value_nil();
    return true;

  case qlib::LVariant::LT_BOOLEAN:
    *pRval = xmlrpc_c::value_boolean(variant.getBoolValue());
    return true;

  case qlib::LVariant::LT_INTEGER:
    // MB_DPRINTLN("LVar: integer(%d)", variant.getIntValue());
    *pRval = xmlrpc_c::value_int(variant.getIntValue());
    return true;

  case qlib::LVariant::LT_REAL: 
    // MB_DPRINTLN("LVar: real(%f)", variant.getRealValue());
    *pRval = xmlrpc_c::value_double(variant.getRealValue());
    return true;

  case qlib::LVariant::LT_STRING: {
    *pRval = xmlrpc_c::value_string(variant.getStringValue().c_str());
    return true;
  }

  case qlib::LVariant::LT_OBJECT: {
    qlib::LScriptable *pObj = variant.getObjectPtr();
    qlib::uid_t id = registerObj(pObj);

    xmlrpc_c::cstruct dict;
    dict.insert(xmlrpc_c::cstruct::value_type(std::string("UID"), xmlrpc_c::value_int(id)));

    *pRval = xmlrpc_c::value_struct(dict);

    // At this point, the ownership of value is passed to PyObject
    //  (forget() avoids deleting the ptr transferred to PyObject)
    variant.forget();

    break;
  }
    
  case qlib::LVariant::LT_ARRAY: {
    // TO DO: impl
    break;
  }

  default:
    LOG_DPRINTLN("Unknown LVariant type (%d)", variant.getTypeID());
    break;
  }

  // PyErr_SetString(PyExc_RuntimeError, "Unable to convert LVariant to PyObjectl!");
  // TO DO: report error!!
  return false;
}

bool XmlRpcMgr::convXrval2Lvar(const xmlrpc_c::value *pVal, qlib::LVariant &rvar)
{
  xmlrpc_c::value::type_t ntype = pVal->type();

  switch (ntype) {
  case xmlrpc_c::value::TYPE_INT:
    rvar.setIntValue(static_cast<const xmlrpc_c::value_int *>(pVal)->cvalue());
    return true;

  case xmlrpc_c::value::TYPE_I8:
    rvar.setIntValue(static_cast<const xmlrpc_c::value_i8 *>(pVal)->cvalue());
    return true;

  case xmlrpc_c::value::TYPE_BOOLEAN:
    rvar.setBoolValue(static_cast<const xmlrpc_c::value_boolean *>(pVal)->cvalue());
    return true;

  case xmlrpc_c::value::TYPE_STRING:
    rvar.setStringValue(static_cast<const xmlrpc_c::value_string *>(pVal)->cvalue());
    return true;

  case xmlrpc_c::value::TYPE_DOUBLE:
    rvar.setRealValue(static_cast<const xmlrpc_c::value_double *>(pVal)->cvalue());
    return true;

  case xmlrpc_c::value::TYPE_STRUCT: {
    xmlrpc_c::cstruct obj = static_cast<const xmlrpc_c::value_struct *>(pVal)->cvalue();
    xmlrpc_c::cstruct::const_iterator iter = obj.find("UID");
    if (iter==obj.end()) {
      MB_DPRINTLN("convXrval2Lvar: unsupported type %d", ntype);
      break;
    }
    if (iter->second.type()!=xmlrpc_c::value::TYPE_INT) {
      MB_DPRINTLN("convXrval2Lvar: unsupported type %d", ntype);
      break;
    }
    qlib::uid_t id = static_cast<const xmlrpc_c::value_int>(iter->second).cvalue();
    qlib::LScriptable *pScr = getObj(id);
    if (pScr==NULL) {
      MB_DPRINTLN("Obj not found %d", id);
      break;
    }

    // pScr is owned by obj_tab
    // (variant share the ptr and won't have the ownership!!)
    rvar.shareObjectPtr(pScr);
    MB_DPRINTLN("Object");
    return true;
  }

  default:
    MB_DPRINTLN("convXrval2Lvar: unsupported type %d", ntype);
    break;
  }

  // Error!!
  MB_THROW(qlib::RuntimeException, "unsupported XML-RPC value type");
  return false;
}

void XmlRpcMgr::chkCred(const LString &c)
{
  // TO DO: implementation
  if (!c.equals("XXX"))
    throw( xmlrpc_c::fault("Invalid credential", xmlrpc_c::fault::CODE_UNSPECIFIED) );
}

////////////////////

namespace {
  class CreateObjMethod : public xmlrpc_c::method
  {
  public:
    CreateObjMethod() {
      this->_signature = "i:ss";
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(2);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      // Class name of object to create
      std::string clsnm = paramList.getString(1);
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();

      // check credential
      pMgr->chkCred(cred);

      qlib::uid_t nObjID = pMgr->createObj(clsnm);

      *retvalP = xmlrpc_c::value_int(nObjID);
    }
  };

  class GetServiceMethod : public xmlrpc_c::method
  {
  public:
    GetServiceMethod() {
      this->_signature = "i:ss";
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(2);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      // Class name of service object
      std::string clsnm = paramList.getString(1);
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();
      // check credential
      pMgr->chkCred(cred);

      qlib::uid_t nObjID = pMgr->getService(clsnm);

      *retvalP = xmlrpc_c::value_int(nObjID);
    }
  };

  class DestroyObjMethod : public xmlrpc_c::method
  {
  public:
    DestroyObjMethod() {
      this->_signature = "i:si";
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(2);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      //
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(1);
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();

      // check credential
      pMgr->chkCred(cred);

      bool res = pMgr->destroyObj(uid);

      *retvalP = xmlrpc_c::value_boolean(res);
    }
  };

  class HasPropMethod : public xmlrpc_c::method
  {
  public:
    HasPropMethod() {
      this->_signature = "i:sis";
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(3);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      //
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(1);
      //
      std::string propnm = paramList.getString(2);
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();

      // check credential
      pMgr->chkCred(cred);

      int rcode = pMgr->hasProp(uid, propnm);

      *retvalP = xmlrpc_c::value_int(rcode);
      return;
    }
  };


  class GetPropMethod : public xmlrpc_c::method
  {
  public:
    GetPropMethod() {
      this->_signature = "i:sis";
      this->_help = "This method";
    }

    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(3);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      //
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(1);
      //
      std::string propnm = paramList.getString(2);
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();
      // check credential
      pMgr->chkCred(cred);

      pMgr->getProp(uid, propnm, retvalP);

      return;
    }
  };

  class TryGetPropMethod : public xmlrpc_c::method
  {
  public:
    TryGetPropMethod() {
      this->_signature = "i:sis";
      this->_help = "This method";
    }

    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(3);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      //
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(1);
      //
      std::string propnm = paramList.getString(2);
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();
      // check credential
      pMgr->chkCred(cred);

      int rcode = pMgr->hasProp(uid, propnm);
      if (rcode==0) {
	LString msg = LString::format("TryGetProp: property %s not found.", propnm.c_str());
	throw( xmlrpc_c::fault(msg.c_str(), xmlrpc_c::fault::CODE_UNSPECIFIED) );
	return;
      }

      xmlrpc_c::cstruct dict;
      dict.insert(xmlrpc_c::cstruct::value_type(std::string("rcode"), xmlrpc_c::value_int(rcode)));
      if (rcode==1||rcode==2) {
	xmlrpc_c::value rval;
	pMgr->getProp(uid, propnm, &rval);
	dict.insert(xmlrpc_c::cstruct::value_type(std::string("rval"), rval));
      }

      *retvalP = xmlrpc_c::value_struct(dict);
      return;
    }
  };

  class SetPropMethod : public xmlrpc_c::method
  {
  public:
    SetPropMethod() {
      this->_signature = "i:sis";
      this->_help = "This method";
    }

    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(4);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      //
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(1);
      //
      std::string propnm = paramList.getString(2);
      //
      xmlrpc_c::value val = paramList[3];
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();
      // check credential
      pMgr->chkCred(cred);

      MB_DPRINTLN("SetProp for obj(%d), propnm=(%s) called", uid, propnm.c_str());

      pMgr->setProp(uid, propnm, &val);

      *retvalP = xmlrpc_c::value_nil();

      MB_DPRINTLN("SetProp for obj(%d), propnm=(%s) DONE", uid, propnm.c_str());
      return;
    }
  };


  class CallMethod : public xmlrpc_c::method
  {
  public:
    CallMethod() {
      this->_signature = "i:is";
      this->_help = "This method";
    }

    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(4);
        
      // Credential for authentication
      std::string cred = paramList.getString(0);
      //
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(1);
      //
      std::string mthnm = paramList.getString(2);
      //
      xmlrpc_c::carray vargs = paramList.getArray(3);
        
      XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();
      // check credential
      pMgr->chkCred(cred);

      MB_DPRINTLN("CallMethod for %d, %s called", uid, mthnm.c_str());
      int nargs = vargs.size();
      for (int i=0; i<nargs; ++i) {
	MB_DPRINTLN("Arg %d: type %d", i, vargs[i].type());
      }

      pMgr->callMethod(uid, mthnm, vargs, retvalP);

      return;
    }
  };
}

void XmlRpcMgr::run()
{
  try {
    xmlrpc_c::registry myRegistry;
    
    ;
    myRegistry.addMethod("createObj", xmlrpc_c::methodPtr(new CreateObjMethod));
    myRegistry.addMethod("getService", xmlrpc_c::methodPtr(new GetServiceMethod));
    myRegistry.addMethod("destroyObj", xmlrpc_c::methodPtr(new DestroyObjMethod));

    myRegistry.addMethod("hasProp", xmlrpc_c::methodPtr(new HasPropMethod));
    myRegistry.addMethod("getProp", xmlrpc_c::methodPtr(new GetPropMethod));
    myRegistry.addMethod("tryGetProp", xmlrpc_c::methodPtr(new TryGetPropMethod));
    myRegistry.addMethod("setProp", xmlrpc_c::methodPtr(new SetPropMethod));
    myRegistry.addMethod("callMethod", xmlrpc_c::methodPtr(new CallMethod));

    xmlrpc_c::serverAbyss myAbyssServer(xmlrpc_c::serverAbyss::constrOpt()
					.registryP(&myRegistry)
					.portNumber(8080));
    
    myAbyssServer.run();

    // xmlrpc_c::serverAbyss.run() never returns
    MB_ASSERT(false);

  }
  catch (std::exception const& e) {
    //std::cerr << "Something failed.  " << e.what() << std::endl;
  }

}

void XrMgrThrImpl::run()
{
  XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();
  pMgr->run();
}

void XmlRpcMgr::start()
{
  MB_ASSERT(m_pMgrThr==NULL);

  m_pMgrThr = MB_NEW XrMgrThrImpl;

  // start the server thread
  m_pMgrThr->kick();
  
  LOG_DPRINTLN("XML-RPC thread start: thread running %d", m_pMgrThr->isRunning());
}

void XmlRpcMgr::processReq(int n)
{
  m_pQue->processReq(n);
}

