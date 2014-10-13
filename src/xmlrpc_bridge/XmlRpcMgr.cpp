//
// Event manager
//

#include <common.h>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>

#include "XmlRpcMgr.hpp"

#include <xmlrpc-c/base.hpp>
#include <xmlrpc-c/registry.hpp>
#include <xmlrpc-c/server_abyss.hpp>

using namespace xrbr;

SINGLETON_BASE_IMPL(XmlRpcManager);

XmlRpcManager::XmlRpcManager() : m_uidgen(0)
{
}

XmlRpcManager::~XmlRpcManager()
{
}

qlib::uid_t XmlRpcManager::registerObj(LScriptable *pObj)
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
  
  return uid;
}

qlib::uid_t XmlRpcManager::createObj(const LString &clsname)
{
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);

  qlib::LClass *pCls = NULL;
  try {
    pCls = pMgr->getClassObj(clsname);
    MB_DPRINTLN("LClass: %p", pCls);
  }
  catch (...) {
    LString msg = LString::format("createObj class %s not found", clsname.c_str());
    LOG_DPRINTLN(msg);
    return qlib::invalid_uid;
  }

  LScriptable *pNewObj = dynamic_cast<LScriptable *>(pCls->createScrObj());
  if (pNewObj==NULL) {
    LString msg = LString::format("createObj %s failed", clsname.c_str());
    LOG_DPRINTLN(msg);
    return qlib::invalid_uid;
  }
  
  MB_DPRINTLN("createObj(%s) OK, result=%p!!", clsname.c_str(), pNewObj);

  return registerObj(pNewObj);
}

qlib::uid_t XmlRpcManager::getService(const LString &clsname)
{
  qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
  MB_ASSERT(pMgr!=NULL);

  qlib::LDynamic *pObj = NULL;
  try {
    pObj = pMgr->getSingletonObj(clsname);
  }
  catch (...) {
    LString msg = LString::format("getService(%s) failed", clsname.c_str());
    LOG_DPRINTLN(msg);
    return qlib::invalid_uid;
  }

  MB_DPRINTLN("getService(%s) OK, result=%p!!", clsname.c_str(), pObj);

  return registerObj((qlib::LScriptable *)pObj);
}

bool XmlRpcManager::destroyObj(qlib::uid_t uid)
{
  ObjTable::iterator i = m_objtab.find(uid);
  if (i==m_objtab.end()) {
    MB_DPRINTLN("destroyObj uid %d not found!!", uid);
    return false;
  }

  i->second.icnt--;
  MB_DPRINTLN("destroyObj icnt %d", i->second.icnt);
  if (i->second.icnt<=0) {
    uintptr_t iptr = (uintptr_t) i->second.p;
    i->second.p->destruct();
    m_objtab.erase(i);

    // remove from ptr-to-uid table
    RevTable::iterator i2 = m_revtab.find(iptr);
    if (i2!=m_revtab.end())
      m_revtab.erase(i2);
  }

  return true;
}

qlib::LScriptable *XmlRpcManager::getObj(qlib::uid_t uid)
{
  ObjTable::const_iterator i = m_objtab.find(uid);
  if (i==m_objtab.end()) {
    MB_DPRINTLN("getObj uid %d not found!!", uid);
    return NULL;
  }

  return i->second.p;
}

bool XmlRpcManager::getProp(qlib::uid_t uid, const LString &propnm, xmlrpc_c::value *pRval)
{
  qlib::LScriptable *pObj = getObj(uid);
  if (pObj==NULL) {
    // TO DO: report error
    return false;
  }
  
  if (!pObj->hasProperty(propnm)) {
    // TO DO: report error
    return false;
  }

  qlib::LVariant lvar;
  if (!pObj->getProperty(propnm, lvar)) {
    LString msg =
      LString::format("GetProp: getProperty(\"%s\") call failed.", propnm.c_str());
    // TO DO: report error
    return false;
  }
  
  if (!convLvar2Xrval(lvar, pRval)) {
    // TO DO: report error
    return false;
  }

  return true;
}

