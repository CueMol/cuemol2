/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

////////////////////////////////////////////////////////////
//
// Implementation of Browser-Side entry points (NPN_*)
//

#include "npcommon.h"
#include "np_entry.hpp"

#ifndef HIBYTE
#define HIBYTE(x) ((((QMP_UINT32)(x)) & 0xff00) >> 8)
#endif

#ifndef LOBYTE
#define LOBYTE(W) ((W) & 0xFF)
#endif

/**
   Function table of the browser-side entry point
 */
NPNetscapeFuncs gNPNFuncs;

///////////////////////////////////////////////////////////////////////

void NPN_Version(int* plugin_major, int* plugin_minor, int* netscape_major, int* netscape_minor)
{
  *plugin_major   = NP_VERSION_MAJOR;
  *plugin_minor   = NP_VERSION_MINOR;
  *netscape_major = HIBYTE(gNPNFuncs.version);
  *netscape_minor = LOBYTE(gNPNFuncs.version);
}

NPError NPN_GetURLNotify(NPP instance, const char *url, const char *target, void* notifyData)
{
	int navMinorVers = gNPNFuncs.version & 0xFF;
  NPError rv = NPERR_NO_ERROR;

  if( navMinorVers >= NPVERS_HAS_NOTIFICATION )
		rv = gNPNFuncs.geturlnotify(instance, url, target, notifyData);
	else
		rv = NPERR_INCOMPATIBLE_VERSION_ERROR;

  return rv;
}

NPError NPN_GetURL(NPP instance, const char *url, const char *target)
{
  NPError rv = gNPNFuncs.geturl(instance, url, target);
  return rv;
}

NPError NPN_PostURLNotify(NPP instance, const char* url, const char* window, QMP_UINT32 len, const char* buf, NPBool file, void* notifyData)
{
	int navMinorVers = gNPNFuncs.version & 0xFF;
  NPError rv = NPERR_NO_ERROR;

	if( navMinorVers >= NPVERS_HAS_NOTIFICATION )
		rv = gNPNFuncs.posturlnotify(instance, url, window, len, buf, file, notifyData);
	else
		rv = NPERR_INCOMPATIBLE_VERSION_ERROR;

  return rv;
}

NPError NPN_PostURL(NPP instance, const char* url, const char* window, QMP_UINT32 len, const char* buf, NPBool file)
{
  NPError rv = gNPNFuncs.posturl(instance, url, window, len, buf, file);
  return rv;
} 

NPError NPN_RequestRead(NPStream* stream, NPByteRange* rangeList)
{
  NPError rv = gNPNFuncs.requestread(stream, rangeList);
  return rv;
}

NPError NPN_NewStream(NPP instance, NPMIMEType type, const char* target, NPStream** stream)
{
	int navMinorVersion = gNPNFuncs.version & 0xFF;

  NPError rv = NPERR_NO_ERROR;

	if( navMinorVersion >= NPVERS_HAS_STREAMOUTPUT )
		rv = gNPNFuncs.newstream(instance, type, target, stream);
	else
		rv = NPERR_INCOMPATIBLE_VERSION_ERROR;

  return rv;
}

QMP_INT32 NPN_Write(NPP instance, NPStream *stream, QMP_INT32 len, void *buffer)
{
	int navMinorVersion = gNPNFuncs.version & 0xFF;
  QMP_INT32 rv = 0;

  if( navMinorVersion >= NPVERS_HAS_STREAMOUTPUT )
		rv = gNPNFuncs.write(instance, stream, len, buffer);
	else
		rv = -1;

  return rv;
}

NPError NPN_DestroyStream(NPP instance, NPStream* stream, NPError reason)
{
	int navMinorVersion = gNPNFuncs.version & 0xFF;
  NPError rv = NPERR_NO_ERROR;

  if( navMinorVersion >= NPVERS_HAS_STREAMOUTPUT )
		rv = gNPNFuncs.destroystream(instance, stream, reason);
	else
		rv = NPERR_INCOMPATIBLE_VERSION_ERROR;

  return rv;
}

void NPN_Status(NPP instance, const char *message)
{
  gNPNFuncs.status(instance, message);
}

const char* NPN_UserAgent(NPP instance)
{
  const char * rv = NULL;
  rv = gNPNFuncs.uagent(instance);
  return rv;
}

