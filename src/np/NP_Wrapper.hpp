//
//
// $Id: NP_Wrapper.hpp,v 1.3 2009/08/18 10:53:35 rishitani Exp $

#ifndef __NP_SCROBJWRAPPER_HPP__
#define __NP_SCROBJWRAPPER_HPP__

#include "NP_ScrPluginObj.hpp"
#include <qlib/LScriptable.hpp>

namespace np {

  using qlib::LString;
  using qlib::LScriptable;

  class ScrObjWrapper : public ScrPluginObjBase
  {
  public:
    ScrObjWrapper(NPP npp)
      : ScrPluginObjBase(npp), m_pObj(NULL)
    {
    }

    virtual ~ScrObjWrapper();

    virtual bool HasMethod(NPIdentifier name);
    virtual bool Invoke(NPIdentifier name, const NPVariant *args,
			uint32_t argCount, NPVariant *result);
    virtual bool InvokeDefault(const NPVariant *args, uint32_t argCount,
			       NPVariant *result);


    // virtual void Invalidate();

    virtual bool HasProperty(NPIdentifier name);
    virtual bool GetProperty(NPIdentifier name, NPVariant *result);
    virtual bool SetProperty(NPIdentifier name, const NPVariant *value);

    // virtual bool RemoveProperty(NPIdentifier name);

    //////////

    void setNewObject(LScriptable *psobj) {
      if (m_pObj!=NULL) return; //TO DO: throw ERROR!!
      if (psobj==NULL) return; //TO DO: throw ERROR!!
      m_pObj = psobj;
    }

    LScriptable *getObject() const { return m_pObj; }

  private:
    LScriptable *m_pObj;

    static bool convIDtoName(NPIdentifier name, LString &data);
    bool convLVarToNPVar(qlib::LVariant &rval, NPVariant *presult);
    bool convNPVarToLVar(const NPVariant *pvalue, qlib::LVariant &lvar);
    bool convNPArgToLArg(const NPVariant *args, qlib::LVarArgs &largs);

  public:
    static NPObject *createWrapper(NPP npp, LScriptable *pobj);

  };

}

#endif // __NP_SCROBJWRAPPER_HPP__