bool XmlRpcManager::setProp(qlib::uid_t uid, const LString &propnm, const xmlrpc_c::value *pVal)
{
  qlib::LScriptable *pObj = getObj(uid);
  if (pObj==NULL) {
    // TO DO: report error
    MB_DPRINTLN("SetProp error, object %d not found", uid);
    return false;
  }
  
  if (!pObj->hasWritableProperty(propnm)) {
    // TO DO: report error
    MB_DPRINTLN("SetProp error, object %d not writable", uid);
    return false;
  }

  MB_DPRINTLN("SetProp object %d ", uid);

  //////////
  // convert to LVariant

  // variant (lvar) doesn't have ownership of its content
  qlib::LVariant lvar;
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

  MB_DPRINTLN("SetProp conv OK ");

  //////////
  // perform setProperty

  // pobj possibly owns the copy of lvar's content
  ok = false;
  errmsg = LString();
  try {
    ok = pObj->setProperty(propnm, lvar);
  }
  catch (const qlib::LException &e) {
    errmsg = 
      LString::format("SetProp(%s) failed: %s", propnm.c_str(), e.getMsg().c_str());
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }
  catch (...) {
    errmsg = 
      LString::format("SetProp(%s) failed.", propnm.c_str());
    MB_DPRINTLN("Err: %s", errmsg.c_str());
  }

  if (!ok) {
    // TO DO: report error
    return false;
  }

  MB_DPRINTLN("SetProp OK ");

  // OK
  return true;
}

bool XmlRpcManager::convLvar2Xrval(qlib::LVariant &variant, xmlrpc_c::value *pRval)
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
    // TO DO: impl
    //PyObject *pObj = createWrapper(variant.getObjectPtr());

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

bool XmlRpcManager::convXrval2Lvar(const xmlrpc_c::value *pVal, qlib::LVariant &rvar)
{
  xmlrpc_c::value::type_t ntype = pVal->type();

  switch (ntype) {
  case xmlrpc_c::value::TYPE_INT:
    rvar.setIntValue(static_cast<const xmlrpc_c::value_int *>(pVal)->cvalue());
    break;

  case xmlrpc_c::value::TYPE_I8:
    rvar.setIntValue(static_cast<const xmlrpc_c::value_i8 *>(pVal)->cvalue());
    break;

  case xmlrpc_c::value::TYPE_BOOLEAN:
    rvar.setBoolValue(static_cast<const xmlrpc_c::value_boolean *>(pVal)->cvalue());
    break;

  case xmlrpc_c::value::TYPE_STRING:
    rvar.setStringValue(static_cast<const xmlrpc_c::value_string *>(pVal)->cvalue());
    break;

  case xmlrpc_c::value::TYPE_DOUBLE:
    rvar.setRealValue(static_cast<const xmlrpc_c::value_double *>(pVal)->cvalue());
    break;

  default:
    break;
  }

  return true;
}


////////////////////

namespace {
  class CreateObjMethod : public xmlrpc_c::method
  {
  public:
    CreateObjMethod() {
      // signature and help strings are documentation -- the client
      // can query this information with a system.methodSignature and
      // system.methodHelp RPC.
      this->_signature = "i:s";
      // method's result and two arguments are integers
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      std::string clsnm = paramList.getString(0);
        
      paramList.verifyEnd(1);
        
      XmlRpcManager *pMgr = XmlRpcManager::getInstance();
      qlib::uid_t nObjID = pMgr->createObj(clsnm);

      *retvalP = xmlrpc_c::value_int(nObjID);
    }
  };

  class GetServiceMethod : public xmlrpc_c::method
  {
  public:
    GetServiceMethod() {
      // signature and help strings are documentation -- the client
      // can query this information with a system.methodSignature and
      // system.methodHelp RPC.
      this->_signature = "i:s";
      // method's result and two arguments are integers
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      std::string clsnm = paramList.getString(0);
        
      paramList.verifyEnd(1);
        
      XmlRpcManager *pMgr = XmlRpcManager::getInstance();
      qlib::uid_t nObjID = pMgr->getService(clsnm);

      *retvalP = xmlrpc_c::value_int(nObjID);
    }
  };

