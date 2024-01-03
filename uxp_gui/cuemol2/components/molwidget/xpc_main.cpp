//
// $Id: xpc_main.cpp,v 1.8 2011/02/12 13:51:19 rishitani Exp $
//

#include "xpcom.hpp"

#include <mozilla/ModuleUtils.h>
#include <nsIClassInfoImpl.h>

#include "XPCCueMol.hpp"

using namespace xpcom;

extern XPCCueMol *gpXPCCueMol;

// Define the constructor for the object XPCCueMol
NS_GENERIC_FACTORY_CONSTRUCTOR(XPCCueMol);

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
  if (gpXPCCueMol!=NULL) {
    //gpXPCCueMol->dumpWrappers();
    gpXPCCueMol->Fini();
  }
  qlib::fini();
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
