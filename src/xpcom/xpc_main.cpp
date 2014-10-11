//
// $Id: xpc_main.cpp,v 1.8 2011/02/12 13:51:19 rishitani Exp $
//

#include <common.h>
#include "xpcom.hpp"

#if (GECKO_SDK_MAJOR_VER>=2)
#  include <mozilla/ModuleUtils.h>
#  include <nsIClassInfoImpl.h>
#else
#  include <nsIGenericFactory.h>
#endif

#include "XPCCueMol.hpp"

using namespace xpcom;

extern XPCCueMol *gpXPCCueMol;

// Define the constructor for the object XPCCueMol
NS_GENERIC_FACTORY_CONSTRUCTOR(XPCCueMol);

#if (GECKO_SDK_MAJOR_VER>=2)
///////////////////////////////////////////////////////////////////////
// Gecko 2.0 xpcom module definition
//

// The following line defines a kXPCCueMol_CID CID variable.
NS_DEFINE_NAMED_CID(XPCCueMol_CID);


// Build a table of ClassIDs (CIDs) which are implemented by this module.
static const mozilla::Module::CIDEntry kModuleCIDs[] = {
  { &kXPCCueMol_CID, false, NULL, XPCCueMolConstructor },
  { NULL }
};

// Build a table which maps contract IDs to CIDs.
static const mozilla::Module::ContractIDEntry kModuleContracts[] = {
  { XPCCueMol_CONTRACTID, &kXPCCueMol_CID },
  { NULL }
};

static const mozilla::Module::CategoryEntry kModuleCategories[] = {
  { "xpc-cuemol-category", "xpc-cuemol-key", XPCCueMol_CONTRACTID },
  { NULL }
};

static nsresult mod_ctor()
{
  nsresult rv;

  printf("CueMol2 XPCOM : MOD CTOR called\n");
  qlib::init();
  MB_DPRINTLN("CueMol2 XPCOM : INITIALIZED");

  return NS_OK;
}

static void mod_dtor()
{
  //printf("##### QM_XPCOM %%%%%% MOD DTOR called %p\n", pmod);
  qlib::fini();
  if (gpXPCCueMol!=NULL)
    gpXPCCueMol->dumpWrappers();
}

static const mozilla::Module kModule = {
  mozilla::Module::kVersion,
  kModuleCIDs,
  kModuleContracts,
  kModuleCategories,
  NULL,
  mod_ctor,
  mod_dtor
  };

// The following line implements the one-and-only "NSModule" symbol exported from this
// shared library.
NSMODULE_DEFN(XPCCueMolModule) = &kModule;

#else

///////////////////////////////////////////////////////////////////////
// Old (pre1.9.2) xpcom module definition
//

static const nsModuleComponentInfo components[] = {
  {
    "XPCCueMol",
    XPCCueMol_CID,
    XPCCueMol_CONTRACTID,
    XPCCueMolConstructor
  }
};

static nsresult mod_ctor(nsIModule* pmod)
{
  nsresult rv;

  printf("##### QM_XPCOM %%%%%% MOD CTOR called %p\n", pmod);
  qlib::init();
  MB_DPRINTLN("##### QM_XPCOM INITIALIZED ##### %p\n", pmod);
  return NS_OK;
}

static void mod_dtor(nsIModule* pmod)
{
  //printf("##### QM_XPCOM %%%%%% MOD DTOR called %p\n", pmod);
  qlib::fini();
  if (gpXPCCueMol!=NULL)
    gpXPCCueMol->dumpWrappers();
}

NS_IMPL_NSGETMODULE_WITH_CTOR_DTOR(cuemolModule, components, mod_ctor, mod_dtor);

#endif

