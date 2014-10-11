//
//
// $Id: NP_Wrapper.cpp,v 1.8 2010/01/15 16:17:24 rishitani Exp $

#include <common.h>

#include "npcommon.h"
#include "NP_ScrPluginObj.hpp"
#include "NP_Wrapper.hpp"

#include <qlib/LVarArgs.hpp>

using namespace np;
using qlib::LString;
using qlib::LScriptable;

//static
NPObject *NP_ScrObjWrapper_Allocate(NPP npp, NPClass *aClass)
{
  return new ScrObjWrapper(npp);
}

DECLARE_NPOBJECT_CLASS_WITH_BASE(NP_ScrObjWrapper, NP_ScrObjWrapper_Allocate);

//static
NPObject *ScrObjWrapper::createWrapper(NPP npp, LScriptable *pobj)
{
  NPObject *pnpobj = NPN_CreateObject(npp, GET_NPOBJECT_CLASS(NP_ScrObjWrapper));

  ScrObjWrapper *pnp_scobj = static_cast<ScrObjWrapper *>(pnpobj);
  pnp_scobj->setNewObject(pobj);
  return pnpobj;
}

//////////////////////////////////////////////////////////////////////

ScrObjWrapper::~ScrObjWrapper()
{
  MB_DPRINTLN("CopyObjWrapper: deallocate.");
  if (m_pObj!=NULL) {
    m_pObj->destruct();
  }
}

//static
bool ScrObjWrapper::convIDtoName(NPIdentifier npid, LString &data)
{
  if (!NPN_IdentifierIsString(npid)) {
    LOG_DPRINTLN("convIDtoName %p is NOT string.", npid);
    return false;
  }

  MB_DPRINTLN("convIDtoName %p is string.", npid);

  NPUTF8 *pp = NPN_UTF8FromIdentifier(npid);
  if (pp==NULL) return false;
  data = LString(pp);
  NPN_MemFree(pp);

  MB_DPRINTLN("ScrObjWrapper::convIDtoName done (%s).", data.c_str());
  return true;
}

bool ScrObjWrapper::convLVarToNPVar(qlib::LVariant &rval, NPVariant *presult)
{
  switch (rval.getTypeID()) {
  case qlib::LVariant::LT_BOOLEAN: {
    BOOLEAN_TO_NPVARIANT(rval.getBoolValue(), *presult);
    return true;
    break;
  }

  case qlib::LVariant::LT_INTEGER: {
    INT32_TO_NPVARIANT(rval.getIntValue(), *presult);
    return true;
    break;
  }

  case qlib::LVariant::LT_REAL: {
    DOUBLE_TO_NPVARIANT(rval.getRealValue(), *presult);
    return true;
    break;
  }

  case qlib::LVariant::LT_STRING: {
    STRINGZ_TO_NPVARIANT(rval.getStringValue().c_str(), *presult);
    return true;
    break;
  }

  case qlib::LVariant::LT_OBJECT: {
    /*
    LScriptable *pObj = rval.getObjectPtr();
    MB_ASSERT(pObj!=NULL);

    NPObject *pnpobj = createWrapper(m_pNpp, pObj);
    OBJECT_TO_NPVARIANT(pnpobj, *presult);
    rval.forget();
    return true;
    */
    break;
  }

  default:
  case qlib::LVariant::LT_NULL: {
    VOID_TO_NPVARIANT(*presult);
    return true;
    break;
  }

  }

  return false;
}

bool ScrObjWrapper::convNPVarToLVar(const NPVariant *pvalue, qlib::LVariant &lvar)
{
  if (NPVARIANT_IS_BOOLEAN(*pvalue)) {
    lvar.setBoolValue(NPVARIANT_TO_BOOLEAN(*pvalue));
    return true;
  }

  if (NPVARIANT_IS_INT32(*pvalue)) {
    lvar.setIntValue(NPVARIANT_TO_INT32(*pvalue));
    return true;
  }

  if (NPVARIANT_IS_DOUBLE(*pvalue)) {
    lvar.setRealValue(NPVARIANT_TO_DOUBLE(*pvalue));
    return true;
  }

  if (NPVARIANT_IS_STRING(*pvalue)) {
    const NPString &str = NPVARIANT_TO_STRING(*pvalue);
    //LString stdstr(str.utf8characters, str.utf8length);
    LString stdstr(str.UTF8Characters, str.UTF8Length);
    lvar.setStringValue(stdstr);
    return true;
  }

  // TO DO: handle Object !!

  return false;
}

///////////////////////////////////////////////////////////////////////////////////

bool ScrObjWrapper::HasProperty(NPIdentifier name)
{
  MB_DPRINTLN("ScrObjWrapper::HasProperty %p", name);

  LString propnm;
  if (!convIDtoName(name, propnm))
    return false;

  MB_DPRINTLN("ScrObjWrapper::HasProperty(NPIdentifier name=%s)", propnm.c_str());
  return getObject()->hasProperty(propnm);
}

bool ScrObjWrapper::GetProperty(NPIdentifier name, NPVariant *result)
{
  MB_DPRINTLN("wrapper::getProperty %p 1", name);

  LString propnm;
  if (!convIDtoName(name, propnm))
    return false;

  MB_DPRINTLN("wapper::GetProperty(NPIdentifier name=%s)", propnm.c_str());

  qlib::LVariant rval;
  if (!getObject()->getProperty(propnm, rval))
    return false;

  if (!convLVarToNPVar(rval, result))
    return false;

  return true;
}

bool ScrObjWrapper::SetProperty(NPIdentifier name, const NPVariant *value)
{
  MB_DPRINTLN("wrapper::setProperty %p 1", name);

  LString propnm;
  if (!convIDtoName(name, propnm))
    return false;

  qlib::LVariant rval;

  if (!convNPVarToLVar(value, rval))
    return false;
  
  if (!getObject()->setProperty(propnm, rval))
    return false;

  return true;
}

///////////////////////////////////////////////////////////////////////////////////

bool ScrObjWrapper::convNPArgToLArg(const NPVariant *args, qlib::LVarArgs &largs)
{
  int i;
  for (i=0; i<largs.getSize(); ++i) {
    MB_DPRINTLN("conv NP --> L arg %d ....", i);
    if (!convNPVarToLVar(&args[i], largs.at(i)))
      return false;
    MB_DPRINTLN("          OK.");
  }
  return true;
}

bool ScrObjWrapper::HasMethod(NPIdentifier name)
{
  MB_DPRINTLN("ScrObjWrapper::HasMethod %p 1", name);

  LString mthnm;
  if (!convIDtoName(name, mthnm))
    return false;

  return getObject()->hasMethod(mthnm);
}

bool ScrObjWrapper::Invoke(NPIdentifier name, const NPVariant *args,
			      uint32_t argCount, NPVariant *presult)
{
  MB_DPRINTLN("ScrObjWrapper::Invoke");

  LString mthnm;
  if (!convIDtoName(name, mthnm))
    return false;

  qlib::LVarArgs largs(argCount);

  if (!convNPArgToLArg(args, largs))
    return false;

  if (!getObject()->invokeMethod(mthnm, largs))
    return false;
  MB_DPRINTLN("invoke OK().");

  if (!convLVarToNPVar(largs.retval(), presult))
    return false;
  MB_DPRINTLN("conv retval OK().");

  return true;
}

bool ScrObjWrapper::InvokeDefault(const NPVariant *args, uint32_t argCount,
				     NPVariant *result)
{
  MB_DPRINTLN("ScrObjWrapper::InvokeDefault");
  return false;
}


