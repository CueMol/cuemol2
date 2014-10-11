/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

//////////////////////////////////////////////////////////////
//
// Plugin entry point implementation for UN*X
//

#include "npcommon.h"
#include "np_entry.hpp"

NPError OSCALL NP_Initialize(NPNetscapeFuncs* pFuncs,
                             NPPluginFuncs* pPluginFuncs)
{
  NPError res = setupBrowserEntryPoint(pFuncs);
  if (res!=NPERR_NO_ERROR)
    return res;

  res = setupPluginEntryPoint(pPluginFuncs);
  if (res!=NPERR_NO_ERROR)
    return res;

  NPP_Initialize();

  return NPERR_NO_ERROR;
}