void* NPN_MemAlloc(QMP_UINT32 size)
{
  void * rv = NULL;
  rv = gNPNFuncs.memalloc(size);
  return rv;
}

void NPN_MemFree(void* ptr)
{
  gNPNFuncs.memfree(ptr);
}

QMP_UINT32 NPN_MemFlush(QMP_UINT32 size)
{
  QMP_UINT32 rv = gNPNFuncs.memflush(size);
  return rv;
}

void NPN_ReloadPlugins(NPBool reloadPages)
{
  gNPNFuncs.reloadplugins(reloadPages);
}

#ifdef OJI
JRIEnv* NPN_GetJavaEnv(void)
{
  JRIEnv * rv = NULL;
	rv = gNPNFuncs.getJavaEnv();
  return rv;
}

jref NPN_GetJavaPeer(NPP instance)
{
  jref rv;
	rv = gNPNFuncs.getJavaPeer(instance);
  return rv;
}
#endif

NPError NPN_GetValue(NPP instance, NPNVariable variable, void *value)
{
  NPError rv = gNPNFuncs.getvalue(instance, variable, value);
  return rv;
}

NPError NPN_SetValue(NPP instance, NPPVariable variable, void *value)
{
  NPError rv = gNPNFuncs.setvalue(instance, variable, value);
  return rv;
}

void NPN_InvalidateRect(NPP instance, NPRect *invalidRect)
{
  gNPNFuncs.invalidaterect(instance, invalidRect);
}

void NPN_InvalidateRegion(NPP instance, NPRegion invalidRegion)
{
  gNPNFuncs.invalidateregion(instance, invalidRegion);
}

void NPN_ForceRedraw(NPP instance)
{
  gNPNFuncs.forceredraw(instance);
}

NPIdentifier NPN_GetStringIdentifier(const NPUTF8 *name)
{
  return gNPNFuncs.getstringidentifier(name);
}

void NPN_GetStringIdentifiers(const NPUTF8 **names, QMP_UINT32 nameCount,
                              NPIdentifier *identifiers)
{
  return gNPNFuncs.getstringidentifiers(names, nameCount, identifiers);
}

NPIdentifier NPN_GetStringIdentifier(QMP_INT32 intid)
{
  return gNPNFuncs.getintidentifier(intid);
}

bool NPN_IdentifierIsString(NPIdentifier identifier)
{
  return gNPNFuncs.identifierisstring(identifier);
}

NPUTF8 *NPN_UTF8FromIdentifier(NPIdentifier identifier)
{
  return gNPNFuncs.utf8fromidentifier(identifier);
}

int32_t NPN_IntFromIdentifier(NPIdentifier identifier)
{
  return gNPNFuncs.intfromidentifier(identifier);
}

NPObject *NPN_CreateObject(NPP npp, NPClass *aClass)
{
  return gNPNFuncs.createobject(npp, aClass);
}

NPObject *NPN_RetainObject(NPObject *obj)
{
  return gNPNFuncs.retainobject(obj);
}

void NPN_ReleaseObject(NPObject *obj)
{
  return gNPNFuncs.releaseobject(obj);
}

bool NPN_Invoke(NPP npp, NPObject* obj, NPIdentifier methodName,
                const NPVariant *args, QMP_UINT32 argCount, NPVariant *result)
{
  return gNPNFuncs.invoke(npp, obj, methodName, args, argCount, result);
}

bool NPN_InvokeDefault(NPP npp, NPObject* obj, const NPVariant *args,
                       QMP_UINT32 argCount, NPVariant *result)
{
  return gNPNFuncs.invokeDefault(npp, obj, args, argCount, result);
}

bool NPN_Evaluate(NPP npp, NPObject* obj, NPString *script,
                  NPVariant *result)
{
  return gNPNFuncs.evaluate(npp, obj, script, result);
}

bool NPN_GetProperty(NPP npp, NPObject* obj, NPIdentifier propertyName,
                     NPVariant *result)
{
  return gNPNFuncs.getproperty(npp, obj, propertyName, result);
}

bool NPN_SetProperty(NPP npp, NPObject* obj, NPIdentifier propertyName,
                     const NPVariant *value)
{
  return gNPNFuncs.setproperty(npp, obj, propertyName, value);
}

bool NPN_RemoveProperty(NPP npp, NPObject* obj, NPIdentifier propertyName)
{
  return gNPNFuncs.removeproperty(npp, obj, propertyName);
}