  class DestroyObjMethod : public xmlrpc_c::method
  {
  public:
    DestroyObjMethod() {
      this->_signature = "i:i";
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(0);
        
      paramList.verifyEnd(1);
        
      XmlRpcManager *pMgr = XmlRpcManager::getInstance();
      bool res = pMgr->destroyObj(uid);

      *retvalP = xmlrpc_c::value_boolean(res);
    }
  };

  class HasPropMethod : public xmlrpc_c::method
  {
  public:
    HasPropMethod() {
      this->_signature = "i:is";
      this->_help = "This method";
    }
    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(0);
      std::string propnm = paramList.getString(1);
        
      paramList.verifyEnd(2);
        
      XmlRpcManager *pMgr = XmlRpcManager::getInstance();
      qlib::LScriptable *pObj = pMgr->getObj(uid);
      if (pObj==NULL) {
	// TO DO: report error
	return;
      }

      if (pObj->hasProperty(propnm)) {
	if (pObj->hasWritableProperty(propnm)) {
	  // has wrprop (1)
	  *retvalP = xmlrpc_c::value_int(1);
	}
	else {
	  // has roprop (2)
	  *retvalP = xmlrpc_c::value_int(2);
	}
	return;
      }

      if (pObj->hasMethod(propnm)) {
	// name is method (3)
	*retvalP = xmlrpc_c::value_int(3);
	return;
      }

      // prop not found
      *retvalP = xmlrpc_c::value_int(0);
      return;
    }
  };


  class GetPropMethod : public xmlrpc_c::method
  {
  public:
    GetPropMethod() {
      this->_signature = "i:is";
      this->_help = "This method";
    }

    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(0);
      std::string propnm = paramList.getString(1);
        
      paramList.verifyEnd(2);
        
      XmlRpcManager *pMgr = XmlRpcManager::getInstance();
      pMgr->getProp(uid, propnm, retvalP);

      return;
    }
  };

  class SetPropMethod : public xmlrpc_c::method
  {
  public:
    SetPropMethod() {
      this->_signature = "i:is";
      this->_help = "This method";
    }

    void
    execute(xmlrpc_c::paramList const& paramList,
            xmlrpc_c::value *   const  retvalP)
    {
      paramList.verifyEnd(3);
        
      qlib::uid_t uid = (qlib::uid_t) paramList.getInt(0);
      std::string propnm = paramList.getString(1);
      xmlrpc_c::value val = paramList[2];
        
      MB_DPRINTLN("SetProp for %d, %s called", uid, propnm.c_str());

      XmlRpcManager *pMgr = XmlRpcManager::getInstance();
      pMgr->setProp(uid, propnm, &val);

      *retvalP = xmlrpc_c::value_nil();
      return;
    }
  };
}

void XmlRpcManager::run()
{
  try {
    xmlrpc_c::registry myRegistry;
    
    ;
    myRegistry.addMethod("createObj", xmlrpc_c::methodPtr(new CreateObjMethod));
    myRegistry.addMethod("getService", xmlrpc_c::methodPtr(new GetServiceMethod));
    myRegistry.addMethod("destroyObj", xmlrpc_c::methodPtr(new DestroyObjMethod));

    myRegistry.addMethod("hasProp", xmlrpc_c::methodPtr(new HasPropMethod));
    myRegistry.addMethod("getProp", xmlrpc_c::methodPtr(new GetPropMethod));
    myRegistry.addMethod("setProp", xmlrpc_c::methodPtr(new SetPropMethod));

    xmlrpc_c::serverAbyss myAbyssServer(xmlrpc_c::serverAbyss::constrOpt()
					.registryP(&myRegistry)
					.portNumber(8080));
    
    myAbyssServer.run();

    // xmlrpc_c::serverAbyss.run() never returns
    MB_ASSERT(false);

  }
  catch (std::exception const& e) {
    std::cerr << "Something failed.  " << e.what() << std::endl;
  }

}

