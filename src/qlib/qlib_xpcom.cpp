
#include <common.h>

#include "qlib.hpp"
#include "ClassA_wrap.hpp"
#include "ClassB_wrap.hpp"

#include "nsIGenericFactory.h"
#include "nsISupportsUtils.h"

#define ClassA_wrap_CID \
{ 0x035072fc, 0x54b2, 0x4ebf, \
{ 0xab, 0xe4, 0x85, 0xde, 0xaa, 0xa4, 0xf6, 0xd4}}

#define ClassB_wrap_CID \
{ 0x7b56dccc, 0xaafd, 0x41c3, \
{ 0xaa, 0x4f, 0xd2, 0xd9, 0x76, 0x02, 0x21, 0x5e}}

NS_GENERIC_FACTORY_CONSTRUCTOR(ClassA_wrap);
NS_GENERIC_FACTORY_CONSTRUCTOR(ClassB_wrap);

static NS_METHOD regproc(nsIComponentManager *aCompMgr,
			 nsIFile *aPath,
			 const char *regloc,
			 const char *comptyp,
			 const nsModuleComponentInfo *info)
{
  printf("***** regproc\n");
  printf("      regproc: regloc: %s\n", regloc);
  printf("      regproc: comptyp: %s\n", comptyp);
  return NS_OK;
}

static NS_METHOD unregproc(nsIComponentManager *aCompMgr,
			   nsIFile *aPath,
			 const char *regloc,
			   const nsModuleComponentInfo *info)
{
  printf("***** Unregproc\n");
  return NS_OK;
}


static const nsModuleComponentInfo components[] = {
  { "ClassA_wrap",
    ClassA_wrap_CID,
    "@cuemol.org/ClassA_wrap",
    ClassA_wrapConstructor,
    regproc,
    unregproc
  },
  { "ClassB_wrap",
    ClassB_wrap_CID,
    "@cuemol.org/ClassB_wrap",
    ClassB_wrapConstructor,
    regproc,
    unregproc
  }
};

static nsresult mod_ctor(nsIModule* pmod)
{
  printf("##### MOD CTOR called %p\n", pmod);
  qlib::init();
  LOG_DPRINTLN("##### QLIB INITIALIZED ##### %p\n", pmod);
  return NS_OK;
}

static void mod_dtor(nsIModule* pmod)
{
  printf("##### MOD DTOR called %p\n", pmod);
  qlib::fini();
}

NS_IMPL_NSGETMODULE_WITH_CTOR_DTOR(qlibModule, components, mod_ctor, mod_dtor)

