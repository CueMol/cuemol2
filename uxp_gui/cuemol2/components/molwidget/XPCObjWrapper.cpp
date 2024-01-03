//
// $Id: XPCObjWrapper.cpp,v 1.58 2011/03/10 13:11:55 rishitani Exp $
//

#include "xpcom.hpp"

#include <nsIMutableArray.h>
#include <nsISupportsPrimitives.h>
#include <nsIVariant.h>

#include "XPCObjWrapper.hpp"
#include "XPCCueMol.hpp"
#include <qlib/LScriptable.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/LUnicode.hpp>
#include <qlib/PropSpec.hpp>
//#include <qlib/NestedPropHandler.hpp>

using namespace xpcom;
using qlib::LVariant;
using qlib::LVarArray;
using qlib::LString;

#ifdef NS_IMPL_ISUPPORTS
NS_IMPL_ISUPPORTS(XPCObjWrapper, qIObjWrapper);
#else
NS_IMPL_ISUPPORTS1(XPCObjWrapper, qIObjWrapper);
#endif

XPCObjWrapper::XPCObjWrapper(XPCCueMol *pParent, int ind)
{
  m_pWrapped = NULL;
  m_pParent = pParent;
  m_nIndex = ind;
}

XPCObjWrapper::~XPCObjWrapper()
{
  if (m_pParent!=NULL)
    m_pParent->notifyDestr(m_nIndex);
  
  if (m_pWrapped!=NULL)
    m_pWrapped->destruct();
}

void XPCObjWrapper::setWrappedObj(qlib::LScriptable *pobj)
{
  if (m_pWrapped!=NULL)
    m_pWrapped->destruct();

  m_pWrapped = pobj;
}

void XPCObjWrapper::detach()
{
  if (m_pWrapped!=NULL)
    m_pWrapped->destruct();
  m_pWrapped = NULL;
  m_pParent = NULL;
  m_nIndex = 0;
}

qlib::LScriptable *XPCObjWrapper::getWrappedObj() const
{
  return m_pWrapped;
}

static
nsresult NSArrayToLArray(nsIVariant *aValue, qlib::LVariant &variant)
{
  uint16_t valueType;
  nsIID iid;
  uint32_t valueCount =0;
  void* rawArray;
  nsresult rv;
  
  rv = aValue->GetAsArray(&valueType, &iid, &valueCount, &rawArray);
  if (NS_FAILED(rv)) {
    // empty array
    LVarArray res(0);
    variant.setArrayValue(res);
    return NS_OK;
  }

  LVarArray res(valueCount);
  if (//valueType == nsIDataType::VTYPE_INTERFACE ||
      valueType == nsIDataType::VTYPE_INTERFACE_IS) {
    nsISupports** values = static_cast<nsISupports**>(rawArray);
    for (uint32_t i = 0; i < valueCount; ++i) {
      nsCOMPtr<nsISupports> supports = dont_AddRef(values[i]);
      nsCOMPtr<qIObjWrapper> piobj = do_QueryInterface(supports);
      XPCObjWrapper *pp = dynamic_cast<XPCObjWrapper *>(piobj.get());
      if (pp==NULL) {
        LOG_DPRINTLN("NSVar2LVar> FATAL ERROR: unknown wrapper type (unsupported)");
        //nsMemory::Free(rawArray);
        NS_Free(rawArray);
        return NS_ERROR_NOT_IMPLEMENTED;
      }

      // object is owned by XPCOM
      // (variant share the ptr and don't have an ownership)
      res[i].shareObjectPtr(pp->getWrappedObj());
    }
  }

  //nsMemory::Free(rawArray);
  NS_Free(rawArray);
  
  // Container array is temporaly owned by wrapper function context
  //  (and will be freed after the execution)
  variant.setArrayValue(res);
  
  return NS_OK;
}

