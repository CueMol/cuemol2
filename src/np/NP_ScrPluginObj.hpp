//
//
// $Id: NP_ScrPluginObj.hpp,v 1.4 2009/08/13 04:53:36 rishitani Exp $

#ifndef __NP_SCRPLUGINOBJ_HPP__
#define __NP_SCRPLUGINOBJ_HPP__

#include <npapi.h>
#include <npruntime.h>

namespace np {

  class ScrPluginObjBase : public NPObject
  {
  protected:
    NPP m_pNpp;

  public:
    ScrPluginObjBase(NPP npp)
      : m_pNpp(npp)
    {
    }

    virtual ~ScrPluginObjBase();

    // Virtual NPObject hooks called through this base class. Override
    // as you see fit.
    virtual void Invalidate();
    virtual bool HasMethod(NPIdentifier name);
    virtual bool Invoke(NPIdentifier name, const NPVariant *args,
			uint32_t argCount, NPVariant *result);
    virtual bool InvokeDefault(const NPVariant *args, uint32_t argCount,
			       NPVariant *result);
    virtual bool HasProperty(NPIdentifier name);
    virtual bool GetProperty(NPIdentifier name, NPVariant *result);
    virtual bool SetProperty(NPIdentifier name, const NPVariant *value);
    virtual bool RemoveProperty(NPIdentifier name);

  public:
    static NPObject *_Allocate(NPP npp, NPClass *aClass);
    static void _Deallocate(NPObject *npobj);
    static void _Invalidate(NPObject *npobj);
    static bool _HasMethod(NPObject *npobj, NPIdentifier name);
    static bool _Invoke(NPObject *npobj, NPIdentifier name,
			const NPVariant *args, uint32_t argCount,
			NPVariant *result);
    static bool _InvokeDefault(NPObject *npobj, const NPVariant *args,
			       uint32_t argCount, NPVariant *result);
    static bool _HasProperty(NPObject * npobj, NPIdentifier name);
    static bool _GetProperty(NPObject *npobj, NPIdentifier name,
			     NPVariant *result);
    static bool _SetProperty(NPObject *npobj, NPIdentifier name,
			     const NPVariant *value);
    static bool _RemoveProperty(NPObject *npobj, NPIdentifier name);

  };

  //////////////////////////////////////////////////////////

#define DECLARE_NPOBJECT_CLASS_WITH_BASE(_class, ctor)                        \
NPClass s##_class##_NPClass = {                                        \
  NP_CLASS_STRUCT_VERSION,                                                    \
  ctor,                                                                       \
  np::ScrPluginObjBase::_Deallocate,                                    \
  np::ScrPluginObjBase::_Invalidate,                                    \
  np::ScrPluginObjBase::_HasMethod,                                     \
  np::ScrPluginObjBase::_Invoke,                                        \
  np::ScrPluginObjBase::_InvokeDefault,                                 \
  np::ScrPluginObjBase::_HasProperty,                                   \
  np::ScrPluginObjBase::_GetProperty,                                   \
  np::ScrPluginObjBase::_SetProperty,                                   \
  np::ScrPluginObjBase::_RemoveProperty                                 \
}

#define GET_NPOBJECT_CLASS(_class) &s##_class##_NPClass

#define USE_NPOBJECT_CLASS(_class) extern NPClass s##_class##_NPClass


  //////////////////////////////////////////////////////////


  class ScrPluginObj : public ScrPluginObjBase
  {
  private:
    NPIdentifier m_idBind;
    NPIdentifier m_idUnBind;

  public:
    ScrPluginObj(NPP npp);
    virtual ~ScrPluginObj();

    virtual bool HasMethod(NPIdentifier name);
    virtual bool Invoke(NPIdentifier name, const NPVariant *args,
			uint32_t argCount, NPVariant *result);
    virtual bool InvokeDefault(const NPVariant *args, uint32_t argCount,
			       NPVariant *result);
  };

}

#endif // __NP_SCRPLUGINOBJ_HPP__
