/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

//////////////////////////////////////////////////////////////
//
// Plugin entry point implementation for UN*X
//

#include "npcommon.h"
#include "np_entry.hpp"

short	gResFile;			// Refnum of the pluginﾕs resource file


int main(NPNetscapeFuncs* nsTable, NPPluginFuncs* pluginFuncs, NPP_ShutdownProcPtr* unloadUpp);

DEFINE_API_C(int) main(NPNetscapeFuncs* nsTable, NPPluginFuncs* pluginFuncs, NPP_ShutdownProcPtr* unloadUpp)
{
  printf("### np_entry_osx main() called.\n");
  // PLUGINDEBUGSTR("\pmain");

  NPError err = NPERR_NO_ERROR;

  //                                                                                                                           
  // Ensure that everything Netscape passed us is valid!                                                                       
  //                                                                                                                           
  if ((nsTable == NULL) || (pluginFuncs == NULL) || (unloadUpp == NULL))
    err = NPERR_INVALID_FUNCTABLE_ERROR;

  //                                                                                                                           
  // Check the ﾒmajorﾓ version passed in Netscapeﾕs function table. 
  // We wonﾕt load if the major version is newer than what we expect.
  // Also check that the function tables passed in are big enough for
  // all the functions we need (they could be bigger, if Netscape added
  // new APIs, but thatﾕs OK with us -- weﾕll just ignore them).
  //

  if (err == NPERR_NO_ERROR) {
    if ((nsTable->version >> 8) > NP_VERSION_MAJOR)         // Major version is in high byte                             
      err = NPERR_INCOMPATIBLE_VERSION_ERROR;
  }


  if (err == NPERR_NO_ERROR) {
    setupBrowserEntryPoint(nsTable);
    setupPluginEntryPoint(pluginFuncs);
    //*unloadUpp = NewNPP_ShutdownProc(NPP_Shutdown);
    *unloadUpp = NPP_Shutdown;

    //SetUpQD();
    gResFile = CurResFile();
    err = NPP_Initialize();
	}
	
	return err;
}

//////////

NPError OSCALL NP_Initialize(NPNetscapeFuncs* pFuncs)
{
  printf("***** NP_Initialize called (OSX)\n");
  NPError res = setupBrowserEntryPoint(pFuncs);

  if (res!=NPERR_NO_ERROR)
    return res;
  
  return NPP_Initialize();
}

NPError OSCALL NP_GetEntryPoints(NPPluginFuncs* pFuncs)
{
  printf("***** NP_GetEntryPoints called (OSX)\n");
  return setupPluginEntryPoint(pFuncs);
}