static
nsresult NSVarToLVar(nsIVariant *aValue, qlib::LVariant &variant)
{
  nsresult rv;
  NS_ENSURE_ARG_POINTER(aValue);

  PRUint16 dt;
  rv = aValue->GetDataType(&dt);
  if (NS_FAILED(rv)) return rv;

  // MB_DPRINTLN("NSVarToLVar dt=%d", dt);
  switch (dt) {
  case nsIDataType::VTYPE_VOID:
  case nsIDataType::VTYPE_EMPTY:
    variant.setNull();
    return NS_OK;
    
  case nsIDataType::VTYPE_BOOL: {
    bool val;
    rv = aValue->GetAsBool(&val);
    NS_ENSURE_SUCCESS(rv,rv);
    //MB_DPRINTLN("NSVar: boolean(%d)", val);
    variant.setBoolValue(val?true:false);
    return NS_OK;
    //GET_FROM_V(bool, v->GetAsBool, MyBool_FromBool);
  }

  case nsIDataType::VTYPE_EMPTY_ARRAY:
  case nsIDataType::VTYPE_ARRAY: {
    return NSArrayToLArray(aValue, variant);
  }

  case nsIDataType::VTYPE_INT8:
  case nsIDataType::VTYPE_INT16:
  case nsIDataType::VTYPE_INT32:
  case nsIDataType::VTYPE_UINT8:
  case nsIDataType::VTYPE_UINT16:
  case nsIDataType::VTYPE_UINT32: {
    PRInt32 val;
    rv = aValue->GetAsInt32(&val);
    NS_ENSURE_SUCCESS(rv,rv);
    //MB_DPRINTLN("NSVar: integer(%d)", val);
    variant.setIntValue(val);
    return NS_OK;
    // GET_FROM_V(PRUint32, v->GetAsUint32, PyLong_FromUnsignedLong);
  }

  case nsIDataType::VTYPE_INT64:
  case nsIDataType::VTYPE_UINT64:
    // TO DO: implementation
    return NS_ERROR_NOT_IMPLEMENTED;

  case nsIDataType::VTYPE_FLOAT:
  case nsIDataType::VTYPE_DOUBLE: {
    double val;
    rv = aValue->GetAsDouble(&val);
    NS_ENSURE_SUCCESS(rv,rv);
    //MB_DPRINTLN("NSVar: real(%f)", val);
    variant.setRealValue(val);
    return NS_OK;
    // GET_FROM_V(double, v->GetAsDouble, PyFloat_FromDouble);
  }

    //
    // Case of the "ASCII or UTF8 strings"
    //
  case nsIDataType::VTYPE_CHAR:
  case nsIDataType::VTYPE_CHAR_STR:
  case nsIDataType::VTYPE_STRING_SIZE_IS:
  case nsIDataType::VTYPE_CSTRING:
  case nsIDataType::VTYPE_UTF8STRING: {
    char *psz;
    PRUint32 nlen;
    rv = aValue->GetAsStringWithSize(&nlen, &psz);
    NS_ENSURE_SUCCESS(rv,rv);

    //MB_DPRINTLN("NSVar: cstring(%s)", psz);
    if (psz && nlen>0) {
      variant.setStringValue(LString(psz));
    }
    else {
      variant.setStringValue(LString());
    }
    return NS_OK;
  }

    //
    // Case of the "wide strings"
    //
  case nsIDataType::VTYPE_WCHAR:
  case nsIDataType::VTYPE_DOMSTRING:
  case nsIDataType::VTYPE_WSTRING_SIZE_IS:
  case nsIDataType::VTYPE_ASTRING:
    {
      //PRUnichar *psz;
      char16_t *psz;
      PRUint32 nlen;
      rv = aValue->GetAsWStringWithSize(&nlen, &psz);
      NS_ENSURE_SUCCESS(rv,rv);
      
      if (psz && nlen>0) {
	LString retval;
	qlib::UCS16toUTF8((U16Char *)psz, nlen, retval);
	// MB_DPRINTLN("NSVar: wstring(%s)", retval.c_str());
	variant.setStringValue(retval);
	//nsMemory::Free(psz);
	NS_Free(psz);
      }
      else {
	variant.setStringValue(LString());
      }
      return NS_OK;
    }

    //
    // Case of the "Object"
    //
  case nsIDataType::VTYPE_INTERFACE: {
    LOG_DPRINTLN("NSVar2LVar> nsIDataType::VTYPE_INTERFACE is not supported");
    // ?? what is difference between INTERFACE and INTERFACE_IS ???
    // TO DO: implementation
    break;
  }

  case nsIDataType::VTYPE_INTERFACE_IS: {
    //MB_DPRINTLN("NSVar2LVar> nsIDataType::VTYPE_INTERFACE_IS");
    nsCOMPtr<nsISupports> pisup;

    rv = aValue->GetAsISupports(getter_AddRefs(pisup));
    if (NS_FAILED(rv))
      LOG_DPRINTLN("NSVar2LVar> GetAsISupports failed.");
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<qIObjWrapper> piobj(do_QueryInterface(pisup, &rv));
    if (NS_FAILED(rv)) {
      LOG_DPRINTLN("NSVar2LVar> NSVar does not have IF of qIObjWrapper (unsupported)");
    }

    XPCObjWrapper *pp = dynamic_cast<XPCObjWrapper *>(piobj.get());
    if (pp==NULL) {
      LOG_DPRINTLN("NSVar2LVar> FATAL ERROR: unknown wrapper type (unsupported)");
      break;
    }

    // object is owned by XPCOM
    // (variant share the ptr and don't have an ownership)
    variant.shareObjectPtr(pp->getWrappedObj());
    
    return NS_OK;
  }

  default:
    break;

  } // switch (dt)


  return NS_ERROR_NOT_IMPLEMENTED;
}

static
nsresult createNull(nsIVariant **aValue)
{
  nsresult rv;

  // MB_DPRINTLN("NSVar: SetAsVoid");
  nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  
  rv = nsvar->SetAsVoid();
  NS_ENSURE_SUCCESS(rv, rv);
  
  *aValue = nsvar;
  NS_ADDREF(*aValue);
  
  return NS_OK;
}