bool NPN_HasProperty(NPP npp, NPObject* obj, NPIdentifier propertyName)
{
  return gNPNFuncs.hasproperty(npp, obj, propertyName);
}

bool NPN_HasMethod(NPP npp, NPObject* obj, NPIdentifier methodName)
{
  return gNPNFuncs.hasmethod(npp, obj, methodName);
}

void NPN_ReleaseVariantValue(NPVariant *variant)
{
  gNPNFuncs.releasevariantvalue(variant);
}

void NPN_SetException(NPObject* obj, const NPUTF8 *message)
{
  gNPNFuncs.setexception(obj, message);
}

///////////////////////////////////////////////////////////////////////

/**
   Setup the browser-side entry point gNPNFuncs
 */
NPError setupBrowserEntryPoint(NPNetscapeFuncs* pFuncs)
{
  if(pFuncs == NULL)
    return NPERR_INVALID_FUNCTABLE_ERROR;

  if(HIBYTE(pFuncs->version) > NP_VERSION_MAJOR)
    return NPERR_INCOMPATIBLE_VERSION_ERROR;

  if(pFuncs->size < sizeof(NPNetscapeFuncs))
    return NPERR_INVALID_FUNCTABLE_ERROR;

  gNPNFuncs.size                    = pFuncs->size;
  gNPNFuncs.version                 = pFuncs->version;
  gNPNFuncs.geturlnotify            = pFuncs->geturlnotify;
  gNPNFuncs.geturl                  = pFuncs->geturl;
  gNPNFuncs.posturlnotify           = pFuncs->posturlnotify;
  gNPNFuncs.posturl                 = pFuncs->posturl;
  gNPNFuncs.requestread             = pFuncs->requestread;
  gNPNFuncs.newstream               = pFuncs->newstream;
  gNPNFuncs.write                   = pFuncs->write;
  gNPNFuncs.destroystream           = pFuncs->destroystream;
  gNPNFuncs.status                  = pFuncs->status;
  gNPNFuncs.uagent                  = pFuncs->uagent;
  gNPNFuncs.memalloc                = pFuncs->memalloc;
  gNPNFuncs.memfree                 = pFuncs->memfree;
  gNPNFuncs.memflush                = pFuncs->memflush;
  gNPNFuncs.reloadplugins           = pFuncs->reloadplugins;

#ifdef OJI
  gNPNFuncs.getJavaEnv              = pFuncs->getJavaEnv;
  gNPNFuncs.getJavaPeer             = pFuncs->getJavaPeer;
#endif
  
  gNPNFuncs.getvalue                = pFuncs->getvalue;
  gNPNFuncs.setvalue                = pFuncs->setvalue;
  gNPNFuncs.invalidaterect          = pFuncs->invalidaterect;
  gNPNFuncs.invalidateregion        = pFuncs->invalidateregion;
  gNPNFuncs.forceredraw             = pFuncs->forceredraw;
  gNPNFuncs.getstringidentifier     = pFuncs->getstringidentifier;
  gNPNFuncs.getstringidentifiers    = pFuncs->getstringidentifiers;
  gNPNFuncs.getintidentifier        = pFuncs->getintidentifier;
  gNPNFuncs.identifierisstring      = pFuncs->identifierisstring;
  gNPNFuncs.utf8fromidentifier      = pFuncs->utf8fromidentifier;
  gNPNFuncs.intfromidentifier       = pFuncs->intfromidentifier;
  gNPNFuncs.createobject            = pFuncs->createobject;
  gNPNFuncs.retainobject            = pFuncs->retainobject;
  gNPNFuncs.releaseobject           = pFuncs->releaseobject;
  gNPNFuncs.invoke                  = pFuncs->invoke;
  gNPNFuncs.invokeDefault           = pFuncs->invokeDefault;
  gNPNFuncs.evaluate                = pFuncs->evaluate;
  gNPNFuncs.getproperty             = pFuncs->getproperty;
  gNPNFuncs.setproperty             = pFuncs->setproperty;
  gNPNFuncs.removeproperty          = pFuncs->removeproperty;
  gNPNFuncs.hasproperty             = pFuncs->hasproperty;
  gNPNFuncs.hasmethod               = pFuncs->hasmethod;
  gNPNFuncs.releasevariantvalue     = pFuncs->releasevariantvalue;
  gNPNFuncs.setexception            = pFuncs->setexception;

  return NPERR_NO_ERROR;
}

