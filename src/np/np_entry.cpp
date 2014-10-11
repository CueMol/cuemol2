/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
//
//
// OS Common plugin entry point implementation
//

#include "npcommon.h"
#include "np_entry.hpp"

char *NPP_GetMIMEDescription();

char *NP_GetMIMEDescription()
{
  return NPP_GetMIMEDescription();
}

NPError NP_GetValue(void* future, NPPVariable variable, void *value)
{
  //printf("######### NP_GetValue called %p %p %p\n", future, variable, value);
  return NPP_GetValue((NPP_t *)future, variable, value);
}

NPError OSCALL NP_Shutdown()
{
  NPP_Shutdown();
  return NPERR_NO_ERROR;
}