static
nsresult LVarToNSVar(qlib::LVariant &variant, nsIVariant **aValue, XPCCueMol *pParent)
{
  nsresult rv;
  NS_ENSURE_ARG_POINTER(aValue);

  switch (variant.getTypeID()) {
  case qlib::LVariant::LT_NULL: {
    return createNull(aValue);
  }

  case qlib::LVariant::LT_BOOLEAN: {
    //MB_DPRINTLN("LVar: boolean(%d)", variant.getBoolValue());

    nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = nsvar->SetAsBool((bool)variant.getBoolValue());
    NS_ENSURE_SUCCESS(rv, rv);

    *aValue = nsvar;
    NS_ADDREF(*aValue);

    return NS_OK;
  }

  case qlib::LVariant::LT_INTEGER: {
    //MB_DPRINTLN("LVar: integer(%d)", variant.getIntValue());

    nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = nsvar->SetAsInt32(variant.getIntValue());
    NS_ENSURE_SUCCESS(rv, rv);

    *aValue = nsvar;
    NS_ADDREF(*aValue);

    return NS_OK;
  }

  case qlib::LVariant::LT_REAL: {
    //MB_DPRINTLN("LVar2NSVar> real(%f)", variant.getRealValue());

    // nsvar = new nsVariant();
    nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = nsvar->SetAsDouble(variant.getRealValue());
    NS_ENSURE_SUCCESS(rv, rv);

    *aValue = nsvar;
    NS_ADDREF(*aValue);
    //MB_DPRINTLN("LVar2NSVar> set aValue OK.");

    return NS_OK;
  }

  case qlib::LVariant::LT_STRING: {
    LString str = variant.getStringValue();
    //MB_DPRINTLN("LVar: string(%s)", str.c_str());

    nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    if (qlib::isASCII(str)) {
      const char *pcstr = str.c_str();
      rv = nsvar->SetAsString(pcstr);
      NS_ENSURE_SUCCESS(rv, rv);
    }
    else {
      nsAutoString ucs16;
      nsAutoCString nsstr(str.c_str());
      ::CopyUTF8toUTF16(nsstr, ucs16);
      rv = nsvar->SetAsAString(ucs16);

      NS_ENSURE_SUCCESS(rv, rv);
    }

    *aValue = nsvar;
    NS_ADDREF(*aValue);
    //MB_DPRINTLN("LVar2NSVar> set aValue OK.");

    return NS_OK;
  }

  case qlib::LVariant::LT_ENUM: {
    LString str = variant.getEnumValue();

    nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    const char *pcstr = str.c_str();
    rv = nsvar->SetAsString(pcstr);
    NS_ENSURE_SUCCESS(rv, rv);

    *aValue = nsvar;
    NS_ADDREF(*aValue);

    return NS_OK;
  }

  case qlib::LVariant::LT_OBJECT: {
    if (pParent==NULL) {
      LOG_DPRINTLN("FATAL ERROR: cannot conver object variant to NSVariant!!");
      return NS_ERROR_FAILURE;
    }

    // Check the null/wrapped null
    if (variant.getBareObjectPtr()==NULL) {
      return createNull(aValue);
    }

    XPCObjWrapper *pWrap = pParent->createWrapper();
    pWrap->setWrappedObj(variant.getObjectPtr());

    // Ownership is now moved to XPCOM.
    variant.forget();

    nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    nsIID iid_wrp = NS_GET_IID(qIObjWrapper);
    rv = nsvar->SetAsInterface(iid_wrp, pWrap);
    NS_ENSURE_SUCCESS(rv, rv);

    *aValue = nsvar;
    NS_ADDREF(*aValue);

    return NS_OK;
  }
    
  case qlib::LVariant::LT_ARRAY: {
    nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    LVarArray *pLArray = variant.getArrayPtr();
    int nCount = pLArray->getSize();

    nsIVariant ** ptr = new nsIVariant *[nCount];
    for (int i=0; i<nCount; ++i)
      LVarToNSVar(pLArray->at(i), &ptr[i], pParent);

    int nType = nsIDataType::VTYPE_INTERFACE_IS;
    nsIID iid = NS_GET_IID(nsIVariant);
    rv = nsvar->SetAsArray(nType, &iid, nCount, ptr);
    NS_ENSURE_SUCCESS(rv, rv);

    *aValue = nsvar;
    NS_ADDREF(*aValue);

    // nsIVariant array has been copied by SetAsArray(),
    // so now we can delete everything.
    for (int i=0; i<nCount; ++i)
      NS_RELEASE(ptr[i]);
    delete [] ptr;

    return NS_OK;
  }

  default:
    LOG_DPRINTLN("ObjWrapper::LVarToNSVar> Unknown LVariant type!");
    break;
  }

  LOG_DPRINTLN("ObjWrapper::LVarToJSVal> Unable to convert LVariant to nsVariant!");
  return NS_ERROR_NOT_IMPLEMENTED;
}

//////////////////////////////////////////////////

