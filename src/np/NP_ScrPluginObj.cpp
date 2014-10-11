//
//
// $Id: NP_ScrPluginObj.cpp,v 1.7 2009/08/20 12:26:31 rishitani Exp $

#include <common.h>

#include "NP_ScrPluginObj.hpp"
#include "NP_Wrapper.hpp"
#include "Plugin.hpp"

#include <qlib/ClassRegistry.hpp>

using namespace np;

ScrPluginObjBase::~ScrPluginObjBase()
{
  MB_DPRINTLN("ScrPluginObjBase %p destroyed.", this);
}

void ScrPluginObjBase::Invalidate()
{
}

bool ScrPluginObjBase::HasMethod(NPIdentifier name)
{
  return false;
}

bool ScrPluginObjBase::Invoke(NPIdentifier name, const NPVariant *args,
				 uint32_t argCount, NPVariant *result)
{
  return false;
}

bool ScrPluginObjBase::InvokeDefault(const NPVariant *args,
					uint32_t argCount, NPVariant *result)
{
  return false;
}

bool ScrPluginObjBase::HasProperty(NPIdentifier name)
{
  // return name == sBar_id;
  return false;
}

bool ScrPluginObjBase::GetProperty(NPIdentifier name, NPVariant *result)
{
  return false;
}

bool ScrPluginObjBase::SetProperty(NPIdentifier name,
				      const NPVariant *value)
{
  return false;
}

bool ScrPluginObjBase::RemoveProperty(NPIdentifier name)
{
  return false;
}

///////////////////////////////////////////////////////////////////////

// static
void ScrPluginObjBase::_Deallocate(NPObject *npobj)
{
  // Call the virtual destructor.
  delete (ScrPluginObjBase *)npobj;
}

// static
void ScrPluginObjBase::_Invalidate(NPObject *npobj)
{
  ((ScrPluginObjBase *)npobj)->Invalidate();
}

// static
bool ScrPluginObjBase::_HasMethod(NPObject *npobj, NPIdentifier name)
{
  return ((ScrPluginObjBase *)npobj)->HasMethod(name);
}

// static
bool ScrPluginObjBase::_Invoke(NPObject *npobj, NPIdentifier name,
                                    const NPVariant *args, uint32_t argCount,
				  NPVariant *result)
{
  return ((ScrPluginObjBase *)npobj)->Invoke(name, args, argCount,
						result);
}

// static
bool ScrPluginObjBase::_InvokeDefault(NPObject *npobj,
					 const NPVariant *args,
					 uint32_t argCount,
					 NPVariant *result)
{
  return ((ScrPluginObjBase *)npobj)->InvokeDefault(args, argCount,
						       result);
}

// static
bool ScrPluginObjBase::_HasProperty(NPObject * npobj, NPIdentifier name)
{
  return ((ScrPluginObjBase *)npobj)->HasProperty(name);
}

// static
bool ScrPluginObjBase::_GetProperty(NPObject *npobj, NPIdentifier name,
				       NPVariant *result)
{
  return ((ScrPluginObjBase *)npobj)->GetProperty(name, result);
}

// static
bool ScrPluginObjBase::_SetProperty(NPObject *npobj, NPIdentifier name,
				       const NPVariant *value)
{
  return ((ScrPluginObjBase *)npobj)->SetProperty(name, value);
}

// static
bool ScrPluginObjBase::_RemoveProperty(NPObject *npobj, NPIdentifier name)
{
  return ((ScrPluginObjBase *)npobj)->RemoveProperty(name);
}

///////////////////////////////////////////////////////////////////////////////
// Implementation of ScrPluginObj

static NPObject *
AllocateScrPluginObj(NPP npp, NPClass *aClass)
{
  return new ScrPluginObj(npp);
}

DECLARE_NPOBJECT_CLASS_WITH_BASE(NP_ScrPluginObj,
                                 AllocateScrPluginObj);

ScrPluginObj::ScrPluginObj(NPP npp)
     : ScrPluginObjBase(npp)
{
  m_idBind = NPN_GetStringIdentifier("bind");
  m_idUnBind = NPN_GetStringIdentifier("unbind");
}

ScrPluginObj::~ScrPluginObj()
{
  MB_DPRINTLN("ScrPluginObj %p destroyed.", this);
}

bool ScrPluginObj::HasMethod(NPIdentifier name)
{
  //  NPIdentifier id_create = NPN_GetStringIdentifier("create");
  //  return name == id_create;

  // NPIdentifier id_bind = NPN_GetStringIdentifier("bind");
  if (name == m_idBind)
    return true;

  if (name == m_idUnBind)
    return true;

  return false;
}

bool
ScrPluginObj::Invoke(NPIdentifier name, const NPVariant *args,
                               uint32_t argCount, NPVariant *result)
{
  if (name == m_idBind) {
    // printf("*** BIND called ***\n");

    if (argCount<2)
      goto error;
    if (!NPVARIANT_IS_INT32(args[0]))
      goto error;
    if (!NPVARIANT_IS_INT32(args[1]))
      goto error;

    //if (argCount>=3) 

    int scid = NPVARIANT_TO_INT32(args[0]);
    int vwid = NPVARIANT_TO_INT32(args[1]);

    np::Plugin *pPlugin = (np::Plugin *)m_pNpp->pdata;
    pPlugin->bind(scid, vwid);
    return true;
  }
  else if (name==m_idUnBind) {
    np::Plugin *pPlugin = (np::Plugin *)m_pNpp->pdata;
    pPlugin->unbind();
    return true;
  }

  /*
  NPIdentifier id_create = NPN_GetStringIdentifier("create");
  if (name == id_create) {
    printf("*** create called!\n");

    if (argCount!=1)
      goto error;
    if (!NPVARIANT_IS_STRING(args[0]))
      goto error;
      
    const NPUTF8 *pclsname = NPVARIANT_TO_STRING(args[0]).utf8characters;

    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    qlib::LClass *pcls = pMgr->getClassObj(pclsname);
    qlib::LScriptable *pscobj = dynamic_cast<qlib::LScriptable *>(pcls->createObj());

    NPObject *pobj = ScrObjWrapper::createWrapper(m_pNpp, pscobj);
    OBJECT_TO_NPVARIANT(pobj, *result);
    return PR_TRUE;
  }
  */

 error:
  return false;
}

bool ScrPluginObj::InvokeDefault(const NPVariant *args, uint32_t argCount,
                                      NPVariant *result)
{
  return false;
  //return PR_TRUE;
}
