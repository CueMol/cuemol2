/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
*/

//////////////////////////////////////////////////////////////
//
// Plugin entry point implementation for Win32
//

#include "npcommon.h"

#include "np_entry.hpp"

NPError OSCALL NP_GetEntryPoints(NPPluginFuncs* pFuncs)
{
  //printf("*****");
  return setupPluginEntryPoint(pFuncs);
}

NPError OSCALL NP_Initialize(NPNetscapeFuncs* pFuncs)
{
  //printf("*****");
  NPError res = setupBrowserEntryPoint(pFuncs);

  if (res!=NPERR_NO_ERROR)
    return res;
  
  return NPP_Initialize();
}