nsresult XPCObjWrapper::checkPropImpl(const char *propname, bool *rval /*= NULL*/)
{
  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }

  bool hasProperty = m_pWrapped->hasNestedProperty(propname);

  if (rval!=NULL)
    *rval = hasProperty;

  if (rval==NULL && !hasProperty) {
    LOG_DPRINTLN("Obj %s: prop <%s> not found",
		 typeid(*m_pWrapped).name(),
		 propname);
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

NS_IMETHODIMP XPCObjWrapper::GetProp(const char *propname, nsIVariant **_retval)
{
  nsresult rv;
  rv = checkPropImpl(propname);
  NS_ENSURE_SUCCESS(rv, rv);

  //MB_DPRINTLN("wrapped: %p/%s", m_pWrapped, typeid(*m_pWrapped).name());
  qlib::LVariant lvar;

  bool ok;
  LString errmsg;

  try {
    //qlib::NestedPropHandler nph(propname, m_pWrapped);
    //ok = nph.apply()->getProperty(nph.last_name(), lvar);
    ok = m_pWrapped->getNestedProperty(propname, lvar);
  }
  catch (qlib::LException &e) {
    ok = false;
    errmsg = 
      LString::format("Exception occured in getProp for %s: %s",
                      propname,
                      e.getFmtMsg().c_str());
  }
  catch (...) {
    ok = false;
    errmsg = 
      LString::format("Unknown Exception occured in getProp for %s",
                      propname);
  }
  
  if (!ok) {
    LOG_DPRINTLN("GetProp: getProperty(\"%s\") call failed.", propname);
    if (!errmsg.isEmpty()) {
      LOG_DPRINTLN("Reason: %s", errmsg.c_str());
    }
    return NS_ERROR_FAILURE;
  }

  rv = LVarToNSVar(lvar, _retval, m_pParent);
  
  return rv;
}

/* void setProp (in string propname, in nsIVariant value); */
NS_IMETHODIMP XPCObjWrapper::SetProp(const char *propname, nsIVariant *value)
{
  nsresult rv;
  rv = checkPropImpl(propname);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVariant lvar;
  rv = NSVarToLVar(value, lvar);
  NS_ENSURE_SUCCESS(rv, rv);

  //////////

  bool ok;
  LString errmsg;

  try {
    //qlib::NestedPropHandler nph(propname, m_pWrapped);
    //ok = nph.apply()->setProperty(nph.last_name(), lvar);

    ok = m_pWrapped->setNestedProperty(propname, lvar);
  }
  catch (qlib::LException &e) {
    ok = false;
    errmsg = 
      LString::format("Exception occured in setProp for %s: %s",
                      propname, e.getFmtMsg().c_str());
  }
  catch (...) {
    ok = false;
    errmsg = 
      LString::format("Unknown Exception occured in setProp for %s",
                      propname);
  }
  
  if (!ok) {
    LOG_DPRINTLN("Error: SetProp for property \"%s\" failed.", propname);
    if (!errmsg.isEmpty()) {
      LOG_DPRINTLN("Reason: %s", errmsg.c_str());
    }
    return NS_ERROR_FAILURE;
  }

  //MB_DPRINTLN("XPCObjWp> SetProp OK.");
  return NS_OK;
}

/* void resetProp (in string propname); */
NS_IMETHODIMP XPCObjWrapper::ResetProp(const char *propname)
{
  nsresult rv;
  rv = checkPropImpl(propname);
  NS_ENSURE_SUCCESS(rv, rv);

  //////////

  bool ok;
  LString errmsg;

  try {
    //qlib::NestedPropHandler nph(propname, m_pWrapped);
    //ok = nph.apply()->resetProperty(nph.last_name());
    ok = m_pWrapped->resetNestedProperty(propname);
  }
  catch (qlib::LException &e) {
    ok = false;
    errmsg = 
      LString::format("Exception occured in resetProp for %s: %s",
                      propname, e.getFmtMsg().c_str());
  }
  catch (...) {
    ok = false;
    errmsg = 
      LString::format("Unknown Exception occured in resetProp for %s",
                      propname);
  }
  
  if (!ok) {
    LOG_DPRINTLN("Error: ReSetProp for property \"%s\" failed.", propname);
    if (!errmsg.isEmpty()) {
      LOG_DPRINTLN("Reason: %s", errmsg.c_str());
    }
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

/* boolean isPropDefault (in string propname); */
NS_IMETHODIMP XPCObjWrapper::IsPropDefault(const char *propname, PRInt32 *_retval )
{
  nsresult rv;
  rv = checkPropImpl(propname);
  NS_ENSURE_SUCCESS(rv, rv);

  //////////

  bool ok = true;
  int result;
  LString errmsg;

  try {
    //qlib::NestedPropHandler nph(propname, m_pWrapped);
    //qlib::LPropSupport *pTmp = nph.apply();
    /*
    if (! pTmp->hasPropDefault(nph.last_name()) )
      result = 0; // no default value
    else if (! pTmp->isPropDefault(nph.last_name()) )
      result = 1; // has default but not default now
    else
      result = 2; // has default and now is default
      */

    if (! m_pWrapped->hasNestedPropDefault(propname) )
      result = 0; // no default value
    else if (! m_pWrapped->isPropDefault(propname) )
      result = 1; // has default but not default now
    else
      result = 2; // has default and now is default
  }
  catch (qlib::LException &e) {
    ok = false;
    errmsg = 
      LString::format("Exception occured in isPropDef for %s: %s",
                      propname, e.getFmtMsg().c_str());
  }
  catch (...) {
    ok = false;
    errmsg = 
      LString::format("Unknown Exception occured in isPropDef for %s",
                      propname);
  }
  
  if (!ok) {
    LOG_DPRINTLN("Error: isPropDef for property \"%s\" failed.", propname);
    if (!errmsg.isEmpty()) {
      LOG_DPRINTLN("Reason: %s", errmsg.c_str());
    }
    return NS_ERROR_FAILURE;
  }

  if (_retval!=NULL)
    *_retval = result;

  return NS_OK;
}

/* boolean hasProp (in string propname); */
NS_IMETHODIMP XPCObjWrapper::HasProp(const char *propname, bool *_retval)
{
  nsresult rv;
  rv = checkPropImpl(propname, _retval);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult createStringObj(const char *psz, nsISupportsCString **_retval)
{
  nsresult rv;

  nsCOMPtr<nsISupportsCString> nsvar(do_CreateInstance(NS_SUPPORTS_CSTRING_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCString str(psz);
  nsvar->SetData(str);
  *_retval = nsvar;
  NS_ADDREF(*_retval);
  
  return NS_OK;
}

/*
NS_IMETHODIMP XPCObjWrapper::EnumPropNames(nsIVariant **_retval)
{
  nsresult rv;

  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }
  
  nsCOMPtr<nsIWritableVariant> nsvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  std::set<LString> sset;
  m_pWrapped->getPropNames(sset);

  int i, nstr = sset.size();
  const char **ppsztmp = new const char *[nstr];
  std::set<LString>::const_iterator iter = sset.begin();
  for (i=0; iter!=sset.end(); ++iter,++i) {
    ppsztmp[i] = iter->c_str();
  }

  rv = nsvar->SetAsArray(nsIDataType::VTYPE_CHAR_STR, NULL, nstr, ppsztmp);
  delete [] ppsztmp;
  NS_ENSURE_SUCCESS(rv, rv);

  *_retval = nsvar;
  NS_ADDREF(*_retval);

  return NS_OK;
}
*/

/* boolean hasMethod (in string name); */
NS_IMETHODIMP XPCObjWrapper::HasMethod(const char *name, bool *_retval)
{
  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }

  bool hasMethod = m_pWrapped->hasMethod(name);
  if (hasMethod)
    *_retval = PR_TRUE;
  else
    *_retval = PR_FALSE;

  return NS_OK;
}

nsresult XPCObjWrapper::invokeChk1(const char *name)
{
  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }

  bool hasMethod = m_pWrapped->hasMethod(name);
  if (!hasMethod) {
    LOG_DPRINTLN("Invoke Obj %s: method <%s> not found",
		 typeid(*m_pWrapped).name(),
		 name);
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

nsresult XPCObjWrapper::invokeImpl(const char *name, LVarArgs &largs, nsIVariant **_retval)
{
  nsresult rv;

  bool ok;
  LString errmsg;

  try {
    ok = m_pWrapped->invokeMethod(name, largs);
  }
  catch (qlib::LException &e) {
    ok = false;
    errmsg = 
      LString::format("Exception occured in native method \"%s\"\nReason: %s",
                      name, e.getMsg().c_str());
    m_pParent->setErrMsg(e.getMsg());
  }
  catch (...) {
    ok = false;
    errmsg = 
      LString::format("Unknown Exception occured in native method \"%s\"",
                      name);
    m_pParent->setErrMsg("(unknown)");
  }
  
  if (!ok) {
    if (!errmsg.isEmpty()) {
      LOG_DPRINTLN("%s", errmsg.c_str());
    }
    else {
      LOG_DPRINTLN("CallNativeMethod: Error in invoking method \"%s\""
                   " on object %s (%p).",
                   name, typeid(*m_pWrapped).name(), m_pWrapped);
    }
    return NS_ERROR_FAILURE;
  }

  rv = LVarToNSVar(largs.retval(), _retval, m_pParent);
  
  return rv;
}

/* nsIVariant invoke0 (in string name); */
NS_IMETHODIMP XPCObjWrapper::Invoke0(const char *name, nsIVariant **_retval)
{
  nsresult rv;
//  MB_DPRINTLN("XPCObjWrapper::Invoke called for %s", name);

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVarArgs largs(0);
  return invokeImpl(name, largs, _retval);
}

/* nsIVariant invoke1 (in string name, in nsIVariant arg1); */
NS_IMETHODIMP XPCObjWrapper::Invoke1(const char *name, nsIVariant *arg1, nsIVariant **_retval)
{
  nsresult rv;
//  MB_DPRINTLN("XPCObjWrapper::Invoke called for %s", name);

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVarArgs largs(1);

  rv = NSVarToLVar(arg1, largs.at(0));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke1> 1st argument conversion failed");
    return rv;
  }
    
  return invokeImpl(name, largs, _retval);
}

/* nsIVariant invoke2 (in string name, in nsIVariant arg1, in nsIVariant arg2); */
NS_IMETHODIMP XPCObjWrapper::Invoke2(const char *name, nsIVariant *arg1, nsIVariant *arg2, nsIVariant **_retval)
{
  nsresult rv;
//  MB_DPRINTLN("XPCObjWrapper::Invoke called for %s", name);

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVarArgs largs(2);

  rv = NSVarToLVar(arg1, largs.at(0));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke2> 1st argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg2, largs.at(1));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke2> 2nd argument conversion failed");
    return rv;
  }
    
  return invokeImpl(name, largs, _retval);
}


/* nsIVariant invoke3 (in string name, in nsIVariant arg1, in nsIVariant arg2, in nsIVariant arg3); */
NS_IMETHODIMP XPCObjWrapper::Invoke3(const char *name, nsIVariant *arg1, nsIVariant *arg2, nsIVariant *arg3, nsIVariant **_retval)
{
  nsresult rv;
//  MB_DPRINTLN("XPCObjWrapper::Invoke called for %s", name);

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVarArgs largs(3);

  rv = NSVarToLVar(arg1, largs.at(0));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke3> 1st argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg2, largs.at(1));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke3> 2nd argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg3, largs.at(2));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke3> 3rd argument conversion failed");
    return rv;
  }
    
  return invokeImpl(name, largs, _retval);
}

