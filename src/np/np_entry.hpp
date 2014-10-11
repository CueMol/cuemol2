/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

#ifndef __NP_ENTRY_HPP_INCLUDED__
#define __NP_ENTRY_HPP_INCLUDED__

extern NPNetscapeFuncs gNPNFuncs;
NPError setupBrowserEntryPoint(NPNetscapeFuncs* pFuncs);
NPError setupPluginEntryPoint(NPPluginFuncs* pFuncs);

#endif // __NP_ENTRY_HPP_INCLUDED__