/* nsIVariant invoke4 (in string name, in nsIVariant arg1, in nsIVariant arg2, in nsIVariant arg3, in nsIVariant arg4); */
NS_IMETHODIMP XPCObjWrapper::Invoke4(const char *name, nsIVariant *arg1, nsIVariant *arg2, nsIVariant *arg3, nsIVariant *arg4, nsIVariant **_retval)
{
  nsresult rv;

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVarArgs largs(4);

  rv = NSVarToLVar(arg1, largs.at(0));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke4> 1st argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg2, largs.at(1));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke4> 2nd argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg3, largs.at(2));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke4> 3rd argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg4, largs.at(3));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke4> 4th argument conversion failed");
    return rv;
  }
    
  return invokeImpl(name, largs, _retval);
}

/* nsIVariant invoke5 (in string name, in nsIVariant arg1, in nsIVariant arg2, in nsIVariant arg3, in nsIVariant arg4, in nsIVariant arg5); */
NS_IMETHODIMP XPCObjWrapper::Invoke5(const char *name, nsIVariant *arg1, nsIVariant *arg2, nsIVariant *arg3, nsIVariant *arg4, nsIVariant *arg5, nsIVariant **_retval)
{
  nsresult rv;
//  MB_DPRINTLN("XPCObjWrapper::Invoke called for %s", name);

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVarArgs largs(5);

  rv = NSVarToLVar(arg1, largs.at(0));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke5> 1st argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg2, largs.at(1));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke5> 2nd argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg3, largs.at(2));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke5> 3rd argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg4, largs.at(3));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke5> 4th argument conversion failed");
    return rv;
  }
    
  rv = NSVarToLVar(arg5, largs.at(4));
  if (NS_FAILED(rv)) {
    LOG_DPRINTLN("XPC::Invoke5> 5th argument conversion failed");
    return rv;
  }
    
  return invokeImpl(name, largs, _retval);
}

NS_IMETHODIMP XPCObjWrapper::Invoke(const char *name, nsIVariant *valueArray, nsIVariant **_retval)
{
  nsresult rv;
//  MB_DPRINTLN("XPCObjWrapper::Invoke called for %s", name);

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);


  PRUint16 dt;
  rv = valueArray->GetDataType(&dt);
  NS_ENSURE_SUCCESS(rv, rv);
  
  if (dt!=nsIDataType::VTYPE_ARRAY && dt!=nsIDataType::VTYPE_EMPTY_ARRAY) {
    LOG_DPRINTLN("XPC::Invoke> argument is not an array (%d)", dt);
    return NS_ERROR_INVALID_ARG;
  }

  nsIID nsiid;
  PRUint32 nelem;
  void *pArrayValue = NULL;

  if (dt==nsIDataType::VTYPE_EMPTY_ARRAY) {
    nelem = 0;
  }
  else {
    valueArray->GetAsArray(&dt, &nsiid, &nelem, &pArrayValue);
  }

  qlib::LVarArgs largs(nelem);
  bool bOK = true;
  unsigned int i;

  if (nelem>0) {

    switch (dt) {

      // Integer array
    case nsIDataType::VTYPE_INT8:
    case nsIDataType::VTYPE_INT16:
    case nsIDataType::VTYPE_INT32:
    case nsIDataType::VTYPE_UINT8:
    case nsIDataType::VTYPE_UINT16:
    case nsIDataType::VTYPE_UINT32: {
      PRInt32 *pdata = (PRInt32 *)pArrayValue;
      for (i=0; i<nelem; ++i)
        largs.at(i).setIntValue(pdata[i]);
      break;
    }

      // Real array
    case nsIDataType::VTYPE_FLOAT:
    case nsIDataType::VTYPE_DOUBLE: {
      double *pdata = (double *)pArrayValue;
      for (i=0; i<nelem; ++i)
        largs.at(i).setRealValue(pdata[i]);
      break;
    }

      // ASCII/UTF8 String array
    case nsIDataType::VTYPE_CHAR:
    case nsIDataType::VTYPE_CHAR_STR:
    case nsIDataType::VTYPE_STRING_SIZE_IS:
    case nsIDataType::VTYPE_CSTRING:
    case nsIDataType::VTYPE_UTF8STRING: {
      // TO DO: implementation
      bOK = false;
      break;
    }

      // Widechar/UTF32?? String array
    case nsIDataType::VTYPE_WCHAR:
    case nsIDataType::VTYPE_DOMSTRING:
    case nsIDataType::VTYPE_WSTRING_SIZE_IS:
    case nsIDataType::VTYPE_ASTRING: {
      // TO DO: implementation
      bOK = false;
      break;
    }
      
      // Object array
    case nsIDataType::VTYPE_INTERFACE:
    case nsIDataType::VTYPE_INTERFACE_IS: {
      nsISupports **pdata = (nsISupports **)pArrayValue;
      for (i=0; i<nelem; ++i) {
        nsISupports *ppp = pdata[i];
        nsCOMPtr<nsIVariant> nsvar(do_QueryInterface(ppp, &rv));
        if (NS_FAILED(rv)) {
          bOK = false;
          ppp->Release();
          LOG_DPRINTLN("XPC::Invoke> %d th argument conversion failed", i);
          continue;
        }
        
        rv = NSVarToLVar(nsvar, largs.at(i));
        if (NS_FAILED(rv)) {
          bOK = false;
          LOG_DPRINTLN("XPC::Invoke> %d th argument conversion failed", i);
        }
        
        ppp->Release();
      } // for
      break;
    }
      
    default:
      bOK = false;
      MB_DPRINTLN("Unsupported type (%d th) array conversion is requested", dt);
      break;
    } // switch (dt)

    //nsMemory::Free(pArrayValue);
    NS_Free(pArrayValue);
  } // if (nelem>0)

  if (!bOK) {
    LOG_DPRINTLN("XPC::Invoke> argument conversion failed");
    return NS_ERROR_FAILURE;
  }

  return invokeImpl(name, largs, _retval);

}

NS_IMETHODIMP XPCObjWrapper::ToString(char **_retval)
{
  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }

  LString str, errmsg;
  bool ok = false;
  try {
    str = m_pWrapped->toString();
    ok = true;
  }
  catch (qlib::LException &e) {
    errmsg = 
      LString::format("Exception occured in toString(): %s",
                      e.getFmtMsg().c_str());
  }
  catch (...) {
    errmsg = "Unknown Exception occured in toString()";
  }
  
  if (!ok) {
    LOG_DPRINTLN("CallNativeMethod: Error in invoking toString() on object %p.", m_pWrapped);
    if (!errmsg.isEmpty()) {
      LOG_DPRINTLN("Reason: %s", errmsg.c_str());
    }
    return NS_ERROR_FAILURE;
  }

  if (str.isEmpty()) {
    str = LString::format("[CueMol2 object %p]", m_pWrapped);
  }
  nsAutoCString nsstr(str.c_str());
  *_retval = ToNewCString(nsstr);

  return NS_OK;
}

NS_IMETHODIMP XPCObjWrapper::GetPropsJSON(nsAString &_retval)
{
  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }

  try {
    LString str = qlib::getPropsJSONImpl(m_pWrapped);
    nsAutoCString nsstr(str.c_str());
    ::CopyUTF8toUTF16(nsstr, _retval);
  }
  catch (qlib::LException &e) {
    LString errmsg = 
      LString::format("Exception occured in getPropsJSON: %s",
                      e.getFmtMsg().c_str());
    LOG_DPRINTLN(errmsg);
    return NS_ERROR_FAILURE;
  }
  catch (...) {
    LString errmsg = 
      LString::format("Unknown Exception occured in getPropsJSON");
    LOG_DPRINTLN(errmsg);
    return NS_ERROR_FAILURE;
  }

  //*_retval = ToNewCString(nsstr);

  return NS_OK;
}

//////////////////////////////////////

#include <qlib/LScrCallBack.hpp>

class XPCCallBackObj : public qlib::LScrCallBack
{
private:
  qICallBack *pXPCB;

public:

  XPCCallBackObj(qICallBack *p) {
    pXPCB = p;
    NS_ADDREF(pXPCB);
  }

  virtual ~XPCCallBackObj() {
    NS_RELEASE(pXPCB);
    pXPCB = NULL;
  }

  virtual bool invoke(qlib::LVarArgs &args)
  {
    nsresult rv;
    nsIVariant *prval=NULL;
    const int nargs = args.getSize();
    nsIID nsiid;

    XPCCueMol *pParent = XPCCueMol::getInstance();

    if (nargs==0) {
      rv = pXPCB->Notify0(&prval);
    }
    else {

      nsiid = NS_GET_IID(nsIVariant);
      int i;
      nsISupports **pptmp = new nsISupports *[nargs];
      for (i=0; i<nargs; ++i) {
        nsIVariant *pnsvar = NULL;
        
        rv = LVarToNSVar(args.at(i), &pnsvar, pParent);
        NS_ENSURE_SUCCESS(rv, false);
        pptmp[i] = pnsvar;
      }
      
      nsCOMPtr<nsIWritableVariant> nswvar(do_CreateInstance(NS_VARIANT_CONTRACTID, &rv));
      rv = nswvar->SetAsArray(nsIDataType::VTYPE_INTERFACE_IS, &nsiid, nargs, pptmp);
      NS_ENSURE_SUCCESS(rv, false);

      rv = pXPCB->Notify(nswvar, &prval);

      for (i=0; i<nargs; ++i) {
	//if (pptmp[i]!=NULL)
	NS_RELEASE(pptmp[i]);
      }
      delete [] pptmp;
    }

//    if (NS_FAILED(rv))
//      MB_DPRINTLN("XPCCallBk> Notify NG.");
//    else
//      MB_DPRINTLN("XPCCallBk> Notify OK.");

    rv = NSVarToLVar(prval, args.retval());
    NS_ENSURE_SUCCESS(rv, false);

    NS_RELEASE(prval);

    return true;
  }

  virtual LCloneableObject *clone() const {
    MB_ASSERT(false);
    return NULL;
  }
};

/* nsIVariant invokeWithCallback1 (in string name, in qICallBack arg1); */
NS_IMETHODIMP XPCObjWrapper::InvokeWithCallback1(const char *name, qICallBack *arg1, nsIVariant **_retval)
{
  nsresult rv;
//  MB_DPRINTLN("XPCObjWrapper::InvokeWithCallback1 called for %s", name);

  qlib::LSCBPtr pCBObj(new XPCCallBackObj(arg1));

  rv = invokeChk1(name);
  NS_ENSURE_SUCCESS(rv, rv);

  qlib::LVarArgs largs(1);

  largs.at(0).shareObjectPtr(&pCBObj);
    
  rv = invokeImpl(name, largs, _retval);

  return rv;
}

/* boolean instanceOf (in string name); */
NS_IMETHODIMP XPCObjWrapper::InstanceOf(const char *name, bool *_retval )
{
  LString str;

  if (m_pWrapped!=NULL) {
    *_retval = (bool) m_pWrapped->implements(name);
  }
  else {
    *_retval = false;
    LOG_DPRINTLN("instanceOf> Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }

  return NS_OK;
}


/* string getABIClassName (); */
NS_IMETHODIMP XPCObjWrapper::GetAbiClassName(char **_retval)
{
  LString str;

  if (m_pWrapped!=NULL) {
    qlib::LClass *pCls = m_pWrapped->getClassObj();
    if (pCls!=NULL) {
      str = pCls->getAbiClassName();
    }
  }
  else {
    str = "(null)";
  }
  
  nsAutoCString nsstr(str.c_str());
  *_retval = ToNewCString(nsstr);

  return NS_OK;
}

/* string getClassName (); */
NS_IMETHODIMP XPCObjWrapper::GetClassName(char **_retval)
{
  LString str;

  if (m_pWrapped!=NULL) {
    qlib::LClass *pCls = m_pWrapped->getScrClassObj();
    if (pCls!=NULL) {
      str = pCls->getClassName();
    }
  }
  else {
    str = "(null)";
  }
  
  nsAutoCString nsstr(str.c_str());
  *_retval = ToNewCString(nsstr);

  return NS_OK;
}

/* string getEnumDefsJSON (in string propname); */
NS_IMETHODIMP XPCObjWrapper::GetEnumDefsJSON(const char *propname, char **_retval )
{
  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }
  
  qlib::PropSpec spec;
  if ( !m_pWrapped->getPropSpecImpl(propname, &spec) ) {
    LOG_DPRINTLN("XPCObjWrapper::getEnumDefsJSON> "
                 "Fatal error, prop %s is not found", propname);
    return NS_ERROR_FAILURE;
  }

  LString rval;
  
  rval += "{";
  if (spec.pEnumDef) {
    int i=0;
    BOOST_FOREACH(qlib::EnumDef::value_type ii, *(spec.pEnumDef)) {
      if (i!=0) rval += ",";
      rval += LString::format("\"%s\": %d", ii.first.c_str(), ii.second);
      ++i;
    }
  }
  rval += "}";

  nsAutoCString nsstr(rval.c_str());
  *_retval = ToNewCString(nsstr);

  return NS_OK;
  //return NS_ERROR_NOT_IMPLEMENTED;
}

/* PRInt32 getEnumDef (in string propname, in string enumname); */
NS_IMETHODIMP XPCObjWrapper::GetEnumDef(const char *propname, const char *enumname, PRInt32 *_retval )
{
  if (m_pWrapped==NULL) {
    LOG_DPRINTLN("Wrapper target obj is NULL!!");
    return NS_ERROR_INVALID_POINTER;
  }
  
  qlib::PropSpec spec;
  if ( !m_pWrapped->getPropSpecImpl(propname, &spec) ) {
    LOG_DPRINTLN("XPCObjWrapper::getEnumDef> "
                 "Fatal error, prop %s is not found", propname);
    return NS_ERROR_FAILURE;
  }

  if (!spec.pEnumDef) {
    return NS_ERROR_FAILURE;
  }
  
  qlib::EnumDef::const_iterator i = spec.pEnumDef->find(enumname);
  if (i==spec.pEnumDef->end()) {
    LOG_DPRINTLN("XPCObjWrapper::getEnumDef> "
                 "Fatal error, enum %s is not found in prop %s", enumname, propname);
    return NS_ERROR_FAILURE;
  }

  *_retval = i->second;
  
  return NS_OK;
}

NS_IMETHODIMP XPCObjWrapper::SetDbgMsg(const char *dbgmsg)
{
#ifdef MB_DEBUG
  if (m_pParent!=NULL)
    m_pParent->setWrapperDbgMsg(m_nIndex, dbgmsg);
#endif
  return NS_OK;
}


